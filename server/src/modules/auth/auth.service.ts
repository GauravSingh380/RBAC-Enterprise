import { db, withTransaction, type Queryable } from '../../database/db.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '../../common/exceptions/http.exception.js';
import { logger } from '../../common/logger/logger.js';
import { audit } from '../../common/utils/audit.js';
import { hashPassword, verifyPassword } from '../../common/utils/password.js';
import type { RequestContext } from '../../common/utils/request-context.js';
import { generateRefreshToken, generateSecureToken, hashToken, signAccessToken } from '../../common/utils/tokens.js';
import { env } from '../../config/env.js';
import { queueEmail } from '../email/email.service.js';
import { acceptInvitation } from '../invitations/invitations.service.js';
import { createOrganization } from '../organizations/organizations.service.js';
import { rbacService } from '../rbac/rbac.service.js';
import type { Profile } from '../rbac/rbac.types.js';
import { accountPolicy, passwordProblem, sessionEndReason } from '../security/security-policy.js';
import type { LoginDto, RegisterDto } from './auth.dto.js';

// Arbitrary key used to serialise registrations (so only ONE first user becomes platform owner)
const REGISTER_LOCK_KEY = 42_001;
const RESET_TOKEN_MINUTES = 60;

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: Profile;
}

export class AuthService {
  /**
   * Self-serve signup. The new account either creates its own organization (and owns it)
   * or joins one through an invitation. The very first account on the platform also
   * becomes the platform admin (product owner).
   */
  async register(dto: RegisterDto, ctx: RequestContext): Promise<AuthResult> {
    const passwordHash = await hashPassword(dto.password);

    const { userId, organizationId, refreshToken } = await withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock($1)', [REGISTER_LOCK_KEY]);

      const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [dto.email]);
      if (existing.rowCount) throw new ConflictException('An account with this email already exists');

