// Demo organization "Nimbus Labs" — every feature filled with realistic data, for presenting Team-Flex.
//
//   npx tsx scripts/seed-demo.ts            create it (refuses if it already exists)
//   npx tsx scripts/seed-demo.ts --reset    delete the demo organization + its demo accounts, then create it again
//
// Everything goes through the real API (in-process, like the tests), so business rules, history, notifications
// and audit logs are exactly what real use produces. At the end, dates are spread over the last weeks so charts,
// burndown and velocity look like a team that has been working for a while.
// Demo accounts use the reserved ".test" domain — no real mailbox can ever receive anything.
import request from 'supertest';
import app from '../src/app.js';
import { db } from '../src/database/db.js';

const PASSWORD = 'Demo@2026!';
const DOMAIN = 'nimbuslabs.test';
const ORG_NAME = 'Nimbus Labs';
const today = new Date().toISOString().slice(0, 10);
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

// ---------------------------------------------------------------- tiny API client
type Json = Record<string, unknown>;
interface Api {
  get: (url: string) => Promise<any>;
  post: (url: string, body?: Json) => Promise<any>;
  patch: (url: string, body: Json) => Promise<any>;
  put: (url: string, body: Json) => Promise<any>;
  del: (url: string) => Promise<any>;
}
function apiFor(token: string, orgId: number): Api {
  const send = async (method: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, body?: Json) => {
    let r = request(app)[method](`/api${url}`).set('Authorization', `Bearer ${token}`).set('X-Organization-Id', String(orgId));
    if (body) r = r.send(body);
    const res = await r;
    if (res.status >= 400) throw new Error(`${method.toUpperCase()} ${url} → ${res.status}: ${res.body?.message ?? res.text}`);
    return res.body?.data;
  };
  return { get: (u) => send('get', u), post: (u, b) => send('post', u, b ?? {}), patch: (u, b) => send('patch', u, b), put: (u, b) => send('put', u, b), del: (u) => send('delete', u) };
}
/** steps that are nice to have: report and continue */
async function soft<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`  ⚠ ${label}: ${(err as Error).message}`);
    return undefined;
  }
}
const log = (s: string) => console.log(`• ${s}`);

interface User {
  id: number;
  name: string;
  email: string;
  api: Api;
  token: string;
}
const mention = (u: User) => `@[${u.name}](user:${u.id})`;

// ---------------------------------------------------------------- reset
async function reset() {
  const { rows } = await db.query<{ id: number }>(
    `SELECT DISTINCT o.id FROM organizations o JOIN users u ON u.id = o.created_by WHERE u.email LIKE $1`,
    [`%@${DOMAIN}`],
  );
  for (const o of rows) await db.query('DELETE FROM organizations WHERE id = $1', [o.id]);
  const users = await db.query(`DELETE FROM users WHERE email LIKE $1 OR email LIKE '%@globex.test'`, [`%@${DOMAIN}`]);
  console.log(`Reset: removed ${rows.length} demo organization(s) and ${users.rowCount} demo account(s).`);
}

