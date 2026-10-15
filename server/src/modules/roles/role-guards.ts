// Shared privilege-escalation checks used when assigning roles (members, invitations).
import type { Queryable } from '../../database/db.js';
import { ROLES } from '../../common/constants/rbac.js';
import { BadRequestException, ForbiddenException } from '../../common/exceptions/http.exception.js';
import type { TenantContext } from '../../common/types/auth.types.js';

export interface RoleRef {
  id: number;
  name: string;
  isSystem: boolean;
  permissions: string[];
}

/**
 * Loads the roles and verifies that:
 *   * every role belongs to the ACTIVE organization (no cross-tenant role ids)
 *   * only owners can grant the owner role
 *   * non-owners cannot grant a role that has permissions they don't have themselves
 */
export async function assertCanGrantRoles(tenant: TenantContext, roleIds: number[], executor: Queryable): Promise<RoleRef[]> {
  const unique = [...new Set(roleIds)];
  const { rows } = await executor.query<RoleRef>(
    `SELECT r.id, r.name, r.is_system AS "isSystem",
            COALESCE(array_agg(p.name) FILTER (WHERE p.name IS NOT NULL), '{}') AS permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE r.id = ANY($1::int[]) AND r.organization_id = $2
      GROUP BY r.id`,
    [unique, tenant.organizationId],
  );
  if (rows.length !== unique.length) throw new BadRequestException('One or more roles do not exist in this organization');
  if (rows.some((r) => r.isSystem && r.name === ROLES.GUEST)) {
    throw new BadRequestException('The Guest role is given by inviting someone as a guest');
  }

  if (!tenant.isOwner) {
    if (rows.some((r) => r.name === ROLES.OWNER)) {
      throw new ForbiddenException('Only an owner can grant the owner role');
    }
    if (rows.some((r) => r.permissions.some((p) => !tenant.permissions.includes(p)))) {
      throw new ForbiddenException('You cannot grant a role with permissions you do not have');
    }
  }
  return rows;
}
