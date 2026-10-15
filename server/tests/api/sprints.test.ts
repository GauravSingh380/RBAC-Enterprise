// Phase 2e: sprint lifecycle, backlog filters, burndown / velocity / overview reports.
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
  (await developer.api.post(`/projects/${key}/items`, { type: 'story', title, ...extra })).body.data as { id: number; key: string };
const titles = (res: { body: { data: { items: { title: string }[] } } }) => res.body.data.items.map((i) => i.title).sort();

beforeAll(async () => {
  owner = await registerOwner('Sprint Org');
  developer = await addMember(owner, 'developer', 'Dev Person');
  viewer = await addMember(owner, 'member', 'Viewer Person');
  key = uniqueKey();
  const p = await owner.api.post('/projects', { name: 'Scrum', key, template: 'scrum', visibility: 'organization' });
  statuses = p.body.data.statuses;
  await owner.api.post(`/projects/${key}/members`, { userId: developer.id, role: 'member' });
});

describe('sprint lifecycle', () => {
  let sprint1: number;
  let sprint2: number;
  let a: { id: number; key: string };
  let b: { id: number; key: string };
  let c: { id: number; key: string };

  it('creates sprints with default names and puts items in them', async () => {
    const s1 = await developer.api.post(`/projects/${key}/sprints`, {});
    expect(s1.status).toBe(201);
    expect(s1.body.data.name).toBe(`${key} Sprint 1`);
    expect(s1.body.data.status).toBe('planned');
    sprint1 = s1.body.data.id;
    sprint2 = (await developer.api.post(`/projects/${key}/sprints`, { name: 'Next one', goal: 'Polish' })).body.data.id;

    a = await newItem('A', { estimate: 3, sprintId: sprint1 });
    b = await newItem('B', { estimate: 5 });
    c = await newItem('C', { estimate: 2 });
    // sub-tasks follow the parent's sprint and are not counted in points
    const sub = (await developer.api.post(`/projects/${key}/items`, { type: 'subtask', title: 'A.1', parentId: a.id, estimate: 8 })).body.data;
    expect(sub.sprint.id).toBe(sprint1);

    const moved = await developer.api.patch(`/work-items/${b.id}`, { sprintId: sprint1 });
    expect(moved.body.data.sprint).toMatchObject({ id: sprint1, status: 'planned' });
    expect((await developer.api.get(`/work-items/${b.id}/events`)).body.data[0]).toMatchObject({ field: 'sprint', newValue: { id: sprint1 } });

    const list = (await developer.api.get(`/projects/${key}/sprints`)).body.data;
    const s = list.find((x: { id: number }) => x.id === sprint1);
    expect(s.stats).toEqual({ itemCount: 2, points: 8, doneCount: 0, donePoints: 0 });

    // backlog filters
    expect(titles(await developer.api.get(`/projects/${key}/items?sprint=backlog`))).toEqual(['C']);
    expect(titles(await developer.api.get(`/projects/${key}/items?sprint=${sprint1}`))).toEqual(['A', 'A.1', 'B']);
    expect(titles(await developer.api.get(`/projects/${key}/items?sprint=planning`))).toEqual(['A', 'A.1', 'B', 'C']);
    expect(titles(await developer.api.get(`/projects/${key}/items?sprint=active`))).toEqual([]);
  });

  it('moving a story to another sprint takes its sub-tasks along', async () => {
    await developer.api.post(`/work-items/${a.id}/move`, { sprintId: sprint2 });
    expect(titles(await developer.api.get(`/projects/${key}/items?sprint=${sprint2}`))).toEqual(['A', 'A.1']);
    await developer.api.post(`/work-items/${a.id}/move`, { sprintId: sprint1 });
    expect(titles(await developer.api.get(`/projects/${key}/items?sprint=${sprint1}`))).toEqual(['A', 'A.1', 'B']);
  });

  it('starts a sprint: snapshot of the commitment, only one active sprint', async () => {
    expect((await viewer.api.post(`/projects/${key}/sprints/${sprint1}/start`, {})).status).toBe(403);
    const bad = await developer.api.post(`/projects/${key}/sprints/${sprint1}/start`, { startDate: '2026-05-10', endDate: '2026-05-01' });
    expect(bad.status).toBe(400);

    const started = await developer.api.post(`/projects/${key}/sprints/${sprint1}/start`, {});
    expect(started.status).toBe(200);
    expect(started.body.data).toMatchObject({ status: 'active', committedPoints: 8, committedCount: 2 });
    expect(started.body.data.startDate).toBeTruthy();
    expect(started.body.data.endDate).toBeTruthy();

    const second = await developer.api.post(`/projects/${key}/sprints/${sprint2}/start`, {});
    expect(second.status).toBe(409);
    expect(titles(await developer.api.get(`/projects/${key}/items?sprint=active`))).toEqual(['A', 'A.1', 'B']);
  });

  it('scope added after the start shows in the burndown', async () => {
    await developer.api.post(`/work-items/${c.id}/move`, { sprintId: sprint1 }); // +2 points
    await developer.api.patch(`/work-items/${a.id}`, { statusId: status('Done') });

    const report = (await viewer.api.get(`/projects/${key}/reports/burndown/${sprint1}`)).body.data;
    expect(report.summary).toMatchObject({ committedPoints: 8, remainingPoints: 7, addedCount: 1, removedCount: 0 });
    expect(report.series[0]).toMatchObject({ kind: 'start', remainingPoints: 8, scopePoints: 8 });
    const today = report.series.filter((p: { remainingPoints: number | null }) => p.remainingPoints !== null).at(-1);
    expect(today).toMatchObject({ remainingPoints: 7, scopePoints: 10 });
    expect(report.scopeChanges).toEqual([expect.objectContaining({ change: 'added', key: c.key })]);
    expect(report.completedItems.map((i: { key: string }) => i.key)).toEqual([a.key]);
  });

  it('completes the sprint: snapshot + unfinished items move to the next sprint', async () => {
    const bad = await developer.api.post(`/projects/${key}/sprints/${sprint1}/complete`, { moveOpenItemsTo: sprint1 });
    expect(bad.status).toBe(400);

    const done = await developer.api.post(`/projects/${key}/sprints/${sprint1}/complete`, { moveOpenItemsTo: sprint2 });
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: 'completed', completedPoints: 3, completedCount: 1, movedCount: 3 }); // B, C, A.1
    expect(titles(await developer.api.get(`/projects/${key}/items?sprint=${sprint2}`))).toEqual(['A.1', 'B', 'C']);

    // completed sprints are history: no new items, no date changes, no delete
    expect((await developer.api.patch(`/work-items/${b.id}`, { sprintId: sprint1 })).status).toBe(400);
    expect((await developer.api.patch(`/projects/${key}/sprints/${sprint1}`, { endDate: '2030-01-01' })).status).toBe(400);
    expect((await developer.api.patch(`/projects/${key}/sprints/${sprint1}`, { goal: 'Ship it' })).status).toBe(200);
    expect((await developer.api.delete(`/projects/${key}/sprints/${sprint1}`)).status).toBe(400);

    // the report still knows what was NOT completed (they moved out at completion, not "removed")
    const report = (await developer.api.get(`/projects/${key}/reports/burndown/${sprint1}`)).body.data;
    expect(report.summary).toMatchObject({ completedPoints: 3, removedCount: 0 });
    expect(report.notCompletedItems.map((i: { key: string }) => i.key).sort()).toEqual([b.key, c.key].sort());
  });

  it('velocity uses the snapshots of completed sprints', async () => {
    const v = (await viewer.api.get(`/projects/${key}/reports/velocity`)).body.data;
    expect(v.sprints).toEqual([expect.objectContaining({ id: sprint1, committedPoints: 8, completedPoints: 3 })]);
    expect(v.averageCompletedPoints).toBe(3);
    expect(v.sayDoRatio).toBe(38); // 3 of 8
  });

  it('deleting a planned sprint sends its items back to the backlog', async () => {
    const res = await developer.api.delete(`/projects/${key}/sprints/${sprint2}`);
    expect(res.status).toBe(204);
    expect(titles(await developer.api.get(`/projects/${key}/items?sprint=backlog`))).toEqual(['A.1', 'B', 'C']);
    const history = (await developer.api.get(`/work-items/${b.id}/events`)).body.data;
    expect(history[0]).toMatchObject({ field: 'sprint', oldValue: { id: sprint2 }, newValue: null });
  });

  it('items of another project cannot use this project sprints', async () => {
    const otherKey = uniqueKey();
    await owner.api.post('/projects', { name: 'Other', key: otherKey });
    const s = (await owner.api.post(`/projects/${key}/sprints`, {})).body.data.id;
    const res = await owner.api.post(`/projects/${otherKey}/items`, { type: 'task', title: 'x', sprintId: s });
    expect(res.status).toBe(400);
  });
});