async function main() {
  if (process.argv.includes('--reset')) await reset();
  const exists = await db.query('SELECT 1 FROM users WHERE email = $1', [`aarav@${DOMAIN}`]);
  if (exists.rowCount) {
    console.log('The demo organization already exists. Run with --reset to recreate it.');
    return;
  }

  // ============================================================== 1. organization, people, roles
  log('Organization and owner');
  const reg = await request(app).post('/api/auth/register').send({ name: 'Aarav Mehta', email: `aarav@${DOMAIN}`, password: PASSWORD, organizationName: ORG_NAME });
  if (reg.status !== 201) throw new Error(`register: ${JSON.stringify(reg.body)}`);
  const orgId: number = reg.body.data.user.organization.id;
  const owner: User = { id: reg.body.data.user.id, name: 'Aarav Mehta', email: `aarav@${DOMAIN}`, token: reg.body.data.accessToken, api: apiFor(reg.body.data.accessToken, orgId) };
  // enterprise = no plan limits for the demo (the platform owner would do this in Platform → Organizations)
  await db.query(`UPDATE organizations SET plan = 'enterprise' WHERE id = $1`, [orgId]);

  log('Custom role "Project Manager"');
  const permissions: { id: number; name: string }[] = await owner.api.get('/permissions');
  const perm = (names: string[]) => permissions.filter((p) => names.includes(p.name)).map((p) => p.id);
  await owner.api.post('/roles', {
    name: 'project_manager',
    displayName: 'Project Manager',
    description: 'Runs projects and reads organization insights; cannot manage members.',
    permissionIds: perm(['dashboard.view', 'projects.create', 'leave.request', 'guide.view', 'people.view', 'insights.view', 'users.read']),
  });
  const roles: { id: number; name: string }[] = await owner.api.get('/roles');
  const roleId = (name: string) => roles.find((r) => r.name === name)!.id;

  log('Invite the team (they accept and create their accounts)');
  const join = async (name: string, local: string, role: string): Promise<User> => {
    const email = `${local}@${DOMAIN}`;
    const inv = await owner.api.post('/invitations', { email, roleId: roleId(role) });
    const token = inv.inviteUrl.split('/invite/')[1];
    const res = await request(app).post('/api/auth/register').send({ name, email, password: PASSWORD, invitationToken: token });
    if (res.status !== 201) throw new Error(`join ${email}: ${JSON.stringify(res.body)}`);
    return { id: res.body.data.user.id, name, email, token: res.body.data.accessToken, api: apiFor(res.body.data.accessToken, orgId) };
  };
  const sara = await join('Sara Khan', 'sara', 'admin');
  const rohan = await join('Rohan Verma', 'rohan', 'developer');
  const neha = await join('Neha Gupta', 'neha', 'developer');
  const vikram = await join('Vikram Rao', 'vikram', 'developer');
  const ananya = await join('Ananya Iyer', 'ananya', 'qa');
  const kabir = await join('Kabir Singh', 'kabir', 'qa');
  const meera = await join('Meera Nair', 'meera', 'member');
  const arjun = await join('Arjun Das', 'arjun', 'project_manager');
  const zoya = await join('Zoya Ali', 'zoya', 'member');
  // still pending (Members → Pending invitations)
  await owner.api.post('/invitations', { email: `new.hire@${DOMAIN}`, roleId: roleId('developer') });

  log('Job titles, managers, teams');
  const people: [User, string, User | null][] = [
    [owner, 'CEO & Founder', null],
    [sara, 'HR & Operations Manager', owner],
    [rohan, 'Engineering Lead', owner],
    [neha, 'Frontend Developer', rohan],
    [vikram, 'Backend Developer', rohan],
    [ananya, 'QA Lead', owner],
    [kabir, 'QA Engineer', ananya],
    [meera, 'Product Designer', arjun],
    [arjun, 'Project Manager', owner],
    [zoya, 'Marketing Specialist', sara],
  ];
  for (const [u, title, manager] of people) await owner.api.patch(`/people/${u.id}`, { jobTitle: title, managerId: manager?.id ?? null });
  const team = (name: string, description: string, color: string, lead: User, members: User[]) =>
    owner.api.post('/teams', { name, description, color, leadId: lead.id, memberIds: members.map((m) => m.id) });
  await team('Engineering', 'Builds the web and mobile products.', '#1677ff', rohan, [rohan, neha, vikram]);
  await team('Quality', 'Testing, QA verification and release sign-off.', '#13c2c2', ananya, [ananya, kabir]);
  await team('Design', 'Product and visual design.', '#eb2f96', meera, [meera]);
  await team('Marketing', 'Launches, content and campaigns.', '#fa8c16', zoya, [zoya, sara]);
  await team('Delivery', 'Runs client projects end to end.', '#722ed1', arjun, [arjun, rohan, ananya]);

  log('Announcement, notification preferences');
  await owner.api.put('/content/dashboard', {
    content: { announcement: 'Welcome to Nimbus Labs! 🚀 Sprint 3 of the Website Redesign is running — demo for Globex on Friday.' },
  });
  await rohan.api.put('/notifications/preferences', {
    preferences: [
      { category: 'watching', inApp: true, email: 'daily' },
      { category: 'mentions', inApp: true, email: 'instant' },
    ],
  });

  // ============================================================== 2. holidays and leave
  log('Holiday calendar and leave requests');
  const calendars: { id: number; name: string; isDefault: boolean }[] = await owner.api.get('/leave/settings/calendars');
  const defaultCal = calendars.find((c) => c.isDefault) ?? calendars[0]!;
  await owner.api.post(`/leave/settings/calendars/${defaultCal.id}/holidays/bulk`, {
    text: [
      '2026-10-02, Gandhi Jayanti',
      '2026-10-20, Dussehra',
      '2026-11-09, Diwali',
      '2026-11-24, Guru Nanak Jayanti',
      '2026-12-25, Christmas',
      '2027-01-01, New Year',
      '2027-01-26, Republic Day',
    ].join('\n'),
  });
  await soft('second calendar', async () => {
    const created = await owner.api.post('/leave/settings/calendars', { name: 'UK office', description: 'For colleagues working from London', weekendDays: [0, 6] });
    // the API answers with all calendars
    const uk = (Array.isArray(created) ? created : [created]).find((c: { name: string }) => c.name === 'UK office');
    await owner.api.post(`/leave/settings/calendars/${uk.id}/holidays/bulk`, { text: '2026-12-25, Christmas Day\n2026-12-28, Boxing Day (substitute)\n2027-01-01, New Year' });
    await owner.api.put(`/leave/settings/members/${zoya.id}/calendar`, { calendarId: uk.id });
  });
  const types: { id: number; name: string }[] = await owner.api.get('/leave/types');
  const lt = (name: string) => types.find((t) => t.name === name)!.id;
  const leave = (u: User, type: string, startDate: string, endDate: string, reason: string, portion = 'full') =>
    soft(`leave ${u.name}`, () => u.api.post('/leave/requests', { leaveTypeId: lt(type), startDate, endDate, reason, portion }));
  const away = await leave(neha, 'Annual leave', day(-1), day(3), 'Family wedding in Jaipur');
  if (away) await soft('approve', () => rohan.api.post(`/leave/requests/${away.id}/approve`, { note: 'Enjoy the wedding!' }));
  const sick = await leave(vikram, 'Sick leave', day(-22), day(-21), 'Fever');
  if (sick) await soft('approve', () => rohan.api.post(`/leave/requests/${sick.id}/approve`, {}));
  await leave(kabir, 'Annual leave', day(20), day(24), 'Trip to Goa'); // pending → Ananya's approvals
  await leave(meera, 'Casual leave', day(6), day(6), 'Doctor appointment', 'pm'); // pending → Arjun
  await leave(zoya, 'Work from home', day(1), day(1), 'Waiting for a delivery'); // no approval needed
  const rejected = await leave(arjun, 'Annual leave', day(41), day(45), 'Holiday');
  if (rejected) await soft('reject', () => owner.api.post(`/leave/requests/${rejected.id}/reject`, { note: 'Globex go-live is that week — can we move it by one week?' }));
  const xmas = await leave(rohan, 'Annual leave', '2026-12-28', '2026-12-31', 'Year-end break');
  if (xmas) await soft('approve', () => owner.api.post(`/leave/requests/${xmas.id}/approve`, {}));
  const cancelled = await leave(sara, 'Casual leave', day(10), day(10), 'Personal errand');
  if (cancelled) await soft('cancel', () => sara.api.post(`/leave/requests/${cancelled.id}/cancel`, {}));

  // ============================================================== 3. projects
  const project = async (data: Json, members: [User, 'admin' | 'member' | 'viewer'][]) => {
    const p = await owner.api.post('/projects', data);
    // the lead is already a project admin
    for (const [u, role] of members.filter(([m]) => m.id !== data.leadId)) await soft(`member ${u.name}`, () => owner.api.post(`/projects/${p.key}/members`, { userId: u.id, role }));
    return p as { id: number; key: string; statuses: { id: number; name: string }[]; labels: { id: number; name: string }[] };
  };
  const statusOf = (p: { statuses: { id: number; name: string }[] }, name: string) => p.statuses.find((s) => s.name === name)!.id;
  const create = (u: User, key: string, data: Json) => u.api.post(`/projects/${key}/items`, data);
  const comment = (u: User, ref: string | number, body: string) => u.api.post(`/work-items/${ref}/comments`, { body });

  // ---------------------------------------------------------------- 3a. Website Redesign (Scrum)
  log('Website Redesign (Scrum): epics, stories, sprints, docs, templates');
  const web = await project(
    { name: 'Website Redesign', key: 'WEB', template: 'scrum', visibility: 'organization', color: '#1677ff', leadId: rohan.id,
      description: 'New marketing site and checkout. Goal: +20% conversion by January.' },
    [[rohan, 'admin'], [arjun, 'admin'], [neha, 'member'], [vikram, 'member'], [meera, 'member'], [ananya, 'member'], [zoya, 'viewer']],
  );
  const W = (n: string) => statusOf(web, n);
  const seo = await owner.api.post(`/projects/WEB/labels`, { name: 'seo', color: 'green' });
  const a11y = await owner.api.post(`/projects/WEB/labels`, { name: 'accessibility', color: 'cyan' });
  const labelsWeb: { id: number; name: string }[] = await owner.api.get('/projects/WEB/labels');
  const L = (name: string) => labelsWeb.find((l) => l.name === name)?.id;
  void seo; void a11y;
  const area = await owner.api.post('/projects/WEB/fields', { name: 'Area', fieldType: 'select', options: ['Homepage', 'Checkout', 'Blog', 'Account'] });
  // the API answers with all fields of the project
  const areaId = (Array.isArray(area) ? area : [area]).find((f: { name: string }) => f.name === 'Area').id as number;
  await owner.api.patch(`/projects/WEB/statuses/${W('In Progress')}`, { wipLimit: 4 });

  const epicHome = await create(owner, 'WEB', { type: 'epic', title: 'New homepage', description: 'Hero, social proof, pricing teaser. Designs in Docs → Design.', priority: 'high' });
  const epicCheckout = await create(owner, 'WEB', { type: 'epic', title: 'Checkout revamp', description: 'One-page checkout with saved cards.', priority: 'urgent' });
  const epicA11y = await create(owner, 'WEB', { type: 'epic', title: 'Accessibility & SEO', description: 'WCAG 2.2 AA and Core Web Vitals in the green.' });

  // sprints: 1 and 2 completed, 3 active, 4 planned
  const s1 = await rohan.api.post('/projects/WEB/sprints', { name: 'Sprint 1 — Foundations', goal: 'Design system and homepage skeleton', startDate: day(-30), endDate: day(-17) });
  const s2 = await rohan.api.post('/projects/WEB/sprints', { name: 'Sprint 2 — Homepage', goal: 'Ship the new homepage behind a flag', startDate: day(-16), endDate: day(-3) });
  const s3 = await rohan.api.post('/projects/WEB/sprints', { name: 'Sprint 3 — Checkout', goal: 'One-page checkout ready for QA', startDate: day(-2), endDate: day(11) });
  const s4 = await rohan.api.post('/projects/WEB/sprints', { name: 'Sprint 4 — Polish', goal: 'Accessibility, SEO, performance', startDate: day(12), endDate: day(25) });

  type Story = { title: string; type?: string; parent?: number; est?: number; who?: User; sprint?: number; labels?: string[]; area?: string; due?: string; checklist?: string[]; desc?: string; priority?: string };
  const story = (s: Story) =>
    create(owner, 'WEB', {
      type: s.type ?? 'story', title: s.title, parentId: s.parent, estimate: s.est, assigneeId: s.who?.id, sprintId: s.sprint,
      labelIds: (s.labels ?? []).map(L).filter(Boolean), customFields: s.area ? { [areaId]: s.area } : undefined, dueDate: s.due,
      checklist: s.checklist, description: s.desc, priority: s.priority ?? 'medium',
    });

  // Sprint 1 (done)
  const s1Items = [
    await story({ title: 'Set up design tokens and typography', parent: epicHome.id, est: 3, who: meera, sprint: s1.id, labels: ['frontend'], area: 'Homepage' }),
    await story({ title: 'Component library: buttons, inputs, cards', parent: epicHome.id, est: 5, who: neha, sprint: s1.id, labels: ['frontend'] }),
    await story({ title: 'Homepage layout skeleton', parent: epicHome.id, est: 3, who: neha, sprint: s1.id, labels: ['frontend'], area: 'Homepage' }),
    await story({ title: 'CMS content model for the homepage', parent: epicHome.id, est: 5, who: vikram, sprint: s1.id, labels: ['backend'] }),
    await story({ title: 'Analytics events plan', type: 'task', est: 2, who: rohan, sprint: s1.id }),
  ];
  await rohan.api.post(`/projects/WEB/sprints/${s1.id}/start`, { startDate: day(-30), endDate: day(-17) });
  for (const i of s1Items.slice(0, 4)) await rohan.api.patch(`/work-items/${i.id}`, { statusId: W('Done') });
  await rohan.api.post(`/projects/WEB/sprints/${s1.id}/complete`, { moveOpenItemsTo: s2.id });

  // Sprint 2 (done, one item carried over to sprint 3)
  const s2Items = [
    await story({ title: 'Hero section with A/B variants', parent: epicHome.id, est: 5, who: neha, sprint: s2.id, labels: ['frontend'], area: 'Homepage' }),
    await story({ title: 'Customer logos and testimonials', parent: epicHome.id, est: 3, who: meera, sprint: s2.id, area: 'Homepage' }),
    await story({ title: 'Pricing teaser block', parent: epicHome.id, est: 3, who: neha, sprint: s2.id, area: 'Homepage' }),
    await story({ title: 'Homepage API: featured content endpoint', parent: epicHome.id, est: 5, who: vikram, sprint: s2.id, labels: ['backend'] }),
    await story({ title: 'Feature flag for the new homepage', type: 'task', est: 2, who: vikram, sprint: s2.id }),
    await story({ title: 'Image optimisation pipeline', est: 8, who: vikram, sprint: s2.id, labels: ['backend', 'tech-debt'] }),
  ];
  await rohan.api.post(`/projects/WEB/sprints/${s2.id}/start`, { startDate: day(-16), endDate: day(-3) });
  for (const i of s2Items.slice(0, 5)) await rohan.api.patch(`/work-items/${i.id}`, { statusId: W('Done') });
  await rohan.api.post(`/projects/WEB/sprints/${s2.id}/complete`, { moveOpenItemsTo: s3.id });

  // Sprint 3 (active)
  const cart = await story({ title: 'One-page checkout form', parent: epicCheckout.id, est: 8, who: neha, sprint: s3.id, labels: ['frontend'], area: 'Checkout', due: day(4), priority: 'high',
    desc: '## Goal\nAll checkout steps on one page.\n\n## Acceptance\n- Address, shipping and payment on one screen\n- Validation inline\n- Works on mobile',
    checklist: ['Address form', 'Shipping options', 'Payment step', 'Order summary', 'Mobile layout'] });
  await create(neha, 'WEB', { type: 'subtask', title: 'Address autocomplete', parentId: cart.id, assigneeId: neha.id, estimate: 2 });
  await create(neha, 'WEB', { type: 'subtask', title: 'Inline validation messages', parentId: cart.id, assigneeId: neha.id, estimate: 1 });
  const cards = await story({ title: 'Saved cards (tokenised)', parent: epicCheckout.id, est: 5, who: vikram, sprint: s3.id, labels: ['backend'], area: 'Checkout', due: day(6), priority: 'urgent' });
  const promo = await story({ title: 'Promo codes in checkout', parent: epicCheckout.id, est: 3, who: vikram, sprint: s3.id, area: 'Checkout', due: day(8) });
  const design = await story({ title: 'Checkout design review', type: 'task', est: 1, who: meera, sprint: s3.id, due: day(1), checklist: ['Desktop', 'Mobile', 'Dark mode'] });
  const qaCheckout = await story({ title: 'Test plan for checkout', type: 'task', est: 2, who: ananya, sprint: s3.id, due: day(9) });
  const bugWeb = await story({ title: 'Hero image flickers on Safari', type: 'bug', est: 1, who: neha, sprint: s3.id, labels: ['frontend'], due: day(-1), priority: 'high' });
  await rohan.api.post(`/projects/WEB/sprints/${s3.id}/start`, { startDate: day(-2), endDate: day(11) });
  await neha.api.patch(`/work-items/${cart.id}`, { statusId: W('In Progress') });
  await vikram.api.patch(`/work-items/${cards.id}`, { statusId: W('In Review') });
  await meera.api.patch(`/work-items/${design.id}`, { statusId: W('Done') });
  await neha.api.patch(`/work-items/${bugWeb.id}`, { statusId: W('In Progress') });
  void promo; void qaCheckout;
  const cartDetail = await owner.api.get(`/work-items/${cart.id}`);
  for (const c of cartDetail.checklistItems.slice(0, 2)) await neha.api.patch(`/work-items/${cart.id}/checklist/${c.id}`, { done: true });
  await soft('capacity', () => rohan.api.put(`/projects/WEB/sprints/${s3.id}/capacity/${meera.id}`, { allocation: 50, note: 'Half time on Mobile App' }));

  // Sprint 4 (planned) + backlog
  await story({ title: 'Keyboard navigation everywhere', parent: epicA11y.id, est: 5, who: neha, sprint: s4.id, labels: ['accessibility'] });
  await story({ title: 'Colour contrast fixes', parent: epicA11y.id, est: 2, who: meera, sprint: s4.id, labels: ['accessibility'] });
  await story({ title: 'Structured data for products', parent: epicA11y.id, est: 3, who: vikram, sprint: s4.id, labels: ['seo'] });
  await story({ title: 'Lazy-load below-the-fold images', parent: epicA11y.id, est: 2, labels: ['frontend'] });
  await story({ title: 'Blog redesign', est: 8, area: 'Blog' });
  await story({ title: 'Account page: order history', est: 5, area: 'Account', priority: 'low' });
  await story({ title: 'Remove old jQuery plugins', type: 'task', est: 3, labels: ['tech-debt'], priority: 'low' });

  // collaboration: comments, mentions, reactions, links, watchers
  const c1 = await comment(rohan, cart.id, `${mention(neha)} can we reuse the address component from the Mobile App? ${mention(meera)} FYI for the layout.`);
  await soft('reaction', () => neha.api.post(`/work-items/${cart.id}/comments/${c1.id}/reactions`, { emoji: '👍' }));
  await soft('reaction', () => meera.api.post(`/work-items/${cart.id}/comments/${c1.id}/reactions`, { emoji: '🚀' }));
  await comment(neha, cart.id, 'Yes — I will extract it into the shared component library this week.');
  await comment(meera, design.id, 'Reviewed with Arjun: approved, two small spacing fixes in the mobile summary.');
  await comment(ananya, cards.id, `${mention(vikram)} please add the test card numbers to the PR description so QA can verify.`);
  await soft('links', async () => {
    await vikram.api.post(`/work-items/${cards.id}/links`, { target: cart.key, linkType: 'blocks' });
    await owner.api.post(`/work-items/${promo.id}/links`, { target: cart.key, linkType: 'relates_to' });
  });
  await arjun.api.post(`/work-items/${cart.id}/watch`);

  // saved views
  await neha.api.post('/projects/WEB/views', { name: 'My open work', viewType: 'list', filters: { assignee: 'me', category: 'todo,in_progress' }, isShared: false });
  await rohan.api.post('/projects/WEB/views', { name: 'Frontend board', viewType: 'board', filters: { label: String(L('frontend')) }, isShared: true });

  // docs
  const overview = await rohan.api.post('/projects/WEB/pages', { title: 'Project overview', body:
    '## Why\nThe current site converts at 1.8%. Competitors are at 2.5%.\n\n## Goals\n- **+20% conversion** by January\n- Lighthouse 90+ on mobile\n- WCAG 2.2 AA\n\n## Team\n- Rohan — lead\n- Neha, Vikram — development\n- Meera — design\n- Ananya — QA\n\n## Links\n- [Board](/projects/WEB) · [Backlog](/projects/WEB/backlog) · [Reports](/projects/WEB/reports)' });
  await rohan.api.patch(`/projects/WEB/pages/${overview.id}`, { body: `${overview.body}\n\n## Timeline\n- Sprint 3: checkout\n- Sprint 4: polish\n- Go-live: early December` });
  const arch = await vikram.api.post('/projects/WEB/pages', { title: 'Architecture', body: '## Stack\n- Next.js frontend, headless CMS\n- Payments through the existing gateway (tokenised cards)\n\n## Decisions\n1. No client-side card storage — tokens only.\n2. Images through the optimisation pipeline (WEB sprint 2).' });
  await vikram.api.post('/projects/WEB/pages', { title: 'API conventions', parentId: arch.id, body: '- JSON, camelCase\n- Errors: `{ success: false, message }`\n- Dates: ISO 8601, UTC' });
  const notes = await arjun.api.post('/projects/WEB/pages', { title: 'Meeting notes', body: 'One sub-page per meeting.' });
  await arjun.api.post('/projects/WEB/pages', { title: 'Sprint 3 planning', parentId: notes.id, body: `**Date:** ${day(-2)}\n\n**Goal:** one-page checkout ready for QA.\n\n**Risks:** saved cards depend on the payment gateway sandbox.\n\n**Decisions:** Meera at 50% this sprint.` });
  await arjun.api.post('/projects/WEB/pages', { title: 'Sprint 2 retrospective', parentId: notes.id, body: '### Went well\n- Homepage shipped behind a flag\n\n### To improve\n- Image pipeline was underestimated (8 points → moved)\n\n### Actions\n- Split stories bigger than 5 points' });
  await meera.api.post('/projects/WEB/pages', { title: 'Design', body: '## Principles\n- Calm, lots of white space\n- One primary action per screen\n\n## Checkout flow\nAddress → Shipping → Payment → Review, all on one page.' });

  // templates (one repeating)
  await rohan.api.post('/projects/WEB/templates', { name: 'Bug report', type: 'bug', title: 'Bug: ', priority: 'high',
    description: '## Steps to reproduce\n1. \n\n## Expected\n\n## Actual\n', checklist: ['Reproduce', 'Fix', 'Add a test', 'Ready for QA'] });
  await rohan.api.post('/projects/WEB/templates', { name: 'Weekly deploy check', type: 'task', title: 'Weekly deploy check — {date}', repeat: 'weekly', repeatWeekday: 1,
    assigneeId: vikram.id, dueInDays: 1, checklist: ['Error inbox is clean', 'Dependencies updated', 'Backups verified', 'Release notes posted'] });
  await rohan.api.post('/projects/WEB/templates', { name: 'Release checklist', type: 'task', title: 'Release ', checklist: ['Freeze', 'Regression run', 'Tag', 'Deploy', 'Announce'] });

  // trash: a deleted item and a deleted page
  const old = await create(owner, 'WEB', { type: 'task', title: 'Old banner experiment (cancelled)' });
  await owner.api.del(`/work-items/${old.id}`);
  const draft = await meera.api.post('/projects/WEB/pages', { title: 'Draft ideas (old)', body: 'Moodboard links…' });
  await meera.api.del(`/projects/WEB/pages/${draft.id}`);

  // ---------------------------------------------------------------- 3b. Mobile App (Kanban)
  log('Mobile App (Kanban)');
  const mob = await project({ name: 'Mobile App', key: 'MOB', template: 'kanban', visibility: 'organization', color: '#52c41a', leadId: neha.id,
    description: 'iOS and Android app (React Native). Continuous flow, weekly releases.' },
    [[neha, 'admin'], [vikram, 'member'], [meera, 'member'], [kabir, 'member']]);
  const M = (n: string) => statusOf(mob, n);
  await owner.api.patch(`/projects/MOB/statuses/${M('In Progress')}`, { wipLimit: 3 });
  const mobItems: [string, string, User | null, string, string | undefined, string][] = [
    ['Push notifications for order updates', 'story', vikram, 'In Progress', day(3), 'high'],
    ['Biometric login', 'story', neha, 'In Progress', day(5), 'medium'],
    ['Offline mode for the catalogue', 'story', neha, 'To Do', day(14), 'medium'],
    ['App store screenshots', 'task', meera, 'To Do', day(2), 'low'],
    ['Crash on Android 11 when rotating', 'bug', neha, 'In Progress', day(-2), 'urgent'],
    ['Dark mode', 'story', meera, 'Done', undefined, 'medium'],
    ['Onboarding carousel', 'story', neha, 'Done', undefined, 'medium'],
    ['Upgrade React Native to 0.76', 'task', vikram, 'Done', undefined, 'high'],
    ['Deep links from emails', 'story', vikram, 'To Do', day(-4), 'medium'],
    ['Accessibility labels on all buttons', 'task', kabir, 'To Do', day(9), 'medium'],
  ];
  for (const [title, type, who, status, due, priority] of mobItems) {
    await create(owner, 'MOB', { type, title, assigneeId: who?.id, statusId: M(status), dueDate: due, priority });
  }

  // ---------------------------------------------------------------- 3c. Bug Tracker (bug flow, QA, tests, errors)
  log('Bug Tracker: bug flow, QA verification, test cases and runs, production errors');
  const bugp = await project({ name: 'Bug Tracker', key: 'BUG', template: 'bug_tracking', visibility: 'organization', color: '#fa541c', leadId: ananya.id,
    description: 'All product bugs. QA verifies every fix: Ready for QA → Verified or Reopened.' },
    [[ananya, 'admin'], [kabir, 'member'], [rohan, 'member'], [neha, 'member'], [vikram, 'member']]);
  const B = (n: string) => statusOf(bugp, n);
  type BugIn = { title: string; sev: string; pri: string; who: User; env?: string; browser?: string; os?: string; steps?: string; exp?: string; act?: string; ver?: string; labels?: string[] };
  const bugLabels: { id: number; name: string }[] = await owner.api.get('/projects/BUG/labels');
  const BL = (n: string) => bugLabels.find((l) => l.name === n)?.id;
  const bug = (reporter: User, b: BugIn) =>
    create(reporter, 'BUG', { type: 'bug', title: b.title, severity: b.sev, priority: b.pri, assigneeId: b.who.id, environment: b.env ?? 'production',
      browser: b.browser, os: b.os, stepsToReproduce: b.steps, expectedResult: b.exp, actualResult: b.act, foundInVersion: b.ver ?? '2.4.0',
      labelIds: (b.labels ?? []).map(BL).filter(Boolean) });
  const b1 = await bug(kabir, { title: 'Payment fails with 3-D Secure cards', sev: 'critical', pri: 'urgent', who: vikram, browser: 'Chrome 129', os: 'Windows 11', labels: ['api'],
    steps: '1. Add any item to the cart\n2. Pay with a 3-D Secure test card\n3. Complete the challenge', exp: 'Order confirmed', act: 'Spinner forever, 500 in the console' });
  const b2 = await bug(kabir, { title: 'Search returns nothing for words with accents (é, ü)', sev: 'major', pri: 'high', who: vikram, labels: ['api'],
    steps: '1. Search for "café"', exp: 'Café products are listed', act: 'No results' });
  const b3 = await bug(ananya, { title: 'Login button misaligned on small screens', sev: 'minor', pri: 'medium', who: neha, browser: 'Safari 17', os: 'iOS 17', labels: ['ui'] });
  const b4 = await bug(ananya, { title: 'Order history loads slowly (8s)', sev: 'major', pri: 'high', who: vikram, labels: ['performance'] });
  const b5 = await bug(kabir, { title: 'Typo on the pricing page', sev: 'trivial', pri: 'low', who: neha, labels: ['ui'] });
  const b6 = await bug(kabir, { title: 'Password reset email arrives twice', sev: 'minor', pri: 'medium', who: vikram, labels: ['api', 'regression'] });
  const b7 = await bug(ananya, { title: 'Cart badge shows wrong count after removing an item', sev: 'major', pri: 'high', who: neha, labels: ['ui'] });
  const b8 = await bug(neha, { title: 'Footer links open in the same tab', sev: 'trivial', pri: 'none', who: neha, labels: ['ui'] });
  const b9 = await bug(kabir, { title: 'Search: no results for "cafe"', sev: 'major', pri: 'high', who: vikram }); // duplicate of b2
  const b10 = await bug(ananya, { title: 'Date picker starts on Sunday in the UK', sev: 'minor', pri: 'low', who: neha, labels: ['ui'] });
  // flows
  await vikram.api.patch(`/work-items/${b1.id}`, { statusId: B('In Progress') });
  await comment(vikram, b1.id, `Root cause: the gateway callback times out. ${mention(ananya)} fix will be on staging this afternoon.`);
  for (const b of [b3, b6, b7]) {
    await (b === b6 ? vikram : neha).api.patch(`/work-items/${b.id}`, { statusId: B('In Progress') });
    await (b === b6 ? vikram : neha).api.patch(`/work-items/${b.id}`, { statusId: B('Ready for QA'), fixedInVersion: '2.4.1' });
  }
  await ananya.api.post(`/work-items/${b3.id}/qa`, { verdict: 'pass', comment: 'Verified on iPhone SE and 13 mini.' });
  await kabir.api.post(`/work-items/${b6.id}/qa`, { verdict: 'fail', comment: 'Still two emails when I click "Send" twice quickly.' });
  await vikram.api.patch(`/work-items/${b6.id}`, { statusId: B('In Progress') });
  await vikram.api.patch(`/work-items/${b6.id}`, { statusId: B('Ready for QA') });
  // b7 waits in Ready for QA (QA queue in My Work)
  await neha.api.patch(`/work-items/${b5.id}`, { statusId: B('In Progress') });
  await neha.api.patch(`/work-items/${b5.id}`, { statusId: B('Ready for QA') });
  await kabir.api.post(`/work-items/${b5.id}/qa`, { verdict: 'pass' });
  await ananya.api.patch(`/work-items/${b8.id}`, { statusId: B("Won't Fix"), resolution: 'by_design' });
  await soft('duplicate', () => kabir.api.post(`/work-items/${b9.id}/close-duplicate`, { duplicateOf: b2.key }));
  void b4; void b10;
  await owner.api.post('/projects/BUG/templates', { name: 'Bug report', type: 'bug', title: 'Bug: ', priority: 'medium',
    description: '## Steps to reproduce\n1. \n\n## Expected\n\n## Actual\n', checklist: ['Reproduced', 'Root cause found', 'Fix + test', 'Ready for QA'] });

  // test cases and runs
  const login = await ananya.api.post('/projects/BUG/test-suites', { name: 'Login & accounts' });
  const checkout = await ananya.api.post('/projects/BUG/test-suites', { name: 'Checkout' });
  const searchS = await ananya.api.post('/projects/BUG/test-suites', { name: 'Search' });
  const tc = (suite: { id: number }, title: string, steps: [string, string][], priority = 'medium', caseType = 'functional', pre?: string) =>
    ananya.api.post('/projects/BUG/test-cases', { title, suiteId: suite.id, preconditions: pre, priority, caseType, steps: steps.map(([action, expected]) => ({ action, expected })) });
  await tc(login, 'Log in with a valid password', [['Open /login', 'The form is shown'], ['Enter email and password, press Log in', 'The dashboard opens']], 'critical', 'smoke', 'A registered user');
  await tc(login, 'Wrong password shows an error', [['Log in with a wrong password', 'An error message, no login']], 'high');
  await tc(login, 'Password reset email', [['Request a reset', 'One email arrives'], ['Open the link and set a password', 'Can log in with it']], 'high', 'regression');
  await tc(checkout, 'Pay with a normal card', [['Add an item, go to checkout', 'Checkout page'], ['Pay with 4242…', 'Order confirmed']], 'critical', 'smoke');
  await tc(checkout, 'Pay with a 3-D Secure card', [['Pay with a 3DS test card', 'Challenge shown'], ['Complete the challenge', 'Order confirmed']], 'critical', 'regression');
  await tc(checkout, 'Apply a promo code', [['Enter SAVE10', '10% discount shown']], 'medium');
  await tc(searchS, 'Search with accents', [['Search for "café"', 'Café products listed']], 'high', 'regression');
  await tc(searchS, 'Empty search shows suggestions', [['Search for nothing', 'Popular searches shown']], 'low', 'usability');
  const run1 = await ananya.api.post('/projects/BUG/test-runs', { name: 'Release 2.4 regression', environment: 'staging', buildVersion: '2.4.0', scope: { all: true } });
  const r1 = await ananya.api.get(`/projects/BUG/test-runs/${run1.id}`);
  const outcome: Record<string, string> = { 'Pay with a 3-D Secure card': 'failed', 'Search with accents': 'failed', 'Empty search shows suggestions': 'blocked' };
  for (const res of r1.results) {
    const status = outcome[res.title] ?? 'passed';
    await (res.title.includes('Pay') ? kabir : ananya).api.patch(`/projects/BUG/test-runs/${run1.id}/results/${res.id}`,
      { status, comment: status === 'failed' ? 'See the filed bug.' : status === 'blocked' ? 'Suggestions service down on staging.' : undefined });
  }
  const failedRes = r1.results.find((x: { title: string }) => x.title === 'Pay with a 3-D Secure card');
  await soft('bug from failed test', () => kabir.api.post(`/projects/BUG/test-runs/${run1.id}/results/${failedRes.id}/bug`, { severity: 'critical' }));
  await soft('complete run', () => ananya.api.post(`/projects/BUG/test-runs/${run1.id}/complete`));
  const run2 = await kabir.api.post('/projects/BUG/test-runs', { name: 'Release 2.5 smoke', environment: 'staging', buildVersion: '2.5.0-rc1', scope: { all: true } });
  const r2 = await kabir.api.get(`/projects/BUG/test-runs/${run2.id}`);
  for (const res of r2.results.slice(0, 3)) await kabir.api.patch(`/projects/BUG/test-runs/${run2.id}/results/${res.id}`, { status: 'passed' });

  // production errors (server 500s + browser crashes), one turned into a bug, one ignored
  await soft('server errors', async () => {
    for (const kind of ['generic', 'type', 'type']) {
      await request(app).post(`/api/errors/simulate/${kind}`).set('Authorization', `Bearer ${vikram.token}`).set('X-Organization-Id', String(orgId));
    }
  });
  for (let i = 0; i < 4; i++) {
    await request(app).post('/api/client-errors').set('Authorization', `Bearer ${neha.token}`).set('X-Organization-Id', String(orgId)).send({
      errorId: crypto.randomUUID(), source: 'boundary', name: 'TypeError', message: "Cannot read properties of undefined (reading 'price')",
      stack: "TypeError: Cannot read properties of undefined (reading 'price')\n    at CartSummary (http://localhost:5173/assets/CartSummary-x1.js:1:420)",
      url: 'http://localhost:5173/projects/WEB', userAgent: 'Mozilla/5.0 (Macintosh) Safari/605.1.15', release: '2.4.0',
    });
  }
  await new Promise((r) => setTimeout(r, 1500)); // error capture runs after the response
  await soft('error → bug', async () => {
    const groups = await vikram.api.get('/errors?status=unresolved');
    const list = (groups.items ?? groups) as { id: number; source: string }[];
    const client = list.find((g) => g.source === 'client');
    const server = list.find((g) => g.source === 'server');
    if (client) await vikram.api.post(`/errors/${client.id}/bug`, { projectRef: 'BUG', priority: 'high', severity: 'major', assigneeId: neha.id });
    if (server) await vikram.api.patch(`/errors/${server.id}`, { status: 'ignored' });
  });

  // ---------------------------------------------------------------- 3d. Customer Support (Kanban, recurring triage)
  log('Customer Support (Kanban, recurring work)');
  const sup = await project({ name: 'Customer Support', key: 'SUP', template: 'kanban', visibility: 'organization', color: '#13c2c2', leadId: sara.id,
    description: 'Customer requests and escalations. Daily triage at 10:00.' },
    [[sara, 'admin'], [zoya, 'member'], [arjun, 'member'], [kabir, 'member']]);
  const S = (n: string) => statusOf(sup, n);
  const supItems: [string, User, string, string | undefined, string][] = [
    ['Globex: invoice shows the wrong VAT number', sara, 'In Progress', day(0), 'urgent'],
    ['Refund request #4821', zoya, 'To Do', day(1), 'high'],
    ['Customer cannot reset password (Hotmail)', kabir, 'In Progress', day(2), 'high'],
    ['Update the FAQ for the new checkout', zoya, 'To Do', day(7), 'medium'],
    ['Escalation: bulk order discount', arjun, 'To Do', day(-1), 'high'],
    ['Export of all orders for Initech', sara, 'Done', undefined, 'medium'],
    ['Welcome email typo', zoya, 'Done', undefined, 'low'],
  ];
  for (const [title, who, status, due, priority] of supItems) await create(sara, 'SUP', { type: 'task', title, assigneeId: who.id, statusId: S(status), dueDate: due, priority });
  await sara.api.post('/projects/SUP/templates', { name: 'Daily triage', type: 'task', title: 'Support triage — {date}', repeat: 'weekdays', assigneeId: zoya.id, dueInDays: 0,
    checklist: ['New tickets labelled', 'Urgent ones assigned', 'Waiting > 2 days chased'] });

  // ---------------------------------------------------------------- 3e. Globex Client Portal (private, guest)
  log('Globex Client Portal (private project with a guest from the client)');
  const cli = await project({ name: 'Globex Client Portal', key: 'GLX', template: 'scrum', visibility: 'private', color: '#722ed1', leadId: arjun.id,
    description: 'Self-service portal for Globex Corp. Their product owner (Lisa) works with us as a guest.' },
    [[arjun, 'admin'], [neha, 'member'], [vikram, 'member'], [ananya, 'member']]);
  const C = (n: string) => statusOf(cli, n);
  const gInv = await arjun.api.post('/invitations', { email: 'lisa@globex.test', projectId: cli.id, projectRole: 'member' }).catch(() => owner.api.post('/invitations', { email: 'lisa@globex.test', projectId: cli.id, projectRole: 'member' }));
  const gReg = await request(app).post('/api/auth/register').send({ name: 'Lisa Brown (Globex)', email: 'lisa@globex.test', password: PASSWORD, invitationToken: gInv.inviteUrl.split('/invite/')[1] });
  const lisa: User = { id: gReg.body.data.user.id, name: 'Lisa Brown (Globex)', email: 'lisa@globex.test', token: gReg.body.data.accessToken, api: apiFor(gReg.body.data.accessToken, orgId) };
  const glxSprint = await arjun.api.post('/projects/GLX/sprints', { name: 'GLX Sprint 1', goal: 'Login + invoices', startDate: day(-5), endDate: day(8) });
  const g1 = await create(arjun, 'GLX', { type: 'story', title: 'Single sign-on with Globex Azure AD', estimate: 8, assigneeId: vikram.id, sprintId: glxSprint.id, dueDate: day(5) });
  const g2 = await create(arjun, 'GLX', { type: 'story', title: 'Invoice list with PDF download', estimate: 5, assigneeId: neha.id, sprintId: glxSprint.id, dueDate: day(7) });
  await create(arjun, 'GLX', { type: 'story', title: 'Usage dashboard', estimate: 8, sprintId: glxSprint.id });
  await create(arjun, 'GLX', { type: 'task', title: 'Kick-off workshop with Globex', assigneeId: arjun.id, statusId: C('Done') });
  await arjun.api.post(`/projects/GLX/sprints/${glxSprint.id}/start`, { startDate: day(-5), endDate: day(8) });
  await vikram.api.patch(`/work-items/${g1.id}`, { statusId: C('In Progress') });
  await lisa.api.post('/projects/GLX/items', { type: 'story', title: 'Export invoices to Excel', description: 'Our finance team needs this monthly.', priority: 'high' });
  await comment(lisa, g2.id, 'Could the PDF include our PO number? Finance asks for it.');
  await comment(arjun, g2.id, `${mention(neha)} let's add the PO number field — Lisa, we'll show it in Friday's demo.`);
  await arjun.api.post('/projects/GLX/pages', { title: 'Statement of work', body: '## Scope\n- SSO\n- Invoices\n- Usage dashboard\n\n## Milestones\n1. Login + invoices — end of GLX Sprint 1\n2. Dashboard — sprint 2\n\n## Contacts\n- Globex: Lisa Brown (product owner)\n- Nimbus: Arjun Das (PM)' });

  // ---------------------------------------------------------------- 3f. Product Launch Q4 (Blank, docs heavy)
  log('Product Launch Q4 (Blank template, docs)');
  await project({ name: 'Product Launch Q4', key: 'LCH', template: 'blank', visibility: 'organization', color: '#fa8c16', leadId: zoya.id,
    description: 'Launch of the new website and app in December.' },
    [[zoya, 'admin'], [sara, 'member'], [meera, 'member'], [arjun, 'member']]);
  const lch: { statuses: { id: number; name: string }[] } = await owner.api.get('/projects/LCH');
  const launch: [string, User, string | undefined, string[] | undefined, boolean][] = [
    ['Launch announcement blog post', zoya, day(15), ['Draft', 'Review by Arjun', 'Publish'], false],
    ['Press kit', meera, day(10), ['Logos', 'Screenshots', 'Founder quote'], false],
    ['Customer email campaign', zoya, day(20), ['Segment list', 'Write copy', 'A/B subject lines', 'Schedule'], false],
    ['Social media calendar', zoya, day(5), undefined, false],
    ['Launch webinar', arjun, day(30), ['Book the platform', 'Invite customers', 'Rehearsal'], false],
    ['Brand guidelines refresh', meera, undefined, undefined, true],
  ];
  for (const [title, who, due, checklist, done] of launch) {
    await create(owner, 'LCH', { type: 'task', title, assigneeId: who.id, dueDate: due, checklist, statusId: done ? statusOf(lch, 'Done') : undefined });
  }
  const plan = await zoya.api.post('/projects/LCH/pages', { title: 'Launch plan', body: '## Dates\n- Soft launch: 1 December\n- Public launch: 8 December\n\n## Channels\n- Blog, email, LinkedIn, webinar\n\n## Owner\nZoya Ali' });
  await zoya.api.post('/projects/LCH/pages', { title: 'Messaging', parentId: plan.id, body: '**One-liner:** Checkout in one page, on any device.\n\n**Proof points:** +20% conversion in beta.' });
  await zoya.api.post('/projects/LCH/pages', { title: 'Press kit checklist', parentId: plan.id, body: '- [x] Logo pack\n- [ ] Screenshots\n- [ ] Founder quote' });
  await zoya.api.post('/projects/LCH/templates', { name: 'Monthly marketing report', type: 'task', title: 'Marketing report — {date}', repeat: 'monthly', repeatMonthDay: 1, assigneeId: zoya.id, dueInDays: 3,
    checklist: ['Traffic', 'Leads', 'Campaign results', 'Next month plan'] });

  // ---------------------------------------------------------------- 3g. archived + deleted projects
  log('Legacy Intranet (archived) and Experiments 2025 (in the trash)');
  await project({ name: 'Legacy Intranet', key: 'OLD', template: 'kanban', visibility: 'organization', description: 'Replaced by the new portal. Read-only archive.' }, []);
  const oldp: { statuses: { id: number; name: string }[] } = await owner.api.get('/projects/OLD');
  for (const t of ['Migrate documents to the new portal', 'Switch off the old server', 'Redirect old URLs']) {
    await create(owner, 'OLD', { type: 'task', title: t, statusId: statusOf(oldp, 'Done') });
  }
  await owner.api.post('/projects/OLD/archive');
  await project({ name: 'Experiments 2025', key: 'EXP', template: 'kanban', visibility: 'private', description: 'Old spikes.' }, []);
  await create(owner, 'EXP', { type: 'task', title: 'Try a chatbot on the homepage' });
  await owner.api.post('/projects/EXP/archive');
  await owner.api.del('/projects/EXP');

  // ============================================================== 4. security rules (after everyone joined)
  log('Security rules: 10+ characters with a symbol');
  await owner.api.patch('/organizations/current/security', { minLength: 10, requireSymbol: true });

  // ============================================================== 5. make history look real (dates spread over the past weeks)
  log('Spreading dates over the last weeks (charts, burndown, velocity, cycle time)');
  await backdate(orgId, [
    { id: s1.id, start: day(-30), end: day(-17) },
    { id: s2.id, start: day(-16), end: day(-3) },
    { id: s3.id, start: day(-2), end: null },
    { id: glxSprint.id, start: day(-5), end: null },
  ]);

  // ============================================================== done
  console.log('\n✅ Demo organization "Nimbus Labs" is ready.\n');
  console.log(`   Log in as the owner:   aarav@${DOMAIN}   /   ${PASSWORD}`);
  console.log(`   Every demo account uses the same password. Others: sara, rohan, neha, vikram, ananya, kabir, meera, arjun, zoya @${DOMAIN}`);
  console.log(`   Guest (client):        lisa@globex.test   /   ${PASSWORD}\n`);
}

