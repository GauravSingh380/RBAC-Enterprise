// Phase 2f: bug details, resolution, QA verification flow, duplicate detection.
import { beforeAll, describe, expect, it } from 'vitest';
import { addMember, registerOwner, uniqueKey, type TestUser } from '../helpers.js';

let owner: TestUser;
let developer: TestUser;
let qa: TestUser;
let key: string;
let statuses: { id: number; name: string; category: string }[];
const status = (name: string) => statuses.find((s) => s.name === name)!.id;

const newBug = async (title: string, extra: object = {}) =>
  (await developer.api.post(`/projects/${key}/items`, { type: 'bug', title, ...extra })).body.data;

beforeAll(async () => {
  owner = await registerOwner('Bugs Org');
  developer = await addMember(owner, 'developer', 'Dev Person');
  qa = await addMember(owner, 'qa', 'Qa Person');
  key = uniqueKey();
  const p = await owner.api.post('/projects', { name: 'Shop', key, template: 'bug_tracking' });
  statuses = p.body.data.statuses;
  for (const u of [developer, qa]) await owner.api.post(`/projects/${key}/members`, { userId: u.id, role: 'member' });
});

describe('bug details & resolution', () => {
  it('stores browser / OS / versions and keeps severity separate from priority', async () => {
    const bug = await newBug('Checkout button does nothing', {
      priority: 'low',
      severity: 'critical',
      browser: 'Chrome 128',
      os: 'Windows 11',
      foundInVersion: '2.4.0',
      environment: 'staging',
    });
    expect(bug).toMatchObject({ priority: 'low', severity: 'critical', browser: 'Chrome 128', os: 'Windows 11', foundInVersion: '2.4.0', resolution: null, reopenCount: 0 });
    const updated = await developer.api.patch(`/work-items/${bug.id}`, { fixedInVersion: '2.4.1' });
    expect(updated.body.data.fixedInVersion).toBe('2.4.1');
    const history = (await developer.api.get(`/work-items/${bug.id}/events`)).body.data;
    expect(history[0]).toMatchObject({ field: 'fixedInVersion', newValue: '2.4.1' });
  });

  it('sets resolution "fixed" when a bug is done, clears it when reopened, keeps an explicit one', async () => {
    const bug = await newBug('Typo on the pricing page');
    const closed = await owner.api.patch(`/work-items/${bug.id}`, { statusId: status("Won't Fix"), resolution: 'wont_fix' });
    expect(closed.body.data.resolution).toBe('wont_fix');
    const reopened = await owner.api.patch(`/work-items/${bug.id}`, { statusId: status('Reopened') });
    expect(reopened.body.data.resolution).toBeNull();
    const done = await owner.api.patch(`/work-items/${bug.id}`, { statusId: status('Verified') });
    expect(done.body.data.resolution).toBe('fixed');
  });
});

