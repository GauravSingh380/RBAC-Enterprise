// Phase 3f: checklists, item templates and repeating templates.
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../src/database/db.js';
import { runRecurringTemplates } from '../../src/modules/templates/templates.service.js';
import { addMember, registerOwner, uniqueKey, type TestUser } from '../helpers.js';

let owner: TestUser;
let dev: TestUser;
let viewer: TestUser;
let key: string;

beforeAll(async () => {
  owner = await registerOwner('Routine Org');
  dev = await addMember(owner, 'developer', 'Routine Dev');
  viewer = await addMember(owner, 'member', 'Routine Viewer');
  key = uniqueKey();
  await owner.api.post('/projects', { name: 'Routines', key, visibility: 'private' });
  await owner.api.post(`/projects/${key}/members`, { userId: dev.id, role: 'member' });
  await owner.api.post(`/projects/${key}/members`, { userId: viewer.id, role: 'viewer' });
});

describe('checklists', () => {
  it('add, tick, edit, reorder, delete — progress shows on the card', async () => {
    const it1 = (await owner.api.post(`/projects/${key}/items`, { type: 'task', title: 'Release', checklist: ['Tag', 'Build'] })).body.data;
    expect(it1.checklistItems.map((c: { text: string }) => c.text)).toEqual(['Tag', 'Build']);

    let list = (await dev.api.post(`/work-items/${it1.key}/checklist`, { text: 'Announce' })).body.data;
    expect(list).toHaveLength(3);
    list = (await dev.api.patch(`/work-items/${it1.key}/checklist/${list[0].id}`, { done: true })).body.data;
    expect(list[0]).toMatchObject({ done: true, doneBy: { id: dev.id } });
    list = (await dev.api.put(`/work-items/${it1.key}/checklist/order`, { ids: [list[2].id, list[0].id, list[1].id] })).body.data;
    expect(list.map((c: { text: string }) => c.text)).toEqual(['Announce', 'Tag', 'Build']);
    expect((await dev.api.put(`/work-items/${it1.key}/checklist/order`, { ids: [list[0].id] })).status).toBe(400);

    const card = (await owner.api.get(`/projects/${key}/items`)).body.data.items.find((i: { id: number }) => i.id === it1.id);
    expect(card.checklist).toEqual({ done: 1, total: 3 });

    expect((await viewer.api.post(`/work-items/${it1.key}/checklist`, { text: 'nope' })).status).toBe(403);
    list = (await owner.api.delete(`/work-items/${it1.key}/checklist/${list[0].id}`)).body.data;
    expect(list).toHaveLength(2);
  });
});

describe('templates', () => {
  it('project admins manage them; members read them', async () => {
    const tpl = await owner.api.post(`/projects/${key}/templates`, {
      name: 'Bug report', type: 'bug', title: 'Bug: ', description: '## Steps', priority: 'high', checklist: ['Reproduce', 'Fix', 'Verify'],
    });
    expect(tpl.status).toBe(201);
    expect(tpl.body.data).toMatchObject({ name: 'Bug report', repeat: 'never', nextRunOn: null, checklist: ['Reproduce', 'Fix', 'Verify'] });
    expect((await dev.api.post(`/projects/${key}/templates`, { name: 'x', type: 'task', title: 'x' })).status).toBe(403);
    expect((await dev.api.get(`/projects/${key}/templates`)).body.data).toHaveLength(1);
    expect((await owner.api.post(`/projects/${key}/templates`, { name: 'bug REPORT', type: 'task', title: 'x' })).status).toBe(409);
    expect((await owner.api.post(`/projects/${key}/templates`, { name: 'Weekly', type: 'task', title: 'x', repeat: 'weekly' })).status).toBe(400);
  });

  it('a repeating template creates its item once per day, for its author, and moves to the next date', async () => {
    const tpl = (await owner.api.post(`/projects/${key}/templates`, {
      name: 'Deploy check', type: 'task', title: 'Deploy check — {date}', checklist: ['Logs', 'Errors'],
      repeat: 'weekdays', assigneeId: dev.id, dueInDays: 1,
    })).body.data;
    expect(tpl.nextRunOn).not.toBeNull();

    const monday = '2030-01-07'; // a Monday
    await db.query('UPDATE work_item_templates SET next_run_on = $2 WHERE id = $1', [tpl.id, monday]);
    expect(await runRecurringTemplates(monday)).toBe(1);
    expect(await runRecurringTemplates(monday)).toBe(0); // claimed: never twice

    const created = (await owner.api.get(`/projects/${key}/items?search=Deploy check`)).body.data.items;
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ title: 'Deploy check — 2030-01-07', dueDate: '2030-01-08', assignee: { id: dev.id }, checklist: { done: 0, total: 2 } });
    const after = (await owner.api.get(`/projects/${key}/templates`)).body.data.find((t: { id: number }) => t.id === tpl.id);
    expect(after.nextRunOn).toBe('2030-01-08');
  });

  it('pauses when its author can no longer edit the project — saving restarts it', async () => {
    const admin = await addMember(owner, 'admin', 'Template Admin');
    await owner.api.post(`/projects/${key}/members`, { userId: admin.id, role: 'admin' });
    const tpl = (await admin.api.post(`/projects/${key}/templates`, { name: 'Monthly report', type: 'task', title: 'Report', repeat: 'monthly', repeatMonthDay: 1 })).body.data;
    await owner.api.delete(`/members/${admin.id}`); // the author leaves the organization

    // only this template is due (the "Deploy check" one is moved out of the way)
    await db.query('UPDATE work_item_templates SET next_run_on = NULL WHERE project_id = (SELECT project_id FROM work_item_templates WHERE id = $1)', [tpl.id]);
    await db.query('UPDATE work_item_templates SET next_run_on = $2 WHERE id = $1', [tpl.id, '2030-02-01']);
    expect(await runRecurringTemplates('2030-02-01')).toBe(0);
    let t = (await owner.api.get(`/projects/${key}/templates`)).body.data.find((x: { id: number }) => x.id === tpl.id);
    expect(t.nextRunOn).toBeNull();

    t = (await owner.api.patch(`/projects/${key}/templates/${tpl.id}`, { name: 'Monthly report' })).body.data;
    expect(t).toMatchObject({ createdBy: { id: owner.id } });
    expect(t.nextRunOn).not.toBeNull();
  });
});
