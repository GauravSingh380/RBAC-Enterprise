// Platform (product owner) console: sees across ALL organizations.
// This is the only place where queries intentionally have no organization filter.
import { db, withTransaction } from '../../database/db.js';
import { BadRequestException, NotFoundException } from '../../common/exceptions/http.exception.js';
import { audit } from '../../common/utils/audit.js';
import type { Paginated, PaginationQuery } from '../../common/utils/pagination.js';
import type { RequestContext } from '../../common/utils/request-context.js';
import { revokeAllSessions } from '../auth/auth.service.js';
import { planExists } from '../plans/plans.routes.js';
import { rbacService } from '../rbac/rbac.service.js';
import type { UpdateOrganizationAdminDto, UpdateUserAdminDto } from './platform.dto.js';

export interface PlatformStats {
  organizations: number;
  activeOrganizations: number;
  users: number;
  activeUsers30d: number;
  newOrganizations30d: number;
  byPlan: Record<string, number>;
}

export interface PlatformOrganization {
  id: number;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  plan: string;
  /** active memberships, guests included */
  memberCount: number;
  guestCount: number;
  projectCount: number;
  limits: { members: number | null; guests: number | null; projects: number | null };
  owners: string[];
  createdAt: Date;
}

export interface PlatformUser {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
  isPlatformAdmin: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  organizations: { id: number; name: string; roles: string[] }[];
}

export class PlatformService {
  async stats(): Promise<PlatformStats> {
    const { rows } = await db.query<Omit<PlatformStats, 'byPlan'>>(
      `SELECT (SELECT COUNT(*)::int FROM organizations)                                             AS organizations,
              (SELECT COUNT(*)::int FROM organizations WHERE status = 'active')                     AS "activeOrganizations",
              (SELECT COUNT(*)::int FROM users)                                                     AS users,
              (SELECT COUNT(*)::int FROM users WHERE last_login_at > NOW() - INTERVAL '30 days')    AS "activeUsers30d",
              (SELECT COUNT(*)::int FROM organizations WHERE created_at > NOW() - INTERVAL '30 days') AS "newOrganizations30d"`,
    );
    const plans = await db.query<{ plan: string; count: number }>(
      'SELECT plan, COUNT(*)::int AS count FROM organizations GROUP BY plan ORDER BY plan',
    );
    return { ...rows[0]!, byPlan: Object.fromEntries(plans.rows.map((p) => [p.plan, p.count])) };
  }

