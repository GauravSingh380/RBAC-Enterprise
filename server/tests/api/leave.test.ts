// Leave & holidays: types, calendars, requests, balances, approvals, privacy, database rules.
// Dates are in 2030 (Mon 7 Jan 2030 = a Monday) so "today" never interferes.
import { beforeAll, describe, expect, it } from 'vitest';
import { addMember, lastEmailTo, registerOwner, runJobs, type TestUser } from '../helpers.js';

let owner: TestUser;
let admin: TestUser;
let dev: TestUser;
let qa: TestUser;
let types: { id: number; name: string; defaultDays: number | null }[];
let defaultCalendarId: number;
const type = (name: string) => types.find((t) => t.name === name)!.id;

beforeAll(async () => {
  owner = await registerOwner('Leave Org');
  admin = await addMember(owner, 'admin', 'Admin Person');
  dev = await addMember(owner, 'developer', 'Dev Person');
  qa = await addMember(owner, 'qa', 'Qa Person');
  types = (await dev.api.get('/leave/types')).body.data;
  defaultCalendarId = (await owner.api.get('/leave/settings/calendars')).body.data[0].id;
});

describe('setup', () => {
  it('a new organization gets the default leave types and a default calendar', () => {
    expect(types.map((t) => t.name)).toEqual(['Annual leave', 'Sick leave', 'Casual leave', 'Unpaid leave', 'Work from home']);
    expect(types.find((t) => t.name === 'Annual leave')!.defaultDays).toBe(20);
  });

  it('holidays can be pasted as a list; bad lines are reported', async () => {
    const bad = await owner.api.post(`/leave/settings/calendars/${defaultCalendarId}/holidays/bulk`, { text: '2030-01-09 Founders day' });
    expect(bad.status).toBe(400);
    const ok = await owner.api.post(`/leave/settings/calendars/${defaultCalendarId}/holidays/bulk`, {
      text: '# 2030\n2030-01-09, Founders day\n2030-03-15, Spring festival, optional\n',
    });
    expect(ok.body.data.added).toBe(2);
    const list = (await owner.api.get(`/leave/settings/calendars/${defaultCalendarId}/holidays?year=2030`)).body.data;
    expect(list).toEqual([
      expect.objectContaining({ date: '2030-01-09', name: 'Founders day', isOptional: false }),
      expect.objectContaining({ date: '2030-03-15', isOptional: true }),
    ]);
  });

  it('settings need leave.manage', async () => {
    expect((await dev.api.get('/leave/settings/types')).status).toBe(403);
    expect((await dev.api.post('/leave/settings/calendars', { name: 'x' })).status).toBe(403);
  });
});

