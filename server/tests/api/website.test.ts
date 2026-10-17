// Phase 4a: public website — pages made of sections, draft → publish, header & footer, images, pricing from plans.
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../src/database/db.js';
import { publicApi, registerOwner, type TestUser } from '../helpers.js';

let platform: TestUser;
let owner: TestUser;

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const visit = (slug: string) => publicApi().get(`/api/website/pages/${slug}`);

beforeAll(async () => {
  platform = await registerOwner('Website Owner Co');
  await db.query('UPDATE users SET is_platform_admin = TRUE WHERE id = $1', [platform.id]);
  owner = await registerOwner('Just A Customer');
});

describe('visitors', () => {
  it('see the published pages, header, footer and navigation without logging in', async () => {
    const home = await visit('home');
    expect(home.status).toBe(200);
    expect(home.body.data.sections[0]).toMatchObject({ type: 'hero' });
    expect(home.body.data.sections.every((s: { isVisible: boolean }) => s.isVisible)).toBe(true); // hidden placeholders are not sent
    expect(home.body.data.seoTitle).toContain('Team-Flex');

    const site = (await publicApi().get('/api/website/site')).body.data;
    expect(site.settings.brandName).toBe('Team-Flex');
    expect(site.nav.map((n: { path: string }) => n.path)).toEqual(expect.arrayContaining(['/features', '/pricing']));
    expect(site.nav.map((n: { path: string }) => n.path)).not.toContain('/'); // home is not in the menu
    expect((await visit('nope')).status).toBe(404);
  });

  it('pricing shows the live limits of each plan from Platform → Plans', async () => {
    const card = (await visit('pricing')).body.data.sections[0].content.plans.find((p: { planKey: string }) => p.planKey === 'free');
    const { rows } = await db.query('SELECT max_members FROM plans WHERE key = $1', ['free']);
    expect(card.plan).toMatchObject({ key: 'free', name: 'Free', limits: { members: rows[0].max_members } });
  });
});

