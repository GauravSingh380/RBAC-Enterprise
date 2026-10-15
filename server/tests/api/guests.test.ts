// Phase 3e: guest access — an outside collaborator who only sees the projects they are invited to.
import { beforeAll, describe, expect, it } from 'vitest';
import { addMember, apiAs, publicApi, registerOwner, uniqueEmail, uniqueKey, type TestUser } from '../helpers.js';

let owner: TestUser;
let dev: TestUser;
let guest: TestUser;
let shared: { id: number; key: string };
let other: { id: number; key: string };
let secret: { id: number; key: string };

const keys = (r: { body: { data: { key: string }[] } }) => r.body.data.map((p) => p.key);

async function inviteGuest(by: TestUser, projectId: number, projectRole: 'member' | 'viewer' = 'member') {
  const email = uniqueEmail('guest');
  const res = await by.api.post('/invitations', { email, projectId, projectRole });
  return { res, email, token: res.body.data?.inviteUrl?.split('/invite/')[1] as string | undefined };
}

beforeAll(async () => {
  owner = await registerOwner('Agency');
  dev = await addMember(owner, 'developer', 'Dev Staff');
  const create = async (name: string, visibility: 'organization' | 'private') =>
    (await owner.api.post('/projects', { name, key: uniqueKey(), visibility })).body.data as { id: number; key: string };
  shared = await create('Client Site', 'organization');
  other = await create('Internal Tools', 'organization');
  secret = await create('Secret', 'private');

  const { token, email } = await inviteGuest(owner, shared.id);
  const res = await publicApi().post('/api/auth/register').send({ name: 'Clara Client', email, password: 'secret123', invitationToken: token });
  expect(res.status).toBe(201);
  guest = { id: res.body.data.user.id, email, password: 'secret123', token: res.body.data.accessToken, cookie: '', orgId: owner.orgId, api: apiAs(res.body.data.accessToken, owner.orgId) };
});

describe('guest access', () => {
  it('the invitation names the project; the guest gets the Guest role and nothing else', async () => {
    const me = (await guest.api.get('/auth/me')).body.data;
    expect(me).toMatchObject({ isGuest: true, roles: ['guest'], permissions: ['guide.view'] });
    const menuKeys = JSON.stringify(me.menus);
    expect(menuKeys).toContain('"projects"');
    expect(menuKeys).not.toContain('"people"');
    expect(menuKeys).not.toContain('"dashboard"');
  });

  it('sees only their project — not organization-visible ones, not private ones', async () => {
    expect(keys(await guest.api.get('/projects'))).toEqual([shared.key]);
    expect((await guest.api.get(`/projects/${other.key}`)).status).toBe(404);
    expect((await guest.api.get(`/projects/${secret.key}`)).status).toBe(404);
    expect((await guest.api.get(`/projects/${shared.key}`)).body.data.myRole).toBe('member');
    // staff still see organization-visible projects
    expect(keys(await dev.api.get('/projects'))).toEqual(expect.arrayContaining([shared.key, other.key]));
  });

  it('no directory, members list or dashboard', async () => {
    for (const url of ['/people', '/teams', '/members', '/dashboard']) expect((await guest.api.get(url)).status).toBe(403);
    // and staff don't see guests in the directory
    expect((await owner.api.get('/people')).body.data.map((p: { id: number }) => p.id)).not.toContain(guest.id);
  });

  it('inside the project a guest only sees and assigns the people of that project', async () => {
    const forGuest = (await guest.api.get(`/projects/${shared.key}/assignable-users`)).body.data.map((u: { id: number }) => u.id);
    expect(forGuest).toContain(guest.id);
    expect(forGuest).not.toContain(dev.id); // dev is staff but not a member of this project
    expect((await dev.api.get(`/projects/${shared.key}/assignable-users`)).body.data.map((u: { id: number }) => u.id)).toEqual(
      expect.arrayContaining([dev.id, guest.id]),
    );
    expect((await dev.api.get(`/projects/${other.key}/assignable-users`)).body.data.map((u: { id: number }) => u.id)).not.toContain(guest.id);

    expect((await guest.api.post(`/projects/${shared.key}/items`, { type: 'task', title: 'From the client' })).status).toBe(201);
    expect((await guest.api.post(`/projects/${shared.key}/items`, { type: 'task', title: 'x', assigneeId: dev.id })).status).toBe(400);
  });

  it('can never be a project admin, and its role is locked to Guest', async () => {
    expect((await owner.api.patch(`/projects/${shared.key}/members/${guest.id}`, { role: 'admin' })).status).toBe(400);
    expect((await owner.api.post(`/projects/${other.key}/members`, { userId: guest.id, role: 'admin' })).status).toBe(400);

    const roles = (await owner.api.get('/roles')).body.data as { id: number; name: string }[];
    const guestRole = roles.find((r) => r.name === 'guest')!;
    const memberRole = roles.find((r) => r.name === 'member')!;
    expect((await owner.api.put(`/members/${guest.id}/roles`, { roleIds: [memberRole.id] })).status).toBe(400);
    expect((await owner.api.put(`/members/${dev.id}/roles`, { roleIds: [guestRole.id] })).status).toBe(400);
    expect((await owner.api.post('/invitations', { email: uniqueEmail('x'), roleId: guestRole.id })).status).toBe(400);
  });

  it('members list marks guests with their projects', async () => {
    const m = (await owner.api.get(`/members/${guest.id}`)).body.data;
    expect(m).toMatchObject({ isGuest: true, guestProjects: [{ key: shared.key, role: 'member' }] });
    expect((await owner.api.get(`/members/${dev.id}`)).body.data).toMatchObject({ isGuest: false, guestProjects: null });
  });

  it('a project admin can add the guest to another project', async () => {
    expect((await owner.api.post(`/projects/${other.key}/members`, { userId: guest.id, role: 'viewer' })).status).toBe(201);
    expect(keys(await guest.api.get('/projects')).sort()).toEqual([shared.key, other.key].sort());
    expect((await guest.api.get(`/projects/${other.key}`)).body.data.myRole).toBe('viewer');
  });

  it('only project admins invite guests, and only to active projects', async () => {
    const admin = await addMember(owner, 'admin', 'Org Admin'); // users.invite + manage all projects
    expect((await inviteGuest(admin, secret.id)).res.status).toBe(201);
    expect((await inviteGuest(dev, shared.id)).res.status).toBe(403); // no users.invite
    await owner.api.post(`/projects/${secret.key}/archive`);
    expect((await inviteGuest(owner, secret.id)).res.status).toBe(400);
    expect((await inviteGuest(owner, 999999)).res.status).toBe(404);
  });

  it('"Make full member" turns a guest into staff (roles, organization-visible projects, directory)', async () => {
    const memberRole = (await owner.api.get('/roles')).body.data.find((r: { name: string }) => r.name === 'member');
    const res = await owner.api.post(`/members/${guest.id}/make-member`, { roleIds: [memberRole.id] });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ isGuest: false, roles: [{ name: 'member' }] });
    const me = (await guest.api.get('/auth/me')).body.data;
    expect(me.isGuest).toBe(false);
    expect((await guest.api.get('/people')).status).toBe(200);
    expect((await owner.api.post(`/members/${dev.id}/make-member`, { roleIds: [memberRole.id] })).status).toBe(400);
  });
});
