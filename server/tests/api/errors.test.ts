// Phase 2f: production errors — capture, grouping, inbox, bug creation, auto-resolve, regressions.
import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../../src/database/db.js';
import { addMember, publicApi, registerOwner, uniqueKey, type TestUser } from '../helpers.js';

let owner: TestUser;
let developer: TestUser;
let member: TestUser;
let key: string;

/** Capture runs after the 500 response is sent — poll until it shows up. */
async function eventually<T>(fn: () => Promise<T | undefined | null | false>, ms = 3000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > until) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
}

const groupsOf = async (user: TestUser, query = '') => (await user.api.get(`/errors?status=all${query}`)).body.data;

beforeAll(async () => {
  owner = await registerOwner('Errors Org');
  developer = await addMember(owner, 'developer', 'Dev Person');
  member = await addMember(owner, 'member', 'Plain Member');
  key = uniqueKey();
  await owner.api.post('/projects', { name: 'Api', key, template: 'bug_tracking' });
  await owner.api.post(`/projects/${key}/members`, { userId: developer.id, role: 'member' });
});

describe('server errors', () => {
  let groupId: number;

  it('a 500 is captured once per distinct problem, with request id, route and the SQL of the request', async () => {
    const res = await developer.api.post('/errors/simulate/generic');
    expect(res.status).toBe(500);
    expect(res.body.requestId).toBeTruthy();
    await developer.api.post('/errors/simulate/generic'); // same problem again

    const group = await eventually(async () => (await groupsOf(developer)).items.find((g: { occurrences: number }) => g.occurrences === 2));
    groupId = group.id;
    expect(group).toMatchObject({ source: 'server', status: 'unresolved', culprit: 'POST /api/errors/simulate/:kind', usersAffected: 1 });
    expect(group.title).toContain('Simulated failure');

    const detail = (await developer.api.get(`/errors/${groupId}`)).body.data;
    expect(detail.events).toHaveLength(2);
    expect(detail.events[0].requestId).toBeTruthy();
    expect(detail.events[0].stack).toContain('simulateError');
    expect(detail.events[0].context.route).toBe('/api/errors/simulate/:kind');
    expect(Array.isArray(detail.events[0].context.queries)).toBe(true);
    expect(detail.daily).toHaveLength(14);

    // a different error type → a different group
    await developer.api.post('/errors/simulate/type');
    await eventually(async () => (await groupsOf(developer)).items.some((g: { title: string }) => g.title.startsWith('TypeError')));
  });

  it('needs errors.read / errors.manage; plain members see nothing', async () => {
    expect((await member.api.get('/errors')).status).toBe(403);
    expect((await member.api.post('/errors/simulate/generic')).status).toBe(403);
    expect((await developer.api.patch(`/errors/${groupId}`, { status: 'ignored' })).body.data.status).toBe('ignored');
    expect((await developer.api.patch(`/errors/${groupId}`, { status: 'unresolved' })).body.data.status).toBe('unresolved');
  });

  it('is isolated per organization (and visible to platform admins only across them)', async () => {
    const other = await registerOwner('Other Org');
    expect((await other.api.get(`/errors/${groupId}`)).status).toBe(404);
    expect((await groupsOf(other)).total).toBe(0);
    expect((await developer.api.get('/platform/errors')).status).toBe(403); // platform admins only
  });

  it('turns an error into a pre-filled bug; done bug resolves the error; a recurrence re-opens it (regression)', async () => {
    const created = await developer.api.post(`/errors/${groupId}/bug`, { projectRef: key });
    expect(created.status).toBe(201);
    const bug = created.body.data.bug;
    expect(bug).toMatchObject({ type: 'bug', priority: 'high', severity: 'major', productionErrors: [{ id: groupId, occurrences: 2 }] });
    expect(bug.title).toContain('[Error]');
    expect(bug.description).toContain('Request id');
    expect(bug.stepsToReproduce).toBe('POST /api/errors/simulate/generic');
    expect(created.body.data.group.bug.key).toBe(bug.key);
    expect((await developer.api.post(`/errors/${groupId}/bug`, { projectRef: key })).status).toBe(409);

    // the fix is verified → the error counts as resolved
    const project = (await owner.api.get(`/projects/${key}`)).body.data;
    await owner.api.patch(`/work-items/${bug.id}`, { statusId: project.qaPassedStatusId });
    expect((await developer.api.get(`/errors/${groupId}`)).body.data.status).toBe('resolved');

    // …and it happens again → regression: unresolved again + history event on the bug
    await developer.api.post('/errors/simulate/generic');
    const regressed = await eventually(async () => {
      const g = (await developer.api.get(`/errors/${groupId}`)).body.data;
      return g.status === 'unresolved' && g.regressedAt ? g : null;
    });
    expect(regressed.occurrences).toBe(3);
    const history = (await owner.api.get(`/work-items/${bug.id}/events`)).body.data;
    expect(history.map((e: { eventType: string }) => e.eventType)).toEqual(expect.arrayContaining(['error_linked', 'error_regressed']));
  });

  it('can link an existing bug instead (if the user can see it)', async () => {
    const type = (await groupsOf(developer)).items.find((g: { title: string }) => g.title.startsWith('TypeError'));
    const item = (await developer.api.post(`/projects/${key}/items`, { type: 'bug', title: 'Known issue' })).body.data;
    const linked = await developer.api.post(`/errors/${type.id}/link`, { itemRef: item.key });
    expect(linked.body.data.bug.key).toBe(item.key);
  });
});