describe('requests', () => {
  let requestId: number;

  it('preview: working days only, balance after, holidays and weekends skipped', async () => {
    const res = await dev.api.post('/leave/requests/preview', { leaveTypeId: type('Annual leave'), startDate: '2030-01-07', endDate: '2030-01-13' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ days: 4, balance: { entitled: 20, available: 20, after: 16 } });
    expect(res.body.data.skipped.map((s: { reason: string }) => s.reason)).toEqual(['Founders day', 'weekend', 'weekend']);
  });

  it('a request is pending, reserves balance, and emails the approvers', async () => {
    const res = await dev.api.post('/leave/requests', { leaveTypeId: type('Annual leave'), startDate: '2030-01-07', endDate: '2030-01-11', reason: 'Family trip' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'pending', days: 4, canCancel: true, canDecide: false });
    requestId = res.body.data.id;
    // approvers are notified (bell + instant email by default — the email goes out through the job queue)
    await runJobs();
    expect((await lastEmailTo(owner.email))!.template).toBe('notification');
    expect((await lastEmailTo(admin.email))!.subject).toContain('Dev Person requested Annual leave');
    const bell = (await admin.api.get('/notifications?unread=true')).body.data;
    expect(bell.items[0]).toMatchObject({ category: 'leave', type: 'leave_requested', url: '/leave/approvals' });

    const balances = (await dev.api.get('/leave/balances?year=2030')).body.data;
    expect(balances.find((b: { type: { name: string } }) => b.type.name === 'Annual leave')).toMatchObject({ entitled: 20, pending: 4, available: 16 });
  });

  it('overlapping leave is refused by the database (EXCLUDE constraint)', async () => {
    const res = await dev.api.post('/leave/requests', { leaveTypeId: type('Sick leave'), startDate: '2030-01-10', endDate: '2030-01-10' });
    expect(res.status).toBe(409);
  });

  it('validation: half day rules, year boundary, weekends only, not enough balance', async () => {
    expect((await dev.api.post('/leave/requests', { leaveTypeId: type('Annual leave'), startDate: '2030-02-04', endDate: '2030-02-05', portion: 'am' })).status).toBe(400);
    expect((await dev.api.post('/leave/requests', { leaveTypeId: type('Annual leave'), startDate: '2030-12-30', endDate: '2031-01-02' })).status).toBe(400);
    expect((await dev.api.post('/leave/requests', { leaveTypeId: type('Annual leave'), startDate: '2030-01-12', endDate: '2030-01-13' })).status).toBe(400);
    const tooMuch = await dev.api.post('/leave/requests', { leaveTypeId: type('Casual leave'), startDate: '2030-02-04', endDate: '2030-02-15' }); // 10 days > 6
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.message).toContain('Not enough Casual leave');
    const half = await dev.api.post('/leave/requests', { leaveTypeId: type('Casual leave'), startDate: '2030-02-04', endDate: '2030-02-04', portion: 'pm' });
    expect(half.body.data.days).toBe(0.5);
  });

  it('approvals: only approvers, a reason to reject, an email to the person', async () => {
    expect((await qa.api.post(`/leave/requests/${requestId}/approve`, {})).status).toBe(403);
    expect((await qa.api.get('/leave/requests?scope=team')).status).toBe(403);
    expect((await owner.api.post(`/leave/requests/${requestId}/reject`, {})).status).toBe(400); // note required

    const team = (await admin.api.get('/leave/requests?scope=team&status=pending')).body.data.items;
    expect(team.find((r: { id: number }) => r.id === requestId).canDecide).toBe(true);
    const approved = await admin.api.post(`/leave/requests/${requestId}/approve`, { note: 'Enjoy!' });
    expect(approved.body.data).toMatchObject({ status: 'approved', decidedBy: { id: admin.id }, decisionNote: 'Enjoy!' });
    await runJobs();
    expect((await lastEmailTo(dev.email))!.subject).toContain('Admin Person approved your Annual leave');
    expect((await admin.api.post(`/leave/requests/${requestId}/approve`, {})).status).toBe(409);
  });

  it('nobody approves their own leave — except an owner', async () => {
    const mine = (await admin.api.post('/leave/requests', { leaveTypeId: type('Annual leave'), startDate: '2030-04-01', endDate: '2030-04-02' })).body.data;
    expect((await admin.api.post(`/leave/requests/${mine.id}/approve`, {})).status).toBe(403);
    const ownerReq = (await owner.api.post('/leave/requests', { leaveTypeId: type('Annual leave'), startDate: '2030-04-01', endDate: '2030-04-01' })).body.data;
    expect((await owner.api.post(`/leave/requests/${ownerReq.id}/approve`, {})).body.data.status).toBe('approved');
  });

  it('types without approval are approved immediately', async () => {
    const res = await dev.api.post('/leave/requests', { leaveTypeId: type('Work from home'), startDate: '2030-05-06', endDate: '2030-05-06' });
    expect(res.body.data.status).toBe('approved');
  });

  it('the team calendar shows who is out, but the leave type only to the person and approvers', async () => {
    const range = '/leave/calendar?from=2030-01-01&to=2030-01-31';
    const forQa = (await qa.api.get(range)).body.data;
    const leave = forQa.leaves.find((l: { id: number }) => l.id === requestId);
    expect(leave).toMatchObject({ userId: dev.id, startDate: '2030-01-07', type: { name: 'Out of office' } });
    expect(forQa.holidays.map((h: { name: string }) => h.name)).toContain('Founders day');
    expect((await dev.api.get(range)).body.data.leaves.find((l: { id: number }) => l.id === requestId).type.name).toBe('Annual leave');
    expect((await admin.api.get(range)).body.data.leaves.find((l: { id: number }) => l.id === requestId).type.name).toBe('Annual leave');
    expect((await qa.api.get('/leave/calendar?from=2030-01-01&to=2030-06-30')).status).toBe(400); // max two months
  });

  it('cancelling future approved leave gives the days back', async () => {
    const res = await dev.api.post(`/leave/requests/${requestId}/cancel`, {});
    expect(res.body.data.status).toBe('cancelled');
    const annual = (await dev.api.get('/leave/balances?year=2030')).body.data.find((b: { type: { name: string } }) => b.type.name === 'Annual leave');
    expect(annual).toMatchObject({ used: 0, pending: 0, available: 20 });
    // and the dates are free again (the exclusion constraint only covers pending / approved)
    expect((await dev.api.post('/leave/requests', { leaveTypeId: type('Sick leave'), startDate: '2030-01-10', endDate: '2030-01-10' })).status).toBe(201);
  });
});

