// Phase 2h: notifications — triggers, preferences, collapsing, emails, digest, scheduler, isolation.
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../src/database/db.js';
import { runDueSchedules } from '../../src/jobs/index.js';
import { addMember, lastEmailTo, registerOwner, runJobs, uniqueKey, type TestUser } from '../helpers.js';

let owner: TestUser;
let dev: TestUser;
let qa: TestUser;
let key: string;
let statuses: { id: number; name: string }[];
const status = (name: string) => statuses.find((s) => s.name === name)!.id;
const inbox = async (u: TestUser, query = '') => (await u.api.get(`/notifications${query}`)).body.data;

beforeAll(async () => {
  owner = await registerOwner('Notify Org');
  dev = await addMember(owner, 'developer', 'Dev Person');
  qa = await addMember(owner, 'qa', 'Qa Person');
  key = uniqueKey();
  statuses = (await owner.api.post('/projects', { name: 'App', key, template: 'bug_tracking' })).body.data.statuses;
  for (const u of [dev, qa]) await owner.api.post(`/projects/${key}/members`, { userId: u.id, role: 'member' });
});

describe('triggers', () => {
  let bug: { id: number; key: string; number: number };

  it('assigning work notifies the assignee (never the person who did it) + instant email', async () => {
    bug = (await owner.api.post(`/projects/${key}/items`, { type: 'bug', title: 'Cart total is wrong', assigneeId: dev.id })).body.data;
    const d = await inbox(dev);
    expect(d.unread).toBe(1);
    expect(d.items[0]).toMatchObject({ type: 'assigned', category: 'assignments', title: `Owner User assigned you ${bug.key}`, body: 'Cart total is wrong', url: `/projects/${key}/items/${bug.number}`, actor: { id: owner.id } });
    expect((await inbox(owner)).unread).toBe(0);

    await runJobs();
    const email = (await lastEmailTo(dev.email))!;
    expect(email.template).toBe('notification');
    expect(email.html).toContain(`http://app.test/projects/${key}/items/${bug.number}`);
  });

  it('mentions → "mentioned" only; other watchers → "commented"; bursts collapse into one', async () => {
    await qa.api.post(`/work-items/${bug.id}/watch`);
    await owner.api.post(`/work-items/${bug.id}/comments`, { body: 'Please check @[Dev Person](user:' + dev.id + ')' });
    const devItems = (await inbox(dev)).items;
    expect(devItems[0]).toMatchObject({ type: 'mentioned', title: `Owner User mentioned you on ${bug.key}` });
    expect(devItems.filter((n: { type: string }) => n.type === 'commented')).toHaveLength(0);

    await owner.api.post(`/work-items/${bug.id}/comments`, { body: 'One more thing' });
    await owner.api.post(`/work-items/${bug.id}/comments`, { body: 'And another' });
    const qaComments = (await inbox(qa)).items.filter((n: { type: string }) => n.type === 'commented');
    expect(qaComments).toHaveLength(1); // three comments, one notification
    expect(qaComments[0]).toMatchObject({ count: 3, body: 'And another' });
  });

  it('status changes notify watchers; QA verdicts notify assignee and reporter with ONE specific notification', async () => {
    await dev.api.patch(`/work-items/${bug.id}`, { statusId: status('Ready for QA') });
    expect((await inbox(owner)).items[0]).toMatchObject({ type: 'status_changed', title: `Dev Person moved ${bug.key} to Ready for QA` });

    const before = (await inbox(dev)).total;
    await qa.api.post(`/work-items/${bug.id}/qa`, { verdict: 'fail', comment: 'Still wrong with coupons' });
    const after = await inbox(dev);
    expect(after.total).toBe(before + 1); // no extra "status changed" / "commented"
    expect(after.items[0]).toMatchObject({ type: 'qa_failed', category: 'qa', body: 'Still wrong with coupons' });
    expect((await inbox(owner)).items[0].type).toBe('qa_failed'); // reporter
  });

  it('production errors: new problems notify people with errors.manage', async () => {
    await dev.api.post('/errors/simulate/generic');
    const n = await (async () => {
      for (let i = 0; i < 40; i++) {
        const item = (await inbox(qa)).items.find((x: { type: string }) => x.type === 'error_new');
        if (item) return item;
        await new Promise((r) => setTimeout(r, 50));
      }
      return null;
    })();
    expect(n).toMatchObject({ category: 'errors', actor: null });
    expect(n.url).toMatch(/^\/errors\/\d+$/);
  });
});

