// Phase 3f: trash — deleted items, pages and projects are kept 30 days and can be restored.
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../src/database/db.js';
import { purgeTrash } from '../../src/modules/trash/trash.service.js';
import { addMember, registerOwner, uniqueKey, type TestUser } from '../helpers.js';

let owner: TestUser;
let dev: TestUser;
let viewer: TestUser;
let key: string;

const item = (title: string, extra: object = {}) => owner.api.post(`/projects/${key}/items`, { type: 'task', title, ...extra });
const trashOf = async (u: TestUser) => (await u.api.get(`/projects/${key}/trash`)).body.data;

beforeAll(async () => {
  owner = await registerOwner('Trash Org');
  dev = await addMember(owner, 'developer', 'Dev Deleter');
  viewer = await addMember(owner, 'member', 'Just Looking');
  key = uniqueKey();
  await owner.api.post('/projects', { name: 'Bin', key });
  await owner.api.post(`/projects/${key}/members`, { userId: dev.id, role: 'member' });
  await owner.api.post(`/projects/${key}/members`, { userId: viewer.id, role: 'viewer' });
});

describe('work items in the trash', () => {
  it('deleting hides the item (and its sub-tasks) everywhere; restoring brings everything back', async () => {
    const parent = (await item('Parent story', { type: 'story' })).body.data;
    const sub = (await owner.api.post(`/projects/${key}/items`, { type: 'subtask', title: 'Sub step', parentId: parent.id })).body.data;
    await owner.api.post(`/work-items/${parent.id}/comments`, { body: 'keep me' });

    expect((await owner.api.delete(`/work-items/${parent.key}`)).status).toBe(204);
    expect((await owner.api.get(`/work-items/${parent.key}`)).status).toBe(404);
    expect((await owner.api.get(`/work-items/${sub.key}`)).status).toBe(404);
    const list = (await owner.api.get(`/projects/${key}/items`)).body.data.items.map((i: { id: number }) => i.id);
    expect(list).not.toContain(parent.id);
    expect(list).not.toContain(sub.id);
    expect((await owner.api.get(`/projects/${key}`)).body.data.itemCount).toBe(0);

    const t = await trashOf(owner);
    expect(t).toEqual([expect.objectContaining({ kind: 'item', id: parent.id, title: 'Parent story', withChildren: 1, canRestore: true })]);

    expect((await owner.api.post(`/projects/${key}/trash/item/${parent.id}/restore`)).body.data).toEqual({ restored: 2 });
    const back = (await owner.api.get(`/work-items/${parent.key}`)).body.data;
    expect(back.children.map((c: { id: number }) => c.id)).toEqual([sub.id]);
    expect((await owner.api.get(`/work-items/${parent.key}/comments`)).body.data).toHaveLength(1);
    expect((await owner.api.get(`/work-items/${parent.key}/events`)).body.data.map((e: { eventType: string }) => e.eventType)).toContain('restored');
  });

  it('a sub-task deleted with its parent cannot be restored on its own', async () => {
    const parent = (await item('Another', { type: 'story' })).body.data;
    const sub = (await owner.api.post(`/projects/${key}/items`, { type: 'subtask', title: 'Child', parentId: parent.id })).body.data;
    await owner.api.delete(`/work-items/${sub.key}`); // the child first (its own batch)
    await owner.api.delete(`/work-items/${parent.key}`);
    const res = await owner.api.post(`/projects/${key}/trash/item/${sub.id}/restore`);
    expect(res.status).toBe(409);
    await owner.api.post(`/projects/${key}/trash/item/${parent.id}/restore`);
    expect((await owner.api.post(`/projects/${key}/trash/item/${sub.id}/restore`)).status).toBe(200);
  });

  it('who may see the trash, restore and delete for good', async () => {
    const mine = (await dev.api.post(`/projects/${key}/items`, { type: 'task', title: 'Dev wrote this' })).body.data;
    const theirs = (await item('Owner item')).body.data;
    await dev.api.delete(`/work-items/${mine.key}`);
    await owner.api.delete(`/work-items/${theirs.key}`);

    expect((await viewer.api.get(`/projects/${key}/trash`)).status).toBe(403);
    const devView = await trashOf(dev);
    expect(devView.find((e: { id: number }) => e.id === mine.id).canRestore).toBe(true);
    expect(devView.find((e: { id: number }) => e.id === theirs.id).canRestore).toBe(false);
    expect((await dev.api.post(`/projects/${key}/trash/item/${theirs.id}/restore`)).status).toBe(403);
    expect((await dev.api.delete(`/projects/${key}/trash/item/${mine.id}`)).status).toBe(403); // admins only
    expect((await dev.api.post(`/projects/${key}/trash/item/${mine.id}/restore`)).status).toBe(200);

    expect((await owner.api.delete(`/projects/${key}/trash/item/${theirs.id}`)).status).toBe(200);
    expect((await db.query('SELECT 1 FROM work_items WHERE id = $1', [theirs.id])).rowCount).toBe(0);
  });

  it('the nightly job removes what is older than 30 days', async () => {
    const old = (await item('Old one')).body.data;
    const recent = (await item('Recent one')).body.data;
    await owner.api.delete(`/work-items/${old.key}`);
    await owner.api.delete(`/work-items/${recent.key}`);
    await db.query(`UPDATE work_items SET deleted_at = NOW() - INTERVAL '31 days' WHERE id = $1`, [old.id]);
    const r = await purgeTrash();
    expect(r.items).toBeGreaterThanOrEqual(1);
    expect((await db.query('SELECT 1 FROM work_items WHERE id = $1', [old.id])).rowCount).toBe(0);
    expect((await db.query('SELECT 1 FROM work_items WHERE id = $1', [recent.id])).rowCount).toBe(1);
  });
});

describe('projects in the trash', () => {
  it('an archived project goes to the trash, organization admins restore it (archived) or delete it for good', async () => {
    const k = uniqueKey();
    const p = (await owner.api.post('/projects', { name: 'Old project', key: k })).body.data;
    expect((await owner.api.delete(`/projects/${k}`)).status).toBe(400); // archive first
    await owner.api.post(`/projects/${k}/archive`);
    expect((await owner.api.delete(`/projects/${k}`)).status).toBe(204);
    expect((await owner.api.get(`/projects/${k}`)).status).toBe(404);
    expect((await owner.api.get('/projects?status=all')).body.data.map((x: { key: string }) => x.key)).not.toContain(k);

    expect((await dev.api.get('/trash/projects')).status).toBe(403);
    expect((await owner.api.get('/trash/projects')).body.data).toEqual([expect.objectContaining({ id: p.id, key: k })]);
    expect((await owner.api.post(`/trash/projects/${p.id}/restore`)).status).toBe(200);
    expect((await owner.api.get(`/projects/${k}`)).body.data.status).toBe('archived');

    await owner.api.delete(`/projects/${k}`);
    expect((await owner.api.delete(`/trash/projects/${p.id}`)).status).toBe(200);
    expect((await db.query('SELECT 1 FROM projects WHERE id = $1', [p.id])).rowCount).toBe(0);
  });
});
