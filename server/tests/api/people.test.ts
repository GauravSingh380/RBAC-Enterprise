// Phase 3c: people directory, managers (incl. leave approvals) and teams.
import { beforeAll, describe, expect, it } from 'vitest';
import { addMember, registerOwner, runJobs, lastEmailTo, type TestUser } from '../helpers.js';

let owner: TestUser;
let admin: TestUser;
let lead: TestUser;
let dev: TestUser;

beforeAll(async () => {
  owner = await registerOwner('People Org');
  admin = await addMember(owner, 'admin', 'Admin Person');
  lead = await addMember(owner, 'developer', 'Lead Person');
  dev = await addMember(owner, 'developer', 'Dev Person');
});

const person = async (u: TestUser, id: number) => (await u.api.get(`/people/${id}`)).body.data;

describe('directory & managers', () => {
  it('everyone sees the directory; only admins change titles and managers', async () => {
    const dir = (await dev.api.get('/people')).body.data;
    expect(dir.map((p: { name: string }) => p.name)).toEqual(['Admin Person', 'Dev Person', 'Lead Person', 'Owner User']);
    expect(dir[0]).toMatchObject({ jobTitle: null, manager: null, teams: [], directReports: 0, awayToday: false });

    expect((await dev.api.patch(`/people/${dev.id}`, { jobTitle: 'CTO' })).status).toBe(403);
    const updated = await admin.api.patch(`/people/${dev.id}`, { jobTitle: 'Frontend developer', managerId: lead.id });
    expect(updated.body.data).toMatchObject({ jobTitle: 'Frontend developer', manager: { id: lead.id, name: 'Lead Person' } });
    await admin.api.patch(`/people/${lead.id}`, { managerId: owner.id, jobTitle: 'Engineering lead' });
    expect(await person(dev, lead.id)).toMatchObject({ directReports: 1, reports: [{ id: dev.id, jobTitle: 'Frontend developer' }] });
  });

  it('refuses self-management and loops in the reporting line', async () => {
    expect((await admin.api.patch(`/people/${dev.id}`, { managerId: dev.id })).status).toBe(400);
    // owner → lead → dev; making dev the owner's manager would close the loop
    const loop = await admin.api.patch(`/people/${owner.id}`, { managerId: dev.id });
    expect(loop.status).toBe(400);
    expect(loop.body.message).toContain('loop');
    expect((await admin.api.patch(`/people/${dev.id}`, { managerId: 999999 })).status).toBe(400);
  });
});

describe('manager approves leave', () => {
  it('the request goes to the manager, who can approve it without leave.approve', async () => {
    const annual = ((await dev.api.get('/leave/types')).body.data as { id: number; name: string }[]).find((t) => t.name === 'Annual leave')!.id;
    const req = (await dev.api.post('/leave/requests', { leaveTypeId: annual, startDate: '2030-03-04', endDate: '2030-03-05' })).body.data;
    await runJobs();
    expect((await lastEmailTo(lead.email))!.subject).toContain('Dev Person requested Annual leave');
    // notified: the manager, not every approver
    const adminBell = (await admin.api.get('/notifications')).body.data.items;
    expect(adminBell.some((n: { type: string }) => n.type === 'leave_requested')).toBe(false);

    // the manager sees the request as "team" and can decide it
    const team = (await lead.api.get('/leave/requests?scope=team&status=pending')).body.data.items;
    expect(team.map((r: { id: number }) => r.id)).toEqual([req.id]);
    expect(team[0].canDecide).toBe(true);
    const approved = await lead.api.post(`/leave/requests/${req.id}/approve`, { note: 'Have fun' });
    expect(approved.body.data).toMatchObject({ status: 'approved', decidedBy: { id: lead.id } });

    // someone who is neither manager nor approver cannot
    const other = (await lead.api.post('/leave/requests', { leaveTypeId: annual, startDate: '2030-03-11', endDate: '2030-03-11' })).body.data;
    expect((await dev.api.post(`/leave/requests/${other.id}/approve`, {})).status).toBe(403);
    // HR (leave.approve) can still decide anyone's
    expect((await admin.api.post(`/leave/requests/${other.id}/approve`, {})).body.data.status).toBe('approved');
  });
});

describe('teams', () => {
  it('create with lead + members, rename, change members, delete — admins only', async () => {
    expect((await dev.api.post('/teams', { name: 'Hackers' })).status).toBe(403);
    let teams = (await admin.api.post('/teams', { name: 'Frontend', color: '#13c2c2', leadId: lead.id, memberIds: [dev.id] })).body.data;
    const fe = teams.find((t: { name: string }) => t.name === 'Frontend');
    expect(fe).toMatchObject({ lead: { id: lead.id }, color: '#13c2c2' });
    expect(fe.members.map((m: { id: number }) => m.id).sort()).toEqual([lead.id, dev.id].sort()); // lead is a member too
    expect((await admin.api.post('/teams', { name: 'Frontend' })).status).toBe(409);

    teams = (await admin.api.put(`/teams/${fe.id}/members`, { userIds: [admin.id] })).body.data;
    expect(teams[0].members.map((m: { id: number }) => m.id).sort()).toEqual([admin.id, lead.id].sort()); // lead stays
    expect((await admin.api.put(`/teams/${fe.id}/members`, { userIds: [999999] })).status).toBe(400);

    await admin.api.patch(`/teams/${fe.id}`, { name: 'Web' });
    expect((await dev.api.get('/teams')).body.data[0].name).toBe('Web'); // everyone can read teams
    expect((await dev.api.get('/people')).body.data.find((p: { id: number }) => p.id === lead.id).teams).toEqual([{ id: fe.id, name: 'Web', color: '#13c2c2' }]);

    expect((await admin.api.delete(`/teams/${fe.id}`)).body.data).toEqual([]);
  });

  it('is isolated per organization', async () => {
    const other = await registerOwner('Other People Org');
    expect((await other.api.get('/people')).body.data).toHaveLength(1);
    expect((await other.api.get(`/people/${dev.id}`)).status).toBe(404);
    expect((await other.api.patch(`/people/${other.id}`, { managerId: dev.id })).status).toBe(400);
  });
});
