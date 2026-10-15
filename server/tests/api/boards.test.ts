// Phase 2d: drag & drop ordering, bulk edit, saved views, WIP limits.
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../src/database/db.js';
import { addMember, registerOwner, uniqueKey, type TestUser } from '../helpers.js';

let owner: TestUser;
let developer: TestUser;
let viewer: TestUser;
let key: string;
let statuses: { id: number; name: string; category: string }[];
const status = (name: string) => statuses.find((s) => s.name === name)!.id;

const newItem = async (title: string, extra: object = {}) =>
  (await owner.api.post(`/projects/${key}/items`, { type: 'task', title, ...extra })).body.data as { id: number; key: string; rank: number };

const column = async (statusName: string) => {
  const res = await owner.api.get(`/projects/${key}/items?statusIds=${status(statusName)}&sort=rank&order=asc&limit=500`);
  return (res.body.data.items as { title: string }[]).map((i) => i.title);
};

beforeAll(async () => {
  owner = await registerOwner('Boards Org');
  developer = await addMember(owner, 'developer', 'Dev Person');
  viewer = await addMember(owner, 'member', 'Viewer Person'); // org-visible project → viewer
  key = uniqueKey();
  const p = await owner.api.post('/projects', { name: 'Board', key, template: 'kanban', visibility: 'organization' });
  statuses = p.body.data.statuses;
  await owner.api.post(`/projects/${key}/members`, { userId: developer.id, role: 'member' });
});

describe('board: move / rank', () => {
  it('new items go to the bottom; moving between neighbours re-orders and changes status', async () => {
    const a = await newItem('A');
    const b = await newItem('B');
    const c = await newItem('C');
    expect(b.rank).toBeGreaterThan(a.rank);
    expect(await column('To Do')).toEqual(['A', 'B', 'C']);

    // drop C between A and B
    const moved = await developer.api.post(`/work-items/${c.id}/move`, { prevId: a.id, nextId: b.id });
    expect(moved.status).toBe(200);
    expect(await column('To Do')).toEqual(['A', 'C', 'B']);

    // drop A on top of the "In Progress" column (empty → no neighbours)
    const toProgress = await developer.api.post(`/work-items/${a.id}/move`, { statusId: status('In Progress') });
    expect(toProgress.body.data.status.name).toBe('In Progress');
    expect(await column('To Do')).toEqual(['C', 'B']);

    // a status move is recorded in history like a normal edit; a pure re-order is not
    const history = (await owner.api.get(`/work-items/${a.id}/events`)).body.data as { field: string }[];
    expect(history.filter((e) => e.field === 'status')).toHaveLength(1);
    const cHistory = (await owner.api.get(`/work-items/${c.id}/events`)).body.data as { eventType: string }[];
    expect(cHistory.map((e) => e.eventType)).toEqual(['created']);
  });

  it('re-spaces ranks when there is no room left between two items', async () => {
    const x = await newItem('X');
    const y = await newItem('Y');
    const z = await newItem('Z');
    // squeeze X and Y together artificially
    await db.query('UPDATE work_items SET rank = 5000 WHERE id = $1', [x.id]);
    await db.query('UPDATE work_items SET rank = 5000.0000000001 WHERE id = $1', [y.id]);
    expect((await owner.api.post(`/work-items/${z.id}/move`, { prevId: x.id, nextId: y.id })).status).toBe(200);
    const { rows } = await db.query<{ id: number; rank: number }>('SELECT id, rank FROM work_items WHERE id = ANY($1::int[])', [[x.id, y.id, z.id]]);
    const rank = (id: number) => rows.find((r) => r.id === id)!.rank;
    expect(rank(x.id)).toBeLessThan(rank(z.id));
    expect(rank(z.id)).toBeLessThan(rank(y.id));
    expect(rank(y.id) - rank(x.id)).toBeGreaterThan(1); // renumbered
  });

  it('rejects neighbours from another project and viewers', async () => {
    const otherKey = uniqueKey();
    await owner.api.post('/projects', { name: 'Other', key: otherKey });
    const foreign = (await owner.api.post(`/projects/${otherKey}/items`, { type: 'task', title: 'Foreign' })).body.data;
    const mine = await newItem('Mine');
    expect((await owner.api.post(`/work-items/${mine.id}/move`, { prevId: foreign.id })).status).toBe(400);
    expect((await owner.api.post(`/work-items/${mine.id}/move`, { prevId: mine.id })).status).toBe(400);
    expect((await viewer.api.post(`/work-items/${mine.id}/move`, { statusId: status('Done') })).status).toBe(403);
  });
});