describe('overview report', () => {
  it('summarises the project', async () => {
    const res = await viewer.api.get(`/projects/${key}/reports/overview?days=14`);
    expect(res.status).toBe(200);
    const o = res.body.data;
    expect(o.createdVsResolved).toHaveLength(14);
    expect(o.createdVsResolved.at(-1).created).toBeGreaterThan(0);
    expect(o.totals.total).toBeGreaterThanOrEqual(4);
    expect(o.byStatus.map((s: { name: string }) => s.name)).toEqual(['Backlog', 'To Do', 'In Progress', 'In Review', 'Done']);
    expect(o.times.count).toBeGreaterThanOrEqual(1);
    expect(o.workload.length).toBeGreaterThan(0);
    expect((await viewer.api.get(`/projects/${key}/reports/overview?days=1000`)).status).toBe(400);
  });

  it('private projects stay hidden', async () => {
    const privateKey = uniqueKey();
    await owner.api.post('/projects', { name: 'Secret', key: privateKey, visibility: 'private' });
    expect((await viewer.api.get(`/projects/${privateKey}/reports/overview`)).status).toBe(404);
    expect((await viewer.api.get(`/projects/${privateKey}/sprints`)).status).toBe(404);
  });
});

describe('one active sprint per project (database rule)', () => {
  it('is enforced by a partial unique index even if code is bypassed', async () => {
    const { rows } = await db.query<{ id: number }>(`SELECT id FROM projects WHERE key = $1`, [key]);
    const projectId = rows[0]!.id;
    const org = owner.orgId;
    await db.query(`INSERT INTO sprints (organization_id, project_id, name, status) VALUES ($1, $2, 'X1', 'active')`, [org, projectId]);
    await expect(
      db.query(`INSERT INTO sprints (organization_id, project_id, name, status) VALUES ($1, $2, 'X2', 'active')`, [org, projectId]),
    ).rejects.toThrow(/uq_sprints_one_active/);
  });
});
