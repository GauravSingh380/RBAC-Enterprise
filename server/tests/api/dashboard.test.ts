// Organization dashboard + project quality report (bugs per week, ageing, cycle time).
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../src/database/db.js';
import { addMember, registerOwner, uniqueKey, type TestUser } from '../helpers.js';

let owner: TestUser;
let dev: TestUser;
let key: string;
let privateKey: string;
let statuses: { id: number; name: string; category: string }[];

beforeAll(async () => {
  owner = await registerOwner('Dash Org');
  dev = await addMember(owner, 'developer', 'Dev Person');
  key = uniqueKey();
  privateKey = uniqueKey();
  statuses = (await owner.api.post('/projects', { name: 'Shop', key, template: 'bug_tracking' })).body.data.statuses;
  await owner.api.post(`/projects/${key}/members`, { userId: dev.id, role: 'member' });
  await owner.api.post('/projects', { name: 'Secret', key: privateKey, visibility: 'private' });

  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  await owner.api.post(`/projects/${key}/items`, { type: 'task', title: 'Overdue task', assigneeId: dev.id, dueDate: yesterday, priority: 'urgent' });
  await owner.api.post(`/projects/${key}/items`, { type: 'bug', title: 'Fresh bug', severity: 'critical', assigneeId: dev.id });
  const old = (await owner.api.post(`/projects/${key}/items`, { type: 'bug', title: 'Ancient bug', severity: 'minor' })).body.data;
  await db.query(`UPDATE work_items SET created_at = NOW() - INTERVAL '45 days' WHERE id = $1`, [old.id]);
  // a bug that went through the workflow: created 10 days ago, started 4 days ago, done today
  const done = (await owner.api.post(`/projects/${key}/items`, { type: 'bug', title: 'Fixed bug', severity: 'major' })).body.data;
  await owner.api.patch(`/work-items/${done.id}`, { statusId: statuses.find((s) => s.name === 'In Progress')!.id });
  await owner.api.patch(`/work-items/${done.id}`, { statusId: statuses.find((s) => s.name === 'Verified')!.id });
  await db.query(`UPDATE work_items SET created_at = NOW() - INTERVAL '10 days' WHERE id = $1`, [done.id]);
  await db.query(`UPDATE work_item_events SET created_at = NOW() - INTERVAL '4 days' WHERE work_item_id = $1 AND field = 'status' AND new_value->>'name' = 'In Progress'`, [done.id]);
  // the private project's bug must not show up for the developer
  await owner.api.post(`/projects/${privateKey}/items`, { type: 'bug', title: 'Secret bug' });
});

describe('dashboard', () => {
  it('shows my work, project health, bug trend and leave — respecting project access', async () => {
    const res = await dev.api.get('/dashboard');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.myWork).toMatchObject({ open: 2, overdue: 1 });
    expect(d.myWork.items[0].title).toBe('Overdue task'); // overdue first
    expect(d.projects.map((p: { key: string }) => p.key)).toEqual([key]); // not the private project
    expect(d.projects[0]).toMatchObject({ open: 3, openBugs: 2, overdue: 1, doneLast7: 1 });
    expect(d.bugTrend).toHaveLength(8);
    // this week: only "Fresh bug" (the others were back-dated; the private project's bug is not visible)
    expect(d.bugTrend.at(-1)).toMatchObject({ opened: 1, closed: 1 });
    expect(d.leave).toMatchObject({ myPending: 0, approvalsPending: null });
    expect(d.leave.balances.map((b: { type: { name: string } }) => b.type.name)).toContain('Annual leave');
    expect(d.unresolvedErrors).toBe(0); // developers have errors.read

    const forOwner = (await owner.api.get('/dashboard')).body.data;
    expect(forOwner.projects.map((p: { key: string }) => p.key).sort()).toEqual([key, privateKey].sort());
    expect(forOwner.leave.approvalsPending).toBe(0);
  });

  it('lists who is out this week (type hidden from non-approvers)', async () => {
    // approved sick leave for today, inserted directly so the test also runs on weekends
    const today = new Date().toISOString().slice(0, 10);
    await db.query(
      `INSERT INTO leave_requests (organization_id, user_id, leave_type_id, start_date, end_date, days, status, decided_at)
       SELECT $1, $2, id, $3, $3, 1, 'approved', NOW() FROM leave_types WHERE organization_id = $1 AND name = 'Sick leave'`,
      [owner.orgId, owner.id, today],
    );
    const out = (await dev.api.get('/dashboard')).body.data.leave.out;
    expect(out[0]).toMatchObject({ userId: owner.id, startDate: today, typeName: 'Out of office' });
    expect((await owner.api.get('/dashboard')).body.data.leave.out[0].typeName).toBe('Sick leave');
  });
});

describe('quality report', () => {
  it('bugs opened vs closed per week, ageing by severity, oldest bugs, cycle time', async () => {
    const res = await dev.api.get(`/projects/${key}/reports/quality?weeks=8`);
    expect(res.status).toBe(200);
    const q = res.body.data;
    expect(q.bugsPerWeek).toHaveLength(8);
    expect(q.bugsPerWeek.at(-1)).toMatchObject({ closed: 1 });
    expect(q.bugsPerWeek.at(-1).openAtEnd).toBe(2);
    expect(q.openBugs).toBe(2);
    expect(q.ageing.find((a: { bucket: string }) => a.bucket === '0–7 days')).toMatchObject({ critical: 1, minor: 0 });
    expect(q.ageing.find((a: { bucket: string }) => a.bucket === '31–90 days')).toMatchObject({ minor: 1 });
    expect(q.oldestBugs[0]).toMatchObject({ title: 'Ancient bug', ageDays: 45 });
    const thisWeek = q.flowPerWeek.at(-1);
    expect(thisWeek.count).toBe(1);
    expect(thisWeek.medianLeadDays).toBeCloseTo(10, 0);
    expect(thisWeek.medianCycleDays).toBeCloseTo(4, 0);
    expect(q.cycleDistribution.map((b: { bucket: string }) => b.bucket)).toEqual(['< 1 day', '1–3 days', '3–7 days', '1–2 weeks', '2–4 weeks', '4+ weeks']);
    expect(q.cycleDistribution.find((b: { bucket: string }) => b.bucket === '3–7 days').count).toBe(1);
    expect((await dev.api.get(`/projects/${privateKey}/reports/quality`)).status).toBe(404);
  });
});
