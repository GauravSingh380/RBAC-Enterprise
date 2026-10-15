import { existsSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../src/database/db.js';
import { addMember, registerOwner, uniqueKey, type TestUser } from '../helpers.js';

let owner: TestUser;
let developer: TestUser;
let qa: TestUser;
let key: string;
let statuses: { id: number; name: string; category: string }[];
const status = (name: string) => statuses.find((s) => s.name === name)!.id;

beforeAll(async () => {
  owner = await registerOwner('Items Org');
  developer = await addMember(owner, 'developer', 'Dev Person');
  qa = await addMember(owner, 'qa', 'Qa Person');
  key = uniqueKey();
  const p = await owner.api.post('/projects', { name: 'Product', key, template: 'bug_tracking' });
  statuses = p.body.data.statuses;
  await owner.api.post(`/projects/${key}/members`, { userId: developer.id, role: 'member' });
  await owner.api.post(`/projects/${key}/members`, { userId: qa.id, role: 'member' });
});

describe('work items', () => {
  it('numbers items per project and finds them by key', async () => {
    const a = await developer.api.post(`/projects/${key}/items`, { type: 'bug', title: 'First bug', priority: 'high', severity: 'major' });
    const b = await developer.api.post(`/projects/${key}/items`, { type: 'task', title: 'Second' });
    expect(a.status).toBe(201);
    expect(b.body.data.number).toBe(a.body.data.number + 1);
    expect(a.body.data.key).toBe(`${key}-${a.body.data.number}`);
    expect(a.body.data.status.name).toBe('Open'); // first status of the workflow
    expect(a.body.data.reporter.id).toBe(developer.id);
    expect(a.body.data.isWatching).toBe(true); // reporter watches automatically

    const byKey = await developer.api.get(`/work-items/${a.body.data.key}`);
    expect(byKey.status).toBe(200);
    expect(byKey.body.data.title).toBe('First bug');
  });

  it('enforces the hierarchy epic > story/task/bug > subtask', async () => {
    const epic = (await owner.api.post(`/projects/${key}/items`, { type: 'epic', title: 'Epic' })).body.data;
    const story = await owner.api.post(`/projects/${key}/items`, { type: 'story', title: 'Story', parentId: epic.id });
    expect(story.status).toBe(201);
    expect((await owner.api.post(`/projects/${key}/items`, { type: 'subtask', title: 'Orphan' })).status).toBe(400);
    expect((await owner.api.post(`/projects/${key}/items`, { type: 'subtask', title: 'Wrong', parentId: epic.id })).status).toBe(400);
    const sub = await owner.api.post(`/projects/${key}/items`, { type: 'subtask', title: 'Sub', parentId: story.body.data.id });
    expect(sub.status).toBe(201);
    expect((await owner.api.patch(`/work-items/${story.body.data.id}`, { type: 'subtask' })).status).toBe(400); // has children

    const epicDetail = await owner.api.get(`/work-items/${epic.id}`);
    expect(epicDetail.body.data.children.map((c: { title: string }) => c.title)).toEqual(['Story']);
  });

  it('workflow restrictions: only QA (or admins) can move a bug to Verified', async () => {
    const bug = (await developer.api.post(`/projects/${key}/items`, { type: 'bug', title: 'Needs QA' })).body.data;
    expect((await developer.api.patch(`/work-items/${bug.id}`, { statusId: status('Ready for QA') })).status).toBe(200);
    const denied = await developer.api.patch(`/work-items/${bug.id}`, { statusId: status('Verified') });
    expect(denied.status).toBe(403);
    expect(denied.body.message).toContain('Verified');

    const verified = await qa.api.patch(`/work-items/${bug.id}`, { statusId: status('Verified') });
    expect(verified.status).toBe(200);
    expect(verified.body.data.completedAt).not.toBeNull(); // "done" category sets completed_at

    const reopened = await qa.api.patch(`/work-items/${bug.id}`, { statusId: status('Reopened') });
    expect(reopened.body.data.completedAt).toBeNull();
  });

  it('records every change in the history', async () => {
    const item = (await owner.api.post(`/projects/${key}/items`, { type: 'task', title: 'Track me' })).body.data;
    await owner.api.patch(`/work-items/${item.id}`, { title: 'Tracked', priority: 'urgent', assigneeId: developer.id, statusId: status('In Progress') });
    const events = (await owner.api.get(`/work-items/${item.id}/events`)).body.data;
    const fields = events.filter((e: { eventType: string }) => e.eventType === 'updated').map((e: { field: string }) => e.field).sort();
    expect(fields).toEqual(['assignee', 'priority', 'status', 'title']);
    const assignee = events.find((e: { field: string }) => e.field === 'assignee');
    expect(assignee.newValue).toEqual({ id: developer.id, name: 'Dev Person' });
    expect(events.at(-1).eventType).toBe('created');

    // the assignee now watches the item
    const detail = await developer.api.get(`/work-items/${item.id}`);
    expect(detail.body.data.isWatching).toBe(true);
  });

  it('assignees must be able to access the project', async () => {
    const outsider = await addMember(owner, 'member');
    const privateKey = uniqueKey();
    await owner.api.post('/projects', { name: 'Private', key: privateKey, visibility: 'private' });
    const res = await owner.api.post(`/projects/${privateKey}/items`, { type: 'task', title: 'x', assigneeId: outsider.id });
    expect(res.status).toBe(400);
  });

  it('labels and custom fields are validated', async () => {
    const labels = (await owner.api.get(`/projects/${key}/labels`)).body.data;
    const fields = await owner.api.post(`/projects/${key}/fields`, { name: 'Browser', fieldType: 'select', options: ['Chrome', 'Safari'], required: true });
    const browser = fields.body.data[0];

    expect((await owner.api.post(`/projects/${key}/items`, { type: 'bug', title: 'No browser' })).status).toBe(400); // required
    expect(
      (await owner.api.post(`/projects/${key}/items`, { type: 'bug', title: 'Bad', customFields: { [browser.id]: 'Edge' } })).status,
    ).toBe(400);
    const ok = await owner.api.post(`/projects/${key}/items`, {
      type: 'bug',
      title: 'Good',
      labelIds: [labels[0].id],
      customFields: { [browser.id]: 'Safari' },
      stepsToReproduce: '1. open\n2. click',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.data.labels.map((l: { id: number }) => l.id)).toEqual([labels[0].id]);
    expect(ok.body.data.customFields[browser.id]).toBe('Safari');

    // deleting the field removes the value everywhere (and stops it being required)
    await owner.api.delete(`/projects/${key}/fields/${browser.id}`);
    expect((await owner.api.get(`/work-items/${ok.body.data.id}`)).body.data.customFields).toEqual({});
  });

  it('links show the right wording from both sides', async () => {
    const a = (await owner.api.post(`/projects/${key}/items`, { type: 'task', title: 'Blocker' })).body.data;
    const b = (await owner.api.post(`/projects/${key}/items`, { type: 'task', title: 'Blocked' })).body.data;
    const res = await owner.api.post(`/work-items/${a.id}/links`, { target: b.key, linkType: 'blocks' });
    expect(res.status).toBe(201);
    expect(res.body.data.links[0].label).toBe('blocks');
    const fromB = (await owner.api.get(`/work-items/${b.id}`)).body.data.links[0];
    expect(fromB.label).toBe('is blocked by');
    expect(fromB.item.key).toBe(a.key);
    expect((await owner.api.post(`/work-items/${a.id}/links`, { target: b.key, linkType: 'blocks' })).status).toBe(409);
    expect((await owner.api.post(`/work-items/${a.id}/links`, { target: a.key, linkType: 'relates_to' })).status).toBe(400);
    expect((await owner.api.delete(`/work-items/${b.id}/links/${fromB.linkId}`)).status).toBe(204);
  });

  it('comments: mentions make people watchers, reactions toggle, only authors edit', async () => {
    const item = (await owner.api.post(`/projects/${key}/items`, { type: 'task', title: 'Discuss' })).body.data;
    const comment = await owner.api.post(`/work-items/${item.id}/comments`, { body: `Hey @[Qa Person](user:${qa.id}) please check` });
    expect(comment.status).toBe(201);
    expect((await qa.api.get(`/work-items/${item.id}`)).body.data.isWatching).toBe(true);

    const c = comment.body.data;
    const r1 = await qa.api.post(`/work-items/${item.id}/comments/${c.id}/reactions`, { emoji: '👍' });
    expect(r1.body.data.reactions).toEqual([{ emoji: '👍', count: 1, reacted: true, users: ['Qa Person'] }]);
    const r2 = await qa.api.post(`/work-items/${item.id}/comments/${c.id}/reactions`, { emoji: '👍' });
    expect(r2.body.data.reactions).toEqual([]);

    expect((await qa.api.patch(`/work-items/${item.id}/comments/${c.id}`, { body: 'edited by someone else' })).status).toBe(403);
    const edited = await owner.api.patch(`/work-items/${item.id}/comments/${c.id}`, { body: 'Edited' });
    expect(edited.body.data.editedAt).not.toBeNull();
    expect((await owner.api.get(`/work-items/${item.id}`)).body.data.commentCount).toBe(1);
  });

  it('attachments: upload, download with access check, delete removes the file', async () => {
    const item = (await developer.api.post(`/projects/${key}/items`, { type: 'task', title: 'With file' })).body.data;
    const up = await developer.api.upload(`/work-items/${item.id}/attachments`, 'notes.txt', Buffer.from('hello attachment'));
    expect(up.status).toBe(201);
    const att = up.body.data[0];
    expect(att.fileName).toBe('notes.txt');

    const { rows } = await db.query<{ key: string }>('SELECT storage_key AS key FROM work_item_attachments WHERE id = $1', [att.id]);
    const file = path.resolve('uploads-test', rows[0]!.key);
    expect(existsSync(file)).toBe(true);

    const download = await developer.api
      .get(`/work-items/${item.id}/attachments/${att.id}`)
      .buffer(true)
      .parse((res, done) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => done(null, data));
      });
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.body).toBe('hello attachment');

    const stranger = await registerOwner('Stranger Org');
    expect((await stranger.api.get(`/work-items/${item.id}/attachments/${att.id}`)).status).toBe(404);

    expect((await qa.api.delete(`/work-items/${item.id}/attachments/${att.id}`)).status).toBe(403); // not uploader / admin
    expect((await developer.api.delete(`/work-items/${item.id}/attachments/${att.id}`)).status).toBe(204);
    expect(existsSync(file)).toBe(false);
  });

  it('filters, search and organization-wide quick search', async () => {
    await owner.api.post(`/projects/${key}/items`, { type: 'bug', title: 'Login button misaligned', priority: 'urgent', assigneeId: qa.id });
    const byText = await owner.api.get(`/projects/${key}/items?search=misaligned`);
    expect(byText.body.data.items.map((i: { title: string }) => i.title)).toContain('Login button misaligned');

    const urgentMine = await qa.api.get(`/projects/${key}/items?priorities=urgent&assignees=me`);
    expect(urgentMine.body.data.items.every((i: { priority: string }) => i.priority === 'urgent')).toBe(true);
    expect(urgentMine.body.data.total).toBeGreaterThan(0);

    const quick = await owner.api.get('/work-items?search=misaligned');
    expect(quick.body.data[0].key.startsWith(`${key}-`)).toBe(true);
  });

  it('only the reporter or a project admin can delete an item', async () => {
    const item = (await developer.api.post(`/projects/${key}/items`, { type: 'task', title: 'Mine' })).body.data;
    expect((await qa.api.delete(`/work-items/${item.id}`)).status).toBe(403);
    expect((await developer.api.delete(`/work-items/${item.id}`)).status).toBe(204);
    expect((await developer.api.get(`/work-items/${item.id}`)).status).toBe(404);
  });
});