describe('editing (platform owner only)', () => {
  it('is for platform admins only', async () => {
    expect((await owner.api.get('/platform/website/pages')).status).toBe(403);
    const pages = (await platform.api.get('/platform/website/pages')).body.data;
    expect(pages.map((p: { slug: string }) => p.slug)).toEqual(expect.arrayContaining(['home', 'features', 'pricing', 'contact', 'faq', 'privacy', 'terms']));
  });

  it('changes are a draft until published; discard goes back', async () => {
    const draft = (await platform.api.get('/platform/website/pages/features')).body.data;
    const hero = draft.sections.find((s: { type: string }) => s.type === 'hero');
    const content = structuredClone(hero.content);
    content.slides[0].title = 'Brand new headline';
    const saved = (await platform.api.patch(`/platform/website/sections/${hero.id}`, { content })).body.data;
    expect(saved.hasChanges).toBe(true);
    expect(saved.previewSections[0].content.slides[0].title).toBe('Brand new headline');
    expect((await visit('features')).body.data.sections[0].content.slides[0].title).not.toBe('Brand new headline'); // not live yet

    const discarded = (await platform.api.post('/platform/website/pages/features/discard')).body.data;
    expect(discarded.hasChanges).toBe(false);
    expect(discarded.sections[0].content.slides[0].title).not.toBe('Brand new headline');

    const again = discarded.sections[0];
    const c2 = structuredClone(again.content);
    c2.slides[0].title = 'Published headline';
    await platform.api.patch(`/platform/website/sections/${again.id}`, { content: c2 });
    const pub = (await platform.api.post('/platform/website/pages/features/publish')).body.data;
    expect(pub.hasChanges).toBe(false);
    expect((await visit('features')).body.data.sections[0].content.slides[0].title).toBe('Published headline');
  });

  it('add, duplicate, hide, reorder and delete sections', async () => {
    let page = (await platform.api.post('/platform/website/pages/pricing/sections', { type: 'rich_text' })).body.data;
    const added = page.sections[page.sections.length - 1];
    expect(added).toMatchObject({ type: 'rich_text', isVisible: true });

    page = (await platform.api.post(`/platform/website/sections/${added.id}/duplicate`)).body.data;
    expect(page.sections.filter((s: { type: string }) => s.type === 'rich_text')).toHaveLength(2);
    const ids = page.sections.map((s: { id: number }) => s.id);

    page = (await platform.api.put('/platform/website/pages/pricing/sections/order', { ids: [...ids].reverse() })).body.data;
    expect(page.sections.map((s: { id: number }) => s.id)).toEqual([...ids].reverse());
    expect((await platform.api.put('/platform/website/pages/pricing/sections/order', { ids: ids.slice(1) })).status).toBe(400);

    page = (await platform.api.patch(`/platform/website/sections/${added.id}`, { isVisible: false })).body.data;
    expect(page.previewSections.map((s: { id: number }) => s.id)).not.toContain(added.id);

    for (const s of page.sections.filter((x: { type: string }) => x.type === 'rich_text')) await platform.api.delete(`/platform/website/sections/${s.id}`);
    await platform.api.put('/platform/website/pages/pricing/sections/order', { ids: page.sections.filter((x: { type: string }) => x.type !== 'rich_text').map((s: { id: number }) => s.id).reverse() });
    await platform.api.post('/platform/website/pages/pricing/discard');
  });

  it('validates content: unsafe links, missing slides, unknown images', async () => {
    const hero = (await platform.api.get('/platform/website/pages/home')).body.data.sections[0];
    const bad = structuredClone(hero.content);
    bad.slides[0].primaryCta = { label: 'Click', href: 'javascript:alert(1)' };
    expect((await platform.api.patch(`/platform/website/sections/${hero.id}`, { content: bad })).status).toBe(400);
    expect((await platform.api.patch(`/platform/website/sections/${hero.id}`, { content: { slides: [] } })).status).toBe(400);
    const noImage = structuredClone(hero.content);
    noImage.slides[0].mediaId = 999999;
    expect((await platform.api.patch(`/platform/website/sections/${hero.id}`, { content: noImage })).status).toBe(400);
    expect((await platform.api.post('/platform/website/pages/home/sections', { type: 'video' })).status).toBe(400);
  });

  it('SEO title and navigation are part of the page (published with it)', async () => {
    await platform.api.patch('/platform/website/pages/pricing', { navLabel: 'Plans & prices', seoTitle: 'Pricing for every team' });
    expect((await visit('pricing')).body.data.seoTitle).not.toBe('Pricing for every team');
    await platform.api.post('/platform/website/pages/pricing/publish');
    expect((await visit('pricing')).body.data.seoTitle).toBe('Pricing for every team');
    expect((await publicApi().get('/api/website/site')).body.data.nav.find((n: { path: string }) => n.path === '/pricing').label).toBe('Plans & prices');
    await platform.api.patch('/platform/website/pages/pricing', { navLabel: 'Pricing', seoTitle: 'Pricing — Team-Flex' });
    await platform.api.post('/platform/website/pages/pricing/publish');
  });
});

describe('images and header & footer', () => {
  it('upload (images only), use, serve publicly, refuse to delete while used', async () => {
    expect((await platform.api.upload('/platform/website/media', 'x.png', Buffer.from('<html>not an image</html>'))).status).toBe(400);
    const up = await platform.api.upload('/platform/website/media', 'logo.png', PNG);
    expect(up.status).toBe(201);
    const id = up.body.data.id;

    const file = await publicApi().get(`/api/website/media/${id}`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');

    const settings = (await platform.api.get('/platform/website/settings')).body.data;
    const draft = { ...settings.draft, logoMediaId: id, brandName: 'Team-Flex' };
    expect((await platform.api.put('/platform/website/settings', draft)).body.data.hasChanges).toBe(true);
    expect((await publicApi().get('/api/website/site')).body.data.settings.logoMediaId ?? null).toBeNull(); // not published yet
    await platform.api.post('/platform/website/settings/publish');
    expect((await publicApi().get('/api/website/site')).body.data.settings.logoMediaId).toBe(id);

    expect((await platform.api.delete(`/platform/website/media/${id}`)).status).toBe(409);
    await platform.api.put('/platform/website/settings', { ...draft, logoMediaId: null });
    await platform.api.post('/platform/website/settings/publish');
    expect((await platform.api.delete(`/platform/website/media/${id}`)).status).toBe(200);
    expect((await publicApi().get(`/api/website/media/${id}`)).status).toBe(404);
  });

  it('header & footer links are validated too', async () => {
    const settings = (await platform.api.get('/platform/website/settings')).body.data;
    const bad = { ...settings.draft, header: { ...settings.draft.header, ctaHref: 'javascript:void(0)' } };
    expect((await platform.api.put('/platform/website/settings', bad)).status).toBe(400);
  });
});
