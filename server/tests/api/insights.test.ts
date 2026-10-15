// Phase 3b: organization insights + weekly report.
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../src/database/db.js';
import { runDueSchedules } from '../../src/jobs/index.js';
import { addMember, lastEmailTo, publicApi, registerOwner, runJobs, uniqueKey, type TestUser } from '../helpers.js';

let owner: TestUser;
let admin: TestUser;
let dev: TestUser;
let healthyKey: string;
let riskyKey: string;
let staleKey: string;
let privateKey: string;

beforeAll(async () => {
  owner = await registerOwner('Insights Org');
  admin = await addMember(owner, 'admin', 'Admin Person');
  dev = await addMember(owner, 'developer', 'Dev Person');
  [healthyKey, riskyKey, staleKey, privateKey] = [uniqueKey(), uniqueKey(), uniqueKey(), uniqueKey()];
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  await owner.api.post('/projects', { name: 'Healthy', key: healthyKey });
  await owner.api.post(`/projects/${healthyKey}/items`, { type: 'task', title: 'Fine', assigneeId: dev.id, estimate: 3 });

  await owner.api.post('/projects', { name: 'Risky', key: riskyKey, template: 'bug_tracking' });
  await owner.api.post(`/projects/${riskyKey}/items`, { type: 'bug', title: 'Prod down', severity: 'critical', assigneeId: dev.id, dueDate: yesterday });
  await owner.api.post(`/projects/${riskyKey}/items`, { type: 'bug', title: 'Typo', severity: 'minor' });

  const stale = (await owner.api.post('/projects', { name: 'Stale', key: staleKey })).body.data;
  const old = (await owner.api.post(`/projects/${staleKey}/items`, { type: 'task', title: 'Forgotten' })).body.data;
  await db.query(`UPDATE work_items SET updated_at = NOW() - INTERVAL '30 days', created_at = NOW() - INTERVAL '40 days' WHERE id = $1`, [old.id]);
  await db.query(`UPDATE projects SET created_at = NOW() - INTERVAL '60 days' WHERE id = $1`, [stale.id]);

  // a private project the admin is NOT a member of — insights still count it (oversight)
  await owner.api.post('/projects', { name: 'Secret', key: privateKey, visibility: 'private' });
  await owner.api.post(`/projects/${privateKey}/items`, { type: 'task', title: 'Hidden work' });
});

const overview = async (u: TestUser, days = 30) => (await u.api.get(`/insights?days=${days}`)).body.data;

describe('access', () => {
  it('owners and admins (insights.view) only', async () => {
    expect((await dev.api.get('/insights')).status).toBe(403);
    expect((await admin.api.get('/insights')).status).toBe(200);
    expect((await admin.api.get('/insights?days=12')).status).toBe(400);
  });
});

