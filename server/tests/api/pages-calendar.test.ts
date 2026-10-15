// Phase 3f: project docs (pages, versions, conflicts, search, trash) and the calendar.
import { beforeAll, describe, expect, it } from 'vitest';
import { addMember, registerOwner, uniqueKey, type TestUser } from '../helpers.js';

let owner: TestUser;
let dev: TestUser;
let viewer: TestUser;
let outsider: TestUser;
let key: string;

beforeAll(async () => {
  owner = await registerOwner('Docs Org');
  dev = await addMember(owner, 'developer', 'Doc Writer');
  viewer = await addMember(owner, 'member', 'Doc Reader');
  outsider = await addMember(owner, 'member', 'Not In Project');
  key = uniqueKey();
  await owner.api.post('/projects', { name: 'Docs', key, visibility: 'private' });
  await owner.api.post(`/projects/${key}/members`, { userId: dev.id, role: 'member' });
  await owner.api.post(`/projects/${key}/members`, { userId: viewer.id, role: 'viewer' });
});

describe('project docs', () => {
  it('members write, viewers read, outsiders see nothing', async () => {
    const page = await dev.api.post(`/projects/${key}/pages`, { title: 'Specification', body: '## Goal\n\nShip the **checkout**.' });
    expect(page.status).toBe(201);
    expect(page.body.data).toMatchObject({ title: 'Specification', parentId: null, canEdit: true, createdBy: { id: dev.id } });
    expect((await viewer.api.get(`/projects/${key}/pages/${page.body.data.id}`)).body.data.canEdit).toBe(false);
    expect((await viewer.api.post(`/projects/${key}/pages`, { title: 'x' })).status).toBe(403);
    expect((await outsider.api.get(`/projects/${key}/pages`)).status).toBe(404);
  });

  it('sub-pages, no loops, search', async () => {
    const parent = (await owner.api.post(`/projects/${key}/pages`, { title: 'Meetings' })).body.data;
    const child = (await owner.api.post(`/projects/${key}/pages`, { title: 'Kick-off notes', body: 'We agreed on the deadline.', parentId: parent.id })).body.data;
    expect(child.parentId).toBe(parent.id);
    expect((await owner.api.patch(`/projects/${key}/pages/${parent.id}`, { parentId: child.id })).status).toBe(400);
    expect((await owner.api.patch(`/projects/${key}/pages/${parent.id}`, { parentId: parent.id })).status).toBe(400);

    const hits = (await viewer.api.get(`/projects/${key}/pages/search?q=deadline`)).body.data;
    expect(hits[0]).toMatchObject({ id: child.id, title: 'Kick-off notes' });
    expect(hits[0].snippet).toContain('[[deadline]]');
    expect((await viewer.api.get(`/projects/${key}/pages/search?q=Kick`)).body.data[0].id).toBe(child.id);
  });

  it('every save is a version; an older one can be restored; a stale edit is refused', async () => {
    const p = (await dev.api.post(`/projects/${key}/pages`, { title: 'Decisions', body: 'v1' })).body.data;
    const v2 = (await dev.api.patch(`/projects/${key}/pages/${p.id}`, { body: 'v2', baseUpdatedAt: p.updatedAt })).body.data;
    expect(v2.body).toBe('v2');

    // someone else started from the first version
    const stale = await owner.api.patch(`/projects/${key}/pages/${p.id}`, { body: 'mine', baseUpdatedAt: p.updatedAt });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('PAGE_CHANGED');
    expect(stale.body.message).toContain('Doc Writer');

    const versions = (await owner.api.get(`/projects/${key}/pages/${p.id}/versions`)).body.data;
    expect(versions.map((v: { length: number }) => v.length)).toEqual([2, 2]); // v2, v1 (newest first)
    const restored = (await owner.api.post(`/projects/${key}/pages/${p.id}/versions/${versions[1].id}/restore`)).body.data;
    expect(restored.body).toBe('v1');
    expect((await owner.api.get(`/projects/${key}/pages/${p.id}/versions`)).body.data).toHaveLength(3);
  });

  it('deleting moves the page and its sub-pages to the trash', async () => {
    const parent = (await owner.api.post(`/projects/${key}/pages`, { title: 'Old area' })).body.data;
    await owner.api.post(`/projects/${key}/pages`, { title: 'Old child', parentId: parent.id });
    expect((await owner.api.delete(`/projects/${key}/pages/${parent.id}`)).body.data).toEqual({ trashed: 2 });
    const titles = (await owner.api.get(`/projects/${key}/pages`)).body.data.map((x: { title: string }) => x.title);
    expect(titles).not.toContain('Old area');
    expect(titles).not.toContain('Old child');
    const trash = (await owner.api.get(`/projects/${key}/trash`)).body.data;
    expect(trash).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'page', id: parent.id, withChildren: 1 })]));
    expect((await owner.api.post(`/projects/${key}/trash/page/${parent.id}/restore`)).body.data).toEqual({ restored: 2 });
  });
});

describe('calendar', () => {
  it('project: items by due date in the range + sprints; mine: my items across projects', async () => {
    const make = (title: string, dueDate: string | undefined, assigneeId?: number) =>
      owner.api.post(`/projects/${key}/items`, { type: 'task', title, dueDate, assigneeId });
    await make('In range', '2030-03-10', dev.id);
    await make('Out of range', '2030-05-01', dev.id);
    await make('No date', undefined, dev.id);
    const gone = (await make('Deleted', '2030-03-11', dev.id)).body.data;
    await owner.api.delete(`/work-items/${gone.key}`);
    const sprint = (await owner.api.post(`/projects/${key}/sprints`, { name: 'March', startDate: '2030-03-04', endDate: '2030-03-15' })).body.data;

    const cal = (await viewer.api.get(`/projects/${key}/calendar?from=2030-03-01&to=2030-03-31`)).body.data;
    expect(cal.items.map((i: { title: string }) => i.title)).toEqual(['In range']);
    expect(cal.sprints).toEqual([expect.objectContaining({ id: sprint.id, startDate: '2030-03-04', endDate: '2030-03-15' })]);
    expect((await viewer.api.get(`/projects/${key}/calendar?from=2030-03-01&to=2030-06-30`)).status).toBe(400); // > 62 days

    const mine = (await dev.api.get('/my-work/calendar?from=2030-03-01&to=2030-03-31')).body.data;
    expect(mine.items.map((i: { title: string }) => i.title)).toEqual(['In range']);
    expect((await outsider.api.get('/my-work/calendar?from=2030-03-01&to=2030-03-31')).body.data.items).toEqual([]);
  });
});
