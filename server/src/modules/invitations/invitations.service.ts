// Invitations: an admin invites an email address to the organization with a role.
// The invitee opens the link and either logs in (existing account) or registers.
// Only the SHA-256 of the link token is stored.
import { db, withTransaction, type Queryable } from '../../database/db.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/http.exception.js';
import { audit } from '../../common/utils/audit.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';
import { generateSecureToken, hashToken } from '../../common/utils/tokens.js';
import { env } from '../../config/env.js';
import { queueEmail } from '../email/email.service.js';
import { rbacService } from '../rbac/rbac.service.js';
import { assertWithinPlan } from '../plans/plan-limits.js';
import { getProjectAccess } from '../projects/project-access.js';
import { assertCanGrantRoles } from '../roles/role-guards.js';
import { organizationPolicy, type PasswordPolicy } from '../security/security-policy.js';
import type { CreateInvitationDto } from './invitations.dto.js';

const INVITATION_DAYS = 7;

export interface Invitation {
  id: number;
  email: string;
  role: { id: number; name: string; displayName: string };
  /** guest invitation: the project they join */
  project: { id: number; key: string; name: string; role: 'member' | 'viewer' } | null;
  invitedBy: { id: number; name: string } | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface InvitationPreview {
  organizationName: string;
  email: string;
  roleName: string;
  /** guest invitation: the project name */
  projectName: string | null;
  /** the organization's password rules (for the sign-up form) */
  passwordPolicy: PasswordPolicy;
  invitedBy: string | null;
  expiresAt: Date;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
}

export class InvitationsService {
  /** Pending (not accepted / revoked / expired) invitations of the active organization. */
  async findPending(ctx: RequestContext): Promise<Invitation[]> {
    const { rows } = await db.query<Invitation>(
      `SELECT i.id, i.email, i.expires_at AS "expiresAt", i.created_at AS "createdAt",
              json_build_object('id', r.id, 'name', r.name, 'displayName', r.display_name) AS role,
              CASE WHEN p.id IS NULL THEN NULL
                   ELSE json_build_object('id', p.id, 'key', p.key, 'name', p.name, 'role', i.project_role) END AS project,
              CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name) END AS "invitedBy"
         FROM invitations i
         JOIN roles r ON r.id = i.role_id
         LEFT JOIN projects p ON p.id = i.project_id
         LEFT JOIN users u ON u.id = i.invited_by
        WHERE i.organization_id = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > NOW()
        ORDER BY i.created_at DESC`,
      [tenantOf(ctx).organizationId],
    );
    return rows;
  }