      const { rows: countRows } = await client.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM users');
      const isFirstUser = countRows[0]!.count === 0;

      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO users (name, email, password_hash, is_platform_admin, last_login_at)
         VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
        [dto.name, dto.email, passwordHash, isFirstUser],
      );
      const userId = rows[0]!.id;

      const organizationId = dto.invitationToken
        ? await acceptInvitation(client, dto.invitationToken, { id: userId, email: dto.email })
        : (await createOrganization(client, { name: dto.organizationName!, ownerId: userId })).id;
      await rbacService.rememberOrganization(userId, organizationId, client);
      if (dto.invitationToken) {
        // the organization may have stricter password rules than the product minimum
        const problem = passwordProblem(dto.password, await accountPolicy(client, userId));
        if (problem) throw new BadRequestException(problem, [{ field: 'password', message: problem }]);
      }

      logger.info(
        dto.invitationToken ? 'New user joined an organization by invitation' : 'New user registered and created an organization',
        { userId, email: dto.email, organizationId, platformAdmin: isFirstUser },
      );
      await audit(
        ctx,
        {
          action: dto.invitationToken ? 'auth.register_invited' : 'auth.register',
          entity: 'user',
          entityId: userId,
          userId,
          organizationId,
          details: { platformAdmin: isFirstUser },
        },
        client,
      );
      if (!dto.invitationToken) {
        await queueEmail(
          { to: dto.email, template: 'welcome', data: { name: dto.name, organizationName: dto.organizationName!, url: `${env.appUrl}/dashboard` }, organizationId },
          client,
        );
      }

      const refreshToken = await this.createRefreshToken(userId, ctx, client);
      return { userId, organizationId, refreshToken };
    });

    return this.buildResult(userId, refreshToken, organizationId);
  }

  async login(dto: LoginDto, ctx: RequestContext, requestedOrganizationId: number | null): Promise<AuthResult> {
    const { rows } = await db.query<{ id: number; password_hash: string; is_active: boolean }>(
      'SELECT id, password_hash, is_active FROM users WHERE email = $1',
      [dto.email],
    );
    const user = rows[0];
    const valid = await verifyPassword(dto.password, user?.password_hash);

    if (!user || !valid) {
      logger.warn('Failed login attempt', { email: dto.email, ip: ctx.ip });
      await audit(ctx, { action: 'auth.login_failed', userId: user?.id ?? null, details: { email: dto.email } });
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.is_active) {
      throw new ForbiddenException('Your account is deactivated. Please contact support.');
    }

    // Existing passwords are checked against the (possibly new) rules here: the only moment we see them.
    const weak = passwordProblem(dto.password, await accountPolicy(db, user.id)) !== null;
    await db.query(
      'UPDATE users SET last_login_at = NOW(), password_change_required = password_change_required OR $2 WHERE id = $1',
      [user.id, weak],
    );
    await audit(ctx, { action: 'auth.login', entity: 'user', entityId: user.id, userId: user.id, details: weak ? { passwordChangeRequired: true } : undefined });

    const refreshToken = await this.createRefreshToken(user.id, ctx);
    return this.buildResult(user.id, refreshToken, requestedOrganizationId);
  }

  /**
   * Rotates the refresh token. If an already-revoked token is presented,
   * it was probably stolen, so every session of that user is revoked.
   */
  async refresh(token: string | undefined, ctx: RequestContext, requestedOrganizationId: number | null): Promise<AuthResult> {
    if (!token) throw new UnauthorizedException('No session');

    const outcome = await withTransaction(async (client) => {
      const { rows } = await client.query<{
        id: number;
        user_id: number;
        expires_at: Date;
        revoked_at: Date | null;
        created_at: Date;
        session_started_at: Date;
      }>(
        'SELECT id, user_id, expires_at, revoked_at, created_at, session_started_at FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE',
        [hashToken(token)],
      );
      const stored = rows[0];
      if (!stored) return { ok: false as const };

      if (stored.revoked_at) {
        logger.warn('Refresh token reuse detected - revoking all sessions', { userId: stored.user_id, ip: ctx.ip });
        await client.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [stored.user_id]);
        await audit(ctx, { action: 'auth.refresh_reuse_detected', userId: stored.user_id }, client);
        return { ok: false as const };
      }
      if (stored.expires_at < new Date()) return { ok: false as const };

      // Organization session rules. The token was issued at the last refresh, so its age = time without activity
      // (the browser only refreshes when it uses the API).
      const ended = sessionEndReason(await accountPolicy(client, stored.user_id), {
        startedAt: stored.session_started_at,
        lastActivityAt: stored.created_at,
      });
      if (ended) {
        await client.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [stored.id]);
        await audit(ctx, { action: 'auth.session_timeout', entity: 'user', entityId: stored.user_id, userId: stored.user_id, details: { reason: ended } }, client);
        return { ok: false as const, ended };
      }

      await client.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [stored.id]);
      const refreshToken = await this.createRefreshToken(stored.user_id, ctx, client, stored.session_started_at);
      return { ok: true as const, userId: stored.user_id, refreshToken };
    });

    if (!outcome.ok) {
      if (outcome.ended === 'idle') {
        throw new UnauthorizedException('You were signed out after a period of inactivity. Please sign in again.').withCode('SESSION_IDLE');
      }
      if (outcome.ended === 'max') {
        throw new UnauthorizedException('Your session reached the maximum length set by your organization. Please sign in again.').withCode('SESSION_MAX');
      }
      throw new UnauthorizedException('Session expired, please log in again');
    }
    return this.buildResult(outcome.userId, outcome.refreshToken, requestedOrganizationId);
  }

  /** Profile for the requested (or default) organization. */
  async me(ctx: RequestContext, requestedOrganizationId: number | null): Promise<Profile> {
    const user = ctx.user!;
    const tenant = await rbacService.resolveActiveOrganization(user.id, requestedOrganizationId);
    return rbacService.getProfile(user, tenant);
  }

  /** Makes another organization active (and the default for the next login). */
  async switchOrganization(organizationId: number, ctx: RequestContext): Promise<Profile> {
    const user = ctx.user!;
    const tenant = await rbacService.getMembership(user.id, organizationId);
    if (!tenant) throw new ForbiddenException('You are not an active member of this organization, or it is suspended');

    await rbacService.rememberOrganization(user.id, organizationId);
    await audit(ctx, { action: 'auth.switch_organization', entity: 'organization', entityId: organizationId, organizationId });
    return rbacService.getProfile(user, tenant);
  }

  // ------------------------------------------------------------------ passwords & profile

  /**
   * "Forgot password". Always answers the same way whether or not the email exists,
   * so attackers cannot use it to discover registered emails.
   */
  async forgotPassword(email: string, ctx: RequestContext): Promise<void> {
    const { rows } = await db.query<{ id: number; name: string }>(
      'SELECT id, name FROM users WHERE email = $1 AND is_active = TRUE',
      [email],
    );
    const user = rows[0];
    if (!user) {
      logger.info('Password reset requested for unknown or inactive email', { email });
      return;
    }

    const token = generateSecureToken();
    await withTransaction(async (client) => {
      // Only the newest link works
      await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
      await client.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, ip_address)
         VALUES ($1, $2, NOW() + make_interval(mins => $3), $4)`,
        [user.id, hashToken(token), RESET_TOKEN_MINUTES, ctx.ip],
      );
      await queueEmail(
        {
          to: email,
          template: 'passwordReset',
          data: { name: user.name, url: `${env.appUrl}/reset-password?token=${token}`, minutes: RESET_TOKEN_MINUTES },
        },
        client,
      );
      await audit(ctx, { action: 'auth.password_reset_requested', entity: 'user', entityId: user.id, userId: user.id }, client);
    });
  }

  /** Is this reset link still usable? (lets the UI show "link expired" before typing a password) */
  async checkResetToken(token: string): Promise<{ valid: boolean; email?: string }> {
    const { rows } = await db.query<{ email: string }>(
      `SELECT u.email FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > NOW() AND u.is_active = TRUE`,
      [hashToken(token)],
    );
    if (!rows[0]) return { valid: false };
    // mask: g****h@gmail.com
    const [local, domain] = rows[0].email.split('@');
    return { valid: true, email: `${local!.charAt(0)}${'*'.repeat(Math.max(1, local!.length - 2))}${local!.slice(-1)}@${domain}` };
  }

  /** Sets a new password from a reset link and signs the user out everywhere. */
  async resetPassword(token: string, password: string, ctx: RequestContext): Promise<void> {
    const passwordHash = await hashPassword(password);
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: number; userId: number; name: string; email: string }>(
        `SELECT t.id, t.user_id AS "userId", u.name, u.email
           FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
          WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > NOW() AND u.is_active = TRUE
          FOR UPDATE OF t`,
        [hashToken(token)],
      );
      const reset = rows[0];
      if (!reset) throw new BadRequestException('This reset link is invalid or has expired. Please request a new one.');
      const problem = passwordProblem(password, await accountPolicy(client, reset.userId));
      if (problem) throw new BadRequestException(problem, [{ field: 'password', message: problem }]);

      await client.query(
        'UPDATE users SET password_hash = $1, password_change_required = FALSE, updated_at = NOW() WHERE id = $2',
        [passwordHash, reset.userId],
      );
      await client.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [reset.userId]);
      await revokeAllSessions(reset.userId, client);
      await audit(ctx, { action: 'auth.password_reset', entity: 'user', entityId: reset.userId, userId: reset.userId }, client);
      await queueEmail(
        { to: reset.email, template: 'passwordChanged', data: { name: reset.name, when: new Date().toUTCString(), ip: ctx.ip } },
        client,
      );
    });
  }

  /** Logged-in password change. Other devices are signed out; this session stays. */
  async changePassword(currentPassword: string, newPassword: string, currentRefreshToken: string | undefined, ctx: RequestContext): Promise<void> {
    const user = ctx.user!;
    const { rows } = await db.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    if (!(await verifyPassword(currentPassword, rows[0]?.password_hash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (currentPassword === newPassword) throw new BadRequestException('The new password must be different');
    const problem = passwordProblem(newPassword, await accountPolicy(db, user.id));
    if (problem) throw new BadRequestException(problem, [{ field: 'newPassword', message: problem }]);

    const passwordHash = await hashPassword(newPassword);
    await withTransaction(async (client) => {
      await client.query(
        'UPDATE users SET password_hash = $1, password_change_required = FALSE, updated_at = NOW() WHERE id = $2',
        [passwordHash, user.id],
      );
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = NOW()
          WHERE user_id = $1 AND revoked_at IS NULL AND ($2::text IS NULL OR token_hash <> $2)`,
        [user.id, currentRefreshToken ? hashToken(currentRefreshToken) : null],
      );
      await audit(ctx, { action: 'auth.password_change', entity: 'user', entityId: user.id }, client);
      await queueEmail(
        { to: user.email, template: 'passwordChanged', data: { name: user.name, when: new Date().toUTCString(), ip: ctx.ip } },
        client,
      );
    });
  }

  async updateProfile(name: string, ctx: RequestContext, requestedOrganizationId: number | null): Promise<Profile> {
    const user = ctx.user!;
    await db.query('UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2', [name, user.id]);
    await audit(ctx, { action: 'auth.profile_update', entity: 'user', entityId: user.id, details: { name } });
    return this.me({ ...ctx, user: { ...user, name } }, requestedOrganizationId);
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL', [
      hashToken(token),
    ]);
  }

  /** Signs the user out from every device. */
  async logoutAll(userId: number, ctx: RequestContext): Promise<void> {
    await revokeAllSessions(userId);
    await audit(ctx, { action: 'auth.logout_all', entity: 'user', entityId: userId });
  }

  /** `sessionStartedAt` is kept through rotation (a new sign-in starts a new session). */
  private async createRefreshToken(userId: number, ctx: RequestContext, executor: Queryable = db, sessionStartedAt?: Date): Promise<string> {
    // Housekeeping: drop this user's expired / long-revoked tokens
    await executor.query(
      `DELETE FROM refresh_tokens
        WHERE
          user_id = $1
          AND (
            expires_at < NOW()
            OR revoked_at < NOW() - INTERVAL '1 day'
          )`,
      [userId],
    );

    const token = generateRefreshToken();
    await executor.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address, session_started_at)
       VALUES ($1, $2, NOW() + make_interval(days => $3), $4, $5, COALESCE($6, NOW()))`,
      [userId, hashToken(token), env.auth.refreshTokenDays, ctx.userAgent, ctx.ip, sessionStartedAt ?? null],
    );
    return token;
  }

  private async buildResult(userId: number, refreshToken: string, requestedOrganizationId: number | null): Promise<AuthResult> {
    const user = await rbacService.getAuthUser(userId);
    if (!user) throw new UnauthorizedException('Account is inactive or no longer exists');
    const tenant = await rbacService.resolveActiveOrganization(userId, requestedOrganizationId);
    return { accessToken: signAccessToken(userId), refreshToken, user: await rbacService.getProfile(user, tenant) };
  }
}

/** Revokes every refresh token of a user (used on logout-all and account deactivation). */
export async function revokeAllSessions(userId: number, executor: Queryable = db): Promise<void> {
  await executor.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}
