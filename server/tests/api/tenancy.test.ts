// Multi-tenant isolation: one organization can never see or change another's data.
import { beforeAll, describe, expect, it } from 'vitest';
import { addMember, lastEmailTo, registerOwner, runJobs, type TestUser } from '../helpers.js';

let acme: TestUser;
let globex: TestUser;

beforeAll(async () => {
  acme = await registerOwner('Acme Tenancy');
  globex = await registerOwner('Globex Tenancy');
});

describe('tenant isolation', () => {
  it('tenant routes require an organization header', async () => {
    const res = await acme.api.get('/members', -1 as unknown as number).unset('X-Organization-Id');
    expect(res.status).toBe(400);
  });

  it('cannot read another organization by switching the header', async () => {
    expect((await globex.api.get('/members', acme.orgId)).status).toBe(403);
    expect((await globex.api.get('/projects', acme.orgId)).status).toBe(403);
  });

  it('cannot use another organization role id', async () => {
    const roles = await acme.api.get('/roles');
    const dev = roles.body.data.find((r: { name: string }) => r.name === 'developer');
    const res = await globex.api.post('/invitations', { email: 'x@test.local', roleId: dev.id });
    expect(res.status).toBe(400);
  });

  it('invitations are emailed and join the right organization with the right role', async () => {
    const qa = await addMember(acme, 'qa');
    await runJobs();
    expect((await lastEmailTo(qa.email))?.template).toBe('invitation');
    const me = await qa.api.get('/auth/me');
    expect(me.body.data.organization.id).toBe(acme.orgId);
    expect(me.body.data.roles).toEqual(['qa']);
    expect((await qa.api.get('/members')).status).toBe(403); // QA has no users.read
  });

  it('projects and items of one organization are invisible to another', async () => {
    const p = await acme.api.post('/projects', { name: 'Secret Project', key: 'SEC', template: 'kanban' });
    expect(p.status).toBe(201);
    const item = await acme.api.post('/projects/SEC/items', { type: 'task', title: 'Hidden task' });
    expect(item.status).toBe(201);

    // Globex uses its own (valid) org header — Acme's project / item simply don't exist there
    expect((await globex.api.get('/projects/SEC')).status).toBe(404);
    expect((await globex.api.get(`/work-items/${item.body.data.id}`)).status).toBe(404);
    expect((await globex.api.get('/work-items/SEC-1')).status).toBe(404);
    expect((await globex.api.patch(`/work-items/${item.body.data.id}`, { title: 'hacked' })).status).toBe(404);
  });
});