  /** Creates an invitation and returns the one-time link (shown once to the inviter). */
  async create(dto: CreateInvitationDto, ctx: RequestContext): Promise<{ invitation: Invitation; inviteUrl: string }> {
    const tenant = tenantOf(ctx);
    const token = generateSecureToken();

    const guest = !!dto.projectId;
    // a guest joins one project: the inviter must administer it (project admins / organization project admins)
    const project = guest ? (await getProjectAccess(ctx, dto.projectId!)) : null;
    if (project && !project.canManage) throw new ForbiddenException('Only an admin of this project can invite guests to it');
    if (project && project.project.status !== 'active') throw new BadRequestException('This project is archived');

    const id = await withTransaction(async (client) => {
      const roleId = guest ? await guestRoleId(client, tenant.organizationId) : dto.roleId!;
      if (!guest) await assertCanGrantRoles(tenant, [roleId], client);

      const member = await client.query(
        `SELECT 1 FROM organization_members m JOIN users u ON u.id = m.user_id
          WHERE m.organization_id = $1 AND u.email = $2 AND m.status = 'active'`,
        [tenant.organizationId, dto.email],
      );
      if (member.rowCount) throw new ConflictException(`${dto.email} is already a member of this organization`);

      // Only one open invitation per email: replace older ones
      await client.query(
        `UPDATE invitations SET revoked_at = NOW()
          WHERE organization_id = $1 AND email = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
        [tenant.organizationId, dto.email],
      );
      // pending invitations count towards the plan: no more invitations than places
      await assertWithinPlan(client, tenant.organizationId, guest ? 'guests' : 'members');

      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO invitations (organization_id, email, role_id, token_hash, invited_by, expires_at, project_id, project_role)
         VALUES ($1, $2, $3, $4, $5, NOW() + make_interval(days => $6), $7, $8) RETURNING id`,
        [tenant.organizationId, dto.email, roleId, hashToken(token), ctx.user!.id, INVITATION_DAYS,
         project?.project.id ?? null, guest ? dto.projectRole : null],
      );
      const role = await client.query<{ displayName: string }>('SELECT display_name AS "displayName" FROM roles WHERE id = $1', [roleId]);
      // Sent by the background worker; part of this transaction (no email if the invite fails)
      await queueEmail(
        {
          to: dto.email,
          template: 'invitation',
          organizationId: tenant.organizationId,
          data: {
            organizationName: tenant.name,
            inviterName: ctx.user!.name,
            roleName: project ? `Guest on the project "${project.project.name}"` : (role.rows[0]?.displayName ?? 'Member'),
            url: `${env.appUrl}/invite/${token}`,
            expiresDays: INVITATION_DAYS,
          },
        },
        client,
      );
      await audit(
        ctx,
        { action: 'invitation.create', entity: 'invitation', entityId: rows[0]!.id, details: { email: dto.email, roleId, guestProjectId: project?.project.id } },
        client,
      );
      return rows[0]!.id;
    });

    const invitation = (await this.findPending(ctx)).find((i) => i.id === id)!;
    // The link is emailed AND returned once so the inviter can also share it directly
    return { invitation, inviteUrl: `${env.appUrl}/invite/${token}` };
  }