describe('overview', () => {
  it('people, totals and project health with reasons — across every project', async () => {
    const o = await overview(admin);
    expect(o.people).toMatchObject({ active: 3, deactivated: 0, joinedInPeriod: 3 });
    expect(o.people.active7).toBeGreaterThanOrEqual(1);
    expect(o.totals).toMatchObject({ activeProjects: 4, open: 5, overdue: 1, atRiskProjects: 1, staleProjects: 1 });

    const byKey = (k: string) => o.projects.find((p: { key: string }) => p.key === k);
    expect(byKey(riskyKey)).toMatchObject({ health: 'at_risk', openBugs: 2, criticalBugs: 1, overdue: 1 });
    expect(byKey(riskyKey).reasons).toEqual(expect.arrayContaining(['1 critical bug', '1 overdue']));
    expect(byKey(staleKey)).toMatchObject({ health: 'stale' });
    expect(byKey(healthyKey)).toMatchObject({ health: 'healthy', open: 1 });
    expect(byKey(privateKey)).toMatchObject({ open: 1 }); // private, still counted
    expect(o.projects[0].health).toBe('at_risk'); // needing attention first
    expect(o.trend).toHaveLength(12);
    expect(o.trend.at(-1).created).toBeGreaterThanOrEqual(4);
  });

  it('workload per person, quality and leave', async () => {
    const o = await overview(owner);
    const devRow = o.workload.find((w: { user: { id: number } }) => w.user.id === dev.id);
    expect(devRow).toMatchObject({ open: 2, overdue: 1, points: 3, projects: 2 });
    expect(o.workload[0].user.id).toBe(dev.id); // most loaded first
    expect(o.quality.openBugsBySeverity).toEqual([
      { severity: 'critical', count: 1 },
      { severity: 'major', count: 0 },
      { severity: 'minor', count: 1 },
      { severity: 'trivial', count: 0 },
      { severity: 'none', count: 0 },
    ]);
    expect(o.quality.bugs.opened).toBe(2);
    expect(o.leave).toMatchObject({ pendingApprovals: 0, outToday: [] });
    expect(o.leave.daysTakenThisYear.map((t: { name: string }) => t.name)).toContain('Annual leave');
  });

  it('exports projects and workload as CSV', async () => {
    const res = await publicApi()
      .get('/api/insights/export/projects?days=30')
      .set('Authorization', `Bearer ${admin.token}`)
      .set('X-Organization-Id', String(admin.orgId))
      .buffer(true)
      .parse((r, cb) => {
        let data = '';
        r.setEncoding('utf8');
        r.on('data', (c: string) => (data += c));
        r.on('end', () => cb(null, data));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('insights-projects-');
    const lines = (res.body as string).replace(/^﻿/, '').split('\r\n');
    expect(lines[0]).toContain('Key,Project,Health');
    expect(lines.some((l) => l.startsWith(`${riskyKey},Risky,at_risk`))).toBe(true);
    expect((await admin.api.get('/insights/export/everything')).status).toBe(400);
  });
});

describe('weekly report', () => {
  it('"send me" emails the report now; the Monday schedule sends it to everyone with insights.view who wants it', async () => {
    expect((await admin.api.post('/insights/weekly-report/send-me')).body.data.sent).toBe(1);
    await runJobs();
    const preview = (await lastEmailTo(admin.email))!;
    expect(preview.template).toBe('insightsWeekly');
    expect(preview.html).toContain('Risky');
    expect(preview.html).toContain('critical bug');

    // the admin opts out; the owner keeps the default (on)
    await admin.api.put('/notifications/preferences', { preferences: [{ category: 'reports', inApp: false, email: 'off' }] });
    expect((await dev.api.get('/notifications/preferences')).body.data.map((p: { category: string }) => p.category)).not.toContain('reports');

    const before = (await lastEmailTo(admin.email))!;
    // pretend the server missed last week's run (Monday 08:00, a week+ ago) → it runs once now, next run = the coming Monday 08:00
    await db.query(`UPDATE job_schedules SET next_run_at = date_trunc('week', NOW()) - INTERVAL '7 days' + INTERVAL '8 hours' WHERE name = 'insights.weekly-report'`);
    expect(await runDueSchedules()).toEqual(['insights.weekly-report']);
    await runJobs();
    expect((await lastEmailTo(owner.email))!.template).toBe('insightsWeekly');
    expect((await lastEmailTo(admin.email))!.subject).toBe(before.subject); // nothing new for the admin
    expect((await lastEmailTo(dev.email))?.template).not.toBe('insightsWeekly');
    const { rows } = await db.query(
      `SELECT EXTRACT(ISODOW FROM next_run_at) AS dow, EXTRACT(HOUR FROM next_run_at) AS hour, next_run_at > NOW() AS future
         FROM job_schedules WHERE name = 'insights.weekly-report'`,
    );
    expect(rows[0]).toMatchObject({ future: true });
    expect([Number(rows[0].dow), Number(rows[0].hour)]).toEqual([1, 8]); // Monday 08:00
  });
});