  async listOrganizations(query: PaginationQuery): Promise<Paginated<PlatformOrganization>> {
    const search = query.search ? `%${query.search}%` : null;
    const where = '($1::text IS NULL OR o.name ILIKE $1 OR o.slug ILIKE $1)';
    const [items, total] = await Promise.all([
      db.query<PlatformOrganization>(
        `SELECT o.id, o.name, o.slug, o.status, o.plan, o.created_at AS "createdAt",
                (SELECT COUNT(*)::int FROM organization_members m WHERE m.organization_id = o.id AND m.status = 'active') AS "memberCount",
                (SELECT COUNT(*)::int FROM organization_members m WHERE m.organization_id = o.id AND m.status = 'active' AND m.is_guest) AS "guestCount",
                (SELECT COUNT(*)::int FROM projects p WHERE p.organization_id = o.id AND p.status = 'active') AS "projectCount",
                json_build_object('members', pl.max_members, 'guests', pl.max_guests, 'projects', pl.max_projects) AS limits,
                COALESCE((SELECT array_agg(u.email ORDER BY u.email)
                            FROM member_roles mr
                            JOIN roles r ON r.id = mr.role_id AND r.name = 'owner'
                            JOIN users u ON u.id = mr.user_id
                           WHERE mr.organization_id = o.id), '{}') AS owners
           FROM organizations o
           LEFT JOIN plans pl ON pl.key = o.plan
          WHERE ${where}
          ORDER BY o.created_at DESC
          LIMIT $2 OFFSET $3`,
        [search, query.limit, (query.page - 1) * query.limit],
      ),
      db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM organizations o WHERE ${where}`, [search]),
    ]);
    return { items: items.rows, total: total.rows[0]!.count, page: query.page, limit: query.limit };
  }

  /** Suspend / reactivate an organization, or change its plan. */
  async updateOrganization(id: number, dto: UpdateOrganizationAdminDto, ctx: RequestContext): Promise<void> {
    if (dto.plan && !(await planExists(dto.plan))) throw new BadRequestException(`Unknown plan "${dto.plan}" — create it in Platform → Plans first`);
    const { rowCount } = await db.query(
      `UPDATE organizations
          SET status = COALESCE($1, status), plan = COALESCE($2, plan), updated_at = NOW()
        WHERE id = $3`,
      [dto.status ?? null, dto.plan ?? null, id],
    );
    if (!rowCount) throw new NotFoundException('Organization not found');
    await audit(ctx, { action: 'platform.organization_update', entity: 'organization', entityId: id, organizationId: id, details: dto });
  }

  async listUsers(query: PaginationQuery): Promise<Paginated<PlatformUser>> {
    const search = query.search ? `%${query.search}%` : null;
    const where = '($1::text IS NULL OR u.name ILIKE $1 OR u.email ILIKE $1)';
    const [items, total] = await Promise.all([
      db.query<PlatformUser>(
        `SELECT u.id, u.name, u.email, u.is_active AS "isActive", u.is_platform_admin AS "isPlatformAdmin",
                u.last_login_at AS "lastLoginAt", u.created_at AS "createdAt",
                COALESCE((
                  SELECT json_agg(json_build_object(
                           'id', o.id, 'name', o.name,
                           'roles', COALESCE((SELECT array_agg(r.name) FROM member_roles mr JOIN roles r ON r.id = mr.role_id
                                               WHERE mr.organization_id = o.id AND mr.user_id = u.id), '{}')
                         ) ORDER BY o.name)
                    FROM organization_members m JOIN organizations o ON o.id = m.organization_id
                   WHERE m.user_id = u.id), '[]') AS organizations
           FROM users u
          WHERE ${where}
          ORDER BY u.id
          LIMIT $2 OFFSET $3`,
        [search, query.limit, (query.page - 1) * query.limit],
      ),
      db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM users u WHERE ${where}`, [search]),
    ]);
    return { items: items.rows, total: total.rows[0]!.count, page: query.page, limit: query.limit };
  }

  /** Disable an account platform-wide, or grant / revoke platform admin. */
  async updateUser(id: number, dto: UpdateUserAdminDto, ctx: RequestContext): Promise<void> {
    if (id === ctx.user!.id) throw new BadRequestException('You cannot change your own platform access');

    await withTransaction(async (client) => {
      const { rows } = await client.query<{ isPlatformAdmin: boolean }>(
        'SELECT is_platform_admin AS "isPlatformAdmin" FROM users WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!rows[0]) throw new NotFoundException('User not found');

      const losesAdmin = rows[0].isPlatformAdmin && (dto.isPlatformAdmin === false || dto.isActive === false);
      if (losesAdmin && (await rbacService.countActivePlatformAdmins(client, id)) === 0) {
        throw new BadRequestException('There must be at least one active platform admin');
      }

      await client.query(
        `UPDATE users SET is_active = COALESCE($1, is_active), is_platform_admin = COALESCE($2, is_platform_admin), updated_at = NOW()
          WHERE id = $3`,
        [dto.isActive ?? null, dto.isPlatformAdmin ?? null, id],
      );
      if (dto.isActive === false) await revokeAllSessions(id, client);
      await audit(ctx, { action: 'platform.user_update', entity: 'user', entityId: id, organizationId: null, details: dto }, client);
    });
  }
}
