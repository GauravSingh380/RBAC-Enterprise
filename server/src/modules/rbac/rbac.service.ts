// Central place for "who is this user, which organizations can they access,
// and what can they do / see in the active one".
import { db, type Queryable } from '../../database/db.js';
import { ROLES } from '../../common/constants/rbac.js';
import type { AuthUser, TenantContext } from '../../common/types/auth.types.js';
import type { MenuNode, OrganizationSummary, Profile } from './rbac.types.js';

interface MenuRow {
  id: number;
  key: string;
  label: string;
  path: string | null;
  icon: string | null;
  scope: 'organization' | 'platform';
  parentId: number | null;
  permission: string | null;
}

class RbacService {
  /** The global account, or null if missing / disabled. */
  async getAuthUser(userId: number, executor: Queryable = db): Promise<AuthUser | null> {
    const { rows } = await executor.query<AuthUser>(
      `SELECT id, name, email, is_platform_admin AS "isPlatformAdmin", password_change_required AS "passwordChangeRequired"
         FROM users WHERE id = $1 AND is_active = TRUE`,
      [userId],
    );
    return rows[0] ?? null;
  }

  /**
   * The user's access inside one organization, or null when they are not an ACTIVE member
   * of an ACTIVE organization. This is the tenant boundary check.
   */
  async getMembership(userId: number, organizationId: number, executor: Queryable = db): Promise<TenantContext | null> {
    const { rows } = await executor.query<Omit<TenantContext, 'isOwner'>>(
      `SELECT o.id AS "organizationId", o.name, o.slug, o.plan, m.is_guest AS "isGuest",
              COALESCE(array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles,
              COALESCE(array_agg(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL), '{}') AS permissions
         FROM organization_members m
         JOIN organizations o          ON o.id = m.organization_id
         LEFT JOIN member_roles mr     ON mr.organization_id = m.organization_id AND mr.user_id = m.user_id
         LEFT JOIN roles r             ON r.id = mr.role_id
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         LEFT JOIN permissions p       ON p.id = rp.permission_id
        WHERE m.user_id = $1 AND m.organization_id = $2
          AND m.status = 'active' AND o.status = 'active'
        GROUP BY o.id, m.is_guest`,
      [userId, organizationId],
    );
    const membership = rows[0];
    if (!membership) return null;

    const isOwner = membership.roles.includes(ROLES.OWNER);
    if (isOwner) {
      // Owners implicitly have every organization permission, including newly added ones
      const all = await executor.query<{ name: string }>('SELECT name FROM permissions ORDER BY name');
      membership.permissions = all.rows.map((r) => r.name);
    }
    return { ...membership, isOwner };
  }

  /** Organizations the user can switch to (active membership in an active organization). */
  async listOrganizations(userId: number): Promise<OrganizationSummary[]> {
    const { rows } = await db.query<OrganizationSummary>(
      `SELECT o.id, o.name, o.slug,
              COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
         FROM organization_members m
         JOIN organizations o      ON o.id = m.organization_id
         LEFT JOIN member_roles mr ON mr.organization_id = m.organization_id AND mr.user_id = m.user_id
         LEFT JOIN roles r         ON r.id = mr.role_id
        WHERE m.user_id = $1 AND m.status = 'active' AND o.status = 'active'
        GROUP BY o.id
        ORDER BY o.name`,
      [userId],
    );
    return rows;
  }

  /**
   * Picks the organization to work in: the requested one (header) if the user may access it,
   * otherwise the last one they used, otherwise their first organization, otherwise none.
   */
  async resolveActiveOrganization(userId: number, requestedId: number | null): Promise<TenantContext | null> {
    if (requestedId) {
      const requested = await this.getMembership(userId, requestedId);
      if (requested) return requested;
    }

    const { rows } = await db.query<{ lastOrganizationId: number | null }>(
      'SELECT last_organization_id AS "lastOrganizationId" FROM users WHERE id = $1',
      [userId],
    );
    const lastId = rows[0]?.lastOrganizationId;
    if (lastId && lastId !== requestedId) {
      const last = await this.getMembership(userId, lastId);
      if (last) return last;
    }

    const [first] = await this.listOrganizations(userId);
    return first ? this.getMembership(userId, first.id) : null;
  }

  /**
   * Sidebar tree: platform menus for platform admins, organization menus filtered by the
   * permissions in the active organization. Empty groups are removed.
   */
  async getMenus(user: AuthUser, tenant: TenantContext | null): Promise<MenuNode[]> {
    const { rows } = await db.query<MenuRow>(
      `SELECT m.id, m.key, m.label, m.path, m.icon, m.scope,
              m.parent_id AS "parentId", p.name AS permission
         FROM menus m
         LEFT JOIN permissions p ON p.id = m.permission_id
        WHERE m.is_active = TRUE
        ORDER BY m.sort_order, m.id`,
    );

    const visible = rows.filter((m) => {
      if (m.scope === 'platform') return user.isPlatformAdmin;
      if (!tenant) return false;
      return !m.permission || tenant.isOwner || tenant.permissions.includes(m.permission);
    });

    const build = (parentId: number | null): MenuNode[] =>
      visible
        .filter((m) => m.parentId === parentId)
        .map((m) => ({
          id: m.id,
          key: m.key,
          label: m.label,
          path: m.path,
          icon: m.icon,
          scope: m.scope,
          children: build(m.id),
        }))
        // A group heading (no path) is only shown if it has visible children
        .filter((m) => m.path || m.children.length > 0);

    return build(null);
  }

  async getProfile(user: AuthUser, tenant: TenantContext | null): Promise<Profile> {
    const [organizations, menus] = await Promise.all([this.listOrganizations(user.id), this.getMenus(user, tenant)]);
    return {
      ...user,
      organizations,
      organization: tenant ? { id: tenant.organizationId, name: tenant.name, slug: tenant.slug, plan: tenant.plan } : null,
      roles: tenant?.roles ?? [],
      permissions: tenant?.permissions ?? [],
      isOwner: tenant?.isOwner ?? false,
      isGuest: tenant?.isGuest ?? false,
      menus,
    };
  }

  /** Remembers the organization the user works in, so the next login opens it. */
  async rememberOrganization(userId: number, organizationId: number, executor: Queryable = db): Promise<void> {
    await executor.query('UPDATE users SET last_organization_id = $2 WHERE id = $1', [userId, organizationId]);
  }

  async countActiveOwners(organizationId: number, executor: Queryable = db, excludeUserId?: number): Promise<number> {
    const { rows } = await executor.query<{ count: number }>(
      `SELECT COUNT(DISTINCT m.user_id)::int AS count
         FROM organization_members m
         JOIN member_roles mr ON mr.organization_id = m.organization_id AND mr.user_id = m.user_id
         JOIN roles r ON r.id = mr.role_id
        WHERE m.organization_id = $1 AND m.status = 'active' AND r.name = $2
          AND ($3::int IS NULL OR m.user_id <> $3)`,
      [organizationId, ROLES.OWNER, excludeUserId ?? null],
    );
    return rows[0]!.count;
  }

  async countActivePlatformAdmins(executor: Queryable = db, excludeUserId?: number): Promise<number> {
    const { rows } = await executor.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM users
        WHERE is_platform_admin = TRUE AND is_active = TRUE AND ($1::int IS NULL OR id <> $1)`,
      [excludeUserId ?? null],
    );
    return rows[0]!.count;
  }
}

export const rbacService = new RbacService();
