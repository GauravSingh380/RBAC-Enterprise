// Phase 4b: Contact (form → Inquiries inbox), FAQ, Privacy / Terms (unpublished templates), footer links.
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../src/database/db.js';
import { publicApi, registerOwner, uniqueEmail, type TestUser } from '../helpers.js';

let platform: TestUser;
let customer: TestUser;

const send = (body: object) => publicApi().post('/api/website/inquiries').send(body);
const valid = (extra: object = {}) => ({
  type: 'demo', name: 'Priya Visitor', email: uniqueEmail('visitor'), company: 'Acme', teamSize: '11-50',
  message: 'We would like to see a demo for our team of 20.', elapsedMs: 9000, website: '', sourcePath: '/contact', ...extra,
});

beforeAll(async () => {
  platform = await registerOwner('Inbox Owner Co');
  await db.query('UPDATE users SET is_platform_admin = TRUE WHERE id = $1', [platform.id]);
  customer = await registerOwner('Not Platform');
});

describe('new pages', () => {
  it('Contact and FAQ are live and in the menu; Privacy and Terms wait for review', async () => {
    expect((await publicApi().get('/api/website/pages/contact')).body.data.sections[0].type).toBe('contact_form');
    expect((await publicApi().get('/api/website/pages/faq')).status).toBe(200);
    expect((await publicApi().get('/api/website/pages/privacy')).status).toBe(404);
    expect((await publicApi().get('/api/website/pages/terms')).status).toBe(404);
    const site = (await publicApi().get('/api/website/site')).body.data;
    expect(site.nav.map((n: { path: string }) => n.path)).toEqual(expect.arrayContaining(['/faq', '/contact']));
    expect(site.footerLinks).toEqual([]);
  });

  it('publishing the legal pages puts them in the footer links', async () => {
    await platform.api.post('/platform/website/pages/privacy/publish');
    await platform.api.post('/platform/website/pages/terms/publish');
    expect((await publicApi().get('/api/website/pages/privacy')).body.data.sections[0].content.title).toBe('Privacy policy');
    const site = (await publicApi().get('/api/website/site')).body.data;
    expect(site.footerLinks).toEqual([{ path: '/privacy', label: 'Privacy' }, { path: '/terms', label: 'Terms' }]);
    // footer flag is a page setting, published with the page
    await platform.api.patch('/platform/website/pages/terms', { showInFooter: false });
    await platform.api.post('/platform/website/pages/terms/publish');
    expect((await publicApi().get('/api/website/site')).body.data.footerLinks.map((l: { path: string }) => l.path)).toEqual(['/privacy']);
  });

  it('the contact form section is validated like the others', async () => {
    const section = (await platform.api.get('/platform/website/pages/contact')).body.data.sections[0];
    expect((await platform.api.patch(`/platform/website/sections/${section.id}`, { content: { ...section.content, topics: [] } })).status).toBe(400);
    expect((await platform.api.patch(`/platform/website/sections/${section.id}`, { content: { ...section.content, topics: ['demo', 'support'] } })).status).toBe(200);
    await platform.api.post('/platform/website/pages/contact/discard');
  });
});

describe('contact form', () => {
  it('stores the message, thanks the sender and tells the platform admins', async () => {
    const body = valid();
    expect((await send(body)).status).toBe(201);
    const { rows } = await db.query(`SELECT id, status, type, team_size FROM website_inquiries WHERE email = $1`, [body.email]);
    expect(rows[0]).toMatchObject({ status: 'new', type: 'demo', team_size: '11-50' });
    const mails = await db.query(`SELECT to_address, template FROM email_messages WHERE template IN ('inquiryReceived', 'inquiryNew') AND created_at > NOW() - INTERVAL '1 minute'`);
    expect(mails.rows).toEqual(expect.arrayContaining([
      { to_address: body.email, template: 'inquiryReceived' },
      { to_address: platform.email, template: 'inquiryNew' },
    ]));
  });

  it('validates the form', async () => {
    expect((await send(valid({ email: 'not-an-email' }))).status).toBe(400);
    expect((await send(valid({ message: 'short' }))).status).toBe(400);
    expect((await send(valid({ type: 'job' }))).status).toBe(400);
  });

  it('bots get a thank-you but land in spam and nobody is e-mailed', async () => {
    const trap = valid({ website: 'http://spam.example' });
    const fast = valid({ elapsedMs: 300 });
    expect((await send(trap)).status).toBe(201);
    expect((await send(fast)).status).toBe(201);
    const { rows } = await db.query(`SELECT status FROM website_inquiries WHERE email = ANY($1::text[])`, [[trap.email, fast.email]]);
    expect(rows.map((r) => r.status)).toEqual(['spam', 'spam']);
    expect((await db.query(`SELECT 1 FROM email_messages WHERE to_address = ANY($1::text[])`, [[trap.email, fast.email]])).rowCount).toBe(0);
  });
});