describe('browser errors', () => {
  const report = (message: string, extra: object = {}) => ({
    errorId: randomUUID(),
    source: 'boundary',
    name: 'TypeError',
    message,
    stack: `TypeError: ${message}\n    at onDrop (http://localhost:5173/assets/BoardPage-AbC123de.js:1:200)`,
    url: 'http://localhost:5173/projects/TF',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/128.0.0.0 Safari/537.36',
    release: '1.2.3',
    ...extra,
  });

  it('are grouped across deploys and attributed to the organization only for its members', async () => {
    const msg = `items.map is not a function ${uniqueKey()}`;
    // signed in + organization header → organization inbox
    const first = await publicApi()
      .post('/api/client-errors')
      .set('Authorization', `Bearer ${developer.token}`)
      .set('X-Organization-Id', String(developer.orgId))
      .send(report(msg));
    expect(first.status).toBe(204);
    // same bug after a new deploy (different bundle hash) → same group
    await publicApi()
      .post('/api/client-errors')
      .set('Authorization', `Bearer ${developer.token}`)
      .set('X-Organization-Id', String(developer.orgId))
      .send(report(msg, { stack: `TypeError: ${msg}\n    at onDrop (http://localhost:5173/assets/BoardPage-Zz9_8xYw.js:1:999)` }));

    const group = await eventually(async () =>
      (await groupsOf(developer, '&source=client')).items.find((g: { title: string; occurrences: number }) => g.title.includes(msg) && g.occurrences === 2),
    );
    expect(group).toMatchObject({ source: 'client', culprit: '/assets/BoardPage.js in onDrop', lastRelease: '1.2.3' });

    // a header for an organization the user is NOT in → not attributed to it
    const other = await registerOwner('Spoof Target');
    await publicApi()
      .post('/api/client-errors')
      .set('Authorization', `Bearer ${developer.token}`)
      .set('X-Organization-Id', String(other.orgId))
      .send(report(`spoof ${msg}`));
    await eventually(async () => {
      const { rows } = await db.query('SELECT organization_id FROM error_groups WHERE title LIKE $1', [`%spoof ${msg}%`]);
      return rows.length ? rows : null;
    }).then((rows) => expect((rows as { organization_id: number | null }[])[0]!.organization_id).toBeNull());
    expect((await groupsOf(other)).total).toBe(0);
  });
});
