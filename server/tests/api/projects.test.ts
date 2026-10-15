import { beforeAll, describe, expect, it } from 'vitest';
import { addMember, registerOwner, uniqueKey, type TestUser } from '../helpers.js';

let owner: TestUser;
let developer: TestUser;
let admin: TestUser;

beforeAll(async () => {
  owner = await registerOwner('Projects Org');
  developer = await addMember(owner, 'developer');
  admin = await addMember(owner, 'admin');
});

describe('projects', () => {
  it('creates a project from a template with its workflow and labels', async () => {
    const res = await owner.api.post('/projects', { name: 'Bug Hunt', key: 'bug', template: 'bug_tracking' });
    expect(res.status).toBe(201);
    const p = res.body.data;
    expect(p.key).toBe('BUG'); // normalised to upper case
    expect(p.statuses.map((s: { name: string }) => s.name)).toEqual(['Open', 'In Progress', 'Ready for QA', 'Verified', 'Reopened', "Won't Fix"]);
    expect(p.statuses.find((s: { name: string }) => s.name === 'Verified').restrictedRoles).toEqual(['qa', 'admin', 'owner']);
    expect(p.labels.length).toBe(4);
    expect(p.myRole).toBe('admin');
    expect(p.defaultItemType).toBe('bug');
  });

  it('project keys are unique per organization and validated', async () => {
    const key = uniqueKey();
    expect((await owner.api.post('/projects', { name: 'One', key })).status).toBe(201);
    expect((await owner.api.post('/projects', { name: 'Two', key })).status).toBe(409);
    expect((await owner.api.post('/projects', { name: 'Bad', key: '1X' })).status).toBe(400);
    // the same key in ANOTHER organization is fine
    const other = await registerOwner('Other Org');
    expect((await other.api.post('/projects', { name: 'Same key', key })).status).toBe(201);
  });

  it('only roles with projects.create can create projects', async () => {
    expect((await developer.api.post('/projects', { name: 'Dev project', key: uniqueKey() })).status).toBe(403);
    expect((await admin.api.post('/projects', { name: 'Admin project', key: uniqueKey() })).status).toBe(201);
  });

  it('private projects are hidden from non-members; organization projects are read-only for them', async () => {
    const privateKey = uniqueKey();
    const openKey = uniqueKey();
    await owner.api.post('/projects', { name: 'Private', key: privateKey, visibility: 'private' });
    await owner.api.post('/projects', { name: 'Open', key: openKey, visibility: 'organization' });

    const list = await developer.api.get('/projects');
    const keys = list.body.data.map((p: { key: string }) => p.key);
    expect(keys).toContain(openKey);
    expect(keys).not.toContain(privateKey);
    expect((await developer.api.get(`/projects/${privateKey}`)).status).toBe(404);

    const open = await developer.api.get(`/projects/${openKey}`);
    expect(open.body.data.myRole).toBe('viewer');
    expect(open.body.data.canEdit).toBe(false);
    expect((await developer.api.post(`/projects/${openKey}/items`, { type: 'task', title: 'x' })).status).toBe(403);

    // org admins (projects.manage_all) see everything
    expect((await admin.api.get(`/projects/${privateKey}`)).body.data.myRole).toBe('admin');
  });

  it('project members: add, change role, protect the last project admin', async () => {
    const key = uniqueKey();
    await owner.api.post('/projects', { name: 'Team', key, visibility: 'private' });

    expect((await owner.api.post(`/projects/${key}/members`, { userId: developer.id, role: 'member' })).status).toBe(201);
    expect((await owner.api.post(`/projects/${key}/members`, { userId: developer.id })).status).toBe(409);
    expect((await developer.api.get(`/projects/${key}`)).body.data.myRole).toBe('member');
    expect((await developer.api.post(`/projects/${key}/items`, { type: 'task', title: 'Now I can' })).status).toBe(201);

    // the creator is the only project admin
    expect((await owner.api.patch(`/projects/${key}/members/${owner.id}`, { role: 'member' })).status).toBe(400);
    expect((await owner.api.delete(`/projects/${key}/members/${owner.id}`)).status).toBe(400);
    // members cannot manage the project
    expect((await developer.api.patch(`/projects/${key}`, { name: 'Renamed' })).status).toBe(403);
  });

  it('workflow: create, reorder, restrict and delete statuses (items are moved)', async () => {
    const key = uniqueKey();
    const p = (await owner.api.post('/projects', { name: 'Flow', key, template: 'kanban' })).body.data;
    const [todo, doing, done] = p.statuses;

    const created = await owner.api.post(`/projects/${key}/statuses`, { name: 'QA', category: 'in_progress', restrictedRoles: ['qa'] });
    expect(created.status).toBe(201);
    const qa = created.body.data.find((s: { name: string }) => s.name === 'QA');
    expect((await owner.api.post(`/projects/${key}/statuses`, { name: 'qa', category: 'todo' })).status).toBe(409);
    expect((await owner.api.post(`/projects/${key}/statuses`, { name: 'X', category: 'todo', restrictedRoles: ['nope'] })).status).toBe(400);

    const order = await owner.api.put(`/projects/${key}/statuses/order`, { statusIds: [todo.id, doing.id, qa.id, done.id] });
    expect(order.body.data.map((s: { name: string }) => s.name)).toEqual(['To Do', 'In Progress', 'QA', 'Done']);

    await owner.api.post(`/projects/${key}/items`, { type: 'task', title: 'In QA', statusId: qa.id });
    expect((await owner.api.delete(`/projects/${key}/statuses/${qa.id}`)).status).toBe(400); // has items
    const del = await owner.api.delete(`/projects/${key}/statuses/${qa.id}?moveTo=${doing.id}`);
    expect(del.status).toBe(200);
    const items = await owner.api.get(`/projects/${key}/items`);
    expect(items.body.data.items[0].status.id).toBe(doing.id);
  });

  it('archived projects are read-only and must be archived before deletion', async () => {
    const key = uniqueKey();
    await owner.api.post('/projects', { name: 'Old', key });
    expect((await owner.api.delete(`/projects/${key}`)).status).toBe(400);
    expect((await owner.api.post(`/projects/${key}/archive`)).body.data.status).toBe('archived');
    expect((await owner.api.post(`/projects/${key}/items`, { type: 'task', title: 'x' })).status).toBe(403);
    expect((await owner.api.post(`/projects/${key}/restore`)).body.data.status).toBe('active');
    await owner.api.post(`/projects/${key}/archive`);
    expect((await owner.api.delete(`/projects/${key}`)).status).toBe(204);
    expect((await owner.api.get(`/projects/${key}`)).status).toBe(404);
  });
});
