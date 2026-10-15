// Phase 3c: My Work — assigned items, QA queue, leave to decide, mentions.
import { beforeAll, describe, expect, it } from 'vitest';
import { addMember, registerOwner, uniqueKey, type TestUser } from '../helpers.js';

let owner: TestUser;
let dev: TestUser;
let qa: TestUser;
let key: string;
let statuses: { id: number; name: string }[];

beforeAll(async () => {
  owner = await registerOwner('Work Org');
  dev = await addMember(owner, 'developer', 'Dev Person');
  qa = await addMember(owner, 'qa', 'Qa Person');
  key = uniqueKey();
  statuses = (await owner.api.post('/projects', { name: 'Shop', key, template: 'bug_tracking' })).body.data.statuses;
  for (const u of [dev, qa]) await owner.api.post(`/projects/${key}/members`, { userId: u.id, role: 'member' });

  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  await owner.api.post(`/projects/${key}/items`, { type: 'task', title: 'Later, no date', assigneeId: dev.id });
  await owner.api.post(`/projects/${key}/items`, { type: 'task', title: 'Due in 3 days', assigneeId: dev.id, dueDate: day(3) });
  await owner.api.post(`/projects/${key}/items`, { type: 'task', title: 'Overdue', assigneeId: dev.id, dueDate: day(-2), priority: 'urgent' });
  await owner.api.post(`/projects/${key}/items`, { type: 'task', title: 'Due today', assigneeId: dev.id, dueDate: day(0) });
  const fixed = (await owner.api.post(`/projects/${key}/items`, { type: 'bug', title: 'Fixed, needs QA', assigneeId: dev.id })).body.data;
  await dev.api.patch(`/work-items/${fixed.id}`, { statusId: statuses.find((s) => s.name === 'Ready for QA')!.id });
  await owner.api.post(`/work-items/${fixed.id}/comments`, { body: `@[Qa Person](user:${qa.id}) please verify` });

  // dev reports to qa (as a manager) and asks for leave
  await owner.api.patch(`/people/${dev.id}`, { managerId: qa.id });
  const annual = ((await dev.api.get('/leave/types')).body.data as { id: number; name: string }[]).find((t) => t.name === 'Annual leave')!.id;
  await dev.api.post('/leave/requests', { leaveTypeId: annual, startDate: '2030-05-06', endDate: '2030-05-07' });
});

describe('my work', () => {
  it('assigned items, due soonest first, with counts', async () => {
    const w = (await dev.api.get('/my-work')).body.data;
    expect(w.assigned.map((i: { title: string }) => i.title)).toEqual(['Overdue', 'Due today', 'Due in 3 days', 'Fixed, needs QA', 'Later, no date']);
    expect(w.counts).toMatchObject({ assigned: 5, overdue: 1, dueToday: 1, dueThisWeek: 1, qa: 0, leave: 0 });
  });

  it('QA sees bugs waiting for a verdict, mentions and the leave of their reports', async () => {
    const w = (await qa.api.get('/my-work')).body.data;
    expect(w.qa.map((i: { title: string }) => i.title)).toEqual(['Fixed, needs QA']);
    expect(w.mentions[0].title).toContain('mentioned you');
    expect(w.leave).toEqual([expect.objectContaining({ user: { id: dev.id, name: 'Dev Person' }, typeName: 'Annual leave', days: 2 })]);
    expect(w.counts).toMatchObject({ assigned: 0, qa: 1, leave: 1, mentions: 1 });
  });

  it('developers cannot verify (Verified is restricted) so their QA list stays empty; owners see all leave', async () => {
    expect((await dev.api.get('/my-work')).body.data.qa).toEqual([]);
    const w = (await owner.api.get('/my-work')).body.data;
    expect(w.qa).toHaveLength(1);
    expect(w.leave).toHaveLength(1); // owner = leave approver
  });
});
