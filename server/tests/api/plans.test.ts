// Phase 3e: plans and their limits (members, guests, active projects), enforced on the server.
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../src/database/db.js';
import { addMember, publicApi, registerOwner, uniqueEmail, uniqueKey, type TestUser } from '../helpers.js';

let platform: TestUser;
let owner: TestUser;
let memberRoleId: number;
const planKey = `tiny-${Date.now() % 100000}`;

const invite = (email = uniqueEmail('seat')) => owner.api.post('/invitations', { email, roleId: memberRoleId });
const usage = async () => (await owner.api.get('/organizations/current/usage')).body.data;

beforeAll(async () => {
  platform = await registerOwner('Platform Co');
  await db.query('UPDATE users SET is_platform_admin = TRUE WHERE id = $1', [platform.id]);
  owner = await registerOwner('Small Team');
  memberRoleId = (await owner.api.get('/roles')).body.data.find((r: { name: string }) => r.name === 'member').id;
});

describe('plans (platform owner)', () => {
  it('are managed by platform admins only', async () => {
    expect((await owner.api.get('/platform/plans')).status).toBe(403);
    const plans = (await platform.api.get('/platform/plans')).body.data;
    expect(plans.map((p: { key: string }) => p.key)).toEqual(expect.arrayContaining(['free', 'pro', 'enterprise']));
    expect(plans.find((p: { key: string }) => p.key === 'free')).toMatchObject({ maxMembers: 10, maxProjects: 5, maxGuests: 5 });

    const created = await platform.api.post('/platform/plans', { key: planKey, name: 'Tiny', maxMembers: 2, maxProjects: 1, maxGuests: 1 });
    expect(created.status).toBe(201);
    expect((await platform.api.post('/platform/plans', { key: planKey, name: 'Again', maxMembers: 1, maxProjects: 1, maxGuests: 1 })).status).toBe(409);
  });

  it('an organization can only be moved to an existing plan', async () => {
    expect((await platform.api.patch(`/platform/organizations/${owner.orgId}`, { plan: 'gold' })).status).toBe(400);
    expect((await platform.api.patch(`/platform/organizations/${owner.orgId}`, { plan: planKey })).status).toBe(204);
    const orgs = (await platform.api.get('/platform/organizations?search=Small%20Team&limit=50')).body.data.items;
    expect(orgs.find((o: { id: number }) => o.id === owner.orgId)).toMatchObject({ plan: planKey, limits: { members: 2, projects: 1, guests: 1 } });
  });
});

describe('limits (organization)', () => {
  it('usage shows the plan and what is used', async () => {
    expect(await usage()).toEqual({
      plan: { key: planKey, name: 'Tiny', limits: { members: 2, guests: 1, projects: 1 } },
      used: { members: 1, guests: 0, projects: 0 },
      pendingInvitations: { members: 0, guests: 0 },
    });
  });

  it('members: pending invitations take a seat; revoking frees it', async () => {
    const first = await invite();
    expect(first.status).toBe(201);
    const second = await invite();
    expect(second.status).toBe(403);
    expect(second.body.code).toBe('PLAN_LIMIT_REACHED');
    expect(second.body.message).toContain('Tiny plan includes 2 members');

    await owner.api.delete(`/invitations/${first.body.data.invitation.id}`);
    expect((await invite()).status).toBe(201);
    expect((await usage()).used.members).toBe(2);
  });

  it('projects: archived ones do not count; restoring needs a free place', async () => {
    const a = uniqueKey();
    expect((await owner.api.post('/projects', { name: 'Alpha', key: a })).status).toBe(201);
    const blocked = await owner.api.post('/projects', { name: 'Beta', key: uniqueKey() });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PLAN_LIMIT_REACHED');

    await owner.api.post(`/projects/${a}/archive`);
    const b = uniqueKey();
    expect((await owner.api.post('/projects', { name: 'Beta', key: b })).status).toBe(201);
    expect((await owner.api.post(`/projects/${a}/restore`)).status).toBe(403);
  });

  it('guests have their own limit', async () => {
    const project = (await owner.api.get('/projects')).body.data[0];
    expect((await owner.api.post('/invitations', { email: uniqueEmail('g'), projectId: project.id })).status).toBe(201);
    const second = await owner.api.post('/invitations', { email: uniqueEmail('g'), projectId: project.id });
    expect(second.status).toBe(403);
    expect(second.body.message).toContain('1 guest');
    expect((await usage()).pendingInvitations).toEqual({ members: 1, guests: 1 });
  });

  it('a lowered limit blocks accepting an old invitation and re-activating people — nothing is removed', async () => {
    await platform.api.patch(`/platform/plans/${planKey}`, { maxMembers: 3 });
    const email = uniqueEmail('late');
    const token = (await invite(email)).body.data.inviteUrl.split('/invite/')[1];
    await platform.api.patch(`/platform/plans/${planKey}`, { maxMembers: 2 });

    const res = await publicApi().post('/api/auth/register').send({ name: 'Late Joiner', email, password: 'secret123', invitationToken: token });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PLAN_LIMIT_REACHED');

    // over the limit: existing people keep working, an inactive one can't come back
    await platform.api.patch(`/platform/plans/${planKey}`, { maxMembers: null });
    const extra = await addMember(owner, 'member', 'Extra Person');
    await owner.api.patch(`/members/${extra.id}`, { isActive: false });
    await platform.api.patch(`/platform/plans/${planKey}`, { maxMembers: 1 });
    expect((await owner.api.patch(`/members/${extra.id}`, { isActive: true })).body.code).toBe('PLAN_LIMIT_REACHED');
    expect((await owner.api.get('/projects')).status).toBe(200);
  });

  it('a plan in use cannot be deleted', async () => {
    expect((await platform.api.delete(`/platform/plans/${planKey}`)).status).toBe(409);
    await platform.api.patch(`/platform/organizations/${owner.orgId}`, { plan: 'enterprise' });
    expect((await platform.api.delete(`/platform/plans/${planKey}`)).status).toBe(200);
  });
});