describe('reading', () => {
  it('mark one / all read, unread again, counts', async () => {
    const d = await inbox(dev, '?unread=true');
    expect(d.unread).toBeGreaterThan(0);
    const first = d.items[0];
    expect((await dev.api.post('/notifications/read', { ids: [first.id] })).body.data.unread).toBe(d.unread - 1);
    expect((await dev.api.post(`/notifications/${first.id}/unread`)).body.data.unread).toBe(d.unread);
    expect((await dev.api.post('/notifications/read', { all: true })).body.data.unread).toBe(0);
    expect((await dev.api.get('/notifications/unread-count')).body.data.unread).toBe(0);
  });

  it('a notification read in the app is not emailed afterwards', async () => {
    const item = (await owner.api.post(`/projects/${key}/items`, { type: 'task', title: 'Seen already', assigneeId: dev.id })).body.data;
    const n = (await inbox(dev)).items.find((x: { title: string }) => x.title.includes(item.key));
    await dev.api.post('/notifications/read', { ids: [n.id] });
    await runJobs();
    const { rows } = await db.query('SELECT emailed_at FROM notifications WHERE id = $1', [n.id]);
    expect(rows[0].emailed_at).toBeNull();
  });

  it('notifications are per organization', async () => {
    const other = await registerOwner('Other Notify Org');
    expect((await inbox(other)).total).toBe(0);
    const devItem = (await inbox(dev)).items[0];
    expect((await other.api.post(`/notifications/${devItem.id}/unread`)).status).toBe(404);
  });
});

describe('preferences, digest and scheduler', () => {
  it('defaults per category; turning a category off stops it', async () => {
    const prefs = (await qa.api.get('/notifications/preferences')).body.data;
    expect(prefs.find((p: { category: string }) => p.category === 'watching')).toMatchObject({ inApp: true, email: 'daily', isDefault: true });
    await qa.api.put('/notifications/preferences', { preferences: [{ category: 'assignments', inApp: false, email: 'off' }] });
    const before = (await inbox(qa)).total;
    await owner.api.post(`/projects/${key}/items`, { type: 'task', title: 'Quiet', assigneeId: qa.id });
    expect((await inbox(qa)).total).toBe(before);
    expect((await qa.api.put('/notifications/preferences', { preferences: [{ category: 'nope', inApp: true, email: 'off' }] })).status).toBe(400);
  });

  it('daily items are sent as ONE digest email by the scheduled job', async () => {
    // owner watches the bug through reporting → status changes are "watching" = daily by default
    const item = (await owner.api.post(`/projects/${key}/items`, { type: 'bug', title: 'Digest me', assigneeId: dev.id })).body.data;
    await dev.api.patch(`/work-items/${item.id}`, { statusId: status('In Progress') });
    await runJobs(); // instant emails, not the digest

    await db.query(`UPDATE job_schedules SET next_run_at = NOW() - INTERVAL '1 minute' WHERE name = 'notifications.daily-digest'`);
    expect(await runDueSchedules()).toEqual(['notifications.daily-digest']);
    expect(await runDueSchedules()).toEqual([]); // moved to tomorrow — runs once
    await runJobs();
    const digest = (await lastEmailTo(owner.email))!;
    expect(digest.template).toBe('notificationDigest');
    expect(digest.html).toContain(`moved ${item.key} to In Progress`);
    const { rows } = await db.query(`SELECT next_run_at > NOW() + INTERVAL '23 hours' AS later FROM job_schedules WHERE name = 'notifications.daily-digest'`);
    expect(rows[0].later).toBe(true);
  });
});