describe('calendars & allowances', () => {
  it('a member on another calendar (Fri + Sat weekend) is charged differently', async () => {
    const calendars = (await owner.api.post('/leave/settings/calendars', { name: 'Gulf office', weekendDays: [5, 6] })).body.data;
    const gulf = calendars.find((c: { name: string }) => c.name === 'Gulf office');
    await owner.api.put(`/leave/settings/members/${qa.id}/calendar`, { calendarId: gulf.id });
    const preview = await qa.api.post('/leave/requests/preview', { leaveTypeId: type('Annual leave'), startDate: '2030-01-07', endDate: '2030-01-13' });
    expect(preview.body.data.days).toBe(5); // Sun–Thu, and the default calendar's holiday doesn't apply
    // deleting the calendar sends its members back to the default
    await owner.api.delete(`/leave/settings/calendars/${gulf.id}`);
    expect((await qa.api.post('/leave/requests/preview', { leaveTypeId: type('Annual leave'), startDate: '2030-01-07', endDate: '2030-01-13' })).body.data.days).toBe(4);
    expect((await owner.api.delete(`/leave/settings/calendars/${defaultCalendarId}`)).status).toBe(400);
  });

  it('allowances can be overridden per person and year', async () => {
    const res = await owner.api.put('/leave/settings/balances', { userId: qa.id, leaveTypeId: type('Annual leave'), year: 2030, entitled: 25, carriedOver: 3, note: 'Seniority' });
    const row = res.body.data.find((b: { userId: number; leaveTypeId: number }) => b.userId === qa.id && b.leaveTypeId === type('Annual leave'));
    expect(row).toMatchObject({ entitled: 25, carriedOver: 3, overridden: true });
    const mine = (await qa.api.get('/leave/balances?year=2030')).body.data.find((b: { type: { name: string } }) => b.type.name === 'Annual leave');
    expect(mine.available).toBe(28);
    // people can't peek at each other's balances
    expect((await dev.api.get(`/leave/balances?year=2030&userId=${qa.id}`)).status).toBe(403);
  });

  it('leave types with history are deactivated, not deleted', async () => {
    expect((await owner.api.delete(`/leave/settings/types/${type('Annual leave')}`)).status).toBe(400);
    const created = (await owner.api.post('/leave/settings/types', { name: 'Study leave', defaultDays: 5 })).body.data;
    const study = created.find((t: { name: string }) => t.name === 'Study leave');
    expect((await owner.api.delete(`/leave/settings/types/${study.id}`)).status).toBe(200);
    await owner.api.patch(`/leave/settings/types/${type('Casual leave')}`, { isActive: false });
    expect((await dev.api.get('/leave/types')).body.data.map((t: { name: string }) => t.name)).not.toContain('Casual leave');
  });

  it('organizations are isolated', async () => {
    const other = await registerOwner('Other Leave Org');
    expect((await other.api.post(`/leave/requests/1/approve`, {})).status).toBe(404);
    const cal = (await other.api.get('/leave/calendar?from=2030-01-01&to=2030-01-31')).body.data;
    expect(cal.leaves).toEqual([]);
    expect(cal.members.map((m: { id: number }) => m.id)).toEqual([other.id]);
  });
});
