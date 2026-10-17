# Team-Flex

A multi-tenant team & project management platform (projects, work items, bugs, sprints and more to come),
built as a production-style SaaS: organizations (tenants), per-organization role-based access control (RBAC),
project-level roles, a platform console for the product owner, background jobs, email, structured logging,
automated tests and an Ant Design UI.

> **Status**
> - **Phase 1 — platform foundation** ✅ accounts, organizations, RBAC, invitations, menus, content, audit, logging, error handling, UI shell
> - **Phase 2a — platform services** ✅ email service, background job queue, versioned migrations, automated tests, password reset / change
> - **Phase 2b — projects** ✅ projects, project members & roles, templates, workflows, labels, custom fields, archive
> - **Phase 2c — work items** ✅ epics / stories / tasks / bugs / sub-tasks, comments with @mentions, attachments, links, watchers, full history
> - **Phase 2d — daily work** ✅ Kanban board (drag & drop, WIP limits), backlog, list bulk edit, saved views, **Ctrl/⌘ K** palette, **real-time** updates (SSE + PostgreSQL LISTEN/NOTIFY)
> - **Phase 2e — sprints & reports** ✅ sprint planning / start / complete (carry-over), burndown, velocity, project overview (created vs resolved, workload, lead & cycle time)
> - **Phase 2f — quality** ✅ bug flow (severity vs priority, browser / OS / versions, resolution, **QA verification** pass / fail with reopen count, **duplicate detection**), **test cases & test runs** (failure → pre-filled bug), **production errors → bugs** (server 500s + browser crashes grouped, with the request's SQL; auto-resolve + regression detection)
> - **Phase 2g — dashboards, reports & leave** ✅ organization **dashboard** (my work, project health, bug trend, who's out, holidays, my leave), project **Bugs** report (opened vs closed per week, open bugs over time, **ageing** by severity, oldest bugs) and **Cycle & lead time** report, **leave management** (types, balances, half days, approvals with email, team calendar) and **holiday calendars**
> - **Phase 2h — notifications** ✅ live bell (unread count in the tab title), notification inbox, per-category preferences (in-app · email instant / daily digest), collapsing of bursts, recurring-job scheduler
> - **Phase 3a — capacity planning** ✅ sprint capacity from holiday calendars + leave + allocation %, forecast from past sprints, per-person load, "away" hints in assignee pickers and due-date warnings
> - **Phase 3b — organization insights** ✅ owner / admin view of every project and person: health with reasons (at risk · stale), work trend, workload, quality, leave, CSV export, **weekly report email** every Monday
> - **Phase 3c — people & My Work** ✅ teams, job titles, managers (who approve their reports' leave), people directory + org chart, team filters on capacity and insights, **My Work** (my items by due date, QA queue, leave to approve, mentions)
> - **Phase 3d — Help Center** ✅ product guide at `/guide` written by the platform owner (sections, markdown articles, draft / published, all or selected organizations, "admins only" articles), search, "Open this page", permission `guide.view` (owners can hide it from a role), **Getting started** checklist for owners / admins, "?" links on the main pages
> - **Phase 3e — security, plans & guests** ✅ password & session rules per organization (minimum length, symbol, sign-out after inactivity, maximum session length, "ask everyone for a new password"), **plans** with member / guest / project limits enforced on the server (Platform → Plans), **guest access** for outside collaborators who see only the projects they are invited to — with Help Center articles for each
> - **Phase 3f — everyday work** ✅ **checklists** in items (progress on cards), **templates** per project (+ **repeating** every weekday / week / month), **trash** for items, docs and projects (restore within 30 days), project **docs** (wiki pages with history and search), **calendar** of due dates, sprints and absences (drag to reschedule) — also in My Work
> - **Phase 4a — public website** ✅ **Home**, **Features** and **Pricing** pages built from sections (hero slider, feature grid, image + text rows, numbers, logos, testimonials, pricing from Plans, FAQ, text, call to action), header & footer, image library — all edited by the platform owner in **Platform → Website** with draft → preview → publish. Own module: `server/src/modules/website`, `client/src/website`
> - **Phase 4b — Contact, FAQ, legal** ✅ **Contact** page with a contact-form section → **Inquiries inbox** (status, internal notes, replies by e-mail, spam), automatic e-mails to the sender and the platform admins, bot protection without external services; **FAQ** page; **Privacy** and **Terms** templates (unpublished until reviewed) shown in the footer links once published
> - Next: releases & roadmap · time tracking · integrations (see [roadmap](#18-roadmap))
>
> 📘 **New to the code?** Read the learning guides — **[PHASE-2.md](PHASE-2.md)** (2a–2c) and **[PHASE-2D-2E.md](PHASE-2D-2E.md)** (boards, realtime, sprints, reports) , **[PHASE-2F.md](PHASE-2F.md)** (bug flow, test management, production errors), **[PHASE-2G.md](PHASE-2G.md)** (dashboards, reports, leave & holidays) , **[PHASE-2H-3A.md](PHASE-2H-3A.md)** (notifications, capacity planning) , **[PHASE-3B.md](PHASE-3B.md)** (organization insights) , **[PHASE-3C.md](PHASE-3C.md)** (teams, managers, My Work) , **[PHASE-3D.md](PHASE-3D.md)** (Help Center) , **[PHASE-3E.md](PHASE-3E.md)** (security rules, plans, guests) , **[PHASE-3F.md](PHASE-3F.md)** (checklists, templates, trash, docs, calendar) , **[PHASE-4A.md](PHASE-4A.md)** (public website) and **[PHASE-4B.md](PHASE-4B.md)** (contact form, inquiries, FAQ, legal pages): how it works inside, why, and where to look.

---

## Table of contents

1. [Tech stack](#1-tech-stack)
2. [Quick start](#2-quick-start)
3. [Project structure](#3-project-structure)
4. [Architecture](#4-architecture)
5. [Multi-tenancy](#5-multi-tenancy)
6. [Authentication, sessions & passwords](#6-authentication-sessions--passwords)
7. [RBAC — organization roles & permissions](#7-rbac--organization-roles--permissions)
8. [Projects & project roles](#8-projects--project-roles)
9. [Work items](#9-work-items)
10. [Database & migrations](#10-database--migrations)
11. [Background jobs & email](#11-background-jobs--email)
12. [API reference](#12-api-reference)
13. [Frontend](#13-frontend)
14. [Logging & observability](#14-logging--observability)
15. [Testing](#15-testing)
16. [Configuration (.env)](#16-configuration-env)
17. [How to add a new module](#17-how-to-add-a-new-module)
18. [Roadmap](#18-roadmap)
19. [Change log](#19-change-log)

---

## 1. Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js 24, Express 5, TypeScript, ES modules |
| Database | PostgreSQL 15+ (developed on 18; driver `pg`, raw SQL — no ORM) |
| Validation | Zod 4 |
| Auth | JWT access token (`jsonwebtoken`) + rotating refresh token in an httpOnly cookie, `bcryptjs` |
| Security | `helmet`, `cors`, `express-rate-limit`, `cookie-parser` |
| Jobs | Own PostgreSQL job queue (`FOR UPDATE SKIP LOCKED`) |
| Email | Nodemailer (drivers: outbox / ethereal / smtp) |
| Uploads | Multer → storage layer (local disk, S3-ready interface) |
| Logging | Winston 3 + `winston-daily-rotate-file` |
| Tests | Vitest + Supertest (server), Vitest (client) |
| Frontend | React 19, Vite 8, TypeScript, React Router 7 (data router) |
| UI | Ant Design 6 + `@ant-design/icons`, `react-markdown`, `dayjs` |
| HTTP client | Axios (one central instance with interceptors) |

> PostgreSQL **15 or newer** is required: work items use `ON DELETE SET NULL (column)` foreign keys.

---

## 2. Quick start

### Prerequisites
- Node.js 20+ (developed on 24)
- PostgreSQL 15+ running locally

### Setup

```powershell
# 1. Server
cd server
npm install
copy .env.example .env        # then edit DB_PASSWORD and JWT_SECRET
npm run db:init               # creates the database, tables, master data and runs migrations

# 2. Client
cd ../client
npm install
```

Generate a strong `JWT_SECRET`:
```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Run (two terminals)

```powershell
cd server; npm run dev        # API + background worker on http://localhost:5000
cd client; npm run dev        # UI on http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://localhost:5000`, so the refresh cookie is same-origin.

### First account
Open http://localhost:5173 → **Sign up** with an organization name.
**The very first account on a fresh database becomes the Platform Admin** (product owner) and the
owner of its organization. Every later sign-up creates its own organization or joins one through an invitation.

**Emails in development** never leave your machine (`EMAIL_DRIVER=outbox`): open **Platform → Mailbox**
to read welcome, invitation and password-reset emails.

### Scripts

| Where | Command | What it does |
|---|---|---|
| server | `npm run dev` | API + job worker with auto-reload (`tsx watch`) |
| server | `npm run build` / `npm start` | Compile to `dist/` / run the build |
| server | `npm test` / `npm run test:watch` | Run the API test suite (separate test database) |
| server | `npm run db:init` | Create DB if missing, apply `schema.sql`, run pending migrations (safe, idempotent) |
| server | `npm run db:status` | List migrations and whether they are applied |
| server | `npm run db:new -- <name>` | Create `migrations/NNNN_<name>.sql` |
| server | `npm run db:reset` | **Drops everything** and recreates (refused when `NODE_ENV=production`) |
| client | `npm run dev` / `npm run build` | Vite dev server / type-check + production build |
| client | `npm test` / `npm run lint` | Unit tests / ESLint |

---

## 3. Project structure

```
Team-Flex/
├── README.md
├── server/
│   ├── .env / .env.example
│   ├── vitest.config.ts             # tests run against the team_flex_test database
│   ├── tests/                       # unit/ (pure functions) and api/ (HTTP, real database)
│   ├── backups/  logs/  uploads/    # git-ignored
│   └── src/
│       ├── main.ts                  # bootstrap, job worker, graceful shutdown, crash handlers
│       ├── app.ts                   # express app + global middleware
│       ├── routes.ts                # mounts every module under /api
│       ├── config/env.ts            # typed environment
│       ├── database/
│       │   ├── schema.sql           # ★ ALL tables + ALL master data (single source of truth)
│       │   ├── migrations/          # ★ one-time changes: NNNN_name.sql
│       │   ├── migrate.ts           # migration runner (checksums, transactions)
│       │   ├── init.ts              # db:init / db:reset / db:status / db:new
│       │   ├── db.ts                # pg pool + withTransaction()
│       │   └── query-logger.ts      # times & records every SQL query per request/job
│       ├── jobs/                    # queue.ts (enqueue), worker.ts (SKIP LOCKED worker), index.ts (handlers)
│       ├── common/
│       │   ├── constants/rbac.ts    # ROLES, PERMISSIONS, ORGANIZATION_HEADER
│       │   ├── exceptions/          # HttpException, NotFound/Forbidden/... exceptions
│       │   ├── logger/              # winston logger, console format (HTTP + jobs), SQL formatter
│       │   ├── middleware/          # auth, tenant, permission, validate, rate-limit, request-id, http-logger, error
│       │   ├── storage/storage.ts   # file storage interface (local disk now, S3 later)
│       │   ├── types/               # AuthUser, TenantContext
│       │   └── utils/               # audit(), tokens, password, pagination, request-context
│       └── modules/                 # NestJS-style feature modules
│           ├── auth/                # register, login, refresh, logout, me, switch org, passwords
│           ├── email/               # templates, transport drivers, queueEmail(), email.send job
│           ├── organizations/       # create org (self-serve), settings, leave
│           ├── members/  invitations/  roles/  permissions/  rbac/
│           ├── projects/            # projects, members, templates, workflow, labels, custom fields, access
│           ├── work-items/          # items, comments, attachments, links, events (history), move / bulk
│           ├── sprints/             # sprint lifecycle (plan, start, complete, carry-over)
│           ├── reports/             # burndown (replayed from history), velocity, overview, quality (bugs, ageing, cycle time)
│           ├── saved-views/         # named filter sets for list / board
│           ├── realtime/            # SSE streams + PostgreSQL LISTEN/NOTIFY hub
│           ├── qa/                  # test suites, test cases, test runs, bug from failure
│           ├── errors/              # production error capture (fingerprints), inbox, error → bug
│           ├── leave/               # leave types, holiday calendars, balances, requests & approvals, team calendar
│           ├── notifications/       # notify(), bell API, preferences, email + daily digest jobs
│           ├── capacity/            # sprint capacity (leave + holidays + allocation), forecast, availability
│           ├── insights/            # organization insights, CSV export, weekly report job
│           ├── people/              # directory, job titles, managers (no loops), teams
│           ├── guide/               # Help Center: reading, search, getting-started checklist, platform authoring
│           ├── security/            # password & session rules per organization (strictest of all memberships)
│           ├── plans/               # plans, usage and limit checks (members, guests, active projects)
│           ├── templates/           # item templates + repeating (job work-items.recurring)
│           ├── pages/               # project docs: pages, versions, search
│           ├── trash/               # trash for items / pages / projects + nightly purge (job trash.purge)
│           ├── calendar/            # month view data (project and My Work)
│           ├── website/             # public website: pages of sections, draft → publish, header & footer, images
│           ├── my-work/             # "My Work": assigned items, QA queue, leave to decide, mentions
│           ├── dashboard/           # the organization dashboard (one aggregated request)
│           ├── content/  audit-logs/  menus/  client-errors/
│           └── platform/            # product-owner console + mailbox + jobs
│
└── client/
    ├── vitest.config.ts
    └── src/
        ├── router.tsx               # every route + guard
        ├── auth/  config/  theme/  layouts/  components/  hooks/  types/
        ├── lib/api.ts               # ★ the only API entry point (get/post/put/patch/delete/upload/blob)
        ├── lib/realtime.ts          # one live (SSE) connection per tab
        ├── services/                # auth / organization / platform / projects API calls
        ├── __tests__/               # client unit tests
        ├── website/                 # ★ public website, separate from the app: routes.tsx, public/ (layout, page),
        │                            #   sections/ (one component per section type), admin/ (Platform → Website editor)
        └── pages/
            ├── public/              # Login, Register, Invite, Forgot / Reset password
            ├── dashboard/           # Dashboard, Profile (name, password, sessions)
            ├── org/                 # members, roles, announcement, audit, settings
            ├── projects/            # ProjectsPage, ProjectShell, board/, backlog/, items/ (list), item/, tests/, reports/, settings/, shared/
            ├── errors/              # production error inbox + detail (also used by the platform console)
            ├── leave/               # my leave, team calendar, approvals, leave & holiday settings
            ├── notifications/       # inbox + notification settings (the bell lives in components/)
            ├── platform/            # overview, orgs, users, menus, home, audit, mailbox, jobs
            └── index.ts             # lazy-loaded page exports
```

---

## 4. Architecture

### Request lifecycle (server)

```
helmet → cors → express.json → cookieParser
  → requestId        (X-Request-Id, per-request async context)
  → httpLogger       (logs request/response + all SQL of the request)
  → /api routes:
       authenticate          verify JWT, load the global account (must be active)
       requireOrganization   X-Organization-Id → verify active membership → req.tenant
       requirePermission(…)  organization permission (owners always pass)
       validateBody(zod)
       controller → service  (project access: getProjectAccess → project role)
                 → db (pool or transaction) → enqueue(job) inside the same transaction
  → notFoundHandler → errorHandler (HttpException / ZodError / Multer / 500 with requestId)

background worker (same process): jobs table → handler → logs as "JOB" lines with their SQL
```

### Layering rules
- **Routes** wire middleware + controller. **Controllers** translate HTTP ↔ service calls.
  **Services** hold business rules and SQL; they receive a `RequestContext` (user, tenant, ip), never `req`.
- Every response is `{ success: true, data }` or `{ success: false, message, errors? }`.
- Throw `NotFoundException`, `ForbiddenException`, … from services; the error handler maps them.
- Slow / external work (email, …) goes to the **job queue**, never inside the request.

### Access levels

| Level | Who | Routes | UI |
|---|---|---|---|
| Public | anyone | `/auth/*` (login, register, passwords), `/content/public/*`, `/invitations/token/*`, `/client-errors` | `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/invite/:token` |
| Organization | members of the active org | `/members`, `/roles`, `/projects`, `/work-items`, … | `/dashboard`, `/projects/*`, `/org/*` |
| Project | depends on the project role | everything under a project / work item | `/projects/:key/*` |
| Platform | platform admins | `/platform/*` | `/platform/*` |

---

## 5. Multi-tenancy

**Model: shared database, shared tables, `organization_id` on every tenant-owned row**
(the model used by Slack, Jira Cloud, Notion).

- **Users are global**; **memberships** link them to organizations with per-organization roles.
- **Active organization** is sent as `X-Organization-Id` on every request; the server remembers the last one.
- **Tenant boundary**: `requireOrganization` verifies an active membership of an active organization.
- **Services always filter by the verified organization** — never by an id from the body/URL.
- **Database-enforced integrity**: composite foreign keys (e.g. `(project_id, organization_id) → projects(id, organization_id)`)
  make it impossible for a row to point at another organization's project, role, status, label or item.
  Assignees, watchers and project members must be members of the same organization.
- **Self-serve signup**, **invitations by email**, **suspension** by the platform admin.
- **Verified by tests** (`tests/api/tenancy.test.ts`): cross-org reads, cross-org role ids, projects and items
  of another organization are 404.

> **Not yet**: PostgreSQL Row-Level Security. See [roadmap](#18-roadmap).

---

## 6. Authentication, sessions & passwords

| Item | Implementation |
|---|---|
| Passwords | bcrypt (12 rounds), 8–72 chars, letter + number; constant-time login for unknown emails |
| Access token | JWT HS256, **15 min**, `Authorization: Bearer`, kept **in memory only** on the client |
| Refresh token | Random 48-byte token, httpOnly **SameSite=Strict** cookie `tf_refresh` (path `/api/auth`), **7 days**, stored as SHA-256 |
| Rotation & reuse detection | Each refresh rotates the token; reusing a revoked one revokes **all** sessions of the user |
| Live checks | Account / membership / permissions re-read on every request |
| **Forgot password** | `POST /auth/forgot-password` → same answer whether or not the email exists (no enumeration); emails a link valid **60 min**, single use; only the newest link works |
| **Reset password** | `GET /auth/reset-password/:token` (validity + masked email) → `POST /auth/reset-password` → all sessions revoked + "password changed" email |
| **Change password** | `POST /auth/change-password` (needs current password) → other devices signed out, this one kept, notification email |
| Profile | `PATCH /auth/me` (name) |
| Rate limits | login / register / reset: 20 per 15 min · forgot-password: 5 per 15 min · invitation links: 60 per 15 min (disabled in tests) |

---

## 7. RBAC — organization roles & permissions

- **Permission** = `<module>.<action>` (`users.read`). Defined in `schema.sql`, mirrored in
  `server/src/common/constants/rbac.ts` and `client/src/config/permissions.ts`.
- **Role templates** (`role_templates`) are copied into every new organization; each organization edits its own **roles**.
- **Owners** implicitly have every organization permission. **Platform admin** is a separate level above organizations.

### Permissions (23)

| Module | Permission | Meaning |
|---|---|---|
| dashboard | `dashboard.view` | View the dashboard |
| members | `users.read` · `users.invite` · `users.update` · `users.remove` · `users.assign_roles` | View / invite / (de)activate / remove members / assign roles |
| roles | `roles.read` · `roles.create` · `roles.update` · `roles.delete` | Manage roles and their permissions |
| organization | `content.manage` · `audit.read` · `organization.manage` | Announcement · audit log · settings |
| projects | `projects.create` | Create projects |
| projects | `projects.manage_all` | Admin access to **every** project, including private ones |
| errors | `errors.read` · `errors.manage` | View production errors (stack traces, requests, SQL) · resolve / ignore them and turn them into bugs |
| organization | `insights.view` | Organization insights: every project, people, workload, quality — and the weekly report email |
| organization | `guide.view` | Read the Help Center (product guide) — every role by default; remove it from a role to hide the guide |
| members | `people.view` | See the people directory, teams and org chart — every role except Guest |
| leave | `leave.request` · `leave.approve` · `leave.manage` | Request leave, own balances, team calendar · approve / reject the organization's requests · leave types, allowances, holiday calendars |

### Default role templates

| Role | Permissions |
|---|---|
| **Owner** | all (bypass in code) |
| **Admin** | dashboard, all `users.*`, `roles.read`, `roles.create`, `content.manage`, `audit.read`, `projects.create`, `projects.manage_all`, `errors.*`, `leave.*`, `insights.view`, `guide.view`, `people.view` |
| **QA** · **Developer** | `dashboard.view`, `errors.read`, `errors.manage`, `leave.request`, `guide.view`, `people.view` (project access comes from **project roles**) |
| **Member** | `dashboard.view`, `leave.request`, `guide.view`, `people.view` |
| **Guest** | `guide.view` — given only by a **guest invitation**; can't be assigned like other roles. Projects come from project membership only |

### Server-enforced rules
- No changing your own roles/status; at least one active owner; only owners manage owners.
- **No privilege escalation**: non-owners cannot grant permissions (or roles containing them) they don't have.
- System roles cannot be deleted; custom roles cannot be deleted while assigned; the Owner role is not editable.

---

## 8. Projects & project roles

A project belongs to one organization and has a **key** (`TF`) used in item numbers (`TF-123`).

### Effective project role (decided in one place: `projects/project-access.ts`)

| Who | Role | Can |
|---|---|---|
| Organization owner / `projects.manage_all` | **admin** | everything, in every project (also private) |
| Project member with role `admin` | **admin** | settings, members, workflow, labels, fields, archive |
| Project member with role `member` | **member** | create / edit work items, labels, comments, attachments, links |
| Project member with role `viewer`, **or** any org member on an *organization-visible* project | **viewer** | read, comment, react, watch |
| Anyone else on a *private* project | — | the project is a **404** (its existence is not revealed) |

- **Visibility**: `organization` (everyone can view) or `private` (members only).
- **Templates** (`projects/project-templates.ts`): **Kanban**, **Scrum**, **Bug tracking**, **Blank** — each seeds
  statuses (and labels). Bug tracking: Open → In Progress → Ready for QA → **Verified** (only `qa` / `admin` / `owner`) · Reopened · Won't Fix.
- **Workflow**: ordered statuses with a **category** (`todo` / `in_progress` / `done`), a colour and optional
  **restricted roles** (organization role names allowed to move items *into* that status).
  Deleting a status with items requires choosing where to move them.
- **Labels** (coloured, per project; members can create, admins rename/delete) and **custom fields**
  (text, number, date, single/multi select, checkbox; optional *required*). Deleting a field removes its value from all items.
- **Lifecycle**: archive (read-only) → restore, or delete permanently (org admins only, archived projects only; files are removed).
- **Rules**: keys unique per organization; a project always keeps at least one project admin; removing someone
  from the organization removes them from its projects (database cascade).

---

## 9. Work items

**One model for every kind of work** (`work_items.type`): `epic` › `story` / `task` / `bug` › `subtask`.

| Feature | Details |
|---|---|
| Numbering | Sequential **per project** (`TF-1`, `TF-2` …) using a row lock on the project — never duplicates |
| Lookup | By id or key: `/work-items/TF-12` |
| Hierarchy | story / task / bug may sit under an epic; sub-tasks **must** have a story / task / bug parent; type changes are validated against parent and children |
| Fields | title, markdown description, status, priority (urgent → none), severity (bugs), assignee, reporter, due date, estimate, labels, custom fields |
| Bug details | steps to reproduce, expected result, actual result, environment |
| Workflow | moving into a restricted status needs one of its roles (or project admin); `done` statuses set `completed_at` |
| Assignees | must be active org members who can access the project (private → project members) |
| **History** | every change → `work_item_events` (field, old value, new value, actor, time) — powers the History tab and future reports / AI |
| Comments | markdown, **@mentions** (stored as `@[Name](user:12)`), edit (author), delete (author / project admin), **reactions** 👍 ❤️ 🎉 … |
| Watchers | reporter, assignee, commenters and mentioned people watch automatically; watch / unwatch manually (notifications arrive in phase 2g) |
| Links | blocks / is blocked by, duplicates / is duplicated by, relates to — across projects of the organization; wording computed per side |
| Attachments | up to `MAX_UPLOAD_MB` (10 MB) per file; stored under `uploads/org-<id>/YYYY/MM/<uuid>`; downloads go through the API with an access check; only safe types (images, PDF, text) are shown inline |
| Search | full-text (`tsvector`, title weighted over description) + key/number match; org-wide quick search for linking |
| Filters | type, status, category, assignee (`me`, `none`, ids), priority, label, parent; sort by number / priority / due / updated |
| Delete | reporter or project admin; attachments' files are removed too |
| Sprint | `sprint_id` (null = backlog); sub-tasks follow their parent's sprint; every move is in history (field `sprint`) |
| Order (`rank`) | a double per item; a drop between two items takes the midpoint, the project is re-spaced (1024, 2048 …) when gaps run out |

### Boards, backlog & views (2d)

| Feature | Details |
|---|---|
| **Board** | one column per status; drag to change status / order (`POST /work-items/:ref/move` with `prevId` / `nextId`); restricted statuses still apply; quick-add per column; epics are not cards; Scrum projects show the **active sprint** by default |
| **WIP limits** | `project_statuses.wip_limit` — the column turns red when exceeded (a soft limit: it warns, never blocks) |
| **Backlog** | active sprint, planned sprints and the backlog as stacked sections; drag between them / re-order to prioritise; points per section; create / edit / start / complete / delete sprints |
| **List** | the table view with a sprint filter + column, **row selection and bulk edit** (status, assignee, priority, sprint, add label) — one request, all-or-nothing, history per item |
| **Saved views** | named filter sets for list / board, private or shared with the project (`saved_views`); a view is just the page's URL query |
| **Ctrl / ⌘ K** | command palette: work items (key `TF-12` or text), projects, project tabs, pages from the sidebar, dark-mode toggle, recent items |

### Real-time (2d)
Browser `EventSource` ← `GET /api/realtime/stream?ticket=…` (Server-Sent Events). The ticket comes from
`POST /api/realtime/ticket` (normal auth) because EventSource cannot send headers; it is a 60-second JWT with its own
audience, useless as an access token. Services call `publishItems()` / `publishSprints()` after commit →
`pg_notify('tf_events', …)` → **every** API instance (LISTEN) forwards the event to its streams that may see the project
(same access rule as the API). Events carry ids only; pages re-fetch through the normal API. Heartbeat every 25 s,
membership re-checked every ~4 min, max 10 streams per user, `resync` after a reconnect. The header shows **Live / Connecting / Offline**.

### Sprints & reports (2e)

| Feature | Details |
|---|---|
| Lifecycle | `planned → active → completed`; **one active sprint per project** (partial unique index `uq_sprints_one_active`) |
| Start | dates default to today + 2 weeks; snapshot `committed_points / committed_count` |
| Complete | snapshot `completed_points / completed_count`; unfinished items (and sub-tasks) move to the backlog or a planned sprint |
| History | completed sprints keep their dates and cannot be deleted; deleting a planned / active sprint returns its items to the backlog |
| Points | sum of `estimate`; **sub-tasks are not counted** (no double counting) |
| **Burndown** | replayed from `work_item_events`: value at time T = the old value of the first change after T (else the current value) → remaining, scope and ideal per day; completed / not completed items; scope added / removed after the start |
| **Velocity** | committed vs completed for the last 7 completed sprints, average, say/do ratio |
| **Overview** | totals (open, done, overdue, unassigned), created vs resolved per day (14 / 30 / 90 days), items by status / type / priority, workload per person, lead time (created → done) and cycle time (first move out of "to do" → done), median and average |

### Bug flow (2f)

| Feature | Details |
|---|---|
| Fields | **severity** (impact: critical → trivial) separate from **priority** (urgency); environment, **browser, OS, found-in / fixed-in version**, steps to reproduce, expected vs actual; "Use my browser" fills browser / OS |
| Resolution | `fixed` · `duplicate` · `wont_fix` · `cannot_reproduce` · `by_design` — a bug reaching a *done* status becomes **Fixed** automatically, reopening clears it |
| **QA verification** | per project: *waiting for QA* → **Pass** (→ passed status, fixed-in version) or **Fail** (→ failed status, reason posted as a comment, `reopen_count + 1`). Verdicts need the rights of the passed status (Bug tracking template: QA / admin / owner). Configured in Settings → Workflow; Bug tracking projects get Ready for QA → Verified / Reopened |
| **Duplicate detection** | while typing a title: trigram similarity (`pg_trgm` — typos, word order) + full-text on any word → "Possible duplicates"; **Close as duplicate** links the items, sets resolution and moves watchers to the original |

### Test management (2f)

| Feature | Details |
|---|---|
| Test cases | `TC-1, TC-2 …` per project, suites (folders), preconditions, numbered steps (action + expected), priority, type (functional, regression, smoke …), status (draft / ready / deprecated), **covers** a story → the story shows its test coverage and last results |
| Test runs | a set of READY cases (all / suites / picked), optional sprint, environment and build; cases are **snapshotted** — editing or deleting a case never changes past runs |
| Execution | per-step pass / fail / blocked (a failed step fails the case), overall result, notes; keyboard **P F B S** and **J K**; live for several testers; progress & pass rate; complete / reopen |
| **Failure → bug** | one click: steps to reproduce = preconditions + steps up to the failing one, expected = that step's expected result, actual = the tester's notes, environment / found-in version from the run; linked both ways |

### Production errors → bugs (2f)
Every unexpected **server error (HTTP 500)** and every **browser crash** (error boundary, `window.onerror`, unhandled promise) is
captured into `error_groups` by **fingerprint** (type + normalized message + top stack frame + route, so ids, line numbers and
bundle hashes don't split groups). Each occurrence keeps its **request id** (→ `logs/http-*.log`), user, release, user agent and —
for server errors — **the SQL the request ran** (from the SQL logger). Inbox: **Production Errors** (`errors.read`), platform-wide
under Platform → All Errors. **Create bug** pre-fills a bug (occurrences, route, release, request id, stack; browser / OS from the UA).
When the linked bug is **done**, the error is resolved; if it **happens again** it re-opens as a **regression** and the bug's history says so.
Browser crashes are attributed to an organization only if the reporter is a member of it.

### Dashboards & reports (2g)

| Where | What |
|---|---|
| **Dashboard** (`/dashboard`) | tiles (assigned to me, overdue, due this week, leave to approve / unresolved errors), **my work** (due soonest first), **bugs opened vs closed per week** across my projects, **project health** (open, bugs, overdue, done in 7 days), **team & leave** (who's out this week, my balances, upcoming holidays) — one request, respects project access |
| Project → Reports → **Bugs** | opened vs closed per week, open bugs at the end of each week, **ageing of open bugs** by severity (0–7 / 8–30 / 31–90 / 90+ days), oldest open bugs |
| Project → Reports → **Cycle & lead time** | median lead time (created → done) and cycle time (started → done) per week, cycle time distribution, period medians / averages |
| Project → Reports → Overview | (2e) status breakdown, workload per person, created vs resolved per day |

Charts follow the validated palette: two series blue / orange; severity is **ordered**, so it uses one blue ramp (darker = more severe, its own dark-mode steps); every chart has a table view.

### Leave & holidays (2g)

| Feature | Details |
|---|---|
| Leave types | per organization, copied from `leave_type_templates` (Annual 20, Sick 10, Casual 6, Unpaid ∞, Work from home ∞ auto-approved); colour, paid, yearly allowance (or unlimited), half days, approval required; types with history are deactivated, not deleted |
| Holiday calendars | name, **weekend days** (e.g. Fri + Sat), holidays (optional ones don't count as days off); one default calendar; members can be assigned another calendar; holidays can be pasted as `YYYY-MM-DD, Name[, optional]` lines |
| Requesting | range or half day (morning / afternoon); **cost = working days** of the person's calendar; live preview (skipped weekends / holidays, balance after, teammates away); one balance year per request |
| Balances | available = allowance (per-person override or type default) + carried over − approved − pending; limited types can't go negative (checked under an advisory lock) |
| Rules in the database | `EXCLUDE USING gist (user_id WITH =, daterange(start, end) WITH &&) WHERE status IN ('pending','approved')` — no overlapping leave even with simultaneous requests (`btree_gist`) |
| Approvals | `leave.approve` (or owner); nobody decides their own leave except an owner; reject needs a reason; approvers are **notified** on request and the person on decision / cancellation (bell + email per their preferences) |
| Cancelling | the person: pending, or approved leave that hasn't started; approvers: any pending / approved |
| Team calendar | month grid (person × day): weekends per calendar, holidays, pending (dashed), half days; **leave types hidden** ("Out of office") unless you are the person or an approver |

### Notifications (2h)

| | |
|---|---|
| Triggers | **assigned** (create / edit / bulk), **mentioned**, **commented** + **status changed** on items you watch, **QA passed / failed** (assignee + reporter), **leave** requested / approved / rejected / cancelled, **new production error** and **regression** (people with `errors.manage`, + the bug's watchers) |
| Rules | never about your own actions; only active members; created **inside the transaction** of the change (`notify(client, …)`) so they commit or roll back with it |
| Collapsing | the same kind of unread notification on the same item within 30 minutes is updated (count + latest text) instead of adding rows — 5 comments = 1 notification "(+4)" |
| Preferences | per person, organization and category (assignments, mentions, watched items, QA, leave, errors): in-app on/off, email **off / instant / daily digest**; defaults in `notification-types.ts` |
| Instant email | job `notifications.email`, delayed `NOTIFY_EMAIL_DELAY_SECONDS` (60) and **skipped if already read in the app**; generic `notification` template |
| Daily digest | job `notifications.digest` started by the **recurring-job scheduler** (`job_schedules`, 08:00 DB time) — one email per person with everything unread and `daily` |
| Live | `pg_notify` on the transaction client → delivered on COMMIT → the realtime hub sends a `notifications` event **only to the recipients**; the bell refreshes; unread count in the tab title "(3) Team-Flex" |

### Organization insights (3b)

`/org/insights` (permission `insights.view`: owners and Admin by default) — unlike the personal dashboard it covers **every** project, including private ones (counts and names, never item contents).

| Block | What |
|---|---|
| Tiles | members (joined / invited / deactivated), active people (7 days and period — sign-ins, session refreshes, activity), projects (at risk / stale / archived), open & overdue work, done in period, open bugs (critical, reopened by QA), production errors (new, regressions), out today + pending leave approvals |
| Project health | per project: open, overdue, open / critical bugs, created & done in the period, last activity, lead, members → **At risk** (critical bugs, ≥ 5 or ≥ 25 % overdue) · **Stale** (open work, no activity for 14 days) · Healthy · Idle — always with the reason |
| Trend | items created vs completed per week, 12 weeks, all projects |
| Workload | per person across all projects: open, in progress, overdue, open points, projects, done in the period, last active, leave in the next 14 days |
| Quality | open bugs by severity (ordered colour ramp), bugs opened / closed / reopened, unresolved / new / regressed errors, test pass rate |
| Leave | away this week, leave taken this year by type (types only for approvers / leave managers) |
| Export | CSV of projects and workload (UTF-8 for Excel; cells starting with `= + - @` are neutralized against formula injection) |
| **Weekly report** | job `insights.weekly-report` every **Monday 08:00** (`job_schedules`): last week's numbers, projects needing attention, most loaded people, who is away, pending approvals — to everyone with `insights.view` who keeps the "Weekly organization report" setting on; "Email me the weekly report" sends a preview now |
| Period | 7 / 30 / 90 days |

### Contact, inquiries, FAQ & legal pages (4b)

| | |
|---|---|
| **Pages** | `/contact` (contact form + "before you write" FAQ) · `/faq` (four groups of questions + CTA) — live and in the menu · `/privacy`, `/terms` — **templates with [placeholders], not published** until the platform owner reviews and publishes them |
| **Contact form section** (`contact_form`) | topics (question, demo, sales, support — choose which, first = default; `/contact?type=demo` pre-selects), optional company / team size / phone, thank-you message, contact details next to the form (icon, label, text, link); inside the editor's preview it sends nothing |
| **On submit** (`POST /api/website/inquiries`, no login) | stored in `website_inquiries` · "we received your message" e-mail to the sender · "new inquiry" e-mail to every platform admin with a link straight to it |
| **Bots** | hidden "website" field + time to fill in (< 2.5 s) → stored as **spam**, nobody e-mailed, the bot still sees "thank you" · 5 messages per IP per 15 minutes |
| **Inquiries inbox** (Website → Inquiries, badge = new) | filter Open / New / Replied / Closed / Spam / All, topic, search · a message: details, **reply by e-mail** (original quoted, kept in a timeline, optionally close), status, **internal notes**, delete |
| **Footer links** | each page has "In the footer links"; the published ones (Privacy, Terms) appear at the bottom of every page |

### Public website (4a)

| | |
|---|---|
| **Pages** | `/` Home, `/features`, `/pricing` — each a list of **sections**; visitors need no account |
| **Section types** | hero **slider** (slides with headline, text, image, two buttons; auto-slide seconds) · feature grid (icon, title, text, 2–4 columns) · image + text rows (alternating, bullets) · numbers · logo strip · testimonials · **pricing** (cards per plan: price, period, badge, highlight, features; **name and limits live from Platform → Plans**) · FAQ · text (markdown) · call to action |
| **Platform → Website** (platform admins only) | per page: add a section (anywhere), edit it in a form, drag to reorder, hide / show, duplicate, delete; page settings (menu label, in the menu, order, Google title & description); **live preview** + full-page preview; **Publish** / **Discard** · **Header & footer**: brand name, logo, announcement bar, header buttons, footer columns and links, copyright (`{year}`) — draft → publish too · **Images**: upload (PNG / JPG / WebP / GIF ≤ 5 MB, content checked by its bytes), alt text, delete (refused while used anywhere, published versions included) |
| **Draft → publish** | editing changes `website_sections` / `website_settings.draft`; **Publish** copies them into a snapshot (`website_pages.published`, `website_settings.published`) — the only thing visitors read; **Discard** restores the draft from the snapshot |
| **Safety** | every section's content is validated per type (Zod); links only `/path`, `https://`, `mailto:` or `#anchor` (no `javascript:`); markdown without raw HTML; images must exist in the library |
| Without images | heroes and image rows show a **drawn product preview** (board / QA / chart / calendar) that follows light and dark mode |
| Starting content | written as master data in `schema.sql` (inserted once; the platform owner's edits are never overwritten); testimonials and logos start **hidden** with placeholders — real customer quotes only |

### Checklists, templates, trash, docs & calendar (3f)

| | |
|---|---|
| **Checklists** | steps inside an item (add with Enter, tick, rename, drag to reorder, delete); anyone who can edit the item; cards and lists show **☑ done/total** (`ITEM_SELECT.checklist`) |
| **Templates** (Project → Settings → Templates, project admins) | name, type, title (`{date}` placeholder), description, priority, labels, checklist; **Create → Use a template** fills the form and adds the checklist |
| **Repeating** | a template can repeat **every weekday**, **weekly** (a day) or **monthly** (day 1–28) with an assignee and "due N days later"; the hourly job `work-items.recurring` claims each due template (`FOR UPDATE SKIP LOCKED`, next date set in the same transaction → never twice) and creates the item **as the template's author**; after downtime only one item is created; if the author can't edit the project any more the repetition **pauses** (saving the template restarts it and makes you the author) |
| **Trash** | deleting an item (with its sub-items), a doc page (with sub-pages) or an archived project only sets `deleted_at` — every query skips it (`ITEM_SELECT` join condition, `resolveItem`, `getProjectAccess`, `ACCESSIBLE_PROJECT_SQL`, reports, insights, dashboard, sprints, capacity …). **Project → Trash**: restore (project admins anything, others what they deleted; a batch comes back together; a child whose parent is still in the trash can't be restored alone) · delete for good (project admins). **Projects → Trash** (organization project admins): restore (comes back archived) or delete for good. Job `trash.purge` removes everything older than **30 days** at 03:00, with files |
| **Docs** (project tab) | markdown pages + sub-pages (no loops), members write / viewers read; every save is a **version** (last 100), view and **restore** older ones; **conflict check** (`baseUpdatedAt` → 409 `PAGE_CHANGED`, the draft is kept); full-text **search** with snippets |
| **Calendar** (project tab + My Work → Calendar) | month grid (Monday first): items on their due date (done faded), sprints as bands, 🌴 who is away (approved / pending), 🎉 holidays; **drag an item** to another day = new due date (if you can edit); live |

### Security rules, plans & guests (3e)

| | |
|---|---|
| **Security** (Organization → Settings, `organization.manage`) | minimum password length (8–64; a letter and a number always), require a symbol · **sign out after inactivity** (30 min … 24 h) · **maximum session length** (8 h … 1 week) · "ask everyone to set a new password" · audited |
| One account, many organizations | an account follows the **strictest** rules of all its active memberships (`accountPolicy`) |
| When passwords are checked | on every new password (invitation sign-up, change, reset) · at **sign-in** (the only moment the plain password is seen): too weak → `users.password_change_required` → every API call except `/api/auth/*` answers **403 `PASSWORD_CHANGE_REQUIRED`**, and the app shows a "choose a new password" screen |
| How sessions end | on refresh: the refresh token's `created_at` = last activity (the browser only refreshes when it uses the API) → **401 `SESSION_IDLE`**; `session_started_at` (kept through rotation) → **401 `SESSION_MAX`**; the sign-in page says why. Precision: the access token (15 min) keeps working until it expires |
| **Plans** (`plans` table; Platform → Plans) | `max_members`, `max_guests`, `max_projects` (empty = unlimited) — Free 10 / 5 / 5, Pro 100 / 100 / 100, Enterprise unlimited (master data, edits kept) |
| What counts | members and guests **including pending invitations**; **active** projects (archived don't count) |
| Where limits are checked | invite member / guest · accept an invitation · re-activate a member · guest → member · create a project · restore an archived project — the organization row is locked (`FOR UPDATE`) so two requests can't take the last place; **403 `PLAN_LIMIT_REACHED`** with a clear message. Nothing is ever removed when an organization is over its plan |
| Usage | Organization → Settings → **Plan & usage** (bars), the members page, the invite dialog; platform organizations list shows used / limit |
| **Guests** | `organization_members.is_guest` + the system **Guest** role (`guide.view` only). Invited from Members → Invite → **Guest** with a project and *read & comment* / *create & edit* (the inviter must administer the project) |
| What a guest sees | only projects they are a **member** of (never organization-visible ones, never "manage all projects"); in a project, only that project's people (assignee pickers, mentions, availability); no directory, members, dashboard (lands on My Work), leave, insights. Never a project admin. Hidden from the people directory |
| Later | project admins add a guest to more projects; **Make full member** (Members → guest → choose a role; uses a member seat) |

### Help Center (3d)

| | |
|---|---|
| **Help Center** (`/guide`, `guide.view`) | sections with markdown articles; home = **Getting started** checklist + every section; article page with **Open this page** (the article's `app_path`), previous / next; **search** (Postgres full text: title > summary > body, highlighted snippet, plus a "title contains" fallback for partial words); links to `/…` pages stay inside the app |
| Who sees an article | **status** published (drafts never) × **visibility** all organizations or only **selected** ones × **audience** everyone or **admins** (owners + `users.update`) — always filtered on the server |
| **Help content** (`/platform/guide`, platform admins) | sections (title, slug, icon, order; only empty sections can be deleted) · article editor (markdown write / preview, slug from the title, section, order, "Open this page" path, published switch, audience, organizations multi-select); every change is audited |
| Starting content | 7 sections · 21 articles are master data in `schema.sql` (`ON CONFLICT (slug) DO NOTHING`): `db:init` adds new ones but **never overwrites** an article the platform owner edited |
| **Getting started** | owners / admins: 6 steps ticked from real data (people invited, teams or managers, holidays, a project, a work item, a sprint), each with its page and article; on the dashboard and the Help Center home; dismissible per organization (`organizations.getting_started_dismissed_at`) and restorable |
| **"?" links** | next to the title of the main pages (projects and every project tab, My Work, People, Notifications, leave pages, production errors, insights, members, roles, dashboard) → the matching article; hidden without `guide.view` |

### Teams, managers & My Work (3c)

| | |
|---|---|
| **People** (`/people`, every member) | **Directory** (search, team filter, "away today", person drawer with manager and direct reports) · **Teams** (cards with lead and members) · **Org chart** (tree from managers) |
| Editing | job title, manager and teams need `users.update` (Admin); a person can be in several teams; the team lead is always a member |
| Managers | `organization_members.manager_id`; nobody manages themselves (CHECK) and the reporting line can't loop (recursive CTE check) |
| **Leave goes to the manager** | a new request notifies the person's **manager** (or, without one, the leave approvers); the manager can approve / reject / cancel their **direct reports'** leave without `leave.approve`; leave approvers (HR) still decide anyone's |
| Team filters | capacity drawer (people + team totals) and insights workload |
| **My Work** (`/my-work`, every member) | my open items grouped **Overdue · Due today · This week · Later**, bugs **waiting for my QA verdict** (same rule as the QA API), **leave to approve** (approve inline), **unread mentions** — live via notifications |

### Capacity planning (3a)

| | |
|---|---|
| Team of a sprint | project members (admin / member) + anyone with work in the sprint + anyone with an allocation row |
| Per person | working days of **their** holiday calendar (weekends + holidays excluded) − **approved** leave in the sprint (half days 0.5; pending shown, not subtracted) × **allocation %** (`sprint_capacity`, default 100, 0 = not in this sprint) = available days |
| Forecast | points per available person-day learned from the last 3 completed sprints (their availability recomputed from calendars + leave history) × this sprint's available days |
| Load | planned points (non-sub-task estimates) vs expected points per person and for the team: idle · ok · nearly full (> 90 %) · overloaded (> 110 %) — always with a label |
| Where | Backlog: capacity chip on every sprint → **capacity drawer** (allocation editable) · item sidebar / create dialog: "🌴 away 14–15 Jan" next to people in the assignee picker, warning when the assignee is away / on holiday / off on the due date |
| Privacy | only *that* someone is away — never the leave type |

---

## 10. Database & migrations

### Two complementary mechanisms

| | `schema.sql` | `migrations/NNNN_name.sql` |
|---|---|---|
| Purpose | The **complete, readable current state**: every table, index, constraint and master-data row | **One-time** changes that can't be expressed idempotently: data fixes, back-fills, granting new permissions to existing organizations |
| Runs | Every `npm run db:init` (idempotent, never deletes business data) | Once, in order, each in its own transaction |
| Tracked by | — | `schema_migrations` (version + SHA-256 checksum). Editing an applied migration is refused |

`npm run db:init` = create DB if missing → `schema.sql` → pending migrations.
Examples: `0006_security_plans_guests.sql` gave every existing organization the Guest role, granted `people.view` to the system roles and put the People menu behind it; `0005_help_center.sql` granted `guide.view` to the system roles (Admin, QA, Developer, Member) of existing organizations; `0004_organization_insights.sql` granted `insights.view` to existing Admin roles; `0003_leave_management.sql` granted the `leave.*` permissions and gave every existing organization the default leave types and calendar; `0002_qa_and_error_tracking.sql` granted `errors.*` to existing Admin / QA / Developer roles and set the QA flow on existing Bug tracking projects; `0001_grant_project_permissions.sql` gave `projects.create` / `projects.manage_all` to the Admin role of every existing organization (templates only affect new organizations).

### Tables (67)

| Area | Tables |
|---|---|
| Accounts & tenancy | `users`, `organizations`, `organization_members`, `member_roles`, `invitations`, `refresh_tokens`, `password_reset_tokens` |
| RBAC | `permissions`, `role_templates`, `role_template_permissions`, `roles`, `role_permissions` |
| App config | `menus`, `site_content`, `audit_logs` |
| Platform services | `schema_migrations`, `jobs`, `job_schedules`, `email_messages` |
| Projects | `projects`, `project_members`, `project_statuses`, `project_labels`, `project_custom_fields`, `sprints`, `saved_views` |
| QA | `test_suites`, `test_cases`, `test_runs`, `test_results` |
| Production errors | `error_groups`, `error_events` |
| Leave | `leave_type_templates` (master data), `leave_types`, `leave_balances`, `leave_requests`, `holiday_calendars`, `holidays` (+ `organization_members.holiday_calendar_id`) |
| Notifications & capacity | `notifications`, `notification_preferences`, `sprint_capacity` |
| People | `teams`, `team_members` (+ `organization_members.job_title`, `manager_id`) |
| Help Center | `guide_sections`, `guide_articles` (generated `search_vector` + GIN index), `guide_article_organizations` (+ `organizations.getting_started_dismissed_at`) |
| Public website | `website_pages` (+ `published` snapshot, `show_in_footer`), `website_sections`, `website_settings` (draft / published), `website_media`, `website_inquiries`, `website_inquiry_replies` |
| Checklists, templates, docs | `work_item_checklist_items`, `work_item_templates`, `project_pages` (generated `search_vector`), `project_page_versions` (+ `deleted_at` / `deleted_by` on `work_items`, `projects`, `project_pages`) |
| Plans & security | `plans` (+ `organizations.password_min_length`, `password_require_symbol`, `session_idle_minutes`, `session_max_hours`; `users.password_change_required`; `refresh_tokens.session_started_at`; `organization_members.is_guest`; `invitations.project_id`, `project_role`) |
| Work items | `work_items`, `work_item_labels`, `work_item_links`, `work_item_comments`, `comment_mentions`, `comment_reactions`, `work_item_watchers`, `work_item_attachments`, `work_item_events` |

### Conventions for new tables
```sql
CREATE TABLE IF NOT EXISTS releases (
  id              SERIAL PRIMARY KEY,
  organization_id INT NOT NULL,
  project_id      INT NOT NULL,
  ...,
  FOREIGN KEY (project_id, organization_id) REFERENCES projects (id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_releases_project ON releases (project_id);
```

### Backups
Before every migration of a real database a backup was written to `server/backups/` (JSON / `pg_dump`).
Restore a plain `.sql` dump: `psql -U postgres -d team-flex -f backups/<file>.sql` (on an empty database).
Restore a custom-format `.dump` (e.g. `team-flex-before-phase2d-….dump`): `pg_restore -U postgres -d team-flex --clean backups/<file>.dump`.

---

## 11. Background jobs & email

### Job queue (`server/src/jobs/`)
- Jobs are rows in the `jobs` table. `enqueue('email.send', { emailId }, { executor: client })` — passing the
  transaction client makes the job part of the same transaction (**transactional outbox**): no job if the change
  rolls back, guaranteed job if it commits.
- The worker (started by `main.ts`, `JOBS_CONCURRENCY` loops) claims jobs with
  `FOR UPDATE SKIP LOCKED`, so several API instances can run workers safely.
- Failures retry with exponential backoff (5 s, 10 s, 20 s … max 1 h) up to `max_attempts` (5), then `failed`.
- Maintenance every minute: re-queue jobs stuck > 10 min (worker crashed), delete completed jobs > 7 days.
- Register handlers with `defineJob('queue.name', handler)` and import the module in `jobs/index.ts`.
- **Recurring jobs**: rows in `job_schedules` (master data in `schema.sql`); the worker's minute tick enqueues each due schedule exactly once (conditional `UPDATE … RETURNING`, safe with several servers) and moves `next_run_at` forward, skipping runs missed while down. Example: `notifications.daily-digest`.
- **Platform → Background Jobs**: counts by status, payloads, errors, **Retry** for failed jobs.
- Job logs look like API logs: `⚙ JOB email.send #12 completed 41ms · attempt 1/5 · 2 queries`, with their SQL tree.

### Email (`server/src/modules/email/`)
- `queueEmail({ to, template, data }, client)` renders the template, stores it in `email_messages` and enqueues `email.send`.
- Templates: **welcome**, **invitation**, **passwordReset**, **passwordChanged** (HTML + plain text, inline styles).
- Drivers (`EMAIL_DRIVER`):

| Driver | Use | Notes |
|---|---|---|
| `outbox` (default) | development | Nothing is sent; read everything in **Platform → Mailbox** (rendered in a sandboxed iframe) |
| `ethereal` | free fake SMTP | No signup; each email gets a web preview link (shown in the Mailbox and logs). Needs internet |
| `smtp` | real delivery | Any provider (Brevo free tier, Mailgun, SES, Gmail app password). Then disposable inboxes like **@yopmail.com** receive the emails |

- In production with a real driver the stored HTML/text is cleared after sending (bodies may contain live links).

---

## 12. API reference

Base URL `/api`. Organization routes need `Authorization: Bearer <token>` **and** `X-Organization-Id`.
List endpoints accept `?page=&limit=&search=` and return `{ items, total, page, limit }`.

### Public / account
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Liveness |
| POST | `/auth/register` | `{ name, email, password, organizationName }` or `{ …, invitationToken }` |
| POST | `/auth/login` · `/auth/refresh` · `/auth/logout` · `/auth/logout-all` | Session |
| GET · PATCH | `/auth/me` | Profile (PATCH: `{ name }`) |
| POST | `/auth/switch-organization` | `{ organizationId }` |
| POST | `/auth/forgot-password` | `{ email }` |
| GET | `/auth/reset-password/:token` | `{ valid, email (masked) }` |
| POST | `/auth/reset-password` | `{ token, password }` |
| POST | `/auth/change-password` | `{ currentPassword, newPassword }` — must follow the account's password rules |
| GET | `/auth/password-policy` | `{ minLength, requireSymbol }` for this account (strictest of its organizations) |
| GET | `/content/public/:key` · `/invitations/token/:token` | Home content · invitation preview |
| POST | `/invitations/token/:token/accept` · `/client-errors` | Accept invite · frontend crash report |

### Organization
| Method | Path | Permission |
|---|---|---|
| POST · GET · PATCH | `/organizations` · `/organizations/current` | create (anyone) · member · `organization.manage` |
| GET | `/organizations/current/usage` | `{ plan: { key, name, limits }, used, pendingInvitations }` (members, guests, projects) |
| GET · PATCH · POST | `/organizations/current/security` · `/security/require-password-change` | `{ minLength, requireSymbol, sessionIdleMinutes, sessionMaxHours }` · flag every other member · `organization.manage` |
| POST | `/invitations` | member `{ email, roleId }` · guest `{ email, projectId, projectRole: member \| viewer }` (`users.invite` + project admin) — counts towards the plan |
| POST | `/members/:id/make-member` | `{ roleIds }` guest → full member (`users.assign_roles`, uses a seat) |
| GET · PATCH · PUT · DELETE | `/members[/:id[/roles]]` | `users.*` |
| GET · POST · DELETE | `/invitations[/:id]` | `users.invite` (invite is emailed) |
| GET · POST · PATCH · PUT · DELETE | `/roles[/:id[/permissions]]`, `/permissions` | `roles.*` |
| GET · PUT | `/content/:key` · GET `/audit-logs` | member · `content.manage` · `audit.read` |

### Projects (access by project role)
| Method | Path | Who |
|---|---|---|
| GET · POST | `/projects` | list accessible · create needs `projects.create` |
| GET · PATCH · DELETE | `/projects/:ref` (`ref` = id or key) | view · project admin · org admin (archived only) |
| POST | `/projects/:ref/archive` · `/restore` | project admin |
| DELETE | `/projects/:ref` | archived projects only → **trash** (organization project admins) |
| GET · POST · DELETE | `/projects/:ref/trash` · `/trash/:kind/:id/restore` · `/trash/:kind/:id` | `kind` = `item` \| `page` — list (members who can edit) · restore (project admin or the person who deleted it) · delete for good (project admin) |
| GET · POST · DELETE | `/trash/projects` · `/:id/restore` · `/:id` | deleted projects (organization project admins) |
| GET · POST · PATCH · DELETE | `/projects/:ref/templates[/:id]` | read: project access · change: project admin — `{ name, type, title, description, priority, labelIds, checklist[], repeat, repeatWeekday, repeatMonthDay, assigneeId, dueInDays }` |
| GET · POST · PATCH · DELETE | `/projects/:ref/pages[/:id]` · `/pages/search?q=` | docs: `{ title, body, parentId }`; PATCH with `baseUpdatedAt` (409 `PAGE_CHANGED`); DELETE → trash |
| GET · POST | `/projects/:ref/pages/:id/versions[/:versionId[/restore]]` | history; restoring saves it as a new version |
| GET | `/projects/:ref/calendar?from=&to=` · `/my-work/calendar?from=&to=` | `{ items, sprints }` (≤ 62 days) |
| POST · PATCH · PUT · DELETE | `/work-items/:ref/checklist[/:id]` · `PUT /checklist/order { ids }` | each answers with the whole checklist; `POST /projects/:ref/items` also takes `checklist: string[]` |
| GET · POST · PATCH · DELETE | `/projects/:ref/members[/:userId]` | view · project admin (members may remove themselves) |
| GET | `/projects/:ref/assignable-users` · `/member-candidates` | view · project admin |
| GET · POST · PATCH · DELETE · PUT | `/projects/:ref/statuses[/:id]`, `/statuses/order`, `DELETE …?moveTo=` | view · project admin |
| GET · POST · PATCH · DELETE | `/projects/:ref/labels[/:id]` | view · member (create) · project admin |
| GET · POST · PATCH · DELETE | `/projects/:ref/fields[/:id]` | view · project admin |
| GET · POST | `/projects/:ref/items` | filters: `types, statusIds, categories, assignees(me,none,ids), priorities, labelIds, parent, sprint(id,active,backlog,planning), search, sort(rank,number,…), order` |
| POST | `/projects/:ref/items/bulk` | `{ itemIds (≤200), changes: { statusId, priority, assigneeId, sprintId, addLabelIds, removeLabelIds } }` · member |
| GET · POST · PATCH · DELETE | `/projects/:ref/sprints[/:id]` (`?status=open,completed,all`) | view · member |
| POST | `/projects/:ref/sprints/:id/start` · `/complete` | `{ name?, goal?, startDate?, endDate? }` · `{ moveOpenItemsTo: 'backlog' \| sprintId }` · member |
| GET · POST · PATCH · DELETE | `/projects/:ref/views[/:id]` | private views: anyone who can see the project; shared: member; change: owner (shared: + project admin) |
| GET | `/projects/:ref/reports/overview?days=30` · `/velocity?limit=7` · `/burndown/:sprintId` | view |

### Work items (`:itemRef` = id or key like `TF-12`)
| Method | Path | Notes |
|---|---|---|
| GET | `/work-items?search=` | Org-wide quick search (accessible projects) |
| GET · PATCH · DELETE | `/work-items/:itemRef` | Detail (children, links, watchers, permissions) · partial update (incl. `sprintId`) · delete |
| POST | `/work-items/:itemRef/move` | `{ statusId?, sprintId?, prevId?, nextId? }` — board / backlog drag & drop |
| GET | `/work-items/:itemRef/events` | History |
| POST · DELETE | `/work-items/:itemRef/watch` | Watch / unwatch |
| GET · POST · PATCH · DELETE | `/work-items/:itemRef/comments[/:id]` | Comments |
| POST | `/work-items/:itemRef/comments/:id/reactions` | `{ emoji }` toggle |
| POST · DELETE | `/work-items/:itemRef/links[/:linkId]` | `{ target: "TF-9", linkType }` |
| GET · POST · GET · DELETE | `/work-items/:itemRef/attachments[/:id]` | multipart field `file`; GET `/:id?inline=1` streams the file |

### Bug flow & QA
| Method | Path | Notes |
|---|---|---|
| GET | `/projects/:ref/items/similar?title=&excludeId=` | possible duplicates (score) |
| POST | `/work-items/:itemRef/qa` | `{ verdict: 'pass' \| 'fail', comment (required for fail), fixedInVersion? }` |
| POST | `/work-items/:itemRef/close-duplicate` | `{ duplicateOf: "TF-3" }` |
| GET · POST · PATCH · DELETE | `/projects/:ref/test-suites[/:id]` | view · member |
| GET · POST · PATCH · DELETE | `/projects/:ref/test-cases[/:number]` | filters `suiteId(id,none), status, priority, caseType, workItemId, search`; GET one includes run history |
| GET · POST · PATCH · DELETE | `/projects/:ref/test-runs[/:id]` | create: `{ name, environment?, buildVersion?, sprintId?, scope: { all \| suiteIds \| caseIds } }`; delete: admin or creator |
| POST | `/projects/:ref/test-runs/:id/complete` · `/reopen` | member |
| PATCH | `/projects/:ref/test-runs/:id/results/:resultId` | `{ status?, stepResults?, comment? }` |
| POST | `/projects/:ref/test-runs/:id/results/:resultId/bug` | `{ title?, priority?, severity?, assigneeId? }` → pre-filled bug |

### Production errors
| Method | Path | Notes |
|---|---|---|
| GET | `/errors?status=&source=&search=&sort=` | inbox + counts per status · `errors.read` |
| GET · PATCH | `/errors/:id` | detail (events, daily) · `{ status: resolved \| ignored \| unresolved }` (`errors.manage`) |
| POST | `/errors/:id/bug` · `/errors/:id/link` | `{ projectRef, title?, priority?, severity?, assigneeId? }` · `{ itemRef }` (`errors.manage` + project edit rights) |
| POST | `/errors/simulate/:kind` | development only (`generic`, `type`) — produces a real 500 |
| GET · PATCH | `/platform/errors[/:id]` | every organization (platform admins) |

### Notifications & capacity
| Method | Path | Notes |
|---|---|---|
| GET | `/notifications?unread=true&category=&page=` | inbox + `unread` count |
| GET | `/notifications/unread-count` | for the bell |
| POST | `/notifications/read` · `/notifications/:id/unread` | `{ ids }` or `{ all: true }` |
| GET · PUT | `/notifications/preferences` | `{ preferences: [{ category, inApp, email: off\|instant\|daily }] }` |
| GET | `/projects/:ref/sprints/:id/capacity` | people, capacity, load, totals, forecast, history (`needsDates` when the sprint has no dates) |
| PUT | `/projects/:ref/sprints/:id/capacity/:userId` | `{ allocation 0–100, note }` · member |
| GET | `/projects/:ref/availability?from=&to=` | who is away (no leave types), holidays and weekend days per person — max 3 months |
| GET | `/insights?days=7\|30\|90` | organization insights · `insights.view` |
| GET · PATCH | `/people[/:userId]` | directory / person (+ direct reports) · `{ jobTitle, managerId }` needs `users.update` |
| GET · POST · PATCH · DELETE | `/teams[/:id]` · PUT `/teams/:id/members { userIds }` | read: everyone · change: `users.update` |
| GET | `/my-work` | `{ counts, assigned, qa, leave, mentions }` |
| GET | `/guide` · `/guide/articles/:slug` · `/guide/search?q=` | contents · article (+ previous / next) · search (`snippet` with `[[ ]]` around matches) — all `guide.view`, filtered by status, organization and audience |
| GET · POST | `/guide/getting-started` · `/guide/getting-started/dismiss` · `/restore` | checklist (`{ visible: false }` for non-admins) · hide / show it (`users.update`) |
| GET | `/insights/export/projects\|workload?days=` | CSV download |
| POST | `/insights/weekly-report/send-me` | email the weekly report to yourself now |

### Dashboard, quality report & leave
| Method | Path | Notes |
|---|---|---|
| GET | `/dashboard` | aggregated dashboard · `dashboard.view` |
| GET | `/projects/:ref/reports/quality?weeks=12` | bugs per week, open bugs, ageing by severity, oldest bugs, weekly lead / cycle time, cycle time distribution |
| GET | `/leave/types` · `/leave/balances?year=&userId=` | active types · balances (others' only for approvers / managers) |
| POST | `/leave/requests/preview` | `{ leaveTypeId, startDate, endDate, portion }` → days, skipped, balance after, teammates out |
| GET · POST | `/leave/requests?scope=mine\|team&status=&year=` | list (team: `leave.approve`) · create `{ …, reason? }` |
| POST | `/leave/requests/:id/approve` · `/reject` · `/cancel` | `{ note }` (required for reject) — leave approvers, or the person's **manager** |
| GET | `/leave/calendar?from=&to=` | members, leaves (types hidden for others), calendars, holidays — max two months |
| GET · POST · PATCH · DELETE | `/leave/settings/types[/:id]` | `leave.manage` |
| GET · POST · PATCH · DELETE | `/leave/settings/calendars[/:id]` · `/:id/holidays[/:holidayId]` · `POST /:id/holidays/bulk { text }` | `leave.manage` |
| GET · PUT | `/leave/settings/members[/:userId/calendar]` · `/leave/settings/balances` | calendar per member · allowances `{ userId, leaveTypeId, year, entitled, carriedOver, note }` |

### Real-time
| Method | Path | Notes |
|---|---|---|
| POST | `/realtime/ticket` | → `{ ticket, expiresIn: 60 }` (Bearer + organization) |
| GET | `/realtime/stream?ticket=` | Server-Sent Events: `ready`, `items`, `sprints`, `tests`, `notifications` (recipients only), `resync`, `revoked` (+ `: ping` every 25 s) |

### Platform (platform admins)
| Method | Path | Notes |
|---|---|---|
| GET | `/platform/stats` | Totals |
| GET · PATCH | `/platform/organizations[/:id]` · `/platform/users[/:id]` | Suspend / plan · disable / platform admin |
| GET · POST · PATCH · DELETE | `/platform/menus[/:id]` | Sidebar |
| GET | `/website/site` · `/website/pages/:slug` · `/website/media/:id` | **public**: header / footer / menu / `footerLinks` · a published page (pricing with live plans) · an image |
| POST | `/website/inquiries` | **public** contact form `{ type, name, email, company?, teamSize?, phone?, message, website (honeypot), elapsedMs }` — rate limited |
| GET · PATCH · DELETE | `/platform/website/inquiries[/:id]` (`?status=open\|new\|replied\|closed\|spam\|all&type&search&page`) | inbox + counts · one with its replies · `{ status?, notes? }` |
| POST | `/platform/website/inquiries/:id/reply` | `{ body, close? }` — e-mailed to the sender, kept with the inquiry |
| GET · PATCH | `/platform/website/pages[/:slug]` | pages (with "unpublished changes") · a draft with `previewSections` and `plans` · page settings |
| POST · PUT | `/platform/website/pages/:slug/sections` · `/sections/order` · `/publish` · `/discard` | add `{ type, afterId? }` · reorder `{ ids }` · publish · discard |
| PATCH · POST · DELETE | `/platform/website/sections/:id` · `/:id/duplicate` | `{ content?, isVisible? }` (content validated per type) |
| GET · PUT · POST | `/platform/website/settings` · `/settings/publish` | header & footer draft / publish |
| GET · POST · PATCH · DELETE | `/platform/website/media[/:id]` | image library (multipart `file`) · alt text · delete (409 while used) |
| GET · POST · PATCH · DELETE | `/platform/plans[/:key]` | plans and limits (null = unlimited); a plan in use can't be deleted; `PATCH /platform/organizations/:id { plan }` must name an existing plan |
| GET | `/platform/audit-logs` | All organizations |
| GET · POST | `/platform/emails[/:id[/resend]]` | Mailbox |
| GET · POST | `/platform/jobs`, `/platform/jobs/stats`, `/platform/jobs/:id/retry` | Background jobs |
| GET | `/platform/guide` · `/platform/guide/articles/:id` | Help content: everything incl. drafts · one article with its body and organizations |
| POST · PATCH · DELETE | `/platform/guide/sections[/:id]` · `/platform/guide/articles[/:id]` | `{ slug, title, icon?, position? }` · `{ sectionId, slug, title, summary?, body, audience, appPath?, position?, status, visibility, organizationIds? }` (a section with articles can't be deleted) |

---

## 13. Frontend

### Routes

| Path | Access | Page |
|---|---|---|
| `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/invite/:token` | public | Landing, auth, password recovery, invitations |
| `/onboarding` | logged in, no organization | Create organization |
| `/dashboard`, `/profile` | member | **Dashboard** (my work, bug trend, project health, who's out, holidays, my leave) · profile (name, change password, sign out everywhere) |
| `/projects` | member | Project cards (progress, role, private badge) + **New project** (template picker) |
| `/projects/:key` | project access | **Board**: columns per status, drag & drop, WIP limits, quick add, active sprint / all items, filters + saved views, live |
| `/projects/:key/backlog` | project access | **Backlog**: sprints + backlog sections, drag to plan, create / start / complete sprints |
| `/projects/:key/list` | project access | **List**: search, filters in the URL, saved views, sprint filter, sortable columns, paging, **bulk edit**, create (and "create & add another") |
| `/projects/:key/reports` | project access | **Reports**: overview, **bugs** (per week, ageing, oldest), **cycle & lead time**, sprint burndown, velocity (chart ↔ table) |
| `/projects/:key/tests` | project access | **Tests**: suites + test case library (steps editor, history) · test runs (progress, pass rate) |
| `/projects/:key/tests/runs/:id` | project access | **Run execution**: per-step results, notes, keyboard shortcuts, file bug from a failure, live |
| `/my-work` | member | **My Work**: assigned items by due date, QA queue, leave to approve, mentions |
| `/people` | `people.view` | **People**: directory, teams, org chart (editing: `users.update`) |
| `/guide`, `/guide/:slug` | `guide.view` | **Help Center**: contents sidebar, search, getting-started checklist (owners / admins), articles with "Open this page" and previous / next |
| `/org/insights` | `insights.view` | **Organization insights**: tiles, needs-attention list, work trend, project health table, workload table (CSV export), quality, people & leave, "email me the weekly report" |
| `/notifications` | member | **Notifications**: inbox (unread / all, category, mark read / unread) · **Settings** per category (in-app, email instant / daily); the **bell** in the header shows the latest |
| `/leave` · `/leave/calendar` | `leave.request` | **My leave** (balances, requests, request dialog with live preview) · **Team calendar** (month grid) |
| `/leave/approvals` | `leave.approve` | Pending requests first; approve / reject with a note |
| `/org/leave` | `leave.manage` | **Leave & holidays**: leave types · holiday calendars, holidays (paste a list), who uses which calendar · allowances per person and year |
| `/errors`, `/errors/:id` | `errors.read` | **Production errors** inbox (unresolved / resolved / ignored, regressions) · detail (latest request, SQL, stack, component stack, events per day) · create / link bug |
| `/projects/:key/items/:number` | project access | **Work item page**: editable title / markdown description / bug details, children with progress, links, attachments (drag & drop, image previews), comments (@mentions, reactions), history timeline, sidebar with status (locked statuses shown), assignee ("assign to me"), priority, severity, labels (create inline), due date, estimate, custom fields, watchers |
| `/projects/:key/settings` | project admin | General (lead, colour, visibility, archive / delete) · Members · Workflow · Labels · Custom fields · **Templates** (+ repeating) |
| `/projects/:key/docs[/:pageId]` | project access | **Docs**: page tree, search, Write / Preview editor, history drawer (restore a version), sub-pages, delete → trash |
| `/projects/:key/calendar` | project access | **Calendar**: month grid of due dates, sprints, away people and holidays; drag to change the due date |
| `/projects/:key/trash` | project member (edit) | **Trash**: deleted items and pages, restore / delete for good |
| `/org/*` | org permissions | Members, roles, announcement, audit log, settings |
| `/`, `/features`, `/pricing`, `/faq`, `/contact`, `/privacy`, `/terms` | anyone | **Public website** (`client/src/website`) — legal pages once published |
| `/platform/website` | platform admin | **Website** editor: a tab per page, Header & footer, Images, **Inquiries** (`?tab=inquiries&inquiry=12` opens one) |
| `/platform/*` | platform admin | Overview, organizations, users, menus, **Website**, **Plans**, **Help content**, audit, **Mailbox**, **Background jobs**, **All errors** |

### Building blocks
- **API layer** `lib/api.ts`: `api.get/post/put/patch/delete`, `api.upload(url, file, onProgress)`, `api.blob(url)` + `saveBlob()`.
  Interceptors add `Authorization`, `X-Organization-Id`, `X-Request-Id` and refresh the session silently.
- **Auth** `useAuth()`; **data** `useFetch(useCallback(...))`; **project pages** share the loaded project via `useProject()`.
- **Work item UI kit** `pages/projects/shared/`: `ItemTypeIcon`, `PriorityIcon`, `StatusTag`, `UserAvatar`,
  `MarkdownView` / `MarkdownEditor` (no raw HTML → XSS-safe), `MentionInput`, `itemMeta` (visuals), `itemRules` (pure rules).
- **Boards** `shared/boardRules.ts` (pure move / neighbour logic, unit-tested) + `shared/useDragColumns.ts` (@dnd-kit, optimistic, reverts on error);
  filters `shared/useItemFilters.ts` + `FilterBar` + `SavedViewsMenu`.
- **Real-time** `lib/realtime.ts` (one EventSource per tab, ticket, backoff reconnect) + `hooks/useRealtime.ts` (`useLiveReload`, `useRealtimeStatus`);
  every request carries `X-Client-Id` so a tab ignores events of its own changes.
- **Command palette** `components/CommandPalette.tsx` (Ctrl / ⌘ K). **Charts** recharts on the Reports page only (separate chunk).
- **Theme**: light / dark / system + font size; **error boundaries** + crash reporting to the server.

---

## 14. Logging & observability

- **Console (dev)**: one line per API call **and per background job**, each with its SQL as a numbered tree (values filled in).
- **Files** (`server/logs/`, daily, gzipped): `app-*` (everything, 14 d), `http-*` (requests + SQL with ready-to-run `statement`, 14 d), `error-*` (30 d).
- Every entry carries `requestId`, `userId`, `organizationId`; jobs carry `jobId` and the `sourceRequestId` that created them.
- Secrets redacted everywhere (passwords, tokens, cookies, bcrypt / token hashes in SQL params).
- **Audit log** (database) for security-relevant actions; **work item history** for item changes.

---

## 15. Testing

### Server — `cd server; npm test`
- **Vitest + Supertest** against the real Express app and a separate database **`team_flex_test`**, rebuilt from
  `schema.sql` + migrations before every run (your dev data is never touched). Uploads go to `uploads-test/`.
- Jobs don't run in the background during tests; tests call `drainJobs()` and read emails from `email_messages`.
- Helpers (`tests/helpers.ts`): `registerOwner()`, `addMember(owner, 'qa')` (real invite flow), `user.api.get/post/...`, `runJobs()`, `lastEmailTo()`.

| File | Covers |
|---|---|
| `unit/sql-format`, `unit/sanitize` | SQL formatting/interpolation, log redaction |
| `api/jobs` | completion, retry with backoff, permanent failure, transactional outbox, unknown queues |
| `api/auth` | signup → org + welcome email, validation, refresh rotation + reuse detection, profile |
| `api/password-reset` | no enumeration, email link → reset → old password & sessions dead, single use, newest link only, change password |
| `api/tenancy` | header required, cross-org access, cross-org role ids, invitation email, projects/items invisible across orgs |
| `api/projects` | templates, key rules, `projects.create`, private vs organization visibility, members & last admin, workflow CRUD/reorder/delete-with-move, archive/delete |
| `api/work-items` | numbering & keys, hierarchy, restricted transitions (QA → Verified), history, assignee access, labels & custom fields, links wording, comments/mentions/reactions, attachments (disk + access), search/filters, delete rights |
| `api/boards` | move / rank (midpoints, re-spacing), history only for status changes, foreign neighbours, viewers; bulk edit (history, labels, all-or-nothing); saved views (private / shared, rights, validation); WIP limits |
| `api/sprints` | default names, sub-tasks follow parents, sprint filters, start snapshot, one active sprint (API + DB index), burndown with scope change, complete with carry-over, read-only history, velocity, delete → backlog, cross-project sprint ids, overview, private projects |
| `api/realtime` | ticket required (access token ≠ ticket and vice versa), delivery, private-project filtering, sprint events, no cross-organization leaks (real HTTP server + SSE client) |

| `api/bugs` | bug fields & history, automatic resolution, QA flow (template, 409 when not waiting, developer 403, fail needs a reason, reopen count, comment, pass → fixed), QA config validation & status deletion, similar titles (typos / word order), close as duplicate |
| `api/test-cases` | suites, TC numbering, coverage on the story, viewer read-only, same-project coverage, run snapshot (drafts excluded, edits don't leak in), per-step outcome, summary & pass rate, history, bug from failure (pre-filled, linked, once), completed runs read-only, deleted case keeps history, delete rights |
| `api/errors` | capture & grouping of 500s with request id / route / SQL, separate groups per cause, permissions, organization isolation, platform-only listing, create bug (pre-filled, linked once), auto-resolve when done, **regression** re-open + bug history, link existing bug, browser errors grouped across deploys, no attribution to foreign organizations |
| `unit/fingerprint` | message normalization, server / browser top frames (paths, line numbers, bundle hashes), route patterns, user-agent parsing |
| `unit/leave-days` | working days (weekends, holidays, other weekends), half days, reversed / huge ranges, month and leap-year boundaries |
| `api/leave` | default types & calendar, holiday paste, settings permissions, preview, pending + emails, **overlap refused by the database**, half day / year / weekend-only / balance validation, approvals (rights, reject reason, emails, no self-approval except owner), auto-approved types, team calendar privacy, cancel gives days back, calendars with other weekends, allowance overrides, type deletion rules, organization isolation |
| `api/dashboard` | my work order and counts, project health and bug trend respecting private projects, leave section, who's out (type hidden), quality report (per week, open at week end, ageing buckets, oldest, weekly medians, distribution) |

| `api/notifications` | assigned (+ instant email), mentioned vs commented, collapsing, status changes, one specific QA notification, error notifications, mark read / unread / all, no email once read, organization isolation, preferences & validation, daily digest through the scheduler (runs once, next run tomorrow) |
| `api/capacity` + `unit/capacity` | working days per calendar, holidays, approved vs pending leave, allocation (part-time, 0 %), viewer rights, totals, forecast from a completed sprint, per-person load, sprint without dates, availability without leave types |

| `api/insights` + `unit/insights` | access, people / totals, health classification with reasons (at risk, stale, healthy, private projects counted), workload ordering, severity breakdown, leave block, CSV export (+ formula injection guard), weekly report: preview, opt-out respected, Monday schedule |

| `api/people` · `api/my-work` | directory, job title / manager rights, self-management and loop prevention, leave routed to the manager who can approve without `leave.approve`, HR still can, teams (lead is a member, conflicts, member validation, rename, delete), isolation · My Work ordering and counts, QA queue rules, leave to decide (manager / owner), mentions |

| `api/guide` | everyone vs admins articles, article + previous / next, search (snippets, partial titles, admins-only hidden), `guide.view` removable, checklist (non-admins, ticks from data, dismiss / restore rights), platform-only authoring, draft → published, partial update keeps other fields, selected organizations, slug / section validation, section delete protection, audit |

| `api/security` · `api/plans` · `api/guests` + `unit/security-plans` | rules readable / editable by `organization.manage` only, invitation sign-up follows them (rolled back when weak), weak password at sign-in → only `/auth/*` until changed, "ask everyone", strictest of several organizations, session start kept through rotation, idle and maximum session end with reasons + audit, other organizations unaffected · platform-only plans, unknown plan refused, usage, seats incl. pending invitations, revoke frees a seat, archived projects don't count, restore blocked, guest limit, lowered limit blocks accepting / re-activating, plan in use can't be deleted · guests: Guest role only, own projects only (not organization-visible ones), no directory / members / dashboard, project people only in pickers, never project admin, role locked, guest invitation rules, added to another project, make full member |

| `api/trash` · `api/checklists-templates` · `api/pages-calendar` + `unit/repeat-schedule` | item + sub-items hidden everywhere and restored as a batch (comments, history "restored"), parent-first rule, who sees / restores / deletes for good, 30-day purge · project trash (archive first, restore archived, delete for good) · checklist add / tick / reorder (all ids) / delete, card progress, viewers read-only · templates: admin-only changes, unique names, weekly needs a day, repeating creates once per day (claimed), title `{date}`, due date, assignee, checklist; author left → paused, save restarts · docs rights, sub-pages without loops, search snippets, versions + restore, stale edit 409, pages to the trash with sub-pages · calendar range, sprints, trash excluded, My Work calendar · weekdays / weekly / monthly dates |

| `api/website` | public pages and header / footer without login, hidden sections not sent, pricing with live plan limits, platform-only editing, draft vs published, discard, add / duplicate / hide / reorder (all ids) / delete, unsafe links / empty sliders / unknown images / unknown types refused, page SEO + menu published with the page, image upload (bytes checked), public serving, delete refused while used |

| `api/website-inquiries` | Contact / FAQ live and in the menu, legal pages 404 until published then in the footer links, footer flag published with the page, contact section validated · form stored + e-mails to sender and platform admins, validation, honeypot and too-fast → spam without e-mails · inbox admin-only, filters and counts, notes, reply e-mailed and kept, close, unknown status refused, delete |

**223 tests, all passing.** (Test organizations start on the unlimited plan — `tests/helpers.ts` — so only the plan tests see limits.)

### Client — `cd client; npm test`
Vitest unit tests for pure logic (`src/__tests__`): API error mapping, work-item rules, board move / neighbour rules, realtime event filter, QA flow / test outcome / browser detection, leave calendar helpers, availability / due-date helpers, My Work grouping, Help Center snippet / app-path helpers, plan usage rows and security form helpers, month grid / docs tree / repeat labels , website link rules / plan limit lines / section summaries / form cleaning, contact topic from `?type=` (42 tests).

---

## 16. Configuration (.env)

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | development | `production` → JSON logs, secure cookies, email bodies cleared, `db:reset` disabled · `test` → rate limits off |
| `PORT` · `CORS_ORIGIN` · `APP_URL` | 5000 · http://localhost:5173 · = CORS_ORIGIN | API port · browser origin · public URL used in email links |
| `APP_VERSION` | package.json version | Release recorded on production errors |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | — | PostgreSQL |
| `JWT_SECRET` · `ACCESS_TOKEN_TTL` · `REFRESH_TOKEN_DAYS` | — · 15m · 7 | Auth |
| `LOG_LEVEL` `LOG_DIR` `LOG_HTTP_BODIES` `LOG_MAX_BODY_LENGTH` `LOG_SLOW_REQUEST_MS` | http · logs · true · 4000 · 1000 | Logging |
| `LOG_SQL` `LOG_SQL_CONSOLE` `LOG_SQL_PARAMS` `LOG_SLOW_QUERY_MS` | true · true · true · 200 | SQL logging |
| `EMAIL_DRIVER` · `EMAIL_FROM` | outbox · Team-Flex &lt;no-reply@teamflex.local&gt; | `outbox` / `ethereal` / `smtp` |
| `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASS` | — · 587 · false | For `EMAIL_DRIVER=smtp` |
| `JOBS_ENABLED` `JOBS_CONCURRENCY` `JOBS_POLL_INTERVAL_MS` | true · 2 · 1000 | Background worker in the API process |
| `NOTIFY_EMAIL_DELAY_SECONDS` | 60 | Wait before an instant notification email (skipped if read in the app meanwhile) |
| `STORAGE_DIR` · `MAX_UPLOAD_MB` | uploads · 10 | Attachment storage |

Client (optional `client/.env`): `VITE_API_URL` (default `/api`), `VITE_API_TIMEOUT_MS` (30000), `VITE_APP_VERSION` (default: package.json version — sent with crash reports).

---

## 17. How to add a new module

Example: **Sprints** (phase 2e) — built exactly this way, see `server/src/modules/sprints/`.

**1. Database**
- `schema.sql`: table(s) with `organization_id` + composite FK to `projects (id, organization_id)`; indexes; new permissions (if any) + template mapping; menu row.
- If existing organizations need data (e.g. permissions for their Admin role): `npm run db:new -- grant_sprint_permissions` and write the one-time SQL.
- `npm run db:init`.

**2. Server** — `src/modules/sprints/` with `dto` (zod), `service` (SQL; resolve the project with `getProjectAccess(ctx, ref)` and call `assertCanEdit / assertCanManage`), `controller`, `routes` (`router.use(authenticate, requireOrganization)`); mount in `routes.ts`.
- Record important changes (`audit()` for security-relevant, `work_item_events` for item changes).
- Slow side effects → `enqueue()` / `queueEmail()` inside the transaction.

**3. Tests** — `tests/api/sprints.test.ts` using the helpers (including a cross-organization 404 check).

**4. Client** — types, `services/`, pages under `pages/projects/…`, lazy export in `pages/index.ts`, route in `router.tsx`.

---

## 18. Roadmap

~~**2d — Views**~~ ✅ · ~~**2e — Sprints & reports**~~ ✅ — later ideas: sprint capacity per person, cumulative flow diagram, swimlanes (by assignee / epic), board column per sprint for Kanban "done" archiving, Redis pub/sub when LISTEN/NOTIFY is not enough.
~~**2f — Quality**~~ ✅ — later ideas: release entity with "fixed in" tracking, test plans across projects, error alerts (email / chat) and spike detection, source maps for browser stacks.
~~**2g — Dashboards, reports & leave**~~ ✅ — later ideas: leave accrual (monthly) and automatic carry-over at year end, iCal feed of the team calendar, export (CSV / PDF) of reports.
~~**2h — Notifications**~~ ✅ · ~~**3a — Capacity planning**~~ ✅ — later ideas: per-user time zones for digests, Slack / Teams delivery, web push, capacity in hours, capacity snapshot at sprint start.
~~**3b — Organization insights**~~ ✅ — later ideas: trends of the insight numbers over months, per-team breakdowns (after Teams), scheduled CSV exports.
~~**3c — Teams, managers, directory, My Work**~~ ✅ — later ideas: team filter on boards / reports, profile photos, skills, time zones.
~~**4a — Public website: Home, Features, Pricing**~~ ✅ · ~~**4b — Contact + Inquiries, FAQ, Privacy / Terms**~~ ✅ — next: About; later: inquiry → demo organization in one click, pre-rendering for search engines, a blog, a changelog.
~~**3f — Checklists, templates, trash, docs, calendar**~~ ✅ — later ideas: checklist step → sub-task, template variables beyond {date}, links from docs to items (`WEB-12` auto-links), page comments, real-time co-editing, calendar export (iCal), week view.
~~**3e — Security rules, plans, guests**~~ ✅ — later ideas: two-factor sign-in (authenticator app), password expiry / history, allowed email domains for invitations, per-organization limit overrides, storage limits, guest expiry dates.
~~**3d — Help Center**~~ ✅ — later ideas: "Was this helpful?" feedback, screenshots in articles (uploads), extra articles written by an organization owner for their own people, article versions, translations.
**Next**: releases & roadmap timeline · time tracking · integrations (API keys, webhooks, Git) · automation · AI assistant · enterprise security pack (SSO, SCIM, 2FA, RLS, GDPR).

**Platform / enterprise**
- [ ] PostgreSQL Row-Level Security (dedicated DB role + per-request connection)
- [ ] Email verification, 2FA, session list, SSO (SAML / OIDC), SCIM
- [ ] S3 / MinIO storage driver, virus scanning for uploads
- [ ] Per-plan limits, billing, data export / organization deletion (GDPR)
- [ ] Docker / docker-compose, CI (lint, type-check, test, build), OpenAPI docs, OpenTelemetry

---

## 19. Change log

| # | Milestone |
|---|---|
| 1 | Scaffold: Vite React client, Express + PostgreSQL server, NestJS-style modules |
| 2 | RBAC v1: auth (JWT + refresh rotation), roles, permissions, DB-driven sidebar, content, audit log |
| 3 | Winston logging: request/response logs, request ids, redaction, rotating files |
| 4 | Ant Design UI, light/dark/system theme, font size, lazy-loaded pages |
| 5 | Central Axios API layer; error boundaries + frontend crash reporting |
| 6 | Readable console logs; per-request SQL logging with formatted queries |
| 7 | **Multi-tenancy**: organizations, memberships, per-org roles, invitations, switcher, platform console |
| 8 | Role templates in `role_templates`; `roles.organization_id` mandatory |
| 9 | Roles & Access page redesign; permission descriptions synced by `db:init` |
| 10 | **2a** Job queue (SKIP LOCKED, backoff, transactional outbox), email service (outbox / ethereal / smtp, Mailbox), versioned migrations, Vitest test suites, forgot / reset / change password, profile name |
| 11 | **2b** Projects: templates, keys, visibility, project roles, workflow statuses with role restrictions, labels, custom fields, archive / delete |
| 12 | **2c** Work items: unified model & hierarchy, per-project numbering, markdown, bug details, history events, comments with @mentions & reactions, watchers, links, attachments, full-text search & filters |
| 13 | **2d** Board (dnd-kit, rank midpoints + re-spacing, WIP limits, quick add), backlog, list bulk edit, saved views, Ctrl/⌘ K palette, real-time (SSE + LISTEN/NOTIFY, tickets, live indicator) |
| 14 | **2e** Sprints (one active per project, start / complete snapshots, carry-over), burndown replayed from history, velocity, overview report (created vs resolved, workload, lead / cycle time) |
| 15 | **2f** Bug flow (severity vs priority, browser / OS / versions, resolution, QA pass / fail with reopen count, duplicate detection with `pg_trgm`), test management (suites, cases, snapshotted runs, per-step execution, failure → bug), production errors → bugs (fingerprint grouping, request SQL, auto-resolve, regressions, platform view) |
| 16 | **2g** Organization dashboard, Bugs report (per week, open trend, ageing by severity, oldest), Cycle & lead time report, leave management (types from templates, balances, half days, preview, approvals + emails, no-overlap EXCLUDE constraint, team calendar with private types), holiday calendars (weekend days, optional holidays, paste import) |
| 17 | **2h + 3a** Notifications (transactional `notify()`, bell + inbox, preferences per category, collapsing, delayed instant email skipped when read, daily digest via the new recurring-job scheduler, realtime to recipients only); capacity planning (calendars + leave + allocation, forecast from history, per-person load, availability hints and due-date warnings) |
| 18 | **3b** Organization insights (project health with reasons, work trend, workload, quality, leave, CSV export with formula-injection guard, weekly report email via the scheduler, "reports" notification setting) |
| 19 | **3c** Teams, job titles, managers (no loops), people directory + org chart, leave approvals by manager, team filters on capacity and insights, My Work |
| 20 | **3d** Help Center: platform-written guide (sections, markdown articles, draft / published, all / selected organizations, admins-only articles), full-text search, `guide.view`, Getting started checklist, "?" links on main pages |
| 21 | **3e** Security rules per organization (password length / symbol, inactivity sign-out, maximum session, forced new password), plans with member / guest / project limits (Platform → Plans), guest access (one-project outside collaborators), `people.view`, 4 Help Center articles |
| 22 | **3f** Checklists in items, templates + repeating work, trash (items, docs, projects; 30 days), project docs with history and search, calendar (project + My Work) with drag-to-reschedule, 4 Help Center articles |
| 23 | **4a** Public website (separate module): Home, Features, Pricing from sections (hero slider, features, image rows, numbers, logos, testimonials, pricing from Plans, FAQ, text, CTA), header & footer, image library, draft → preview → publish in Platform → Website (replaces Platform → Home Page) |
| 24 | **4b** Contact page with contact-form section and Inquiries inbox (notes, e-mail replies, spam protection), FAQ page, Privacy / Terms templates (published by the owner), footer links per page |
