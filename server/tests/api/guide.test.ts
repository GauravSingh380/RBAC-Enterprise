// Phase 3d: Help Center — reading, audience, visibility per organization, search, permission, checklist, authoring.
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../src/database/db.js';
import { addMember, registerOwner, uniqueKey, type TestUser } from '../helpers.js';

let owner: TestUser;
let member: TestUser;
let other: TestUser; // another organization
let platform: TestUser; // platform admin (owner of their own organization)

const slugs = (sections: { articles: { slug: string }[] }[]) => sections.flatMap((s) => s.articles.map((a) => a.slug));

beforeAll(async () => {
  owner = await registerOwner('Guide Org');
  member = await addMember(owner, 'member', 'Mia Member');
  other = await registerOwner('Other Guide Org');
  platform = await registerOwner('Platform Org');
  await db.query('UPDATE users SET is_platform_admin = TRUE WHERE id = $1', [platform.id]);
});

describe('reading the guide', () => {
  it('everyone sees the seeded guide; "admins" articles only for owners / admins', async () => {
    const forOwner = slugs((await owner.api.get('/guide')).body.data);
    const forMember = slugs((await member.api.get('/guide')).body.data);
    expect(forOwner).toEqual(expect.arrayContaining(['welcome', 'setup-organization', 'roles-and-permissions', 'leave']));
    expect(forMember).toContain('welcome');
    expect(forMember).not.toContain('setup-organization');
    expect((await member.api.get('/guide/articles/setup-organization')).status).toBe(404);
  });

  it('an article has its markdown, its app page and previous / next', async () => {
    const a = (await member.api.get('/guide/articles/first-project')).body.data;
    expect(a).toMatchObject({ title: 'Your first project in 5 minutes', appPath: '/projects', section: { slug: 'getting-started' } });
    expect(a.body).toContain('## 1. Create the project');
    expect(a.previous).toEqual({ slug: 'welcome', title: 'Welcome to Team-Flex' }); // setup-organization is skipped for members
    expect(a.next.slug).toBe('working-as-a-guest');
    expect((await member.api.get('/guide/articles/welcome')).body.data.previous).toBeNull();
  });

  it('searches titles, summaries and bodies, with a highlighted snippet', async () => {
    const hits = (await member.api.get('/guide/search?q=holidays')).body.data;
    expect(hits.map((h: { slug: string }) => h.slug)).toContain('leave');
    expect(hits.find((h: { slug: string }) => h.slug === 'leave').snippet).toMatch(/\[\[holiday/i);
    expect(hits.map((h: { slug: string }) => h.slug)).not.toContain('leave-and-holiday-setup'); // admins only
    expect((await member.api.get('/guide/search?q=burnd')).body.data[0]?.slug).toBeUndefined(); // partial word in body only: no title match
    expect((await member.api.get('/guide/search?q=Capac')).body.data[0].slug).toBe('capacity-planning'); // partial title
    expect((await member.api.get('/guide/search?q=a')).status).toBe(400);
  });

  it('needs guide.view — the owner can take it away from a role', async () => {
    const roleId = (await owner.api.get('/roles')).body.data.find((r: { name: string }) => r.name === 'member').id;
    await db.query(
      `DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = (SELECT id FROM permissions WHERE name = 'guide.view')`,
      [roleId],
    );
    expect((await member.api.get('/guide')).status).toBe(403);
    await db.query(`INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions WHERE name = 'guide.view'`, [roleId]);
    expect((await member.api.get('/guide')).status).toBe(200);
  });
});

describe('getting started checklist', () => {
  it('only for owners / admins, ticked from real data', async () => {
    expect((await member.api.get('/guide/getting-started')).body.data).toEqual({ visible: false });
    const fresh = (await other.api.get('/guide/getting-started')).body.data;
    expect(fresh).toMatchObject({ visible: true, dismissed: false, completed: 0, total: 6 });

    const c = (await owner.api.get('/guide/getting-started')).body.data; // owner invited Mia
    expect(c.steps.find((s: { key: string }) => s.key === 'invite').done).toBe(true);
    expect(c.steps.find((s: { key: string }) => s.key === 'project').done).toBe(false);

    const key = uniqueKey();
    await owner.api.post('/projects', { name: 'First', key, template: 'kanban' });
    await owner.api.post(`/projects/${key}/items`, { type: 'task', title: 'Hello' });
    const after = (await owner.api.get('/guide/getting-started')).body.data;
    expect(after.steps.filter((s: { done: boolean }) => s.done).map((s: { key: string }) => s.key)).toEqual(['invite', 'project', 'workItem']);
    expect(after.completed).toBe(3);
  });

  it('can be dismissed and restored (owners / admins only)', async () => {
    expect((await member.api.post('/guide/getting-started/dismiss')).status).toBe(403);
    expect((await owner.api.post('/guide/getting-started/dismiss')).body.data.dismissed).toBe(true);
    expect((await owner.api.get('/guide/getting-started')).body.data.dismissed).toBe(true);
    expect((await owner.api.post('/guide/getting-started/restore')).body.data.dismissed).toBe(false);
  });
});

describe('writing the guide (platform owner)', () => {
  let sectionId: number;
  let articleId: number;

  it('is for platform admins only', async () => {
    expect((await member.api.get('/platform/guide')).status).toBe(403); // (not owner: the first user of a fresh test DB is a platform admin)
    expect((await platform.api.get('/platform/guide')).body.data.length).toBeGreaterThanOrEqual(7);
  });

  it('a draft is invisible; publishing makes it visible everywhere', async () => {
    const section = await platform.api.post('/platform/guide/sections', { slug: `test-${uniqueKey().toLowerCase()}`, title: 'Release notes' });
    expect(section.status).toBe(201);
    sectionId = section.body.data.id;

    const slug = `whats-new-${uniqueKey().toLowerCase()}`;
    const created = await platform.api.post('/platform/guide/articles', { sectionId, slug, title: "What's new", body: '## New\n\nThe **Help Center**.' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ status: 'draft', visibility: 'all', audience: 'everyone', organizationIds: [] });
    articleId = created.body.data.id;
    expect(slugs((await member.api.get('/guide')).body.data)).not.toContain(slug);

    await platform.api.patch(`/platform/guide/articles/${articleId}`, { status: 'published' });
    expect(slugs((await member.api.get('/guide')).body.data)).toContain(slug);
    expect(slugs((await other.api.get('/guide')).body.data)).toContain(slug);

    // a partial update changes only what it sends (no defaults sneak in)
    const renamed = (await platform.api.patch(`/platform/guide/articles/${articleId}`, { title: "What's new in 3d" })).body.data;
    expect(renamed).toMatchObject({ status: 'published', title: "What's new in 3d", body: '## New\n\nThe **Help Center**.' });
  });

  it('"selected" visibility shows the article to the chosen organizations only', async () => {
    const a = (await platform.api.patch(`/platform/guide/articles/${articleId}`, { visibility: 'selected', organizationIds: [owner.orgId, 999999] })).body.data;
    expect(a.organizationIds).toEqual([owner.orgId]); // unknown ids are ignored
    expect((await member.api.get(`/guide/articles/${a.slug}`)).status).toBe(200);
    expect((await other.api.get(`/guide/articles/${a.slug}`)).status).toBe(404);
  });

  it('validates slugs and protects sections that still have articles', async () => {
    expect((await platform.api.post('/platform/guide/articles', { sectionId, slug: 'Bad Slug!', title: 'x', body: 'x' })).status).toBe(400);
    expect((await platform.api.post('/platform/guide/articles', { sectionId, slug: 'welcome', title: 'x', body: 'x' })).status).toBe(409);
    expect((await platform.api.post('/platform/guide/articles', { sectionId: 999999, slug: 'orphan-x', title: 'x', body: 'x' })).status).toBe(404);
    expect((await platform.api.delete(`/platform/guide/sections/${sectionId}`)).status).toBe(409);
    expect((await platform.api.delete(`/platform/guide/articles/${articleId}`)).status).toBe(200);
    expect((await platform.api.delete(`/platform/guide/sections/${sectionId}`)).status).toBe(200);
    const { rows } = await db.query(`SELECT action FROM audit_logs WHERE user_id = $1 AND action LIKE 'guide.%' ORDER BY id`, [platform.id]);
    expect(rows.map((r) => r.action)).toEqual([
      'guide.section.create', 'guide.article.create', 'guide.article.update', 'guide.article.update', 'guide.article.update',
      'guide.article.delete', 'guide.section.delete',
    ]);
  });
});
