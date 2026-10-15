// Roles of the ACTIVE organization. Each organization has its own copy of the
// system roles (copied from role_templates) plus any custom roles it creates.
import { db, withTransaction, type Queryable } from '../../database/db.js';
import { ROLES } from '../../common/constants/rbac.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/http.exception.js';
import type { TenantContext } from '../../common/types/auth.types.js';
import { audit } from '../../common/utils/audit.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';
import type { CreateRoleDto, UpdateRoleDto } from './roles.dto.js';
import type { Role } from './roles.types.js';

const UNIQUE_VIOLATION = '23505';

const ROLE_SELECT = `
  SELECT r.id, r.name,
         r.display_name AS "displayName",
         r.description,
         r.is_system    AS "isSystem",
         (SELECT COUNT(*)::int FROM member_roles mr WHERE mr.role_id = r.id) AS "userCount",
         COALESCE(
           (SELECT array_agg(rp.permission_id ORDER BY rp.permission_id) FROM role_permissions rp WHERE rp.role_id = r.id),
           '{}'
         ) AS "permissionIds"
    FROM roles r`;

export class RolesService {
  async findAll(ctx: RequestContext): Promise<Role[]> {
    const { rows } = await db.query<Role>(`${ROLE_SELECT} WHERE r.organization_id = $1 ORDER BY r.is_system DESC, r.id`, [
      tenantOf(ctx).organizationId,
    ]);
    return rows;
  }

  async findOne(id: number, ctx: RequestContext, executor: Queryable = db): Promise<Role> {
    const { rows } = await executor.query<Role>(`${ROLE_SELECT} WHERE r.id = $1 AND r.organization_id = $2`, [
      id,
      tenantOf(ctx).organizationId,
    ]);
    if (!rows[0]) throw new NotFoundException(`Role with id ${id} not found`);
    return rows[0];
  }

  async create(dto: CreateRoleDto, ctx: RequestContext): Promise<Role> {
    const tenant = tenantOf(ctx);
    try {
      return await withTransaction(async (client) => {
        const permissionIds = dto.permissionIds ?? [];
        await this.assertCanGrant(tenant, permissionIds, client);

        const { rows } = await client.query<{ id: number }>(
          'INSERT INTO roles (organization_id, name, display_name, description) VALUES ($1, $2, $3, $4) RETURNING id',
          [tenant.organizationId, dto.name, dto.displayName, dto.description ?? null],
        );
        const roleId = rows[0]!.id;
        await this.insertPermissions(roleId, permissionIds, client);

        await audit(ctx, { action: 'role.create', entity: 'role', entityId: roleId, details: { name: dto.name } }, client);
        return this.findOne(roleId, ctx, client);
      });
    } catch (err: any) {
      if (err.code === UNIQUE_VIOLATION) throw new ConflictException('A role with this name already exists');
      throw err;
    }
  }

  async update(id: number, dto: UpdateRoleDto, ctx: RequestContext): Promise<Role> {
    await this.findOne(id, ctx);
    await db.query(
      `UPDATE roles
          SET display_name = COALESCE($1, display_name),
              description  = COALESCE($2, description),
              updated_at   = NOW()
        WHERE id = $3 AND organization_id = $4`,
      [dto.displayName ?? null, dto.description ?? null, id, tenantOf(ctx).organizationId],
    );
    await audit(ctx, { action: 'role.update', entity: 'role', entityId: id, details: dto });
    return this.findOne(id, ctx);
  }

  async setPermissions(id: number, permissionIds: number[], ctx: RequestContext): Promise<Role> {
    const tenant = tenantOf(ctx);
    return withTransaction(async (client) => {
      const role = await this.findOne(id, ctx, client);
      if (role.name === ROLES.OWNER) throw new BadRequestException('Owners always have every permission');

      const added = permissionIds.filter((p) => !role.permissionIds.includes(p));
      await this.assertCanGrant(tenant, added, client);

      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);
      await this.insertPermissions(id, permissionIds, client);

      await audit(ctx, { action: 'role.permissions_update', entity: 'role', entityId: id, details: { from: role.permissionIds, to: permissionIds } }, client);
      return this.findOne(id, ctx, client);
    });
  }

  async remove(id: number, ctx: RequestContext): Promise<void> {
    const role = await this.findOne(id, ctx);
    if (role.isSystem) throw new BadRequestException('System roles cannot be deleted');
    if (role.userCount > 0) {
      throw new ConflictException(`This role is assigned to ${role.userCount} member(s). Reassign them first.`);
    }

    await db.query('DELETE FROM roles WHERE id = $1 AND organization_id = $2', [id, tenantOf(ctx).organizationId]);
    await audit(ctx, { action: 'role.delete', entity: 'role', entityId: id, details: { name: role.name } });
  }

  // ---------------------------------------------------------------- helpers

  /** Prevents privilege escalation: you can only grant permissions you have yourself. */
  private async assertCanGrant(tenant: TenantContext, permissionIds: number[], executor: Queryable) {
    const unique = [...new Set(permissionIds)];
    if (unique.length === 0) return;

    const { rows } = await executor.query<{ name: string }>('SELECT name FROM permissions WHERE id = ANY($1::int[])', [unique]);
    if (rows.length !== unique.length) throw new BadRequestException('One or more permissions do not exist');

    if (!tenant.isOwner && rows.some((p) => !tenant.permissions.includes(p.name))) {
      throw new ForbiddenException('You cannot grant permissions you do not have');
    }
  }

  private async insertPermissions(roleId: number, permissionIds: number[], executor: Queryable) {
    if (permissionIds.length === 0) return;
    await executor.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT $1, unnest($2::int[])
       ON CONFLICT DO NOTHING`,
      [roleId, [...new Set(permissionIds)]],
    );
  }
}