describe('bulk edit', () => {
  it('changes many items in one transaction and records history for each', async () => {
    const labels = (await owner.api.get(`/projects/${key}/labels`)).body.data as { id: number; name: string }[];
    const frontend = labels.find((l) => l.name === 'frontend')!.id;
    const items = [await newItem('Bulk 1'), await newItem('Bulk 2'), await newItem('Bulk 3')];
    const res = await developer.api.post(`/projects/${key}/items/bulk`, {
      itemIds: items.map((i) => i.id),
      changes: { priority: 'urgent', assigneeId: developer.id, addLabelIds: [frontend] },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(3);

    const detail = (await owner.api.get(`/work-items/${items[1]!.id}`)).body.data;
    expect(detail.priority).toBe('urgent');
    expect(detail.assignee.id).toBe(developer.id);
    expect(detail.labels.map((l: { name: string }) => l.name)).toEqual(['frontend']);
    const fields = ((await owner.api.get(`/work-items/${items[1]!.id}/events`)).body.data as { field: string }[]).map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['priority', 'assignee', 'labels']));

    // remove the label again
    await developer.api.post(`/projects/${key}/items/bulk`, { itemIds: [items[1]!.id], changes: { removeLabelIds: [frontend] } });
    expect((await owner.api.get(`/work-items/${items[1]!.id}`)).body.data.labels).toEqual([]);
  });

  it('is all-or-nothing: an item from another project fails the whole request', async () => {
    const otherKey = uniqueKey();
    await owner.api.post('/projects', { name: 'Other 2', key: otherKey });
    const foreign = (await owner.api.post(`/projects/${otherKey}/items`, { type: 'task', title: 'Foreign' })).body.data;
    const mine = await newItem('Stays medium');
    const res = await owner.api.post(`/projects/${key}/items/bulk`, { itemIds: [mine.id, foreign.id], changes: { priority: 'low' } });
    expect(res.status).toBe(400);
    expect((await owner.api.get(`/work-items/${mine.id}`)).body.data.priority).toBe('medium');
  });

  it('viewers cannot bulk edit', async () => {
    const mine = await newItem('Viewer target');
    expect((await viewer.api.post(`/projects/${key}/items/bulk`, { itemIds: [mine.id], changes: { priority: 'low' } })).status).toBe(403);
  });
});

describe('saved views', () => {
  it('private views are visible to their owner only; shared views to everyone', async () => {
    const mine = await developer.api.post(`/projects/${key}/views`, { name: 'My bugs', viewType: 'list', filters: { types: 'bug', assignees: 'me' } });
    expect(mine.status).toBe(201);
    expect(mine.body.data.filters).toEqual({ types: 'bug', assignees: 'me' });
    const shared = await developer.api.post(`/projects/${key}/views`, { name: 'Urgent', viewType: 'board', filters: { priorities: 'urgent' }, isShared: true });
    expect(shared.status).toBe(201);

    const forViewer = (await viewer.api.get(`/projects/${key}/views`)).body.data as { name: string; canEdit: boolean }[];
    expect(forViewer.map((v) => v.name)).toEqual(['Urgent']);
    expect(forViewer[0]!.canEdit).toBe(false);

    // viewers may keep private views, but not share them
    expect((await viewer.api.post(`/projects/${key}/views`, { name: 'Mine', viewType: 'list' })).status).toBe(201);
    expect((await viewer.api.post(`/projects/${key}/views`, { name: 'Shared', viewType: 'list', isShared: true })).status).toBe(403);

    // only the owner (or a project admin, for shared views) can change or delete
    expect((await viewer.api.patch(`/projects/${key}/views/${shared.body.data.id}`, { name: 'Hacked' })).status).toBe(403);
    expect((await owner.api.get(`/projects/${key}/views/${mine.body.data.id}`)).status).toBe(404); // no such route / not visible
    expect((await owner.api.delete(`/projects/${key}/views/${mine.body.data.id}`)).status).toBe(404); // private to the developer
    expect((await owner.api.patch(`/projects/${key}/views/${shared.body.data.id}`, { name: 'Urgent work' })).body.data.name).toBe('Urgent work');
    expect((await developer.api.delete(`/projects/${key}/views/${mine.body.data.id}`)).status).toBe(204);
  });

  it('validates filters', async () => {
    const res = await owner.api.post(`/projects/${key}/views`, { name: 'Bad', viewType: 'list', filters: { 'bad key!': 'x' } });
    expect(res.status).toBe(400);
  });
});

describe('WIP limits', () => {
  it('can be set and cleared on a status', async () => {
    const id = status('In Progress');
    const set = await owner.api.patch(`/projects/${key}/statuses/${id}`, { wipLimit: 3 });
    expect(set.body.data.find((s: { id: number }) => s.id === id).wipLimit).toBe(3);
    const cleared = await owner.api.patch(`/projects/${key}/statuses/${id}`, { wipLimit: null });
    expect(cleared.body.data.find((s: { id: number }) => s.id === id).wipLimit).toBeNull();
    expect((await owner.api.patch(`/projects/${key}/statuses/${id}`, { wipLimit: 0 })).status).toBe(400);
  });
});
