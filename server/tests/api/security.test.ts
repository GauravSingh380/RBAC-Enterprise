// Phase 3e: password & session rules per organization.
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { db } from '../../src/database/db.js';
import { addMember, apiAs, publicApi, registerOwner, uniqueEmail, type TestUser } from '../helpers.js';

let owner: TestUser;
let member: TestUser;

const login = (email: string, password: string) => publicApi().post('/api/auth/login').send({ email, password });
const cookieOf = (res: request.Response) => ((res.headers['set-cookie'] as unknown as string[]) ?? [])[0]?.split(';')[0] ?? '';

beforeAll(async () => {
  owner = await registerOwner('Secure Org');
  member = await addMember(owner, 'member', 'Weak Password'); // password "secret123"
});

describe('password rules', () => {
  it('owners (organization.manage) read and change them; members cannot', async () => {
    expect((await owner.api.get('/organizations/current/security')).body.data).toEqual({
      minLength: 8, requireSymbol: false, sessionIdleMinutes: null, sessionMaxHours: null,
    });
    expect((await member.api.get('/organizations/current/security')).status).toBe(403);
    expect((await owner.api.patch('/organizations/current/security', { minLength: 4 })).status).toBe(400);

    const saved = await owner.api.patch('/organizations/current/security', { minLength: 12, requireSymbol: true });
    expect(saved.body.data).toMatchObject({ minLength: 12, requireSymbol: true, sessionIdleMinutes: null });
    const { rows } = await db.query(`SELECT action FROM audit_logs WHERE organization_id = $1 AND action = 'organization.security_update'`, [owner.orgId]);
    expect(rows).toHaveLength(1);
  });

  it('joining through an invitation must follow them (the invite page shows them)', async () => {
    const roleId = (await owner.api.get('/roles')).body.data.find((r: { name: string }) => r.name === 'member').id;
    const email = uniqueEmail('strict');
    const token = (await owner.api.post('/invitations', { email, roleId })).body.data.inviteUrl.split('/invite/')[1];
    expect((await publicApi().get(`/api/invitations/token/${token}`)).body.data.passwordPolicy).toEqual({ minLength: 12, requireSymbol: true });

    const weak = await publicApi().post('/api/auth/register').send({ name: 'New One', email, password: 'secret123', invitationToken: token });
    expect(weak.status).toBe(400);
    expect(weak.body.message).toContain('at least 12');
    expect((await db.query('SELECT 1 FROM users WHERE email = $1', [email])).rowCount).toBe(0); // rolled back

    const strong = await publicApi().post('/api/auth/register').send({ name: 'New One', email, password: 'much-longer-pw1', invitationToken: token });
    expect(strong.status).toBe(201);
    expect(strong.body.data.user.passwordChangeRequired).toBe(false);
  });

  it('a weak existing password is caught at sign-in: only the account API works until it is changed', async () => {
    const res = await login(member.email, 'secret123');
    expect(res.status).toBe(200);
    expect(res.body.data.user.passwordChangeRequired).toBe(true);
    const api = apiAs(res.body.data.accessToken, member.orgId);

    const blocked = await api.get('/projects');
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await api.get('/auth/me')).status).toBe(200);
    expect((await api.get('/auth/password-policy')).body.data).toEqual({ minLength: 12, requireSymbol: true });

    const stillWeak = await api.post('/auth/change-password', { currentPassword: 'secret123', newPassword: 'longenough123' });
    expect(stillWeak.status).toBe(400);
    expect(stillWeak.body.message).toContain('symbol');

    expect((await api.post('/auth/change-password', { currentPassword: 'secret123', newPassword: 'long-enough-123' })).status).toBe(204);
    expect((await api.get('/auth/me')).body.data.passwordChangeRequired).toBe(false);
    expect((await api.get('/projects')).status).toBe(200);
    member.password = 'long-enough-123';
  });

  it('"ask everyone to set a new password" flags every other member', async () => {
    const res = await owner.api.post('/organizations/current/security/require-password-change');
    expect(res.body.data.affected).toBeGreaterThanOrEqual(2);
    expect((await member.api.get('/projects')).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await owner.api.get('/projects')).status).toBe(200); // not the person asking
    await db.query('UPDATE users SET password_change_required = FALSE WHERE id = $1', [member.id]);
  });

  it('an account in several organizations follows the strictest rules', async () => {
    const other = await registerOwner('Lenient Org'); // minimum 8
    expect((await other.api.get('/auth/password-policy')).body.data).toEqual({ minLength: 8, requireSymbol: false });
    const roleId = (await owner.api.get('/roles')).body.data.find((r: { name: string }) => r.name === 'member').id;
    const token = (await owner.api.post('/invitations', { email: other.email, roleId })).body.data.inviteUrl.split('/invite/')[1];
    expect((await other.api.post(`/invitations/token/${token}/accept`)).status).toBeLessThan(300);
    expect((await other.api.get('/auth/password-policy')).body.data).toEqual({ minLength: 12, requireSymbol: true });
  });
});

describe('session rules', () => {
  const refresh = (cookie: string) => publicApi().post('/api/auth/refresh').set('Cookie', cookie);
  const ageSession = (userId: number, sql: string) => db.query(`UPDATE refresh_tokens SET ${sql} WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);

  it('the session start is kept when the refresh token rotates', async () => {
    const cookie = cookieOf(await login(member.email, member.password));
    await ageSession(member.id, "session_started_at = NOW() - INTERVAL '3 hours'");
    const res = await refresh(cookie);
    expect(res.status).toBe(200);
    const { rows } = await db.query(
      `SELECT NOW() - session_started_at > INTERVAL '2 hours' AS kept FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL`,
      [member.id],
    );
    expect(rows.every((r) => r.kept)).toBe(true);
  });

  it('signs out after inactivity', async () => {
    await owner.api.patch('/organizations/current/security', { sessionIdleMinutes: 30 });
    const cookie = cookieOf(await login(member.email, member.password));
    expect((await refresh(cookie)).status).toBe(200); // active: fine

    const cookie2 = cookieOf(await login(member.email, member.password));
    await ageSession(member.id, "created_at = NOW() - INTERVAL '31 minutes'");
    const res = await refresh(cookie2);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_IDLE');
  });

  it('ends sessions older than the maximum length, even when active', async () => {
    await owner.api.patch('/organizations/current/security', { sessionIdleMinutes: null, sessionMaxHours: 8 });
    const cookie = cookieOf(await login(member.email, member.password));
    await ageSession(member.id, "session_started_at = NOW() - INTERVAL '9 hours'");
    const res = await refresh(cookie);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('SESSION_MAX');
    const { rows } = await db.query(`SELECT details FROM audit_logs WHERE user_id = $1 AND action = 'auth.session_timeout' ORDER BY id`, [member.id]);
    expect(rows.map((r) => r.details.reason)).toEqual(['idle', 'max']);
  });

  it('accounts outside the organization are not affected', async () => {
    const outsider = await registerOwner('Free Org');
    const cookie = cookieOf(await login(outsider.email, outsider.password));
    await ageSession(outsider.id, "session_started_at = NOW() - INTERVAL '30 hours', created_at = NOW() - INTERVAL '5 hours'");
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(200);
  });
});
