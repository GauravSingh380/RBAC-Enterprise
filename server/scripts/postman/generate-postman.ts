// Builds the Postman collection + environment for every API in server/src (run: npm run postman:generate).
//
//   docs/postman/Team-Flex.postman_collection.json         ← import into Postman
//   docs/postman/Team-Flex.local.postman_environment.json  ← import too, then select "Team-Flex · local"
//
// Running the whole collection (Collection Runner, top to bottom) creates a fresh sandbox organization with
// an owner, a member and a guest, then calls every endpoint. Each request saves the ids the next ones need
// (projectKey, itemKey, sprintId …) into collection variables, and checks the expected status code, so the
// negative scenarios (400 / 401 / 403 / 404 / 409) are checked too.
//
// Edit this file, not the JSON: the JSON is generated.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/postman');

type Auth = 'owner' | 'member' | 'guest' | 'platform' | 'none' | 'bad';
interface ReqOpts {
  body?: unknown; // object → raw JSON; a string is sent as written (lets us use unquoted {{numberVars}})
  query?: Record<string, string>;
  auth?: Auth;
  expect?: number | number[];
  save?: Record<string, string>; // variable → JS expression over `json` (the parsed response)
  desc?: string;
  form?: { key: string; src: string }[]; // multipart file upload
  headers?: Record<string, string>;
  pre?: string[]; // extra pre-request lines
  tests?: string[]; // extra test lines
  gate?: 'platform' | 'siteChanges'; // skipped unless that is available / allowed
}
interface Item {
  name: string;
  request?: unknown;
  item?: Item[];
  event?: unknown[];
  description?: string;
}

// ---------------------------------------------------------------- helpers

const SAVE_HELPERS = [
  'let json = {}; try { json = pm.response.json(); } catch (e) {}',
  'const list = (d) => (Array.isArray(d) ? d : (d && (d.items || d.rows || d.data)) || []);',
  '// some create endpoints return the new row, others the refreshed list (or the page with its sections): take the newest',
  'const newest = (a) => a.reduce((x, y) => (y.id > x.id ? y : x));',
  'const created = (d) => (Array.isArray(d) ? newest(d) : d && Array.isArray(d.sections) ? newest(d.sections) : d);',
  'const save = (k, f) => { let v; try { v = f(); } catch (e) {} if (v !== undefined && v !== null) pm.collectionVariables.set(k, typeof v === "object" ? JSON.stringify(v) : String(v)); };',
];

function script(lines: string[], type: 'prerequest' | 'test') {
  return { listen: type, script: { type: 'text/javascript', exec: lines } };
}

function req(name: string, method: string, path: string, o: ReqOpts = {}): Item {
  const expect = o.expect ?? (method === 'POST' ? 201 : method === 'DELETE' ? 204 : 200);
  const codes = Array.isArray(expect) ? expect : [expect];
  const tests = [
    codes.length === 1
      ? `pm.test("Status is ${codes[0]}", () => pm.response.to.have.status(${codes[0]}));`
      : `pm.test("Status is one of ${codes.join(' / ')}", () => pm.expect([${codes.join(', ')}]).to.include(pm.response.code));`,
  ];
  if (o.save || o.tests) tests.push(...SAVE_HELPERS);
  for (const [k, expr] of Object.entries(o.save ?? {})) tests.push(`save("${k}", () => ${expr});`);
  tests.push(...(o.tests ?? []));

  const pre: string[] = [];
  if (o.gate === 'platform')
    pre.push('if (!pm.collectionVariables.get("platformToken")) { console.log("skipped: no platform admin token"); pm.execution.skipRequest(); }');
  if (o.gate === 'siteChanges')
    pre.push(
      'if (!pm.collectionVariables.get("platformToken") || String(pm.environment.get("allowSiteChanges") || pm.collectionVariables.get("allowSiteChanges")) !== "true") { console.log("skipped: set allowSiteChanges=true to change the public website"); pm.execution.skipRequest(); }',
    );
  pre.push(...(o.pre ?? []));

  const [rawPath, inlineQuery] = path.split('?');
  const query = Object.entries(o.query ?? {}).map(([key, value]) => ({ key, value }));
  if (inlineQuery) for (const p of inlineQuery.split('&')) { const [key, value = ''] = p.split('='); query.push({ key: key!, value }); }
  const qs = query.length ? '?' + query.map((q) => `${q.key}=${q.value}`).join('&') : '';

  const header = Object.entries(o.headers ?? {}).map(([key, value]) => ({ key, value }));
  let body: unknown;
  if (o.form) body = { mode: 'formdata', formdata: o.form.map((f) => ({ key: f.key, type: 'file', src: f.src })) };
  else if (o.body !== undefined) {
    header.push({ key: 'Content-Type', value: 'application/json' });
    body = { mode: 'raw', raw: typeof o.body === 'string' ? o.body : JSON.stringify(o.body, null, 2), options: { raw: { language: 'json' } } };
  }

  const auth =
    o.auth === 'none'
      ? { type: 'noauth' }
      : o.auth && o.auth !== 'owner'
        ? { type: 'bearer', bearer: [{ key: 'token', value: o.auth === 'bad' ? '{{invalidToken}}' : `{{${o.auth}Token}}`, type: 'string' }] }
        : undefined;

  return {
    name,
    event: [...(pre.length ? [script(pre, 'prerequest')] : []), script(tests, 'test')],
    request: {
      method,
      header,
      ...(auth ? { auth } : {}),
      ...(body ? { body } : {}),
      url: {
        raw: `{{baseUrl}}${rawPath}${qs}`,
        host: ['{{baseUrl}}'],
        path: rawPath!.split('/').filter(Boolean),
        ...(query.length ? { query } : {}),
      },
      ...(o.desc ? { description: o.desc } : {}),
    },
  };
}
const GET = (n: string, p: string, o?: ReqOpts) => req(n, 'GET', p, o);
const POST = (n: string, p: string, o?: ReqOpts) => req(n, 'POST', p, o);
const PUT = (n: string, p: string, o?: ReqOpts) => req(n, 'PUT', p, o);
const PATCH = (n: string, p: string, o?: ReqOpts) => req(n, 'PATCH', p, o);
const DEL = (n: string, p: string, o?: ReqOpts) => req(n, 'DELETE', p, o);
const folder = (name: string, description: string, item: Item[], event?: unknown[]): Item => ({ name, description, item, ...(event ? { event } : {}) });

const P = '/projects/{{projectKey}}'; // the main (scrum) project
const B = '/projects/{{bugProjectKey}}'; // the bug-tracking project
const W = '/work-items/{{itemKey}}'; // the main story
const range = { from: '{{today}}', to: '{{in30}}' };

// ---------------------------------------------------------------- 00 setup

const setupPre = [
  '// A fresh sandbox per run: new e-mails, dates relative to today.',
  'const tag = String(Date.now()).slice(-9);',
  'const v = (k, x) => pm.collectionVariables.set(k, x);',
  'v("runTag", tag);',
  'v("ownerEmail", `owner.${tag}@sandbox.test`);',
  'v("memberEmail", `member.${tag}@sandbox.test`);',
  'v("guestEmail", `guest.${tag}@client.test`);',
  'v("extraEmail", `extra.${tag}@sandbox.test`);',
  'const d = (n) => { const x = new Date(); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };',
  'v("today", d(0)); v("in7", d(7)); v("in14", d(14)); v("in30", d(30)); v("yesterday", d(-1));',
  'v("year", String(new Date().getUTCFullYear()));',
  '// leave dates: a Monday–Tuesday 3 weeks out, and the Monday after (weekdays, so they count as working days)',
  'const m = new Date(); m.setUTCDate(m.getUTCDate() + 21); while (m.getUTCDay() !== 1) m.setUTCDate(m.getUTCDate() + 1);',
  'const iso = (x) => x.toISOString().slice(0, 10);',
  'const add = (x, n) => { const y = new Date(x); y.setUTCDate(y.getUTCDate() + n); return y; };',
  'v("leaveStart", iso(m)); v("leaveEnd", iso(add(m, 1))); v("leave2Start", iso(add(m, 7))); v("leave3Start", iso(add(m, 14)));',
  'v("holidayDate", iso(add(m, 28)));',
  'v("platformToken", "");',
];

const setup = folder(
  '00 · Setup (run first)',
  'Creates the sandbox organization and its people. Every other folder uses the tokens and ids saved here. Run the whole collection with the Collection Runner, or run this folder first and then any folder by hand.',
  [
    GET('Health check', '/health', { auth: 'none', desc: 'No login. `{ status: "ok", database: "up" }` when the API and PostgreSQL are running.' }),
    POST('Register owner + new organization', '/auth/register', {
      auth: 'none',
      pre: setupPre,
      body: { name: 'Olivia Owner', email: '{{ownerEmail}}', password: '{{password}}', organizationName: 'Sandbox {{runTag}}' },
      save: { accessToken: 'json.data.accessToken', ownerUserId: 'json.data.user.id', orgId: 'json.data.user.organization.id' },
      tests: [
        '// The very first account on an empty database becomes the platform admin, so it can run the Platform folder too.',
        'if (json.data && json.data.user && json.data.user.isPlatformAdmin) pm.collectionVariables.set("platformToken", json.data.accessToken);',
        'pm.test("Owner of the new organization", () => pm.expect(json.data.user.isOwner).to.eql(true));',
        'pm.collectionVariables.set("tokensAt", String(Date.now()));',
      ],
      desc: 'Self-serve signup. `organizationName` creates a new organization that this user owns; the response holds the access token, and the refresh token is set as the httpOnly cookie `tf_refresh` (path /api/auth).',
    }),
    GET('Who am I (profile, roles, permissions, menus)', '/auth/me'),
    GET('List roles (saves role ids)', '/roles', {
      save: {
        memberRoleId: 'list(json.data).find((r) => r.name === "member").id',
        developerRoleId: 'list(json.data).find((r) => r.name === "developer").id',
        qaRoleId: 'list(json.data).find((r) => r.name === "qa").id',
      },
    }),
    POST('Invite a member', '/invitations', {
      body: '{\n  "email": "{{memberEmail}}",\n  "roleId": {{memberRoleId}}\n}',
      save: { inviteToken: 'json.data.inviteUrl.split("/invite/")[1]' },
      desc: 'Member invitation: `{ email, roleId }`. The link is e-mailed and also returned once (`inviteUrl`).',
    }),
    GET('Preview an invitation (public)', '/invitations/token/{{inviteToken}}', { auth: 'none' }),
    POST('Register member with the invitation', '/auth/register', {
      auth: 'none',
      body: { name: 'Max Member', email: '{{memberEmail}}', password: '{{password}}', invitationToken: '{{inviteToken}}' },
      save: { memberToken: 'json.data.accessToken', memberUserId: 'json.data.user.id' },
      desc: 'Signup through an invitation link (`invitationToken` instead of `organizationName`): the account joins that organization with the invited role.',
    }),
    POST('Login as owner', '/auth/login', {
      auth: 'none',
      expect: 200,
      body: { email: '{{ownerEmail}}', password: '{{password}}' },
      save: { accessToken: 'json.data.accessToken' },
      desc: 'Puts the owner\'s refresh cookie back in Postman\'s cookie jar (the member\'s signup replaced it).',
    }),
    POST('Login as platform admin (optional)', '/auth/login', {
      auth: 'none',
      expect: 200,
      pre: ['if (!pm.environment.get("platformEmail")) { console.log("skipped: platformEmail is empty"); pm.execution.skipRequest(); }'],
      body: { email: '{{platformEmail}}', password: '{{platformPassword}}' },
      save: { platformToken: 'json.data.user.isPlatformAdmin ? json.data.accessToken : undefined' },
      tests: ['pm.test("Is a platform admin", () => pm.expect(json.data.user.isPlatformAdmin).to.eql(true));', '// log the owner back in so the refresh cookie is the owner\'s again', 'pm.sendRequest({ url: pm.variables.replaceIn("{{baseUrl}}/auth/login"), method: "POST", header: { "Content-Type": "application/json" }, body: { mode: "raw", raw: JSON.stringify({ email: pm.collectionVariables.get("ownerEmail"), password: pm.environment.get("password") || pm.collectionVariables.get("password") }) } });'],
      desc: 'Only runs when the environment has `platformEmail` / `platformPassword` (the product owner account). On a fresh database the sandbox owner is already the platform admin, so this is not needed.',
    }),
  ],
);