describe('QA verification flow', () => {
  it('is configured from the template and exposed on the project', async () => {
    const p = (await owner.api.get(`/projects/${key}`)).body.data;
    expect(p).toMatchObject({ qaReadyStatusId: status('Ready for QA'), qaPassedStatusId: status('Verified'), qaFailedStatusId: status('Reopened') });
  });

  it('fail → Reopened, reopen count +1, reason posted as a comment; pass → Verified + fixed', async () => {
    const bug = await newBug('Coupon not applied');
    // not waiting for QA yet
    expect((await qa.api.post(`/work-items/${bug.id}/qa`, { verdict: 'pass' })).status).toBe(409);
    await developer.api.patch(`/work-items/${bug.id}`, { statusId: status('Ready for QA') });

    // developers cannot give QA verdicts (Verified is restricted to qa / admin / owner)
    expect((await developer.api.post(`/work-items/${bug.id}/qa`, { verdict: 'pass' })).status).toBe(403);
    // failing needs a reason
    expect((await qa.api.post(`/work-items/${bug.id}/qa`, { verdict: 'fail' })).status).toBe(400);

    const failed = await qa.api.post(`/work-items/${bug.id}/qa`, { verdict: 'fail', comment: 'Still broken for 10% coupons' });
    expect(failed.status).toBe(200);
    expect(failed.body.data).toMatchObject({ status: { name: 'Reopened' }, reopenCount: 1 });
    const comments = (await qa.api.get(`/work-items/${bug.id}/comments`)).body.data;
    expect(comments.at(-1).body).toContain('QA failed');
    const events = (await qa.api.get(`/work-items/${bug.id}/events`)).body.data.map((e: { eventType: string }) => e.eventType);
    expect(events).toContain('qa_failed');

    await developer.api.patch(`/work-items/${bug.id}`, { statusId: status('Ready for QA') });
    const passed = await qa.api.post(`/work-items/${bug.id}/qa`, { verdict: 'pass', fixedInVersion: '2.5.0' });
    expect(passed.body.data).toMatchObject({ status: { name: 'Verified' }, resolution: 'fixed', fixedInVersion: '2.5.0', reopenCount: 1 });
  });

  it('projects without a QA flow refuse verdicts; admins can configure it with their own statuses only', async () => {
    const plainKey = uniqueKey();
    const plain = (await owner.api.post('/projects', { name: 'Plain', key: plainKey, template: 'kanban' })).body.data;
    expect(plain.qaReadyStatusId).toBeNull();
    const item = (await owner.api.post(`/projects/${plainKey}/items`, { type: 'bug', title: 'x' })).body.data;
    expect((await owner.api.post(`/work-items/${item.id}/qa`, { verdict: 'pass' })).status).toBe(400);

    // a status of ANOTHER project is rejected
    expect((await owner.api.patch(`/projects/${plainKey}`, { qaReadyStatusId: status('Ready for QA') })).status).toBe(400);
    const [todo, doing, done] = plain.statuses;
    const configured = await owner.api.patch(`/projects/${plainKey}`, { qaReadyStatusId: doing.id, qaPassedStatusId: done.id, qaFailedStatusId: todo.id });
    expect(configured.body.data).toMatchObject({ qaReadyStatusId: doing.id, qaPassedStatusId: done.id, qaFailedStatusId: todo.id });
    // deleting a status used by the flow just clears that setting
    await owner.api.delete(`/projects/${plainKey}/statuses/${doing.id}?moveTo=${todo.id}`);
    expect((await owner.api.get(`/projects/${plainKey}`)).body.data.qaReadyStatusId).toBeNull();
  });
});

describe('duplicate detection', () => {
  it('suggests similar titles while typing (typos and word order included)', async () => {
    const original = await newBug('Login page crashes on Safari when password is empty');
    await newBug('Profile avatar upload is slow');
    const res = await qa.api.get(`/projects/${key}/items/similar?title=${encodeURIComponent('safari login crash with empty pasword')}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0].id).toBe(original.id);
    expect(res.body.data[0].score).toBeGreaterThan(0.15);
    expect(res.body.data.map((i: { title: string }) => i.title)).not.toContain('Profile avatar upload is slow');
    // excludes the item itself (edit form)
    const self = await qa.api.get(`/projects/${key}/items/similar?title=${encodeURIComponent(original.title)}&excludeId=${original.id}`);
    expect(self.body.data.map((i: { id: number }) => i.id)).not.toContain(original.id);
  });

  it('closes an item as a duplicate: link, resolution, done status, watchers move to the original', async () => {
    const original = await newBug('Search returns no results for accented names');
    const dup = (await qa.api.post(`/projects/${key}/items`, { type: 'bug', title: 'Search fails with é' })).body.data;
    expect((await qa.api.post(`/work-items/${dup.id}/close-duplicate`, { duplicateOf: dup.key })).status).toBe(400);
    const res = await qa.api.post(`/work-items/${dup.id}/close-duplicate`, { duplicateOf: original.key });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ resolution: 'duplicate', status: { name: "Won't Fix", category: 'done' } });
    expect(res.body.data.links[0]).toMatchObject({ linkType: 'duplicates', direction: 'outward', item: { key: original.key } });
    const orig = (await qa.api.get(`/work-items/${original.id}`)).body.data;
    expect(orig.watchers.map((w: { id: number }) => w.id)).toContain(qa.id);
  });
});