/** Moves creation / completion / history dates into the past so reports have a timeline. */
async function backdate(orgId: number, sprints: { id: number; start: string; end: string | null }[]) {
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const at = (date: string, hour: number) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`);
  for (const s of sprints) {
    await db.query(
      `UPDATE sprints SET started_at = $2, completed_at = CASE WHEN status = 'completed' THEN $3::timestamptz ELSE completed_at END, created_at = $2::timestamptz - INTERVAL '3 days' WHERE id = $1`,
      [s.id, at(s.start, 9), s.end ? at(s.end, 17) : null],
    );
  }
  const sprintOf = new Map(sprints.map((s) => [s.id, s]));
  const { rows } = await db.query<{ id: number; sprintId: number | null; done: boolean; projectKey: string }>(
    `SELECT w.id, w.sprint_id AS "sprintId", s.category = 'done' AS done, p.key AS "projectKey"
       FROM work_items w JOIN project_statuses s ON s.id = w.status_id JOIN projects p ON p.id = w.project_id
      WHERE w.organization_id = $1`,
    [orgId],
  );
  // items that were in a completed sprint (sprint events) — use the earliest sprint they were in
  const { rows: history } = await db.query<{ itemId: number; sprintId: number }>(
    `SELECT e.work_item_id AS "itemId", MIN((e.new_value->>'id')::int) AS "sprintId"
       FROM work_item_events e WHERE e.organization_id = $1 AND e.field = 'sprint' AND e.new_value ? 'id' GROUP BY e.work_item_id`,
    [orgId],
  );
  const firstSprint = new Map(history.map((h) => [h.itemId, h.sprintId]));
  const now = Date.now();
  for (const r of rows) {
    const s = sprintOf.get(firstSprint.get(r.id) ?? r.sprintId ?? -1);
    let created: Date;
    let completed: Date | null = null;
    if (s) {
      created = new Date(at(s.start, 9).getTime() - rand(1, 6) * 86_400_000);
      if (r.done) {
        const endMs = s.end ? at(s.end, 17).getTime() : now - 3_600_000;
        completed = new Date(rand(at(s.start, 10).getTime(), endMs));
      }
    } else {
      created = new Date(now - rand(4, 55) * 86_400_000);
      if (r.done) completed = new Date(Math.min(now - 3_600_000, created.getTime() + rand(1, 12) * 86_400_000));
    }
    await db.query('UPDATE work_items SET created_at = $2, completed_at = CASE WHEN completed_at IS NOT NULL THEN $3::timestamptz END, updated_at = GREATEST($2::timestamptz, COALESCE($3::timestamptz, $2::timestamptz)) WHERE id = $1', [r.id, created, completed]);
    // history in the same order: created → (sprint) → status changes → done
    const midway = new Date(created.getTime() + ((completed?.getTime() ?? Math.min(now, created.getTime() + 3 * 86_400_000)) - created.getTime()) / 2);
    await db.query(`UPDATE work_item_events SET created_at = $2 WHERE work_item_id = $1 AND event_type = 'created'`, [r.id, created]);
    await db.query(
      `UPDATE work_item_events SET created_at = $2 WHERE work_item_id = $1 AND field = 'sprint' AND (new_value->>'id')::int = $3`,
      [r.id, s ? at(s.start, 9) : midway, s?.id ?? -1],
    );
    // status changes halfway; the last one (into done) when it was completed
    await db.query(`UPDATE work_item_events SET created_at = $2 WHERE work_item_id = $1 AND (field = 'status' OR event_type LIKE 'qa_%')`, [r.id, midway]);
    if (completed) {
      await db.query(
        `UPDATE work_item_events SET created_at = $2 WHERE id = (SELECT MAX(id) FROM work_item_events WHERE work_item_id = $1 AND field = 'status')`,
        [r.id, completed],
      );
    }
    await db.query(`UPDATE work_item_comments SET created_at = $2 WHERE work_item_id = $1`, [r.id, new Date(Math.min(now - 600_000, midway.getTime() + 3_600_000))]);
  }
  // sprint 1 and 2 "moved out" events happen at their end; keep velocity snapshots as computed by the API
  for (const s of sprints.filter((x) => x.end)) {
    await db.query(
      `UPDATE work_item_events SET created_at = $2 WHERE organization_id = $3 AND field = 'sprint' AND (old_value->>'id')::int = $1`,
      [s.id, at(s.end!, 17), orgId],
    );
  }
}

main()
  .then(async () => {
    await db.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\n❌ Seeding failed:', err.message);
    await db.end();
    process.exit(1);
  });
