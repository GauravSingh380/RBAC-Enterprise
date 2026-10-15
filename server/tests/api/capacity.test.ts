// Phase 3a: capacity planning — leave + holidays + allocation per sprint, forecast from history, availability.
import { beforeAll, describe, expect, it } from 'vitest';
import { addMember, registerOwner, uniqueKey, type TestUser } from '../helpers.js';

let owner: TestUser;
let dev: TestUser;
let qa: TestUser;
let viewer: TestUser;
let key: string;
let statuses: { id: number; name: string }[];
let sprintId: number;

beforeAll(async () => {
  owner = await registerOwner('Capacity Org');
  dev = await addMember(owner, 'developer', 'Dev Person');
  qa = await addMember(owner, 'qa', 'Qa Person');
  viewer = await addMember(owner, 'member', 'Viewer Person');
  key = uniqueKey();
  statuses = (await owner.api.post('/projects', { name: 'Scrum', key, template: 'scrum' })).body.data.statuses;
  for (const u of [dev, qa]) await owner.api.post(`/projects/${key}/members`, { userId: u.id, role: 'member' });
  await owner.api.post(`/projects/${key}/members`, { userId: viewer.id, role: 'viewer' });

  // a holiday on Wed 9 Jan 2030 in the default calendar
  const calendarId = (await owner.api.get('/leave/settings/calendars')).body.data[0].id;
  await owner.api.post(`/leave/settings/calendars/${calendarId}/holidays`, { date: '2030-01-09', name: 'Founders day' });

  // HISTORY: a completed sprint in December 2029 (10 weekdays) where 10 points got done
  const past = (await owner.api.post(`/projects/${key}/sprints`, { name: 'Past' })).body.data.id;
  for (const pts of [6, 4]) {
    const item = (await owner.api.post(`/projects/${key}/items`, { type: 'story', title: `Done ${pts}`, estimate: pts, sprintId: past, assigneeId: dev.id })).body.data;
    await owner.api.patch(`/work-items/${item.id}`, { statusId: statuses.find((s) => s.name === 'Done')!.id });
  }
  await owner.api.post(`/projects/${key}/sprints/${past}/start`, { startDate: '2029-12-03', endDate: '2029-12-14' });
  await owner.api.post(`/projects/${key}/sprints/${past}/complete`, { moveOpenItemsTo: 'backlog' });

  // CURRENT sprint: Mon 7 – Fri 18 Jan 2030
  sprintId = (await owner.api.post(`/projects/${key}/sprints`, { name: 'Next', startDate: '2030-01-07', endDate: '2030-01-18' })).body.data.id;
  await owner.api.post(`/projects/${key}/items`, { type: 'story', title: 'Dev work', estimate: 8, sprintId, assigneeId: dev.id });
  await owner.api.post(`/projects/${key}/items`, { type: 'story', title: 'QA work', estimate: 3, sprintId, assigneeId: qa.id });
  await owner.api.post(`/projects/${key}/items`, { type: 'story', title: 'Nobody yet', estimate: 2, sprintId });

  // dev: approved leave Mon 14 + Tue 15; qa: pending leave Thu 17
  const annual = ((await dev.api.get('/leave/types')).body.data as { id: number; name: string }[]).find((t) => t.name === 'Annual leave')!.id;
  const leave = (await dev.api.post('/leave/requests', { leaveTypeId: annual, startDate: '2030-01-14', endDate: '2030-01-15' })).body.data;
  await owner.api.post(`/leave/requests/${leave.id}/approve`, {});
  await qa.api.post('/leave/requests', { leaveTypeId: annual, startDate: '2030-01-17', endDate: '2030-01-17' });
});

const capacityOf = async (user: TestUser) => (await user.api.get(`/projects/${key}/sprints/${sprintId}/capacity`)).body.data;
const person = (c: { people: { user: { id: number } }[] }, u: TestUser) => c.people.find((p) => p.user.id === u.id) as any;

describe('sprint capacity', () => {
  it('per person: working days of their calendar, holidays, leave, allocation', async () => {
    const c = await capacityOf(dev);
    expect(c.needsDates).toBe(false);
    expect(person(c, dev).capacity).toEqual({ workingDays: 9, holidays: 1, leaveDays: 2, pendingLeaveDays: 0, allocation: 100, availableDays: 7 });
    expect(person(c, qa).capacity).toMatchObject({ leaveDays: 0, pendingLeaveDays: 1, availableDays: 9 });
    expect(person(c, owner).capacity.availableDays).toBe(9); // project admin
    expect(person(c, viewer)).toBeUndefined(); // viewers are not part of the team
    expect(person(c, dev).away).toEqual([{ startDate: '2030-01-14', endDate: '2030-01-15', portion: 'full', status: 'approved' }]); // no leave type
    expect(c.unassigned).toMatchObject({ points: 2, count: 1 });
  });

  it('allocation: part-time and "not in this sprint"', async () => {
    expect((await viewer.api.put(`/projects/${key}/sprints/${sprintId}/capacity/${qa.id}`, { allocation: 50 })).status).toBe(403);
    await owner.api.put(`/projects/${key}/sprints/${sprintId}/capacity/${qa.id}`, { allocation: 50, note: 'Also on the mobile app' });
    const c = (await owner.api.put(`/projects/${key}/sprints/${sprintId}/capacity/${owner.id}`, { allocation: 0 })).body.data;
    expect(person(c, qa)).toMatchObject({ capacity: { allocation: 50, availableDays: 4.5 }, note: 'Also on the mobile app' });
    expect(person(c, owner).capacity.availableDays).toBe(0);
    expect(c.totals).toMatchObject({ people: 2, availableDays: 11.5, committedPoints: 13, leaveDays: 2, pendingLeaveDays: 1 });
  });

  it('forecast: points per available day learned from completed sprints', async () => {
    const c = await capacityOf(dev);
    // December: owner + dev + qa × 10 days (no allocation rows there) = 30 days, 10 points done
    expect(c.history.sprints).toEqual([expect.objectContaining({ name: 'Past', completedPoints: 10, availableDays: 30 })]);
    expect(c.history.pointsPerDay).toBe(0.33);
    expect(c.totals.forecastPoints).toBe(3.8); // 11.5 days × 0.33
    expect(c.totals.load).toBeGreaterThan(300); // 13 points committed — way over
    expect(person(c, dev)).toMatchObject({ assignedPoints: 8, expectedPoints: 2.3, status: 'over' });
  });

  it('a sprint without dates asks for them', async () => {
    const s = (await owner.api.post(`/projects/${key}/sprints`, { name: 'Undated' })).body.data.id;
    expect((await owner.api.get(`/projects/${key}/sprints/${s}/capacity`)).body.data.needsDates).toBe(true);
  });
});

describe('availability', () => {
  it('who is away when (types never revealed), with each person\'s holidays', async () => {
    const res = await viewer.api.get(`/projects/${key}/availability?from=2030-01-01&to=2030-01-31`);
    expect(res.status).toBe(200);
    const d = res.body.data.find((p: { user: { id: number } }) => p.user.id === dev.id);
    expect(d.away).toEqual([{ startDate: '2030-01-14', endDate: '2030-01-15', portion: 'full', status: 'approved' }]);
    expect(d.holidays).toEqual([{ date: '2030-01-09', name: 'Founders day' }]);
    expect(JSON.stringify(res.body.data)).not.toContain('Annual');
    expect((await viewer.api.get(`/projects/${key}/availability?from=2030-01-01&to=2030-12-31`)).status).toBe(400);
  });
});
