import crypto from 'node:crypto';
import { db, withTransaction, type Queryable } from '../../database/db.js';
import { ROLES } from '../../common/constants/rbac.js';
import { BadRequestException } from '../../common/exceptions/http.exception.js';
import type { TenantContext } from '../../common/types/auth.types.js';
import { audit } from '../../common/utils/audit.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';
import { rbacService } from '../rbac/rbac.service.js';
import { seedLeaveDefaults } from '../leave/leave-settings.service.js';

export interface Organization {
  id: number;
  name: string;
  slug: string;
  plan: string;
  status: string;
  memberCount: number;
  createdAt: Date;
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return slug || 'org';
}

async function uniqueSlug(name: string, executor: Queryable): Promise<string> {
  const base = slugify(name);
  const { rowCount } = await executor.query('SELECT 1 FROM organizations WHERE slug = $1', [base]);
  return rowCount ? `${base}-${crypto.randomBytes(3).toString('hex')}` : base;
}

/**
 * Creates a tenant: the organization row, its own copy of every role template
 * (with permissions), and the creator as the first owner. Must run inside a transaction.
 */
export async function createOrganization(
  executor: Queryable,
  input: { name: string; ownerId: number },
): Promise<{ id: number; slug: string }> {
  const slug = await uniqueSlug(input.name, executor);
  const { rows } = await executor.query<{ id: number }>(
    'INSERT INTO organizations (name, slug, created_by) VALUES ($1, $2, $3) RETURNING id',
    [input.name, slug, input.ownerId],
  );
  const organizationId = rows[0]!.id;

  // Roles for this organization = its own copy of every role template (+ the template's permissions)
  await executor.query(
    `INSERT INTO roles (organization_id, name, display_name, description, is_system)
     SELECT $1, name, display_name, description, TRUE FROM role_templates ORDER BY sort_order`,
    [organizationId],
  );
  await executor.query(
    `INSERT INTO role_permissions (role_id, permission_id)
     SELECT r.id, tp.permission_id
       FROM roles r
       JOIN role_templates t ON t.name = r.name
       JOIN role_template_permissions tp ON tp.template_id = t.id
      WHERE r.organization_id = $1`,
    [organizationId],
  );

  // Creator = first member and owner
  await executor.query('INSERT INTO organization_members (organization_id, user_id) VALUES ($1, $2)', [
    organizationId,
    input.ownerId,
  ]);
  await executor.query(
    `INSERT INTO member_roles (organization_id, user_id, role_id, assigned_by)
     SELECT $1, $2, id, $2 FROM roles WHERE organization_id = $1 AND name = $3`,
    [organizationId, input.ownerId, ROLES.OWNER],
  );

  // Leave types (from leave_type_templates) + a default holiday calendar
  await seedLeaveDefaults(executor, organizationId);

  await executor.query(
    `INSERT INTO site_content (organization_id, key, content, updated_by) VALUES ($1, 'dashboard', $2, $3)`,
    [organizationId, JSON.stringify({ announcement: `Welcome to ${input.name}! 🎉` }), input.ownerId],
  );

  return { id: organizationId, slug };
}

export class OrganizationsService {
  /** A logged-in user creates another organization (self-serve) and becomes its owner. */
  async create(name: string, ctx: RequestContext): Promise<number> {
    const user = ctx.user!;
    return withTransaction(async (client) => {
      const org = await createOrganization(client, { name, ownerId: user.id });
      await rbacService.rememberOrganization(user.id, org.id, client);
      await audit(ctx, { action: 'organization.create', entity: 'organization', entityId: org.id, organizationId: org.id, details: { name } }, client);
      return org.id;
    });
  }

  async getCurrent(tenant: TenantContext): Promise<Organization> {
    const { rows } = await db.query<Organization>(
      `SELECT o.id, o.name, o.slug, o.plan, o.status, o.created_at AS "createdAt",
              (SELECT COUNT(*)::int FROM organization_members m WHERE m.organization_id = o.id AND m.status = 'active') AS "memberCount"
         FROM organizations o WHERE o.id = $1`,
      [tenant.organizationId],
    );
    return rows[0]!;
  }

  async update(name: string, ctx: RequestContext): Promise<Organization> {
    const tenant = tenantOf(ctx);
    await db.query('UPDATE organizations SET name = $1, updated_at = NOW() WHERE id = $2', [name, tenant.organizationId]);
    await audit(ctx, { action: 'organization.update', entity: 'organization', entityId: tenant.organizationId, details: { name } });
    return this.getCurrent(tenant);
  }

  /** The current user leaves the active organization (not allowed for the last owner). */
  async leave(ctx: RequestContext): Promise<void> {
    const tenant = tenantOf(ctx);
    const user = ctx.user!;
    await withTransaction(async (client) => {
      if (tenant.isOwner && (await rbacService.countActiveOwners(tenant.organizationId, client, user.id)) === 0) {
        throw new BadRequestException('You are the last owner. Make someone else an owner before leaving.');
      }
      await client.query('DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2', [
        tenant.organizationId,
        user.id,
      ]);
      await audit(ctx, { action: 'member.leave', entity: 'user', entityId: user.id }, client);
    });
  }
}
