// Test helpers: create users/organizations through the real API and call endpoints as them.
import request from 'supertest';
import app from '../src/app.js';
import { db } from '../src/database/db.js';
import { drainJobs } from '../src/jobs/index.js';

let seq = 0;
export const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}-${++seq}@test.local`;
export const uniqueKey = () => `K${(Date.now() % 1e6).toString(36).toUpperCase()}${++seq}`.slice(0, 10);

export interface TestUser {
  id: number;
  email: string;
  password: string;
  token: string;
  cookie: string;
  orgId: number;
  /** Calls the API as this user in `orgId` (or another organization). */
  api: ApiClient;
}

export type ApiClient = ReturnType<typeof apiAs>;

export function apiAs(token: string, orgId?: number) {
  const withHeaders = (req: request.Test, org = orgId) => {
    req.set('Authorization', `Bearer ${token}`);
    if (org) req.set('X-Organization-Id', String(org));
    return req;
  };
  return {
    get: (url: string, org?: number) => withHeaders(request(app).get(`/api${url}`), org),
    post: (url: string, body?: object, org?: number) => withHeaders(request(app).post(`/api${url}`), org).send(body ?? {}),
    put: (url: string, body?: object, org?: number) => withHeaders(request(app).put(`/api${url}`), org).send(body ?? {}),
    patch: (url: string, body?: object, org?: number) => withHeaders(request(app).patch(`/api${url}`), org).send(body ?? {}),
    delete: (url: string, org?: number) => withHeaders(request(app).delete(`/api${url}`), org),
    upload: (url: string, fileName: string, content: Buffer, org?: number) =>
      withHeaders(request(app).post(`/api${url}`), org).attach('file', content, fileName),
  };
}

export const publicApi = () => request(app);

function toUser(res: request.Response, email: string, password: string): TestUser {
  if (res.status >= 300) throw new Error(`Registration failed (${res.status}): ${JSON.stringify(res.body)}`);
  const cookieHeader = res.headers['set-cookie'] as unknown as string[] | undefined;
  const { accessToken, user } = res.body.data;
  return {
    id: user.id,
    email,
    password,
    token: accessToken,
    cookie: cookieHeader?.[0]?.split(';')[0] ?? '',
    orgId: user.organization?.id,
    api: apiAs(accessToken, user.organization?.id),
  };
}

/** Self-serve signup: new account + new organization (the user becomes its owner). */
export async function registerOwner(organizationName = 'Org'): Promise<TestUser> {
  const email = uniqueEmail('owner');
  const password = 'secret123';
  const res = await request(app).post('/api/auth/register').send({ name: 'Owner User', email, password, organizationName });
  const owner = toUser(res, email, password);
  // Most tests are not about plans: start on the unlimited plan. Plan limits are tested in api/plans.test.ts.
  await db.query(`UPDATE organizations SET plan = 'enterprise' WHERE id = $1`, [owner.orgId]);
  return owner;
}

/** Owner invites a new person with a role; the invitee registers through the link. */
export async function addMember(owner: TestUser, roleName: string, name = `${roleName} user`): Promise<TestUser> {
  const roles = await owner.api.get('/roles');
  const role = roles.body.data.find((r: { name: string }) => r.name === roleName);
  if (!role) throw new Error(`Role ${roleName} not found`);
  const email = uniqueEmail(roleName);
  const invite = await owner.api.post('/invitations', { email, roleId: role.id });
  if (invite.status !== 201) throw new Error(`Invite failed: ${JSON.stringify(invite.body)}`);
  const token = invite.body.data.inviteUrl.split('/invite/')[1];
  const password = 'secret123';
  const res = await request(app).post('/api/auth/register').send({ name, email, password, invitationToken: token });
  return toUser(res, email, password);
}

/** Runs queued background jobs (emails, ...) synchronously. */
export const runJobs = () => drainJobs();

/** Latest email sent to an address (from the outbox table). */
export async function lastEmailTo(to: string) {
  const { rows } = await db.query<{ subject: string; html: string; text: string; status: string; template: string }>(
    'SELECT subject, html, text, status, template FROM email_messages WHERE to_address = $1 ORDER BY id DESC LIMIT 1',
    [to],
  );
  return rows[0];
}
