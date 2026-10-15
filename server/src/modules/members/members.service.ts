// Members of the ACTIVE organization. Every query is filtered by tenant.organizationId,
// so an admin of one organization can never see or touch another organization's members.
import { db, withTransaction, type Queryable } from '../../database/db.js';
import { ROLES } from '../../common/constants/rbac.js';
import { BadRequestException, ForbiddenException, NotFoundException } from '../../common/exceptions/http.exception.js';
import { audit } from '../../common/utils/audit.js';
import type { Paginated, PaginationQuery } from '../../common/utils/pagination.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';
import { rbacService } from '../rbac/rbac.service.js';
import { assertWithinPlan } from '../plans/plan-limits.js';
import { assertCanGrantRoles } from '../roles/role-guards.js';
import type { Member } from './members.types.js';

const MEMBER_SELECT = `
  SELECT u.id, u.name, u.email,
         (m.status = 'active') AS "isActive",
         m.is_guest            AS "isGuest",
         CASE WHEN m.is_guest THEN COALESCE((
           SELECT json_agg(json_build_object('id', p.id, 'key', p.key, 'name', p.name, 'role', pm.role) ORDER BY p.name)
             FROM project_members pm JOIN projects p ON p.id = pm.project_id
            WHERE pm.user_id = u.id AND pm.organization_id = m.organization_id), '[]') END AS "guestProjects",
         m.joined_at           AS "joinedAt",
         u.last_login_at       AS "lastLoginAt",
         COALESCE(
           json_agg(json_build_object('id', r.id, 'name', r.name, 'displayName', r.display_name) ORDER BY r.id)
             FILTER (WHERE r.id IS NOT NULL),
           '[]'
         ) AS roles
    FROM organization_members m
    JOIN users u              ON u.id = m.user_id
    LEFT JOIN member_roles mr ON mr.organization_id = m.organization_id AND mr.user_id = m.user_id
    LEFT JOIN roles r         ON r.id = mr.role_id`;