  async revoke(id: number, ctx: RequestContext): Promise<void> {
    const { rowCount } = await db.query(
      `UPDATE invitations SET revoked_at = NOW()
        WHERE id = $1 AND organization_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
      [id, tenantOf(ctx).organizationId],
    );
    if (!rowCount) throw new NotFoundException('Invitation not found');
    await audit(ctx, { action: 'invitation.revoke', entity: 'invitation', entityId: id });
  }

  /** Public: what the invite link is about (shown before login / registration). */
  async preview(token: string): Promise<InvitationPreview> {
    const { rows } = await db.query<Omit<InvitationPreview, 'passwordPolicy' | 'status'> & { organizationId: number; acceptedAt: Date | null; revokedAt: Date | null }>(
      `SELECT o.id AS "organizationId", o.name AS "organizationName", i.email, r.display_name AS "roleName", u.name AS "invitedBy",
              p.name AS "projectName",
              i.expires_at AS "expiresAt", i.accepted_at AS "acceptedAt", i.revoked_at AS "revokedAt"
         FROM invitations i
         JOIN organizations o ON o.id = i.organization_id
         JOIN roles r ON r.id = i.role_id
         LEFT JOIN projects p ON p.id = i.project_id
         LEFT JOIN users u ON u.id = i.invited_by
        WHERE i.token_hash = $1`,
      [hashToken(token)],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('This invitation link is invalid');

    const status = row.acceptedAt ? 'accepted' : row.revokedAt ? 'revoked' : row.expiresAt < new Date() ? 'expired' : 'pending';
    const { minLength, requireSymbol } = await organizationPolicy(db, row.organizationId);
    return {
      organizationName: row.organizationName,
      email: row.email,
      roleName: row.roleName,
      projectName: row.projectName,
      passwordPolicy: { minLength, requireSymbol },
      invitedBy: row.invitedBy,
      expiresAt: row.expiresAt,
      status,
    };
  }

  /** A logged-in user accepts an invitation. Returns the organization id they joined. */
  async accept(token: string, ctx: RequestContext): Promise<number> {
    const user = ctx.user!;
    return withTransaction(async (client) => {
      const organizationId = await acceptInvitation(client, token, user);
      await audit(ctx, { action: 'invitation.accept', entity: 'user', entityId: user.id, organizationId }, client);
      return organizationId;
    });
  }
}

/**
 * Consumes an invitation for `user` inside a transaction: adds (or re-activates) the membership
 * with the invited role. Used by accept() and by registration with an invitation token.
 */
export async function acceptInvitation(executor: Queryable, token: string, user: { id: number; email: string }): Promise<number> {
  const { rows } = await executor.query<{
    id: number;
    organizationId: number;
    email: string;
    roleId: number;
    invitedBy: number | null;
    expiresAt: Date;
    acceptedAt: Date | null;
    revokedAt: Date | null;
    projectId: number | null;
    projectRole: 'member' | 'viewer' | null;
  }>(
    `SELECT i.id, i.organization_id AS "organizationId", i.email, i.role_id AS "roleId", i.invited_by AS "invitedBy",
            i.expires_at AS "expiresAt", i.accepted_at AS "acceptedAt", i.revoked_at AS "revokedAt",
            i.project_id AS "projectId", i.project_role AS "projectRole"
       FROM invitations i
       JOIN organizations o ON o.id = i.organization_id AND o.status = 'active'
      WHERE i.token_hash = $1
      FOR UPDATE OF i`,
    [hashToken(token)],
  );
  const invitation = rows[0];
  if (!invitation || invitation.revokedAt) throw new BadRequestException('This invitation is no longer valid');
  if (invitation.acceptedAt) throw new BadRequestException('This invitation has already been used');
  if (invitation.expiresAt < new Date()) throw new BadRequestException('This invitation has expired');
  if (invitation.email !== user.email.toLowerCase()) {
    throw new ForbiddenException(`This invitation was sent to ${invitation.email}. Log in with that account to accept it.`);
  }

  const { organizationId } = invitation;
  const guest = invitation.projectId !== null;
  const { rows: existing } = await executor.query<{ active: boolean; isGuest: boolean }>(
    `SELECT status = 'active' AS active, is_guest AS "isGuest" FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
    [organizationId, user.id],
  );
  // already a full member and invited as a guest: keep full membership, just join the project
  const staysMember = guest && existing[0]?.active && !existing[0].isGuest;

  if (!staysMember) {
    // the plan may have changed since the invitation was sent (this pending invitation is already counted)
    await assertWithinPlan(executor, organizationId, guest ? 'guests' : 'members', 0);
    await executor.query(
      `INSERT INTO organization_members (organization_id, user_id, invited_by, is_guest) VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, user_id) DO UPDATE SET status = 'active', is_guest = EXCLUDED.is_guest`,
      [organizationId, user.id, invitation.invitedBy, guest],
    );
    await executor.query('DELETE FROM member_roles WHERE organization_id = $1 AND user_id = $2', [organizationId, user.id]);
    await executor.query(
      'INSERT INTO member_roles (organization_id, user_id, role_id, assigned_by) VALUES ($1, $2, $3, $4)',
      [organizationId, user.id, invitation.roleId, invitation.invitedBy],
    );
  }
  if (guest) {
    await executor.query(
      `INSERT INTO project_members (project_id, organization_id, user_id, role, added_by)
       SELECT p.id, p.organization_id, $2, $3, $4 FROM projects p WHERE p.id = $1
       ON CONFLICT DO NOTHING`,
      [invitation.projectId, user.id, invitation.projectRole, invitation.invitedBy],
    );
  }
  await executor.query('UPDATE invitations SET accepted_at = NOW() WHERE id = $1', [invitation.id]);
  await rbacService.rememberOrganization(user.id, organizationId, executor);
  return organizationId;
}

/** The organization's system Guest role (every organization has one, copied from the role templates). */
async function guestRoleId(executor: Queryable, organizationId: number): Promise<number> {
  const { rows } = await executor.query<{ id: number }>(
    `SELECT id FROM roles WHERE organization_id = $1 AND name = 'guest' AND is_system`,
    [organizationId],
  );
  if (!rows[0]) throw new BadRequestException('This organization has no Guest role — ask the platform team');
  return rows[0].id;
}