describe('inquiries inbox (platform owner)', () => {
  let id: number;

  it('is for platform admins only; lists open messages first with counts', async () => {
    expect((await customer.api.get('/platform/website/inquiries')).status).toBe(403);
    const body = valid({ name: 'Inbox Tester', type: 'sales' });
    await send(body);
    const list = (await platform.api.get('/platform/website/inquiries?search=Inbox Tester')).body.data;
    expect(list.items).toHaveLength(1);
    id = list.items[0].id;
    expect(list.counts.new).toBeGreaterThanOrEqual(1);
    expect((await platform.api.get('/platform/website/inquiries?status=spam')).body.data.items.every((i: { status: string }) => i.status === 'spam')).toBe(true);
  });

  it('notes, reply by e-mail (kept with the inquiry), close, delete', async () => {
    let i = (await platform.api.patch(`/platform/website/inquiries/${id}`, { notes: 'Big team — offer Pro' })).body.data;
    expect(i.notes).toBe('Big team — offer Pro');

    i = (await platform.api.post(`/platform/website/inquiries/${id}/reply`, { body: 'Thanks! Pro costs …' })).body.data;
    expect(i).toMatchObject({ status: 'replied', replyCount: 1 });
    expect(i.replies[0]).toMatchObject({ body: 'Thanks! Pro costs …', sentBy: { id: platform.id } });
    const mail = await db.query(`SELECT subject FROM email_messages WHERE to_address = $1 AND template = 'inquiryReply'`, [i.email]);
    expect(mail.rows[0].subject).toBe('Re: your sales / pricing');

    i = (await platform.api.post(`/platform/website/inquiries/${id}/reply`, { body: 'One more thing', close: true })).body.data;
    expect(i).toMatchObject({ status: 'closed', replyCount: 2 });
    expect((await platform.api.patch(`/platform/website/inquiries/${id}`, { status: 'archived' })).status).toBe(400);

    expect((await platform.api.delete(`/platform/website/inquiries/${id}`)).status).toBe(200);
    expect((await platform.api.get(`/platform/website/inquiries/${id}`)).status).toBe(404);
  });
});

describe('product tour, how it works, richer footer (4c)', () => {
  it('home has the new sections; footer has buttons and columns; contact shows next steps', async () => {
    const home = (await publicApi().get('/api/website/pages/home')).body.data.sections.map((s: { type: string }) => s.type);
    expect(home.indexOf('steps')).toBe(home.indexOf('features_grid') + 1);
    expect(home).toContain('showcase');
    const site = (await publicApi().get('/api/website/site')).body.data.settings;
    expect(site.footer.primaryCta).toEqual({ label: 'Start free', href: '/register' });
    expect(site.footer.columns.map((c: { title: string }) => c.title)).toEqual(['Product', 'Company', 'Get started']);
    expect(site.social).toEqual([]);
    const contact = (await publicApi().get('/api/website/pages/contact')).body.data.sections[0].content;
    expect(contact.nextSteps).toHaveLength(3);
  });

  it('validates showcase tabs and social links', async () => {
    const page = (await platform.api.get('/platform/website/pages/home')).body.data;
    const tour = page.sections.find((s: { type: string }) => s.type === 'showcase');
    const bad = structuredClone(tour.content);
    bad.tabs[0].mock = 'spaceship';
    expect((await platform.api.patch(`/platform/website/sections/${tour.id}`, { content: bad })).status).toBe(400);
    expect((await platform.api.patch(`/platform/website/sections/${tour.id}`, { content: { ...tour.content, tabs: [] } })).status).toBe(400);
    const settings = (await platform.api.get('/platform/website/settings')).body.data.draft;
    expect((await platform.api.put('/platform/website/settings', { ...settings, social: [{ network: 'myspace', href: 'https://x.y' }] })).status).toBe(400);
    expect((await platform.api.put('/platform/website/settings', { ...settings, social: [{ network: 'linkedin', href: 'https://www.linkedin.com/company/x' }] })).status).toBe(200);
    await platform.api.put('/platform/website/settings', settings);
  });
});