export class MembersService {
  async findAll(query: PaginationQuery, ctx: RequestContext): Promise<Paginated<Member>> {
    const { organizationId } = tenantOf(ctx);
    const search = query.search ? `%${query.search}%` : null;
    const where = 'm.organization_id = $1 AND ($2::text IS NULL OR u.name ILIKE $2 OR u.email ILIKE $2)';

    const [items, total] = await Promise.all([
      db.query<Member>(`${MEMBER_SELECT} WHERE ${where} GROUP BY u.id, m.organization_id, m.user_id ORDER BY m.joined_at LIMIT $3 OFFSET $4`, [
        organizationId,
        search,
        query.limit,
        (query.page - 1) * query.limit,
      ]),
      db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM organization_members m JOIN users u ON u.id = m.user_id WHERE ${where}`,
        [organizationId, search],
      ),
    ]);

    return { items: items.rows, total: total.rows[0]!.count, page: query.page, limit: query.limit };
  }

  async findOne(userId: number, ctx: RequestContext, executor: Queryable = db): Promise<Member> {
    const { rows } = await executor.query<Member>(
      `${MEMBER_SELECT} WHERE m.organization_id = $1 AND m.user_id = $2 GROUP BY u.id, m.organization_id, m.user_id`,
      [tenantOf(ctx).organizationId, userId],
    );
    if (!rows[0]) throw new NotFoundException('Member not found in this organization');
    return rows[0];
  }

  /** Activate / deactivate a membership (the account itself stays usable in other organizations). */
  async setStatus(userId: number, isActive: boolean, ctx: RequestContext): Promise<Member> {
    const tenant = tenantOf(ctx);
    if (userId === ctx.user!.id) throw new BadRequestException('You cannot change your own membership status');

    return withTransaction(async (client) => {
      const target = await this.findOne(userId, ctx, client);
      await this.assertCanManage(target, ctx, client);
      // re-activating takes a place of the plan again
      if (isActive && !target.isActive) await assertWithinPlan(client, tenant.organizationId, target.isGuest ? 'guests' : 'members');

      await client.query(`UPDATE organization_members SET status = $1 WHERE organization_id = $2 AND user_id = $3`, [
        isActive ? 'active' : 'inactive',
        tenant.organizationId,
        userId,
      ]);
      await audit(ctx, { action: isActive ? 'member.activate' : 'member.deactivate', entity: 'user', entityId: userId }, client);
      return this.findOne(userId, ctx, client);
    });
  }

  async setRoles(userId: number, roleIds: number[], ctx: RequestContext): Promise<Member> {
    const tenant = tenantOf(ctx);
    if (userId === ctx.user!.id) throw new ForbiddenException('You cannot change your own roles');

    return withTransaction(async (client) => {
      const target = await this.findOne(userId, ctx, client);
      await this.assertCanManage(target, ctx, client);
      if (target.isGuest) throw new BadRequestException('Guests always have the Guest role. Use "Make full member" to give them a role.');
      const newRoles = await assertCanGrantRoles(tenant, roleIds, client);

      const oldNames = target.roles.map((r) => r.name);
      const newNames = newRoles.map((r) => r.name);
      if (
        oldNames.includes(ROLES.OWNER) &&
        !newNames.includes(ROLES.OWNER) &&
        (await rbacService.countActiveOwners(tenant.organizationId, client, userId)) === 0
      ) {
        throw new BadRequestException('Cannot remove the last owner of the organization');
      }

      await client.query('DELETE FROM member_roles WHERE organization_id = $1 AND user_id = $2', [tenant.organizationId, userId]);
      await client.query(
        `INSERT INTO member_roles (organization_id, user_id, role_id, assigned_by)
         SELECT $1, $2, unnest($3::int[]), $4`,
        [tenant.organizationId, userId, newRoles.map((r) => r.id), ctx.user!.id],
      );

      await audit(ctx, { action: 'member.roles_update', entity: 'user', entityId: userId, details: { from: oldNames, to: newNames } }, client);
      return this.findOne(userId, ctx, client);
    });
  }

  /** A guest joins the organization as a full member (keeps their project memberships). Uses a member seat. */
  async makeMember(userId: number, roleIds: number[], ctx: RequestContext): Promise<Member> {
    const tenant = tenantOf(ctx);
    return withTransaction(async (client) => {
      const target = await this.findOne(userId, ctx, client);
      if (!target.isGuest) throw new BadRequestException('This person is already a full member');
      const newRoles = await assertCanGrantRoles(tenant, roleIds, client);
      if (target.isActive) await assertWithinPlan(client, tenant.organizationId, 'members');

      await client.query('UPDATE organization_members SET is_guest = FALSE WHERE organization_id = $1 AND user_id = $2', [tenant.organizationId, userId]);
      await client.query('DELETE FROM member_roles WHERE organization_id = $1 AND user_id = $2', [tenant.organizationId, userId]);
      await client.query(
        `INSERT INTO member_roles (organization_id, user_id, role_id, assigned_by)
         SELECT $1, $2, unnest($3::int[]), $4`,
        [tenant.organizationId, userId, newRoles.map((r) => r.id), ctx.user!.id],
      );
      await audit(ctx, { action: 'member.guest_to_member', entity: 'user', entityId: userId, details: { roles: newRoles.map((r) => r.name) } }, client);
      return this.findOne(userId, ctx, client);
    });
  }

  /** Removes the user from this organization (their account and other memberships are untouched). */
  async remove(userId: number, ctx: RequestContext): Promise<void> {
    const tenant = tenantOf(ctx);
    if (userId === ctx.user!.id) throw new BadRequestException('Use "Leave organization" to remove yourself');

    await withTransaction(async (client) => {
      const target = await this.findOne(userId, ctx, client);
      await this.assertCanManage(target, ctx, client);

      await client.query('DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2', [
        tenant.organizationId,
        userId,
      ]);
      await audit(ctx, { action: 'member.remove', entity: 'user', entityId: userId, details: { email: target.email } }, client);
    });
  }

  /** Only owners may manage owners, and the last active owner can never be locked out. */
  private async assertCanManage(target: Member, ctx: RequestContext, executor: Queryable) {
    const tenant = tenantOf(ctx);
    if (!target.roles.some((r) => r.name === ROLES.OWNER)) return;
    if (!tenant.isOwner) throw new ForbiddenException('Only an owner can manage another owner');
    if ((await rbacService.countActiveOwners(tenant.organizationId, executor, target.id)) === 0) {
      throw new BadRequestException('This is the last owner of the organization');
    }
  }
}