// ---------------------------------------------------------------- 01 auth

const auth = folder('01 · Auth & session', 'Login, registration, tokens, password reset and the negative cases.', [
  POST('Login — wrong password → 401', '/auth/login', { auth: 'none', expect: 401, body: { email: '{{ownerEmail}}', password: 'WrongPass123' } }),
  POST('Login — invalid e-mail → 400', '/auth/login', { auth: 'none', expect: 400, body: { email: 'not-an-email', password: 'x' } }),
  POST('Register — e-mail already used → 409', '/auth/register', { auth: 'none', expect: 409, body: { name: 'Copy Cat', email: '{{ownerEmail}}', password: '{{password}}', organizationName: 'Another org' } }),
  POST('Register — weak password → 400', '/auth/register', { auth: 'none', expect: 400, body: { name: 'Weak Pass', email: 'weak.{{runTag}}@sandbox.test', password: 'short', organizationName: 'Weak org' } }),
  POST('Register — no organization or invitation → 400', '/auth/register', { auth: 'none', expect: 400, body: { name: 'No Org', email: 'noorg.{{runTag}}@sandbox.test', password: '{{password}}' } }),
  GET('Password policy (for the sign-up form)', '/auth/password-policy'),
  GET('Me — no token → 401', '/auth/me', { auth: 'none', expect: 401 }),
  GET('Me — invalid token → 401', '/auth/me', { auth: 'bad', expect: 401 }),
  PATCH('Update my profile', '/auth/me', { body: { name: 'Olivia Owner (Postman)' } }),
  PATCH('Update my profile — name too short → 400', '/auth/me', { expect: 400, body: { name: 'O' } }),
  POST('Refresh the access token (cookie)', '/auth/refresh', {
    auth: 'none',
    expect: 200,
    save: { accessToken: 'json.data.accessToken' },
    desc: 'Uses the httpOnly `tf_refresh` cookie from the last login (Postman keeps it in its cookie jar). Returns a new access token and rotates the refresh token.',
  }),
  POST('Switch organization', '/auth/switch-organization', { expect: 200, body: '{ "organizationId": {{orgId}} }' }),
  POST('Switch organization — not a member → 403', '/auth/switch-organization', { expect: 403, body: { organizationId: 999999 } }),
  POST('Forgot password (known e-mail)', '/auth/forgot-password', { auth: 'none', expect: 200, body: { email: '{{ownerEmail}}' }, desc: 'Same answer whether or not the account exists (no account enumeration). The e-mail lands in Platform → Mailbox.' }),
  POST('Forgot password (unknown e-mail) — same answer', '/auth/forgot-password', { auth: 'none', expect: 200, body: { email: 'nobody.{{runTag}}@sandbox.test' } }),
  GET('Check reset link — unknown token → valid: false', '/auth/reset-password/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', { auth: 'none', tests: ['pm.test("valid is false", () => pm.expect(json.data.valid).to.eql(false));'] }),
  POST('Reset password — invalid token → 400', '/auth/reset-password', { auth: 'none', expect: 400, body: { token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', password: 'NewPass@2026' } }),
  POST('Change password — wrong current password', '/auth/change-password', { expect: 400, body: { currentPassword: 'WrongPass123', newPassword: 'NewPass@2026' } }),
]);

// ---------------------------------------------------------------- 02 organization

const org = folder('02 · Organization & security', 'The active organization (from the X-Organization-Id header), its plan usage and its password / session policy.', [
  GET('Current organization', '/organizations/current'),
  PATCH('Rename organization', '/organizations/current', { body: { name: 'Sandbox {{runTag}} Inc' } }),
  PATCH('Rename — too short → 400', '/organizations/current', { expect: 400, body: { name: 'S' } }),
  PATCH('Rename as member → 403', '/organizations/current', { auth: 'member', expect: 403, body: { name: 'Hijacked' } }),
  GET('Plan usage (members / projects / guests vs limits)', '/organizations/current/usage'),
  GET('Security policy', '/organizations/current/security'),
  PATCH('Update security policy', '/organizations/current/security', {
    body: { minLength: 8, requireSymbol: false, sessionIdleMinutes: 480, sessionMaxHours: 720 },
    desc: 'Stricter password rules make existing users choose a new password at their next login. `sessionIdleMinutes` / `sessionMaxHours`: null = no limit.',
  }),
  PATCH('Update security policy — out of range → 400', '/organizations/current/security', { expect: 400, body: { minLength: 4, requireSymbol: false, sessionIdleMinutes: 5, sessionMaxHours: null } }),
  GET('Security policy as member → 403', '/organizations/current/security', { auth: 'member', expect: 403 }),
  POST('Create a second organization', '/organizations', { body: { name: 'Side Org {{runTag}}' }, save: { org2Id: 'json.data.organizations.find((o) => o.name.startsWith("Side Org")).id' }, desc: 'Returns your profile with the new organization in `organizations`.' }),
  POST('Leave organization — last owner → refused', '/organizations/current/leave', { expect: 400, headers: { 'X-Organization-Id': '{{org2Id}}' }, desc: 'The header picks the organization for this one request.' }),
]);

// ---------------------------------------------------------------- 03 members, invitations, roles

const people = folder('03 · Members, invitations, roles & permissions', 'Who belongs to the organization, what they may do, and the 403 cases.', [
  folder('Permissions & roles', '', [
    GET('All permissions (catalog)', '/permissions', { save: { permissionIdsJson: 'list(json.data).slice(0, 3).map((p) => p.id)' } }),
    GET('List roles', '/roles'),
    GET('Get one role', '/roles/{{memberRoleId}}'),
    POST('Create custom role', '/roles', {
      body: '{\n  "name": "team_lead",\n  "displayName": "Team lead",\n  "description": "Leads a squad",\n  "permissionIds": {{permissionIdsJson}}\n}',
      save: { customRoleId: 'created(json.data).id' },
    }),
    POST('Create role — duplicate name → 409', '/roles', { expect: 409, body: { name: 'team_lead', displayName: 'Team lead again' } }),
    POST('Create role — invalid slug → 400', '/roles', { expect: 400, body: { name: 'Team Lead!', displayName: 'Bad' } }),
    POST('Create role as member → 403', '/roles', { auth: 'member', expect: 403, body: { name: 'sneaky', displayName: 'Sneaky' } }),
    PATCH('Update role', '/roles/{{customRoleId}}', { body: { displayName: 'Squad lead', description: 'Leads a squad of 4–6' } }),
    PUT('Set role permissions', '/roles/{{customRoleId}}/permissions', { body: '{ "permissionIds": {{permissionIdsJson}} }' }),
  ]),
  folder('Members', '', [
    GET('List members', '/members', { query: { page: '1', limit: '20' } }),
    GET('Search members', '/members', { query: { search: 'max' } }),
    GET('Get member', '/members/{{memberUserId}}'),
    PUT('Set member roles', '/members/{{memberUserId}}/roles', { body: '{ "roleIds": [{{memberRoleId}}, {{developerRoleId}}, {{customRoleId}}] }' }),
    PUT('Set member roles — empty → 400', '/members/{{memberUserId}}/roles', { expect: 400, body: { roleIds: [] } }),
    PATCH('Deactivate member', '/members/{{memberUserId}}', { body: { isActive: false } }),
    GET('Deactivated member is blocked → 403', '/projects', { auth: 'member', expect: 403 }),
    PATCH('Reactivate member', '/members/{{memberUserId}}', { body: { isActive: true } }),
    DEL('Remove the owner (yourself) → refused', '/members/{{ownerUserId}}', { expect: 400 }),
    GET('List members as member → 403 (needs users.read)', '/members', { auth: 'member', expect: 403 }),
  ]),
  folder('Invitations', '', [
    POST('Invite another person', '/invitations', { body: '{ "email": "{{extraEmail}}", "roleId": {{qaRoleId}} }', save: { invitationId: 'json.data.invitation.id' } }),
    POST('Invite — no role and no project → 400', '/invitations', { expect: 400, body: { email: 'x.{{runTag}}@sandbox.test' } }),
    POST('Invite — existing member → 409', '/invitations', { expect: 409, body: '{ "email": "{{memberEmail}}", "roleId": {{memberRoleId}} }' }),
    GET('Pending invitations', '/invitations'),
    DEL('Revoke invitation', '/invitations/{{invitationId}}'),
    GET('Preview — unknown token → 404', '/invitations/token/zzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', { auth: 'none', expect: 404 }),
  ]),
]);

// ---------------------------------------------------------------- 04 people & teams

const teams = folder('04 · People & teams', 'Directory (job title, manager) and teams.', [
  GET('People directory', '/people'),
  GET('Person', '/people/{{memberUserId}}'),
  PATCH('Set job title + manager', '/people/{{memberUserId}}', { body: '{ "jobTitle": "Frontend engineer", "managerId": {{ownerUserId}} }' }),
  PATCH('Manager = themselves → 400', '/people/{{memberUserId}}', { expect: 400, body: '{ "managerId": {{memberUserId}} }' }),
  GET('List teams', '/teams'),
  POST('Create team', '/teams', {
    body: '{\n  "name": "Web squad",\n  "description": "Checkout and storefront",\n  "color": "#1677ff",\n  "leadId": {{ownerUserId}},\n  "memberIds": [{{ownerUserId}}, {{memberUserId}}]\n}',
    save: { teamId: 'created(json.data).id' },
  }),
  PATCH('Update team', '/teams/{{teamId}}', { body: { name: 'Web squad (EU)', description: 'Storefront for Europe' } }),
  PUT('Set team members', '/teams/{{teamId}}/members', { body: '{ "userIds": [{{memberUserId}}] }' }),
  POST('Create team as member → 403', '/teams', { auth: 'member', expect: 403, body: { name: 'Shadow team' } }),
]);

// ---------------------------------------------------------------- 05 projects

const projects = folder('05 · Projects & settings', 'Projects (templates: kanban, scrum, bug_tracking, blank), project members, workflow statuses, labels and custom fields.', [
  folder('Projects', '', [
    POST('Create scrum project', '/projects', {
      body: '{\n  "name": "Web Storefront",\n  "key": "WEB",\n  "description": "Customer-facing shop",\n  "template": "scrum",\n  "visibility": "organization",\n  "color": "#1677ff",\n  "leadId": {{ownerUserId}}\n}',
      save: { projectId: 'created(json.data).id', projectKey: 'json.data.key' },
    }),
    POST('Create bug-tracking project', '/projects', { body: { name: 'Bug Tracker', key: 'BUG', template: 'bug_tracking', visibility: 'private' }, save: { bugProjectId: 'created(json.data).id', bugProjectKey: 'json.data.key' } }),
    POST('Create kanban project (deleted later)', '/projects', { body: { name: 'Temporary Board', key: 'TMP', template: 'kanban' }, save: { tmpProjectId: 'created(json.data).id' } }),
    POST('Create — invalid key → 400', '/projects', { expect: 400, body: { name: 'Bad key', key: '1-ABC' } }),
    POST('Create — key already used → 409', '/projects', { expect: 409, body: { name: 'Web again', key: 'WEB' } }),
    POST('Create — unknown template → 400', '/projects', { expect: 400, body: { name: 'Odd', key: 'ODD', template: 'waterfall' } }),
    GET('List active projects', '/projects'),
    GET('List all projects (active + archived)', '/projects', { query: { status: 'all', search: 'web' } }),
    GET('Get project by key', P),
    GET('Get project by id', '/projects/{{projectId}}'),
    GET('Unknown project → 404', '/projects/NOPE', { expect: 404 }),
    PATCH('Update project', P, { body: { description: 'Customer-facing shop (EU + US)', color: '#722ed1' } }),
    POST('Archive project', '/projects/TMP/archive', { expect: 200 }),
    POST('Restore archived project', '/projects/TMP/restore', { expect: 200 }),
  ]),
  folder('Project members', '', [
    GET('Member candidates', `${P}/member-candidates`),
    POST('Add project member', `${P}/members`, { body: '{ "userId": {{memberUserId}}, "role": "member" }' }),
    POST('Add to private BUG project', `${B}/members`, { body: '{ "userId": {{memberUserId}}, "role": "member" }' }),
    PATCH('Change project role', `${P}/members/{{memberUserId}}`, { body: { role: 'admin' } }),
    PATCH('Change project role — invalid → 400', `${P}/members/{{memberUserId}}`, { expect: 400, body: { role: 'superuser' } }),
    GET('Project members', `${P}/members`),
    GET('Assignable users', `${P}/assignable-users`),
  ]),
  folder('Workflow statuses', '', [
    GET('List statuses (saves ids)', `${P}/statuses`, {
      save: {
        todoStatusId: 'list(json.data).find((s) => s.category === "todo").id',
        inProgressStatusId: 'list(json.data).find((s) => s.category === "in_progress").id',
        doneStatusId: 'list(json.data).find((s) => s.category === "done").id',
        statusIdsJson: 'list(json.data).map((s) => s.id).reverse()',
      },
    }),
    POST('Create status', `${P}/statuses`, { body: { name: 'Code review', category: 'in_progress', color: '#fa8c16', restrictedRoles: [], wipLimit: 5 }, save: { newStatusId: 'created(json.data).id' } }),
    POST('Create status — bad category → 400', `${P}/statuses`, { expect: 400, body: { name: 'Odd', category: 'waiting' } }),
    PATCH('Update status', `${P}/statuses/{{newStatusId}}`, { body: { name: 'Peer review', wipLimit: 3 } }),
    DEL('Delete status', `${P}/statuses/{{newStatusId}}`, { expect: 200 }),
    PUT('Reorder statuses', `${P}/statuses/order`, { expect: 200, body: '{ "statusIds": {{statusIdsJson}} }', desc: 'Send every status id of the project once, in the new order.' }),
    PUT('Reorder — missing statuses → 400', `${P}/statuses/order`, { expect: 400, body: '{ "statusIds": [{{todoStatusId}}] }' }),
    GET('BUG project statuses (saves ids)', `${B}/statuses`, { save: { bugTodoStatusId: 'list(json.data).find((s) => s.category === "todo").id', bugQaReadyStatusId: 'list(json.data).find((s) => s.name === "Ready for QA").id' } }),
  ]),
  folder('Labels', '', [
    GET('List labels', `${P}/labels`),
    POST('Create label', `${P}/labels`, { body: { name: 'checkout', color: 'blue' }, save: { labelId: 'created(json.data).id' } }),
    POST('Create label — name already used → 409', `${P}/labels`, { expect: 409, body: { name: 'checkout' } }),
    POST('Create label (deleted next)', `${P}/labels`, { body: { name: 'temporary', color: 'gold' }, save: { tmpLabelId: 'created(json.data).id' } }),
    PATCH('Update label', `${P}/labels/{{labelId}}`, { body: { color: 'geekblue' } }),
    DEL('Delete label', `${P}/labels/{{tmpLabelId}}`, { expect: 204 }),
  ]),
  folder('Custom fields', '', [
    GET('List custom fields', `${P}/fields`),
    POST('Create select field', `${P}/fields`, { body: { name: 'Customer', fieldType: 'select', options: ['Acme', 'Globex', 'Initech'], required: false }, save: { fieldId: 'created(json.data).id' } }),
    POST('Create number field (deleted next)', `${P}/fields`, { body: { name: 'Story points', fieldType: 'number' }, save: { tmpFieldId: 'created(json.data).id' } }),
    POST('Select field without options → 400', `${P}/fields`, { expect: 400, body: { name: 'Empty select', fieldType: 'select', options: [] } }),
    PATCH('Update field', `${P}/fields/{{fieldId}}`, { body: { options: ['Acme', 'Globex', 'Initech', 'Umbrella'] } }),
    DEL('Delete field', `${P}/fields/{{tmpFieldId}}`, { expect: 200 }),
  ]),
]);

// ---------------------------------------------------------------- 06 work items

const items = folder('06 · Work items', 'Epics, stories, tasks, bugs and subtasks, with comments, links, checklists, attachments, QA and duplicates. `itemRef` is the key (WEB-12) or the id.', [
  folder('Create & list', '', [
    POST('Create epic', `${P}/items`, { body: { type: 'epic', title: 'Checkout redesign', description: 'One-page checkout for all markets', priority: 'high' }, save: { epicId: 'created(json.data).id', epicKey: 'json.data.key' } }),
    POST('Create story (every field)', `${P}/items`, {
      body: '{\n  "type": "story",\n  "title": "One-page checkout form",\n  "description": "As a shopper I can pay on one page.\\n\\n**Acceptance**: address, shipping and payment on one screen.",\n  "statusId": {{todoStatusId}},\n  "priority": "high",\n  "assigneeId": {{memberUserId}},\n  "parentId": {{epicId}},\n  "dueDate": "{{in14}}",\n  "estimate": 8,\n  "labelIds": [{{labelId}}],\n  "customFields": { "{{fieldId}}": "Acme" },\n  "checklist": ["Address form", "Shipping options", "Payment step"]\n}',
      save: { itemId: 'created(json.data).id', itemKey: 'json.data.key' },
    }),
    POST('Create task', `${P}/items`, { body: '{ "type": "task", "title": "Set up payment provider sandbox", "priority": "medium", "parentId": {{epicId}}, "estimate": 3 }', save: { item2Id: 'created(json.data).id', item2Key: 'json.data.key' } }),
    POST('Create subtask', `${P}/items`, { body: '{ "type": "subtask", "title": "Validate postcode", "parentId": {{itemId}} }', save: { subtaskKey: 'json.data.key' } }),
    POST('Create item (deleted later → trash)', `${P}/items`, { body: { type: 'task', title: 'Old banner experiment', priority: 'low' }, save: { trashItemId: 'created(json.data).id', trashItemKey: 'json.data.key' } }),
    POST('Create bug (bug fields)', `${B}/items`, {
      body: '{\n  "type": "bug",\n  "title": "Card payment fails with 3-D Secure",\n  "priority": "urgent",\n  "severity": "critical",\n  "statusId": {{bugTodoStatusId}},\n  "environment": "staging",\n  "stepsToReproduce": "1. Add item\\n2. Pay with test card 4000 0027 6000 3184",\n  "expectedResult": "Payment succeeds after the challenge",\n  "actualResult": "Spinner forever",\n  "browser": "Chrome 128",\n  "os": "Windows 11",\n  "foundInVersion": "2.4.0"\n}',
      save: { bugId: 'created(json.data).id', bugKey: 'json.data.key' },
    }),
    POST('Create second bug (closed as duplicate later)', `${B}/items`, { body: { type: 'bug', title: '3DS payment spins forever', priority: 'high', severity: 'major' }, save: { bug2Key: 'json.data.key' } }),
    POST('Create — missing title → 400', `${P}/items`, { expect: 400, body: { type: 'task' } }),
    POST('Create — unknown type → 400', `${P}/items`, { expect: 400, body: { type: 'feature', title: 'x' } }),
    POST('Create — subtask without parent → 400', `${P}/items`, { expect: 400, body: { type: 'subtask', title: 'Orphan subtask' } }),
    POST('Create — epic under epic → 400', `${P}/items`, { expect: 400, body: '{ "type": "epic", "title": "Nested epic", "parentId": {{epicId}} }' }),
    GET('List items', `${P}/items`),
    GET('List — filtered & sorted', `${P}/items`, { query: { types: 'story,task', priorities: 'high,medium', sort: 'priority', order: 'asc', page: '1', limit: '25' } }),
    GET('List — my items in the backlog', `${P}/items`, { auth: 'member', query: { assignees: 'me', sprint: 'backlog' } }),
    GET('List — children of the epic', `${P}/items`, { query: { parent: '{{epicId}}' } }),
    GET('List — full-text search', `${P}/items`, { query: { search: 'checkout' } }),
    GET('List — invalid filter → 400', `${P}/items`, { expect: 400, query: { priorities: 'super-urgent' } }),
    GET('Similar items (duplicate hint)', `${P}/items/similar`, { query: { title: 'checkout form' } }),
    POST('Bulk update', `${P}/items/bulk`, { expect: 200, body: '{\n  "itemIds": [{{itemId}}, {{item2Id}}],\n  "changes": { "priority": "medium", "addLabelIds": [{{labelId}}] }\n}' }),
    POST('Bulk update — no changes → 400', `${P}/items/bulk`, { expect: 400, body: '{ "itemIds": [{{itemId}}], "changes": {} }' }),
    GET('Search across projects', '/work-items', { query: { search: 'checkout', limit: '10' } }),
  ]),
  folder('Read & update', '', [
    GET('Get item by key', W),
    GET('Get item by id', '/work-items/{{itemId}}'),
    GET('Unknown item → 404', '/work-items/WEB-99999', { expect: 404 }),
    PATCH('Update item', W, { body: '{ "title": "One-page checkout form (v2)", "priority": "urgent", "estimate": 13, "dueDate": "{{in30}}" }' }),
    PATCH('Update — nothing to update → 400', W, { expect: 400, body: {} }),
    POST('Move to In progress', `${W}/move`, { expect: 200, body: '{ "statusId": {{inProgressStatusId}} }' }),
    POST('Reorder (drop between two items)', `/work-items/{{item2Key}}/move`, { expect: 200, body: '{ "prevId": {{itemId}}, "nextId": null }' }),
    GET('History (events)', `${W}/events`),
    POST('Watch', `${W}/watch`, { expect: 200 }),
    DEL('Unwatch', `${W}/watch`, { expect: 200 }),
    PATCH('Update with an invalid token → 401', W, { auth: 'bad', expect: 401, body: { title: 'Anonymous edit' } }),
  ]),
  folder('Comments & reactions', '', [
    POST('Add comment', `${W}/comments`, { body: { body: 'Can we reuse the address component from the account page? 🙂' }, save: { commentId: 'created(json.data).id' } }),
    POST('Add comment as member', `${W}/comments`, { auth: 'member', body: { body: 'Yes — it already has validation.' }, save: { comment2Id: 'created(json.data).id' } }),
    POST('Empty comment → 400', `${W}/comments`, { expect: 400, body: { body: '   ' } }),
    GET('List comments', `${W}/comments`),
    PATCH('Edit comment', `${W}/comments/{{commentId}}`, { body: { body: 'Can we reuse the address component from the account page?' } }),
    PATCH("Edit someone else's comment → 403", `${W}/comments/{{comment2Id}}`, { expect: 403, body: { body: 'Not mine' } }),
    POST('React 👍', `${W}/comments/{{commentId}}/reactions`, { expect: 200, body: { emoji: '👍' } }),
    POST('React — unsupported emoji → 400', `${W}/comments/{{commentId}}/reactions`, { expect: 400, body: { emoji: '🍕' } }),
    DEL('Delete comment', `${W}/comments/{{comment2Id}}`, { auth: 'member', expect: 204 }),
  ]),
  folder('Links', '', [
    POST('Link: blocks', `${W}/links`, { body: '{ "target": "{{item2Key}}", "linkType": "blocks" }', save: { linkId: 'json.data.links.find((l) => l.item.key === pm.collectionVariables.get("item2Key")).linkId' }, desc: 'Returns the item with its `links` (each has `linkId`, `linkType`, `direction`, `item`).' }),
    POST('Link: relates to (by id)', `${W}/links`, { body: '{ "target": {{bugId}}, "linkType": "relates_to" }' }),
    POST('Link to itself → 400', `${W}/links`, { expect: 400, body: '{ "target": "{{itemKey}}", "linkType": "blocks" }' }),
    POST('Link — unknown item → 404', `${W}/links`, { expect: 404, body: { target: 'WEB-99999', linkType: 'blocks' } }),
    DEL('Remove link', `${W}/links/{{linkId}}`, { expect: 204 }),
  ]),
  folder('Checklist', '', [
    POST('Add checklist item', `${W}/checklist`, { body: { text: 'Order summary' }, save: { checklistId: 'created(json.data).id', checklistIdsJson: 'list(json.data).map((c) => c.id).reverse()' }, desc: 'Returns the whole checklist.' }),
    PUT('Reorder checklist', `${W}/checklist/order`, { expect: 200, body: '{ "ids": {{checklistIdsJson}} }' }),
    PATCH('Tick checklist item', `${W}/checklist/{{checklistId}}`, { body: { done: true } }),
    PATCH('Rename checklist item', `${W}/checklist/{{checklistId}}`, { body: { text: 'Order summary + totals' } }),
    DEL('Delete checklist item', `${W}/checklist/{{checklistId}}`, { expect: 200 }),
  ]),
  folder('Attachments', 'Multipart upload, field name `file`. In Postman: Body → form-data → key `file` (type File) → choose any file.', [
    POST('Upload attachment', `${W}/attachments`, { form: [{ key: 'file', src: 'files/sample.txt' }], save: { attachmentId: 'created(json.data).id' } }),
    POST('Upload — no file → 400', `${W}/attachments`, { expect: 400, body: {} }),
    GET('List attachments', `${W}/attachments`),
    GET('Download attachment', `${W}/attachments/{{attachmentId}}`),
    DEL('Delete attachment', `${W}/attachments/{{attachmentId}}`, { expect: 204 }),
  ]),
  folder('QA verdict & duplicates', '', [
    POST('QA verdict — not waiting for QA → 409', `/work-items/{{bugKey}}/qa`, { expect: 409, body: { verdict: 'pass' } }),
    POST('Developer: move bug to "Ready for QA"', `/work-items/{{bugKey}}/move`, { expect: 200, body: '{ "statusId": {{bugQaReadyStatusId}} }' }),
    POST('QA fail — without a reason → 400', `/work-items/{{bugKey}}/qa`, { expect: 400, body: { verdict: 'fail' } }),
    POST('QA fail (→ Reopened)', `/work-items/{{bugKey}}/qa`, { expect: 200, body: { verdict: 'fail', comment: 'Still spins on Safari 17' }, desc: 'Bug-tracking projects have a QA flow: Ready for QA → Verified (pass) or Reopened (fail). Other projects can set it in the project settings (qaReadyStatusId, qaPassedStatusId, qaFailedStatusId).' }),
    POST('Developer: fixed again → "Ready for QA"', `/work-items/{{bugKey}}/move`, { expect: 200, body: '{ "statusId": {{bugQaReadyStatusId}} }' }),
    POST('QA pass (→ Verified)', `/work-items/{{bugKey}}/qa`, { expect: 200, body: { verdict: 'pass', fixedInVersion: '2.4.1' } }),
    POST('Close as duplicate', `/work-items/{{bug2Key}}/close-duplicate`, { expect: 200, body: '{ "duplicateOf": "{{bugKey}}" }' }),
    POST('Duplicate of itself → 400', `/work-items/{{bugKey}}/close-duplicate`, { expect: 400, body: '{ "duplicateOf": "{{bugKey}}" }' }),
  ]),
  folder('Delete', '', [DEL('Delete item (moves to trash)', `/work-items/{{trashItemKey}}`, { expect: 204 }), GET('Deleted item → 404', `/work-items/{{trashItemKey}}`, { expect: 404 })]),
]);

// ---------------------------------------------------------------- 07 sprints

const sprints = folder('07 · Sprints, capacity & reports', 'Scrum flow on the WEB project: plan → start → capacity → reports → complete.', [
  POST('Create sprint', `${P}/sprints`, { body: { name: 'Sprint 1', goal: 'Ship the one-page checkout', startDate: '{{today}}', endDate: '{{in14}}' }, save: { sprintId: 'created(json.data).id' } }),
  POST('Create next sprint (default name)', `${P}/sprints`, { body: {}, save: { sprint2Id: 'created(json.data).id' } }),
  POST('Create — bad date → 400', `${P}/sprints`, { expect: 400, body: { name: 'Bad', startDate: '14/10/2026' } }),
  GET('List sprints', `${P}/sprints`),
  GET('List open sprints', `${P}/sprints`, { query: { status: 'open' } }),
  GET('Get sprint', `${P}/sprints/{{sprintId}}`),
  PATCH('Update sprint', `${P}/sprints/{{sprintId}}`, { body: { goal: 'Ship the one-page checkout to 10% of shoppers' } }),
  POST('Plan items into the sprint', `${W}/move`, { expect: 200, body: '{ "sprintId": {{sprintId}} }' }),
  PATCH('Plan another item (PATCH sprintId)', '/work-items/{{item2Key}}', { body: '{ "sprintId": {{sprintId}} }' }),
  POST('Start sprint', `${P}/sprints/{{sprintId}}/start`, { expect: 200, body: { endDate: '{{in14}}' } }),
  POST('Start a second sprint while one is active → 409', `${P}/sprints/{{sprint2Id}}/start`, { expect: 409, body: {} }),
  GET('Sprint capacity', `${P}/sprints/{{sprintId}}/capacity`),
  PUT('Set capacity (80%)', `${P}/sprints/{{sprintId}}/capacity/{{memberUserId}}`, { body: { allocation: 80, note: 'Half day off on Friday' } }),
  PUT('Set capacity — 150% → 400', `${P}/sprints/{{sprintId}}/capacity/{{memberUserId}}`, { expect: 400, body: { allocation: 150 } }),
  GET('Team availability (leave + holidays)', `${P}/availability`, { query: range }),
  GET('Report: burndown', `${P}/reports/burndown/{{sprintId}}`),
  GET('Report: velocity', `${P}/reports/velocity`, { query: { limit: '5' } }),
  GET('Report: quality (bugs)', `${P}/reports/quality`, { query: { weeks: '8' } }),
  GET('Report: overview', `${P}/reports/overview`, { query: { days: '30' } }),
  GET('Report — days out of range → 400', `${P}/reports/overview`, { expect: 400, query: { days: '2' } }),
  POST('Complete sprint → open items to the next sprint', `${P}/sprints/{{sprintId}}/complete`, { expect: 200, body: '{ "moveOpenItemsTo": {{sprint2Id}} }' }),
  DEL('Delete the planned sprint (items go to backlog)', `${P}/sprints/{{sprint2Id}}`, { expect: 204 }),
  GET('Project calendar (items + sprints by day)', `${P}/calendar`, { query: range }),
  GET('Project calendar — range > 62 days → 400', `${P}/calendar`, { expect: 400, query: { from: '{{today}}', to: '2099-01-01' } }),
]);

const views = folder('08 · Saved views', 'Named filters for the list / board.', [
  POST('Create shared board view', `${P}/views`, { body: { name: 'Urgent frontend', viewType: 'board', filters: { priorities: 'urgent,high', labelIds: '{{labelId}}' }, isShared: true }, save: { viewId: 'created(json.data).id' } }),
  POST('Create — unknown view type → 400', `${P}/views`, { expect: 400, body: { name: 'Gantt', viewType: 'gantt' } }),
  GET('List views', `${P}/views`),
  PATCH('Update view', `${P}/views/{{viewId}}`, { body: { name: 'Urgent frontend (all)', isShared: false } }),
  DEL('Delete view', `${P}/views/{{viewId}}`, { expect: 204 }),
]);

// ---------------------------------------------------------------- 09 QA

const qa = folder('09 · QA: test suites, cases & runs', 'Test management on the WEB project: suites → cases with steps → a run → results → a bug from a failed result.', [
  POST('Create suite', `${P}/test-suites`, { body: { name: 'Checkout', description: 'Cart, address, payment' }, save: { suiteId: 'created(json.data).id' } }),
  GET('List suites', `${P}/test-suites`),
  PATCH('Update suite', `${P}/test-suites/{{suiteId}}`, { body: { description: 'Cart, address, shipping, payment' } }),
  POST('Create test case (steps, linked story)', `${P}/test-cases`, {
    body: '{\n  "title": "Pay with a 3-D Secure card",\n  "suiteId": {{suiteId}},\n  "preconditions": "Cart has one item; test card 4000 0027 6000 3184",\n  "steps": [\n    { "action": "Open checkout", "expected": "One page with address, shipping, payment" },\n    { "action": "Pay with the 3DS card", "expected": "Challenge window opens" },\n    { "action": "Approve the challenge", "expected": "Order confirmation page" }\n  ],\n  "priority": "critical",\n  "caseType": "functional",\n  "status": "ready",\n  "workItemRef": "{{itemKey}}"\n}',
    save: { caseNumber: 'json.data.number', caseId: 'created(json.data).id' },
  }),
  POST('Create test case (smoke, no suite)', `${P}/test-cases`, { body: { title: 'Home page loads', caseType: 'smoke', priority: 'high', steps: [{ action: 'Open /', expected: 'Products are listed' }] }, save: { case2Number: 'json.data.number' } }),
  POST('Create — empty step → 400', `${P}/test-cases`, { expect: 400, body: { title: 'Bad steps', steps: [{ action: '' }] } }),
  GET('List cases', `${P}/test-cases`),
  GET('List cases in the suite', `${P}/test-cases`, { query: { suiteId: '{{suiteId}}', priority: 'critical' } }),
  GET('Get case', `${P}/test-cases/{{caseNumber}}`),
  PATCH('Update case', `${P}/test-cases/{{caseNumber}}`, { body: { priority: 'high', caseType: 'regression' } }),
  POST('Create run (all ready cases)', `${P}/test-runs`, { body: { name: 'Release 2.4 regression', environment: 'staging', buildVersion: '2.4.0', scope: { all: true } }, save: { testRunId: 'created(json.data).id' } }),
  POST('Create run — empty scope → 400', `${P}/test-runs`, { expect: 400, body: { name: 'Nothing', scope: {} } }),
  GET('List runs', `${P}/test-runs`),
  GET('Get run (saves result ids)', `${P}/test-runs/{{testRunId}}`, { save: { resultId: 'json.data.results.find((r) => r.title.startsWith("Pay with")).id', result2Id: 'json.data.results.find((r) => r.title === "Home page loads").id' } }),
  PATCH('Result: passed', `${P}/test-runs/{{testRunId}}/results/{{result2Id}}`, { body: { status: 'passed', comment: 'OK on Chrome and Safari' } }),
  PATCH('Result: per-step (failed on step 3)', `${P}/test-runs/{{testRunId}}/results/{{resultId}}`, { body: { status: 'failed', stepResults: ['passed', 'passed', 'failed'], comment: 'Confirmation page never loads' } }),
  PATCH('Result — more step results than steps → 400', `${P}/test-runs/{{testRunId}}/results/{{result2Id}}`, { expect: 400, body: { stepResults: ['passed', 'passed', 'passed', 'passed'] } }),
  POST('Bug from a passed result → 400', `${P}/test-runs/{{testRunId}}/results/{{result2Id}}/bug`, { expect: 400, body: {} }),
  POST('Bug from the failed result', `${P}/test-runs/{{testRunId}}/results/{{resultId}}/bug`, { body: '{ "priority": "high", "severity": "major", "assigneeId": {{memberUserId}} }', save: { qaBugKey: 'json.data.key' } }),
  PATCH('Update run', `${P}/test-runs/{{testRunId}}`, { body: { buildVersion: '2.4.0-rc2' } }),
  POST('Complete run', `${P}/test-runs/{{testRunId}}/complete`, { expect: 200 }),
  PATCH('Edit a result of a completed run → 409', `${P}/test-runs/{{testRunId}}/results/{{result2Id}}`, { expect: 409, body: { status: 'failed' } }),
  POST('Reopen run', `${P}/test-runs/{{testRunId}}/reopen`, { expect: 200 }),
  DEL('Delete run', `${P}/test-runs/{{testRunId}}`, { expect: 204 }),
  DEL('Delete case', `${P}/test-cases/{{case2Number}}`, { expect: 204 }),
  DEL('Delete suite', `${P}/test-suites/{{suiteId}}`, { expect: 200 }),
]);

// ---------------------------------------------------------------- 10 errors

const errors = folder('10 · Production errors', 'The error inbox: server and browser errors grouped by fingerprint, turned into bugs.', [
  POST('Simulate a server error (TypeError) → 500', '/errors/simulate/type', { expect: 500, desc: 'Development only. Throws on purpose so the error shows up in the inbox.' }),
  POST('Report a browser error', '/client-errors', {
    expect: 204,
    body: { errorId: '3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b', source: 'boundary', name: 'TypeError', message: "Cannot read properties of undefined (reading 'price')", stack: 'TypeError: Cannot read properties of undefined\n    at CartTotal (Cart.tsx:42:17)', url: 'http://localhost:5173/projects/WEB/board', userAgent: 'Postman', release: '2.4.0' },
    desc: 'What the React error boundary sends. Rate limited to 30 per minute.',
  }),
  POST('Report a browser error — invalid → 400', '/client-errors', { expect: 400, body: { errorId: 'not-a-uuid', source: 'boundary', message: 'x', url: '/' } }),
  GET('Error inbox', '/errors', { save: { errorId: 'list(json.data)[0].id' } }),
  GET('Error inbox — filtered', '/errors', { query: { status: 'all', source: 'server', sort: 'occurrences', search: 'TypeError' } }),
  GET('Error group (occurrences, stack)', '/errors/{{errorId}}'),
  PATCH('Ignore', '/errors/{{errorId}}', { body: { status: 'ignored' } }),
  PATCH('Reopen', '/errors/{{errorId}}', { body: { status: 'unresolved' } }),
  PATCH('Invalid status → 400', '/errors/{{errorId}}', { expect: 400, body: { status: 'fixed' } }),
  POST('Create bug from error', '/errors/{{errorId}}/bug', { expect: 201, body: '{ "projectRef": "{{bugProjectKey}}", "priority": "high", "severity": "major", "assigneeId": {{memberUserId}} }' }),
  POST('Link to an existing bug', '/errors/{{errorId}}/link', { expect: 200, body: '{ "itemRef": "{{bugKey}}" }' }),
  GET('Error inbox as member (developers may read it)', '/errors', { auth: 'member', expect: 200 }),
]);

// ---------------------------------------------------------------- 11 leave

const leave = folder('11 · Leave & holidays', 'Leave types, holiday calendars, balances; requests by the member, decisions by the owner.', [
  folder('Settings (admin)', '', [
    GET('Leave types (settings)', '/leave/settings/types', { save: { leaveTypeId: 'list(json.data).find((t) => t.isActive !== false && t.requiresApproval !== false).id' } }),
    POST('Create leave type', '/leave/settings/types', { body: { name: 'Study leave', color: '#13c2c2', isPaid: true, defaultDays: 5, allowHalfDay: true, requiresApproval: true }, save: { customLeaveTypeId: 'created(json.data).id' } }),
    POST('Create type — days not in half steps → 400', '/leave/settings/types', { expect: 400, body: { name: 'Odd days', defaultDays: 2.3 } }),
    PATCH('Update leave type', '/leave/settings/types/{{customLeaveTypeId}}', { body: { defaultDays: 6, color: '#08979c' } }),
    GET('Holiday calendars', '/leave/settings/calendars', { save: { calendarId: 'list(json.data)[0].id' } }),
    POST('Create holiday calendar', '/leave/settings/calendars', { body: { name: 'US office', description: 'New York team', weekendDays: [0, 6] }, save: { calendar2Id: 'created(json.data).id' } }),
    PATCH('Update calendar', '/leave/settings/calendars/{{calendar2Id}}', { body: { description: 'New York + Boston' } }),
    POST('Add holiday', '/leave/settings/calendars/{{calendar2Id}}/holidays', { body: { date: '{{holidayDate}}', name: 'Company day', isOptional: false }, desc: 'Returns `{ added: 1 }`.' }),
    POST('Bulk add holidays (one per line)', '/leave/settings/calendars/{{calendar2Id}}/holidays/bulk', { expect: 201, body: { text: '{{year}}-12-25, Christmas Day\n{{year}}-12-31, New Year\'s Eve, optional' } }),
    POST('Bulk add — bad line → 400', '/leave/settings/calendars/{{calendar2Id}}/holidays/bulk', { expect: 400, body: { text: '25/12, Christmas' } }),
    GET('List holidays', '/leave/settings/calendars/{{calendar2Id}}/holidays', { save: { holidayId: 'list(json.data).find((h) => h.name === "Company day").id' } }),
    DEL('Delete holiday', '/leave/settings/calendars/{{calendar2Id}}/holidays/{{holidayId}}', { expect: 204 }),
    GET('Who uses which calendar', '/leave/settings/members'),
    PUT('Assign a calendar to the member', '/leave/settings/members/{{memberUserId}}/calendar', { body: '{ "calendarId": {{calendar2Id}} }' }),
    PUT('Back to the default calendar', '/leave/settings/members/{{memberUserId}}/calendar', { body: { calendarId: null } }),
    GET('Balances (settings)', '/leave/settings/balances', { query: { year: '{{year}}' } }),
    PUT('Set a balance', '/leave/settings/balances', { body: '{ "userId": {{memberUserId}}, "leaveTypeId": {{leaveTypeId}}, "year": {{year}}, "entitled": 20, "carriedOver": 2.5, "note": "Joined in January" }' }),
    GET('Settings as member → 403', '/leave/settings/types', { auth: 'member', expect: 403 }),
  ]),
  folder('Requests', '', [
    GET('Leave types (for the request form)', '/leave/types', { auth: 'member' }),
    GET('My balances', '/leave/balances', { auth: 'member' }),
    POST('Preview (working days, balance after)', '/leave/requests/preview', { auth: 'member', expect: 200, body: '{ "leaveTypeId": {{leaveTypeId}}, "startDate": "{{leaveStart}}", "endDate": "{{leaveEnd}}", "portion": "full" }' }),
    POST('Request leave (member)', '/leave/requests', { auth: 'member', body: '{ "leaveTypeId": {{leaveTypeId}}, "startDate": "{{leaveStart}}", "endDate": "{{leaveEnd}}", "portion": "full", "reason": "Family visit" }', save: { leaveRequestId: 'created(json.data).id' } }),
    POST('Request half a day (member)', '/leave/requests', { auth: 'member', body: '{ "leaveTypeId": {{leaveTypeId}}, "startDate": "{{leave2Start}}", "endDate": "{{leave2Start}}", "portion": "am", "reason": "Dentist" }', save: { leaveRequest2Id: 'created(json.data).id' } }),
    POST('Overlapping request → 409', '/leave/requests', { auth: 'member', expect: 409, body: '{ "leaveTypeId": {{leaveTypeId}}, "startDate": "{{leaveStart}}", "endDate": "{{leaveStart}}" }' }),
    POST('End before start → 400', '/leave/requests', { auth: 'member', expect: 400, body: '{ "leaveTypeId": {{leaveTypeId}}, "startDate": "{{leaveEnd}}", "endDate": "{{leaveStart}}" }' }),
    GET('My requests', '/leave/requests', { auth: 'member', query: { scope: 'mine', status: 'all' } }),
    GET('Team requests waiting for me', '/leave/requests', { query: { scope: 'team', status: 'pending' } }),
    GET('Get request', '/leave/requests/{{leaveRequestId}}'),
    POST('Approve', '/leave/requests/{{leaveRequestId}}/approve', { expect: 200, body: { note: 'Enjoy!' } }),
    POST('Approve your own request? → member cannot approve → 403', '/leave/requests/{{leaveRequest2Id}}/approve', { auth: 'member', expect: 403, body: {} }),
    POST('Reject — without a reason → 400', '/leave/requests/{{leaveRequest2Id}}/reject', { expect: 400, body: {} }),
    POST('Reject', '/leave/requests/{{leaveRequest2Id}}/reject', { expect: 200, body: { note: 'Release day — can you move it a week?' } }),
    POST('Request leave (owner)', '/leave/requests', { body: '{ "leaveTypeId": {{leaveTypeId}}, "startDate": "{{leave3Start}}", "endDate": "{{leave3Start}}", "portion": "pm" }', save: { leaveRequest3Id: 'created(json.data).id' } }),
    POST('Cancel my request', '/leave/requests/{{leaveRequest3Id}}/cancel', { expect: 200 }),
    GET('Team leave calendar', '/leave/calendar', { query: { from: '{{today}}', to: '{{in30}}' } }),
    GET('Leave calendar — more than two months → 400', '/leave/calendar', { expect: 400, query: { from: '{{today}}', to: '2099-01-01' } }),
  ]),
  folder('Clean-up', '', [DEL('Delete leave type', '/leave/settings/types/{{customLeaveTypeId}}', { expect: 200 }), DEL('Delete calendar', '/leave/settings/calendars/{{calendar2Id}}', { expect: 200 })]),
]);

// ---------------------------------------------------------------- 12 – 14

const notifications = folder('12 · Notifications', 'In-app notifications (the member was assigned, mentioned and had leave decided above) and e-mail preferences.', [
  GET('List notifications', '/notifications', { auth: 'member', save: { notificationId: 'list(json.data)[0].id' } }),
  GET('Unread only, one category', '/notifications', { auth: 'member', query: { unread: 'true', category: 'leave' } }),
  GET('Unread count', '/notifications/unread-count', { auth: 'member' }),
  POST('Mark some as read', '/notifications/read', { auth: 'member', expect: 200, body: '{ "ids": [{{notificationId}}] }' }),
  POST('Mark as unread', '/notifications/{{notificationId}}/unread', { auth: 'member', expect: 200 }),
  POST('Mark all as read', '/notifications/read', { auth: 'member', expect: 200, body: { all: true } }),
  GET('Preferences', '/notifications/preferences', { auth: 'member' }),
  PUT('Update preferences', '/notifications/preferences', { auth: 'member', body: { preferences: [{ category: 'mentions', inApp: true, email: 'instant' }, { category: 'reports', inApp: false, email: 'daily' }] } }),
  PUT('Preferences — unknown category → 400', '/notifications/preferences', { auth: 'member', expect: 400, body: { preferences: [{ category: 'spam', inApp: true, email: 'off' }] } }),
]);

const myWork = folder('13 · My work, dashboard & insights', 'Personal views and organization reports.', [
  GET('My work (assigned, due, leave, docs)', '/my-work', { auth: 'member' }),
  GET('My calendar', '/my-work/calendar', { auth: 'member', query: range }),
  GET('Dashboard', '/dashboard'),
  GET('Insights (organization)', '/insights'),
  GET('Insights export: projects (CSV)', '/insights/export/projects'),
  GET('Insights export: workload (CSV)', '/insights/export/workload'),
  GET('Insights export — unknown section → 400', '/insights/export/salaries', { expect: 400 }),
  POST('E-mail me the weekly report', '/insights/weekly-report/send-me', { expect: 200 }),
  GET('Insights as member → 403', '/insights', { auth: 'member', expect: 403 }),
]);

// ---------------------------------------------------------------- 15 – 16

const docs = folder('14 · Docs (project wiki)', 'Pages in a tree, with versions and an edit-conflict check (`baseUpdatedAt`).', [
  POST('Create page', `${P}/pages`, { body: { title: 'Checkout architecture', body: '# Checkout\n\nWe use a **single form** with three steps.\n\n- Address\n- Shipping\n- Payment' }, save: { pageId: 'created(json.data).id', pageUpdatedAt: 'json.data.updatedAt' } }),
  POST('Create child page', `${P}/pages`, { body: '{ "title": "Payment provider notes", "body": "Sandbox keys live in the vault.", "parentId": {{pageId}} }', save: { childPageId: 'created(json.data).id' } }),
  POST('Create — empty title → 400', `${P}/pages`, { expect: 400, body: { title: '' } }),
  GET('Page tree', `${P}/pages`),
  GET('Search pages', `${P}/pages/search`, { query: { q: 'payment' } }),
  GET('Get page', `${P}/pages/{{pageId}}`, { save: { pageUpdatedAt: 'json.data.updatedAt' } }),
  PATCH('Edit page (with conflict check)', `${P}/pages/{{pageId}}`, { body: { title: 'Checkout architecture (v2)', body: '# Checkout v2\n\nOne page, three sections.', baseUpdatedAt: '{{pageUpdatedAt}}' } }),
  PATCH('Edit with a stale version → 409 PAGE_CHANGED', `${P}/pages/{{pageId}}`, { expect: 409, body: { body: 'My older edit', baseUpdatedAt: '{{pageUpdatedAt}}' }, desc: 'Someone saved after you opened the page: the server refuses instead of overwriting.' }),
  GET('Versions', `${P}/pages/{{pageId}}/versions`, { save: { versionId: 'list(json.data)[list(json.data).length - 1].id' } }),
  GET('One version', `${P}/pages/{{pageId}}/versions/{{versionId}}`),
  POST('Restore a version', `${P}/pages/{{pageId}}/versions/{{versionId}}/restore`, { expect: 200 }),
  DEL('Delete child page (to trash)', `${P}/pages/{{childPageId}}`, { expect: 200 }),
]);

const templates = folder('15 · Templates & recurring work', 'Item templates; with `repeat` they create the item automatically (job `work-items.recurring`).', [
  POST('Create weekly template', `${P}/templates`, {
    body: '{\n  "name": "Weekly release checklist",\n  "type": "task",\n  "title": "Release {{today}}",\n  "description": "Cut the release branch and run the smoke suite.",\n  "priority": "high",\n  "labelIds": [{{labelId}}],\n  "checklist": ["Freeze main", "Run smoke tests", "Tag release"],\n  "repeat": "weekly",\n  "repeatWeekday": 1,\n  "repeatMonthDay": null,\n  "assigneeId": {{memberUserId}},\n  "dueInDays": 2\n}',
    save: { templateId: 'created(json.data).id' },
  }),
  POST('Create monthly template', `${P}/templates`, { body: { name: 'Monthly dependency audit', type: 'task', title: 'Audit npm dependencies', priority: 'medium', labelIds: [], checklist: [], repeat: 'monthly', repeatWeekday: null, repeatMonthDay: 1, assigneeId: null, dueInDays: 5 }, save: { template2Id: 'created(json.data).id' } }),
  POST('Create plain template (no repeat)', `${P}/templates`, { body: { name: 'Bug report', type: 'bug', title: '[Bug] ', priority: 'medium', labelIds: [], checklist: ['Steps to reproduce', 'Expected vs actual'], repeat: 'never', repeatWeekday: null, repeatMonthDay: null, assigneeId: null, dueInDays: null } }),
  POST('Weekly without a weekday → 400', `${P}/templates`, { expect: 400, body: { name: 'Broken', type: 'task', title: 'x', priority: 'low', labelIds: [], checklist: [], repeat: 'weekly', repeatWeekday: null, repeatMonthDay: null, assigneeId: null, dueInDays: null } }),
  GET('List templates', `${P}/templates`),
  PATCH('Update template', `${P}/templates/{{templateId}}`, { body: { repeat: 'weekdays', repeatWeekday: null, dueInDays: 0 } }),
  DEL('Delete template', `${P}/templates/{{template2Id}}`, { expect: 200 }),
]);

// ---------------------------------------------------------------- 17 trash

const trash = folder('16 · Trash & restore', 'Deleted items and pages stay 30 days in the project trash; deleted projects in the organization trash.', [
  GET('Project trash', `${P}/trash`),
  POST('Restore item', `${P}/trash/item/{{trashItemId}}/restore`, { expect: 200 }),
  GET('Restored item is back', `/work-items/{{trashItemKey}}`),
  POST('Restore — wrong kind → 400', `${P}/trash/folder/{{trashItemId}}/restore`, { expect: 400 }),
  DEL('Delete page forever', `${P}/trash/page/{{childPageId}}`, { expect: 200 }),
  DEL('Delete an active project → 400 (archive first)', '/projects/TMP', { expect: 400 }),
  POST('Archive project', '/projects/TMP/archive', { expect: 200 }),
  DEL('Delete project (to organization trash)', '/projects/TMP', { expect: 204 }),
  GET('Deleted projects', '/trash/projects'),
  POST('Restore project', '/trash/projects/{{tmpProjectId}}/restore', { expect: 200 }),
  POST('Archive project again', '/projects/TMP/archive', { expect: 200, desc: 'A restored project may come back archived; then this says so.' }),
  DEL('Delete project again', '/projects/TMP', { expect: 204 }),
  DEL('Delete project forever', '/trash/projects/{{tmpProjectId}}', { expect: 200 }),
  GET('Deleted projects as member → 403', '/trash/projects', { auth: 'member', expect: 403 }),
]);

// ---------------------------------------------------------------- 18 guests

const guests = folder('17 · Guests (outside collaborators)', 'A guest only sees the projects they are invited to — nothing else in the organization.', [
  POST('Invite a guest to WEB (viewer)', '/invitations', { body: '{ "email": "{{guestEmail}}", "projectId": {{projectId}}, "projectRole": "viewer" }', save: { guestInviteToken: 'json.data.inviteUrl.split("/invite/")[1]' } }),
  POST('Register the guest', '/auth/register', { auth: 'none', body: { name: 'Grace Guest', email: '{{guestEmail}}', password: '{{password}}', invitationToken: '{{guestInviteToken}}' }, save: { guestToken: 'json.data.accessToken', guestUserId: 'json.data.user.id' }, tests: ['pm.test("Is a guest", () => pm.expect(json.data.user.isGuest).to.eql(true));'] }),
  GET('Guest sees only WEB', '/projects', { auth: 'guest', tests: ['pm.test("Only the invited project", () => pm.expect(list(json.data).map((p) => p.key)).to.eql(["WEB"]));'] }),
  GET('Guest reads an item', W, { auth: 'guest' }),
  GET('Guest — other project → 404', B, { auth: 'guest', expect: 404 }),
  GET('Guest — member list → 403', '/members', { auth: 'guest', expect: 403 }),
  GET('Guest — leave → 403', '/leave/requests', { auth: 'guest', expect: 403 }),
  POST('Guest (viewer) creates an item → 403', `${P}/items`, { auth: 'guest', expect: 403, body: { type: 'task', title: 'Guest task' } }),
  POST('Make the guest a full member', '/members/{{guestUserId}}/make-member', { expect: 200, body: '{ "roleIds": [{{memberRoleId}}] }' }),
]);

// ---------------------------------------------------------------- 19 – 21

const misc = folder('18 · Help Center, audit log, content, realtime', '', [
  GET('Help Center (sections + articles)', '/guide', { save: { articleSlug: 'list(json.data.sections || json.data).flatMap((s) => s.articles || [])[0].slug' } }),
  GET('Search help', '/guide/search', { query: { q: 'project' } }),
  GET('Search — too short → 400', '/guide/search', { expect: 400, query: { q: 'p' } }),
  GET('Article', '/guide/articles/{{articleSlug}}'),
  GET('Unknown article → 404', '/guide/articles/no-such-article', { expect: 404 }),
  GET('Getting-started checklist', '/guide/getting-started'),
  POST('Dismiss getting started', '/guide/getting-started/dismiss', { expect: 200 }),
  POST('Show getting started again', '/guide/getting-started/restore', { expect: 200 }),
  GET('Audit log', '/audit-logs', { query: { page: '1', limit: '20' } }),
  GET('Audit log as member → 403', '/audit-logs', { auth: 'member', expect: 403 }),
  GET('Public content (no login)', '/content/public/home', { auth: 'none' }),
  PUT('Organization announcement', '/content/announcement', { body: { content: { announcement: 'Release 2.4 goes out on Friday 🎉' } } }),
  GET('Organization announcement', '/content/announcement'),
  POST('Realtime ticket (for the event stream)', '/realtime/ticket', { expect: 200, save: { realtimeTicket: 'json.data.ticket' }, desc: 'Open `{{baseUrl}}/realtime/stream?ticket=<ticket>` in a browser tab (or Postman → New → SSE) to watch live events. Not run here: a stream never ends.' }),
  GET('Realtime stream — invalid ticket → 401', '/realtime/stream', { auth: 'none', expect: 401, query: { ticket: 'invalid' } }),
]);

const website = folder('19 · Public website (no login)', 'What visitors of the marketing site call. Inquiries are rate limited to 5 per 15 minutes per IP.', [
  GET('Site (menu, footer, settings)', '/website/site', { auth: 'none' }),
  GET('Home page', '/website/pages/home', { auth: 'none' }),
  GET('Pricing page (plans)', '/website/pages/pricing', { auth: 'none' }),
  GET('Unknown / unpublished page → 404', '/website/pages/no-such-page', { auth: 'none', expect: 404 }),
  POST('Contact: book a demo', '/website/inquiries', { auth: 'none', expect: 201, body: { type: 'demo', name: 'Priya Shah', email: 'priya.{{runTag}}@acme.test', company: 'Acme Retail', teamSize: '51-200', phone: '+1 555 0100', message: 'We run 6 squads and want to move off spreadsheets for QA. Can we see a demo?', sourcePath: '/contact', elapsedMs: 9000 } }),
  POST('Contact: bot (honeypot filled) → filed as spam', '/website/inquiries', { auth: 'none', expect: 201, body: { type: 'question', name: 'Bot', email: 'bot.{{runTag}}@spam.test', message: 'Cheap followers, visit my site now!!!', website: 'http://spam.test', elapsedMs: 300 }, desc: 'Bots get the same "thank you" so they learn nothing; the message is stored with status spam and no e-mails are sent.' }),
  POST('Contact — message too short → 400', '/website/inquiries', { auth: 'none', expect: 400, body: { name: 'Al', email: 'al@acme.test', message: 'hi' } }),
]);

// ---------------------------------------------------------------- 22 platform

const platformGate = [script(['// every request below needs a platform-admin token (see 00 · Setup)'], 'prerequest')];
const pf = (n: string, m: string, p: string, o: ReqOpts = {}) => req(n, m, `/platform${p}`, { auth: 'platform', gate: 'platform', ...o });

const platform = folder(
  '20 · Platform (product owner)',
  'Needs a platform admin: on an empty database the sandbox owner is one; otherwise set platformEmail / platformPassword in the environment. Requests that change the public website also need allowSiteChanges=true.',
  [
    folder('Overview, organizations & users', '', [
      pf('Platform stats', 'GET', '/stats'),
      pf('Organizations', 'GET', '/organizations', { query: { search: 'Sandbox', page: '1', limit: '20' } }),
      pf('Move the sandbox org to the Pro plan', 'PATCH', '/organizations/{{orgId}}', { expect: 204, body: { plan: 'pro' } }),
      pf('Unknown plan → 400', 'PATCH', '/organizations/{{orgId}}', { expect: 400, body: { plan: 'platinum' } }),
      pf('Suspend the side organization', 'PATCH', '/organizations/{{org2Id}}', { expect: 204, body: { status: 'suspended' } }),
      pf('Reactivate the side organization', 'PATCH', '/organizations/{{org2Id}}', { expect: 204, body: { status: 'active' } }),
      pf('Users', 'GET', '/users', { query: { search: '{{runTag}}' } }),
      pf('Deactivate a user', 'PATCH', '/users/{{memberUserId}}', { expect: 204, body: { isActive: false } }),
      pf('Reactivate the user', 'PATCH', '/users/{{memberUserId}}', { expect: 204, body: { isActive: true } }),
      pf('Update user — nothing to update → 400', 'PATCH', '/users/{{memberUserId}}', { expect: 400, body: {} }),
      pf('Platform audit log', 'GET', '/audit-logs', { query: { page: '1', limit: '20' } }),
      req('Platform as a normal member → 403', 'GET', '/platform/stats', { auth: 'member', expect: 403 }),
    ]),
    folder('Plans', '', [
      pf('List plans', 'GET', '/plans'),
      pf('Create plan', 'POST', '/plans', { body: { key: 'pm-{{runTag}}', name: 'Postman test plan', description: 'Created by the Postman run', maxMembers: 3, maxProjects: 1, maxGuests: 0, sortOrder: 99 } }),
      pf('Create — bad key → 400', 'POST', '/plans', { expect: 400, body: { key: 'Has Spaces', name: 'x', maxMembers: 1, maxProjects: 0, maxGuests: 0 } }),
      pf('Update plan', 'PATCH', '/plans/pm-{{runTag}}', { body: { maxMembers: 5, name: 'Postman test plan (5 seats)' } }),
      pf('Delete plan', 'DELETE', '/plans/pm-{{runTag}}', { expect: 200 }),
    ]),
    folder('Menus', '', [
      pf('List menus', 'GET', '/menus'),
      pf('Create menu', 'POST', '/menus', { body: { key: 'pm_{{runTag}}', label: 'Postman test', path: '/postman-test', icon: 'ApiOutlined', scope: 'organization', sortOrder: 9999, isActive: false }, save: { menuId: 'created(json.data).id' } }),
      pf('Create — path without "/" → 400', 'POST', '/menus', { expect: 400, body: { key: 'pm_bad', label: 'Bad', path: 'no-slash' } }),
      pf('Update menu', 'PATCH', '/menus/{{menuId}}', { body: { label: 'Postman test (renamed)' } }),
      pf('Delete menu', 'DELETE', '/menus/{{menuId}}', { expect: 204 }),
    ]),
    folder('Help Center editor', '', [
      pf('All sections + articles (incl. drafts)', 'GET', '/guide'),
      pf('Create section', 'POST', '/guide/sections', { body: { slug: 'pm-{{runTag}}', title: 'Postman test section', icon: 'ApiOutlined' }, save: { guideSectionId: 'created(json.data).id' } }),
      pf('Update section', 'PATCH', '/guide/sections/{{guideSectionId}}', { body: { title: 'Postman test section (renamed)' } }),
      pf('Create article (draft)', 'POST', '/guide/articles', { body: '{\n  "sectionId": {{guideSectionId}},\n  "slug": "pm-article-{{runTag}}",\n  "title": "How to use the API from Postman",\n  "summary": "Import, select the environment, run.",\n  "body": "## Steps\\n1. Import\\n2. Run",\n  "audience": "admins",\n  "appPath": "/projects",\n  "status": "draft",\n  "visibility": "all"\n}', save: { guideArticleId: 'created(json.data).id' } }),
      pf('Get article', 'GET', '/guide/articles/{{guideArticleId}}'),
      pf('Publish article (PATCH only what changes)', 'PATCH', '/guide/articles/{{guideArticleId}}', { body: { status: 'published' } }),
      pf('Delete article', 'DELETE', '/guide/articles/{{guideArticleId}}', { expect: 200 }),
      pf('Delete section', 'DELETE', '/guide/sections/{{guideSectionId}}', { expect: 200 }),
    ]),
    folder('Errors (all organizations)', '', [
      pf('All error groups', 'GET', '/errors', { query: { status: 'all' }, save: { platformErrorId: 'list(json.data)[0].id' } }),
      pf('Error group', 'GET', '/errors/{{platformErrorId}}'),
      pf('Resolve', 'PATCH', '/errors/{{platformErrorId}}', { body: { status: 'resolved' } }),
    ]),
    folder('Mailbox & jobs', 'With the outbox e-mail driver every e-mail is stored here instead of being sent.', [
      pf('E-mails', 'GET', '/emails', { query: { search: '{{runTag}}' }, save: { emailId: 'list(json.data)[0].id' } }),
      pf('E-mail (rendered HTML)', 'GET', '/emails/{{emailId}}'),
      pf('Resend', 'POST', '/emails/{{emailId}}/resend', { expect: 204 }),
      pf('Job stats (per queue)', 'GET', '/jobs/stats'),
      pf('Jobs', 'GET', '/jobs', { query: { status: 'completed', limit: '20' } }),
      pf('Retry a job that has not failed → 400', 'POST', '/jobs/999999999/retry', { expect: 400, desc: 'Only failed jobs can be retried (Platform → Jobs → Failed).' }),
    ]),
    folder('Website: inquiries & media', '', [
      pf('Inquiries (open)', 'GET', '/website/inquiries', { query: { search: '{{runTag}}' }, save: { inquiryId: 'list(json.data)[0].id' } }),
      pf('Spam folder', 'GET', '/website/inquiries', { query: { status: 'spam', search: '{{runTag}}' }, save: { spamInquiryId: 'list(json.data)[0].id' } }),
      pf('Inquiry', 'GET', '/website/inquiries/{{inquiryId}}'),
      pf('Add an internal note', 'PATCH', '/website/inquiries/{{inquiryId}}', { body: { notes: 'Good fit — 6 squads, wants QA.' } }),
      pf('Reply (and close)', 'POST', '/website/inquiries/{{inquiryId}}/reply', { expect: 200, body: { body: 'Hi Priya,\n\nThanks for reaching out — how about Tuesday 10:00?\n\nBest,\nThe Team-Flex team', close: true } }),
      pf('Delete spam', 'DELETE', '/website/inquiries/{{spamInquiryId}}', { expect: 200 }),
      pf('Media library', 'GET', '/website/media'),
      pf('Upload image', 'POST', '/website/media', { form: [{ key: 'file', src: 'files/sample.png' }], save: { mediaId: 'created(json.data).id' } }),
      pf('Upload — not an image → 400', 'POST', '/website/media', { expect: 400, form: [{ key: 'file', src: 'files/sample.txt' }] }),
      pf('Set alt text', 'PATCH', '/website/media/{{mediaId}}', { body: { altText: 'Team-Flex board screenshot' } }),
      req('Public media file (no login)', 'GET', '/website/media/{{mediaId}}', { auth: 'none', gate: 'platform' }),
      pf('Delete image', 'DELETE', '/website/media/{{mediaId}}', { expect: 200 }),
    ]),
    folder('Website: pages, sections & settings (changes the live site)', 'Skipped unless the environment has allowSiteChanges=true. Edits go to the draft; publish makes them live.', [
      pf('Pages', 'GET', '/website/pages'),
      pf('Page with draft sections', 'GET', '/website/pages/home'),
      pf('Header & footer settings', 'GET', '/website/settings', { save: { siteSettingsJson: 'json.data.draft || json.data.settings || json.data' } }),
      pf('Create a test page section: add FAQ to FAQ page', 'POST', '/website/pages/faq/sections', { gate: 'siteChanges', body: { type: 'faq' }, save: { sectionId: 'created(json.data).id' } }),
      pf('Add section — unknown type → 400', 'POST', '/website/pages/faq/sections', { gate: 'siteChanges', expect: 400, body: { type: 'carousel' } }),
      pf('Edit section content', 'PATCH', '/website/sections/{{sectionId}}', { gate: 'siteChanges', body: { content: { title: 'API questions', items: [{ question: 'Is there an API?', answer: 'Yes — every screen uses the same REST API.' }] } } }),
      pf('Edit section — content does not match its type → 400', 'PATCH', '/website/sections/{{sectionId}}', { gate: 'siteChanges', expect: 400, body: { content: { title: 'Bad', items: [{ question: '' }] } } }),
      pf('Hide section', 'PATCH', '/website/sections/{{sectionId}}', { gate: 'siteChanges', body: { isVisible: false } }),
      pf('Duplicate section', 'POST', '/website/sections/{{sectionId}}/duplicate', { gate: 'siteChanges', save: { section2Id: 'created(json.data).id' } }),
      pf('Delete duplicate', 'DELETE', '/website/sections/{{section2Id}}', { gate: 'siteChanges', expect: 200 }),
      pf('Delete section', 'DELETE', '/website/sections/{{sectionId}}', { gate: 'siteChanges', expect: 200 }),
      pf('Page settings (SEO, menu)', 'PATCH', '/website/pages/faq', { gate: 'siteChanges', body: { seoDescription: 'Answers about plans, security and the product.' } }),
      pf('Save settings (unchanged)', 'PUT', '/website/settings', { gate: 'siteChanges', body: '{{siteSettingsJson}}' }),
      pf('Discard FAQ draft changes', 'POST', '/website/pages/faq/discard', { gate: 'siteChanges', expect: 200 }),
      pf('Publish a page', 'POST', '/website/pages/faq/publish', { gate: 'siteChanges', expect: 200 }),
      pf('Publish header & footer', 'POST', '/website/settings/publish', { gate: 'siteChanges', expect: 200 }),
      pf('Public home content (platform)', 'PUT', '/content/home', { gate: 'siteChanges', body: { content: { title: 'Team-Flex', subtitle: 'Manage your team, projects, bugs and sprints in one place.' } } }),
    ]),
  ],
  platformGate,
);

// ---------------------------------------------------------------- 99 sessions

const finish = folder('99 · Sessions & clean-up (run last)', 'Forced password change, logout everywhere, refresh after logout.', [
  DEL('Delete team', '/teams/{{teamId}}', { expect: 200 }),
  DEL('Delete a role still in use → 409', '/roles/{{customRoleId}}', { expect: 409 }),
  PUT('Give the member back only the Member role', '/members/{{memberUserId}}/roles', { body: '{ "roleIds": [{{memberRoleId}}] }' }),
  DEL('Delete custom role', '/roles/{{customRoleId}}', { expect: 204 }),
  POST('Require everyone to change their password', '/organizations/current/security/require-password-change', { expect: 200 }),
  GET('Member is blocked → 403 PASSWORD_CHANGE_REQUIRED', '/projects', { auth: 'member', expect: 403, tests: ['pm.test("code is PASSWORD_CHANGE_REQUIRED", () => pm.expect(json.code).to.eql("PASSWORD_CHANGE_REQUIRED"));'] }),
  GET('…but /auth/me still works', '/auth/me', { auth: 'member', tests: ['pm.test("flag is set", () => pm.expect(json.data.passwordChangeRequired).to.eql(true));'] }),
  POST('Member chooses a new password', '/auth/change-password', { auth: 'member', expect: 204, body: { currentPassword: '{{password}}', newPassword: '{{password}}7' } }),
  POST('Owner chooses a new password', '/auth/change-password', { expect: 204, body: { currentPassword: '{{password}}', newPassword: '{{password}}7' } }),
  POST('Log out (revokes the refresh cookie)', '/auth/logout', { auth: 'none', expect: 204 }),
  POST('Refresh after logout → 401', '/auth/refresh', { auth: 'none', expect: 401 }),
  POST('Log out everywhere (all devices)', '/auth/logout-all', { expect: 204 }),
]);

// ---------------------------------------------------------------- write

const collectionPre = [
  '// Every request (except public ones that send their own header) talks to the active organization.',
  'const org = pm.collectionVariables.get("orgId");',
  'if (org && !pm.request.headers.has("X-Organization-Id")) pm.request.headers.add({ key: "X-Organization-Id", value: org });',
  '',
  '// Access tokens live 15 minutes. When you come back later and run single requests, log the sandbox people in again first.',
  'const at = Number(pm.collectionVariables.get("tokensAt") || 0);',
  'if (at && Date.now() - at > 13 * 60 * 1000) {',
  '  pm.collectionVariables.set("tokensAt", String(Date.now()));',
  '  const password = pm.environment.get("password") || pm.collectionVariables.get("password");',
  '  const relogin = (emailVar, tokenVar) => {',
  '    const email = pm.collectionVariables.get(emailVar);',
  '    if (!email || !pm.collectionVariables.get(tokenVar)) return;',
  '    pm.sendRequest({',
  '      url: pm.variables.get("baseUrl") + "/auth/login",',
  '      method: "POST",',
  '      header: { "Content-Type": "application/json" },',
  '      body: { mode: "raw", raw: JSON.stringify({ email, password }) },',
  '    }, (err, res) => {',
  '      if (!err && res.code === 200) pm.collectionVariables.set(tokenVar, res.json().data.accessToken);',
  '      else console.log(`re-login of ${email} failed: run "00 · Setup" again`);',
  '    });',
  '  };',
  '  relogin("ownerEmail", "accessToken");',
  '  relogin("memberEmail", "memberToken");',
  '  relogin("guestEmail", "guestToken");',
  '}',
];

const collection = {
  info: {
    name: 'Team-Flex API',
    description:
      'Every endpoint of the Team-Flex server (Express, /api), generated from server/scripts/postman/generate-postman.ts.\n\n' +
      '**How to use:** import this collection and the environment `Team-Flex · local`, select the environment, start the server (`npm run dev` in server/), then **Run collection** (Collection Runner). Folder 00 creates a fresh sandbox organization (owner + member + guest) and every later request reuses its tokens and ids.\n\n' +
      '**Auth:** Bearer `{{accessToken}}` on the collection (overridden per request for member / guest / platform / public). The header `X-Organization-Id` is added automatically. The refresh token is the httpOnly cookie `tf_refresh`, kept by Postman\'s cookie jar.\n\n' +
      '**Scenarios:** each request has a test for the expected status, so the negative cases (400 validation, 401, 403 permissions, 404, 409 conflicts) are part of the run.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] },
  event: [script(collectionPre, 'prerequest')],
  variable: [
    { key: 'baseUrl', value: 'http://localhost:5000/api' },
    { key: 'password', value: 'Sandbox@2026' },
    { key: 'allowSiteChanges', value: 'false' },
    // a deliberately wrong token for the 401 tests (a variable, so Postman's secret scanner doesn't flag it)
    { key: 'invalidToken', value: 'invalid' },
    ...['accessToken', 'memberToken', 'guestToken', 'platformToken', 'orgId', 'projectKey', 'itemKey'].map((key) => ({ key, value: '' })),
  ],
  item: [setup, auth, org, people, teams, projects, items, sprints, views, qa, errors, leave, notifications, myWork, docs, templates, trash, guests, misc, website, platform, finish],
};

const environment = {
  name: 'Team-Flex · local',
  values: [
    { key: 'baseUrl', value: 'http://localhost:5000/api', type: 'default', enabled: true },
    { key: 'password', value: 'Sandbox@2026', type: 'secret', enabled: true },
    { key: 'platformEmail', value: '', type: 'default', enabled: true },
    { key: 'platformPassword', value: '', type: 'secret', enabled: true },
    { key: 'allowSiteChanges', value: 'false', type: 'default', enabled: true },
  ],
  _postman_variable_scope: 'environment',
};

const count = (i: Item[]): number => i.reduce((n, x) => n + (x.item ? count(x.item) : 1), 0);
mkdirSync(resolve(OUT, 'files'), { recursive: true });
writeFileSync(resolve(OUT, 'Team-Flex.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n');
writeFileSync(resolve(OUT, 'Team-Flex.local.postman_environment.json'), JSON.stringify(environment, null, 2) + '\n');
// sample upload files (a 1×1 PNG and a text file)
writeFileSync(resolve(OUT, 'files/sample.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
writeFileSync(resolve(OUT, 'files/sample.txt'), 'Sample attachment uploaded by the Team-Flex Postman collection.\n');
console.log(`Postman collection: ${count(collection.item)} requests in ${collection.item.length} folders → ${OUT}`);
