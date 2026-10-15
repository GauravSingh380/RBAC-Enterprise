# Phase 2 — How it works (2a · 2b · 2c)

This is a **learning guide**. The main [README](README.md) is the reference (commands, every endpoint,
every setting). This file explains **how Phase 2 works inside, why it was built that way, and where to look
in the code**, so you can read the code with a map in hand.

| Part | What it adds | Read time |
|---|---|---|
| [2a — Platform services](#part-2a--platform-services) | Job queue, email, migrations, tests, password reset | 15 min |
| [2b — Projects](#part-2b--projects) | Projects, project roles, templates, workflow, labels, custom fields | 10 min |
| [2c — Work items](#part-2c--work-items) | Items, hierarchy, history, comments, attachments, links | 15 min |
| [Hands-on tour](#hands-on-tour-try-everything-in-15-minutes) | Click through every feature | 15 min |
| [Glossary](#glossary) · [FAQ](#faq) | Terms and common questions | — |
| **Next:** [PHASE-2D-2E.md](PHASE-2D-2E.md) | Boards, real-time, sprints & reports | 40 min |

> **How to read the code**: every file starts with a comment explaining its job. Follow the request:
> `routes.ts` → `controller.ts` → `service.ts` → SQL. Services never touch `req`/`res`; they get a `RequestContext`.

---

## The big picture

```
                       ┌──────────────────────── API request ─────────────────────────┐
 Browser ──HTTP──▶ middleware (auth → tenant → permission → validate) ──▶ service ──▶ PostgreSQL
                                                                      │        ▲
                                              enqueue job in the SAME │        │ claim job
                                              transaction             ▼        │ (SKIP LOCKED)
                                                                  jobs table ──┘
                                                                      │
                                                         background worker (same process)
                                                                      │
                                                            email driver: outbox / ethereal / smtp
```

Phase 2 adds three layers on top of Phase 1 (accounts, organizations, RBAC):

1. **2a** gives the server *infrastructure*: work that runs **after** a request (jobs), the ability to **send
   email**, a safe way to **change the database over time** (migrations) and **automated tests** that prove it all works.
2. **2b** adds the first business object: **projects**, with their own roles inside an organization.
3. **2c** adds the heart of the product: **work items** (epics, stories, tasks, bugs, sub-tasks) and everything
   people do with them.

---

# Part 2a — Platform services

## 1. Background job queue

### The problem it solves
Sending an email can take 1–5 seconds and can fail (provider down). If we sent it *inside* the API request:
the user waits, and if sending fails the whole request fails even though the real work (e.g. creating the
invitation) succeeded. Real products move this work to a **queue** processed in the background.

### How it works

**Files**: [`server/src/jobs/queue.ts`](../server/src/jobs/queue.ts) · [`worker.ts`](../server/src/jobs/worker.ts) · [`index.ts`](../server/src/jobs/index.ts) · table `jobs` in `schema.sql`

```
enqueue('email.send', { emailId: 7 })          worker loop (every 1s when idle)
        │                                               │
        ▼                                               ▼
INSERT INTO jobs (status = 'pending') ──────▶  UPDATE jobs SET status='running'
                                               WHERE id = (SELECT id FROM jobs
                                                           WHERE status='pending' AND run_at <= NOW()
                                                           ORDER BY run_at FOR UPDATE SKIP LOCKED LIMIT 1)
                                                        │
                                       handler runs ────┼──── success → status = 'completed'
                                                        └──── error   → status = 'pending', run_at = NOW() + backoff
                                                                        (after max_attempts → 'failed')
```

**Key ideas to understand**

| Idea | What it means | Where |
|---|---|---|
| `FOR UPDATE SKIP LOCKED` | Locks the chosen row; other workers *skip* locked rows instead of waiting. Several servers can run workers and **each job runs once** | `claimNext()` in `worker.ts` |
| Exponential backoff | Retries after 5 s, 10 s, 20 s, 40 s … (max 1 h) so a provider outage isn't hammered | `backoffSeconds()` |
| Max attempts | After 5 tries the job is `failed` and shown in **Platform → Background Jobs** with a **Retry** button | `processNextJob()` |
| Transactional outbox | `enqueue(..., { executor: client })` inserts the job **in the same transaction** as the business change. Rollback ⇒ no job. Commit ⇒ guaranteed job | `queue.ts` |
| Stuck job recovery | A worker crashed mid-job? Every minute, jobs `running` for > 10 min go back to `pending` | `maintenance()` |
| Cleanup | Completed jobs older than 7 days are deleted | `maintenance()` |
| Graceful shutdown | Ctrl+C: stop accepting requests → let running jobs finish → close DB | `main.ts`, `stopWorker()` |

**Why not Redis/BullMQ?** PostgreSQL is already there, jobs can join the business transaction, and you can
see every job with SQL. When you need very high volume, the `enqueue` / `defineJob` API can be backed by BullMQ
without changing callers.

**Add your own job**
```ts
// any module
defineJob<{ itemId: number }>('reports.rebuild', async (payload, job) => { /* … */ });
// then import that module in server/src/jobs/index.ts so the worker knows it

await enqueue('reports.rebuild', { itemId: 5 }, { executor: client });
```

**What you'll see in the console**
```
22:41:03.120 ⚙ JOB    email.send #12  completed  41ms  · attempt 1/5 · 2 queries 3.1ms
   ├─ #1  1.2ms · 1 row
         SELECT id::int, to_address AS "to", subject, html, text, status FROM email_messages WHERE id = 12
   └─ #2  1.9ms · 1 row
         UPDATE email_messages SET status = 'sent', …
```

---

## 2. Email service

**Files**: [`modules/email/email.templates.ts`](../server/src/modules/email/email.templates.ts) · [`email.transport.ts`](../server/src/modules/email/email.transport.ts) · [`email.service.ts`](../server/src/modules/email/email.service.ts) · table `email_messages`

### Flow
```
service code                         queueEmail()                          worker
─────────────                        ────────────                          ──────
queueEmail({ to, template,     ──▶   render template (subject/html/text)  ──▶  sendQueuedEmail(emailId)
             data }, client)         INSERT email_messages (queued)              deliver() via EMAIL_DRIVER
                                     enqueue('email.send', { emailId })          UPDATE status = 'sent' | error
```

### Drivers (`EMAIL_DRIVER` in `.env`)

| Driver | What happens | When to use |
|---|---|---|
| `outbox` *(default)* | Nothing leaves your PC. Open **Platform → Mailbox** to read the email (rendered safely in a sandboxed iframe) | Development, offline |
| `ethereal` | Free fake SMTP from Nodemailer. No signup. Each email gets a **preview link** (in the Mailbox and the logs) | Testing real SMTP behaviour |
| `smtp` | Real delivery through any provider (Brevo free tier, Mailgun, SES, Gmail app password) | Real usage. With this, **@yopmail.com** addresses really receive mail |

> **Why not Yopmail?** Yopmail is a disposable *inbox* — it can **receive** but not **send**. Use it as the
> *recipient* once `EMAIL_DRIVER=smtp` is configured.

**Example: switch to Brevo (free 300/day)**
```env
EMAIL_DRIVER=smtp
EMAIL_FROM=Team-Flex <you@yourdomain.com>
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=<your brevo login>
SMTP_PASS=<your brevo SMTP key>
```

### Templates
`welcome` (after signup) · `invitation` (invite a member) · `passwordReset` · `passwordChanged`.
Each returns `{ subject, html, text }`; HTML uses inline styles because email clients ignore `<style>`.
User input is HTML-escaped (`escapeHtml`) so names can't inject markup.

**Security detail**: in production with a real driver, the stored `html`/`text` is cleared after sending —
reset links are live credentials and shouldn't sit in the database.

---

## 3. Database migrations

**Files**: [`database/migrate.ts`](../server/src/database/migrate.ts) · [`init.ts`](../server/src/database/init.ts) · [`migrations/`](../server/src/database/migrations) · table `schema_migrations`

### Two tools, two jobs

| | `schema.sql` | `migrations/0001_xxx.sql` |
|---|---|---|
| Describes | **What the database looks like now** (tables, indexes, master data) | **A one-time change** to existing data |
| Style | Idempotent: `CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING` | Runs **exactly once** |
| Re-run safe? | Yes, every `db:init` | Recorded in `schema_migrations`, skipped next time |
| Example | "Admin template has `projects.create`" | "Give `projects.create` to the Admin role of every **existing** organization" |

`npm run db:init` = create DB if missing → apply `schema.sql` → run pending migrations (each in a transaction; a failure rolls that migration back and stops).

**Checksum protection**: the SHA-256 of each applied file is stored. If someone edits an applied migration,
`db:init` refuses: *"Never edit an applied migration — add a new one."* (other environments already ran the old version).

```powershell
npm run db:status                         # 0001_grant_project_permissions.sql   applied 2026-10-01…
npm run db:new -- backfill_estimates      # creates migrations/0002_backfill_estimates.sql
```

**Rule of thumb**: new table / column / index / master row → `schema.sql`. Changing *existing rows* → migration.

---

## 4. Automated tests

**Files**: [`server/vitest.config.ts`](../server/vitest.config.ts) · [`tests/`](../server/tests) · [`client/src/__tests__`](../client/src/__tests__)

### How the server tests are wired
```
npm test
  └─ global-setup.ts   → recreate database team_flex_test from schema.sql + migrations
  └─ each test file    → supertest calls the REAL Express app (no server port needed)
                          against team_flex_test (your dev DB is never touched)
  └─ setup.ts          → close the DB pool after each file
```
Test environment (`vitest.config.ts → TEST_ENV`): `NODE_ENV=test` (rate limits off), `JOBS_ENABLED=false`
(tests run jobs explicitly), `EMAIL_DRIVER=outbox`, uploads in `uploads-test/`.

### The helpers make tests read like stories ([`tests/helpers.ts`](../server/tests/helpers.ts))
```ts
const owner = await registerOwner('Acme');          // real signup → new org, owner role
const qa    = await addMember(owner, 'qa');          // real invite → register with token
await owner.api.post('/projects', { name: 'Web', key: 'WEB' });
const res = await qa.api.patch('/work-items/WEB-1', { statusId: verified });
expect(res.status).toBe(200);
await runJobs();                                     // process queued emails now
expect((await lastEmailTo(qa.email))?.template).toBe('invitation');
```

### Unit vs API tests
- **Unit** (`tests/unit`): pure functions, no database (SQL formatter, log redaction).
- **API** (`tests/api`): full HTTP + database behaviour, including **security rules** (cross-organization 404s,
  privilege escalation, workflow restrictions). These are the most valuable: they protect the rules you can't see in the UI.

**Bugs the tests caught while building Phase 2**: two PostgreSQL "inconsistent types deduced for parameter" errors
(job worker retry and project archive) — fixed with explicit `::text` casts before they ever reached you.

---

## 5. Password reset & account security

**Files**: [`modules/auth/auth.service.ts`](../server/src/modules/auth/auth.service.ts) (`forgotPassword`, `checkResetToken`, `resetPassword`, `changePassword`) · table `password_reset_tokens` · pages `ForgotPasswordPage`, `ResetPasswordPage`, `AccountSecurity`

```
Forgot password                  Email                      Reset page                         Done
───────────────                  ─────                      ──────────                         ────
POST /auth/forgot-password  ─▶  link …/reset-password  ─▶  GET /auth/reset-password/:token ─▶ POST /auth/reset-password
{ email }                        ?token=<random 48 bytes>   → valid? + masked email g****h@…   → new bcrypt hash
same answer for every email      (DB stores only SHA-256)   (shows "expired" page if not)      → token used
(no account enumeration)         valid 60 min, single use                                       → ALL sessions revoked
older links invalidated                                                                         → "password changed" email
```

| Protection | Why |
|---|---|
| Same response for unknown emails | Attackers can't discover which emails have accounts |
| Only the token **hash** stored | A database leak doesn't expose usable links |
| 60 min + single use + newest only | Limits the window for a stolen link |
| Revoke all sessions on reset | If an attacker was logged in, they're kicked out |
| "Password changed" email | The real owner notices unexpected changes |
| Forgot-password rate limit (5 / 15 min / IP) | Prevents mail flooding |

**Change password** (profile page) requires the current password, signs out **other** devices but keeps this one
(the current refresh token is excluded by its hash).

---

# Part 2b — Projects

**Files**: [`modules/projects/`](../server/src/modules/projects) · tables `projects`, `project_members`, `project_statuses`, `project_labels`, `project_custom_fields`

## 1. Two levels of roles

Phase 1 gave every user an **organization role** (owner, admin, qa, developer, member). Phase 2b adds a
**project role** — the same person can be *admin* of "Mobile App" and *viewer* of "Billing".

```
Organization "Acme"  (org roles: owner, admin, qa, developer, member)
 ├─ Project "WEB"  (visibility: organization)   Ravi: admin   Sara: member   everyone else: viewer
 └─ Project "PAY"  (visibility: private)        Sara: viewer  — others don't even know it exists (404)
```

## 2. The single access decision: `project-access.ts`

**File**: [`modules/projects/project-access.ts`](../server/src/modules/projects/project-access.ts) — read this one first.

```
getProjectAccess(ctx, 'WEB')
   │  SELECT project + my project_members row (scoped to the active organization)
   ▼
effectiveRole():
   owner or projects.manage_all ─────────────▶ admin
   I am a project member ────────────────────▶ my role (admin / member / viewer)
   project.visibility = 'organization' ──────▶ viewer
   otherwise ────────────────────────────────▶ 404 "Project not found"
   │
   ▼
{ project, role, canEdit (active && role ≠ viewer), canManage (role = admin) }
```

Every project and work-item service calls this first, then `assertCanEdit(access)` or `assertCanManage(access)`.
**One function = one place to audit**: if access is wrong, it's wrong here, and the tests in `projects.test.ts` catch it.

Why **404 instead of 403** for private projects? A 403 would confirm the project exists (and its key). Big products
(GitHub private repos) answer "not found" for the same reason.

## 3. Creating a project

`ProjectsService.create()` runs in **one transaction**:
1. Insert the project (key unique per organization — `UNIQUE (organization_id, key)`).
2. Copy the **template's** statuses and labels ([`project-templates.ts`](../server/src/modules/projects/project-templates.ts)).
3. Add the creator (and lead) as **project admins**.
4. Write an audit log row.

| Template | Statuses (category) | Default type |
|---|---|---|
| Kanban | To Do (todo) → In Progress (in_progress) → Done (done) | task |
| Scrum | Backlog → To Do → In Progress → In Review → Done | story |
| Bug tracking | Open → In Progress → Ready for QA → **Verified 🔒 qa/admin/owner** → Reopened → Won't Fix | bug |
| Blank | To Do → Done | task |

## 4. Workflow (statuses)

Each status has:
- **category** `todo` / `in_progress` / `done` — reports and "completed" logic only look at the category, so
  you can rename "Done" to "Shipped" without breaking anything;
- **position** — order on boards (reorder = `PUT /statuses/order`);
- **restricted_roles** — organization roles allowed to move items *into* it (empty = anyone who can edit).

Deleting a status that still has items requires `?moveTo=<statusId>`; the items move first, in the same transaction.

## 5. Labels & custom fields

- **Labels** are per project (colour + name, unique ignoring case). Members create them on the fly; admins rename/delete.
- **Custom fields** let each project capture its own data (e.g. *Browser*, *Customer*, *Release*):
  definitions in `project_custom_fields`, values in `work_items.custom_fields` (JSONB, keyed by field id).
  Types: text, number, date, select, multi-select, checkbox; optional *required*. Deleting a field also removes
  its value from every item (`custom_fields - '<id>'`).

**Why JSONB for values?** Adding a field must not require an `ALTER TABLE` per customer. JSONB keeps it flexible
while the server validates every value against its definition (`validateCustomFields()` in `work-items.service.ts`).

## 6. Database-level tenant safety (composite foreign keys)

```sql
FOREIGN KEY (project_id, organization_id) REFERENCES projects (id, organization_id)
```
The child row must point to a project **and** carry the same organization id. So even a bug in a service can't
attach a status, label, member or item of organization A to a project of organization B — PostgreSQL rejects it.
Removing someone from the organization automatically removes their project memberships
(`ON DELETE CASCADE` via `organization_members`).

---

# Part 2c — Work items

**Files**: [`modules/work-items/`](../server/src/modules/work-items) · tables `work_items`, `work_item_labels`, `work_item_links`, `work_item_comments`, `comment_mentions`, `comment_reactions`, `work_item_watchers`, `work_item_attachments`, `work_item_events`

## 1. One table for every kind of work

Jira and Linear use one item model with a `type`; so does Team-Flex. One table means one API, one list, one
search, one history — and changing a task into a bug is just an update.

```
epic ──┬── story ──── subtask
       ├── task  ──── subtask
       └── bug   ──── subtask
```
Rules ([`ALLOWED_PARENTS`](../server/src/modules/work-items/work-items.dto.ts)): stories/tasks/bugs may sit under an epic;
**sub-tasks must** have a story/task/bug parent; changing a type is refused if it breaks the parent or the children.

## 2. Numbering: `TF-1`, `TF-2`, …

```sql
UPDATE projects SET item_counter = item_counter + 1 WHERE id = $1 RETURNING item_counter
```
The `UPDATE` locks the project row until the transaction ends, so two people creating items at the same moment
get 41 and 42 — never two 41s. `UNIQUE (project_id, number)` is the safety net. Items are found by id **or** key:
`/work-items/TF-12`.

## 3. Updating an item — the most important function

`WorkItemsService.update()` (read it slowly; everything in 2c follows the same pattern):

```
resolveItem(ref)          → find item in MY organization + check project access (404 otherwise)
assertCanEdit(access)     → not archived, not viewer
BEGIN
  SELECT … FOR UPDATE     → lock the item, read current values
  for each field sent:
     validate             → hierarchy, workflow restriction, assignee access, labels, custom fields
     compare old vs new   → skip unchanged
     add SET clause + an event { field, oldValue, newValue }
  UPDATE work_items …     → one statement
  INSERT work_item_events → one row per changed field
COMMIT
return full detail        → the UI replaces its state with the server's truth
```

Special cases:
- **Status** → checks `restricted_roles`; entering a `done` status sets `completed_at`, leaving clears it;
  the item moves to the bottom of the new column (`rank`).
- **Assignee** → must be an active member who can access the project; becomes a **watcher**.
- **Long texts** (description, steps…) → the event records *that* it changed, not the whole text (keeps history small).
- **Custom fields** → merged (send only the fields you change; `null` clears).

## 4. History = `work_item_events` (event log)

Every change is a row: who, when, which field, old value, new value. This is the foundation of features
coming later — burndown charts, cycle time ("how long in *In Progress*?"), notifications, AI summaries — so
it is deliberately captured **now**, from day one.

```
History tab:  Ravi changed the status from To Do to In Progress · 2 min ago
              Sara assigned to Ravi · 5 min ago
              Sara created this bug in Open · 6 min ago
```
Rendered by [`ItemHistory.tsx`](../client/src/pages/projects/item/ItemHistory.tsx) (`describe()` turns events into sentences).

## 5. Comments, mentions, reactions, watchers

**File**: [`comments.service.ts`](../server/src/modules/work-items/comments.service.ts)

- Body is **markdown**. Mentions are stored as `@[Ravi Kumar](user:12)`: the id makes it rename-proof, the name keeps it readable.
- The UI ([`MentionInput.tsx`](../client/src/pages/projects/shared/MentionInput.tsx)) lets you type `@Ra…`, pick a person,
  and converts the text to that format on submit.
- Mentioned people must be able to access the project; they're stored in `comment_mentions` and become **watchers**.
- Reactions toggle (`POST …/reactions { emoji }`), one per person per emoji.
- Edit: author only. Delete: author or project admin. Archived project: read-only.

**Watchers** are people who care about an item: reporter, assignee, commenters and mentioned people are added
automatically; anyone can watch/unwatch. Phase 2g (notifications) will email/notify watchers — the data is ready.

## 6. Attachments

**Files**: [`attachments.service.ts`](../server/src/modules/work-items/attachments.service.ts) · [`common/storage/storage.ts`](../server/src/common/storage/storage.ts)

```
Upload:   multer (memory, max 10 MB) → storage.save('org-12/2026/10/<uuid>.png') → INSERT metadata → event
Download: GET …/attachments/:id → access check → stream from storage (never a public URL)
Delete:   uploader or project admin → DELETE row → remove file
```
- Files are **tenant-prefixed** (`org-<id>/…`) and named by UUID (no user-controlled paths; path traversal is blocked).
- Only safe types (png, jpeg, gif, webp, pdf, txt) are served **inline**; everything else is forced to download with
  `application/octet-stream` — an uploaded HTML/SVG file can never run scripts on your site.
- The `FileStorage` interface (`save` / `read` / `remove`) lets an S3 driver replace local disk without touching services.
- Images in the UI are fetched with the auth header as **blobs** and shown via object URLs ([`ItemAttachments.tsx`](../client/src/pages/projects/item/ItemAttachments.tsx)).

## 7. Links between items

Stored once (`source → target, type`); the wording is computed per side:

| Stored | Seen from source | Seen from target |
|---|---|---|
| `blocks` | blocks | is blocked by |
| `duplicates` | duplicates | is duplicated by |
| `relates_to` | relates to | relates to |

Links can cross projects inside the organization; items in projects you can't see are hidden from your list.

## 8. Search & filters

- `work_items.search_vector` is a **generated column** (`tsvector`, title weighted above description) with a GIN index,
  so full-text search is fast and always in sync — no extra service needed.
- Search also matches keys and numbers (`TF-12`, `12`).
- Filters (type, status, category, assignee incl. `me` / `none`, priority, label, parent) are built safely with
  parameters in `WorkItemsService.list()`. In the UI they live in the **URL** so a filtered view can be bookmarked or shared.

## 9. The work item page (client)

```
WorkItemPage.tsx
 ├─ header: type (changeable), status tag, editable title (Typography editable)
 ├─ EditableMarkdown: description, bug details (steps / expected / actual) + environment
 ├─ ItemRelations.tsx: ChildItems (progress + quick add) · LinkedItems (search & link)
 ├─ ItemAttachments.tsx
 ├─ Tabs: ItemComments.tsx · ItemHistory.tsx
 └─ ItemSidebar.tsx: status (locked statuses disabled), assignee (+ assign to me), priority, severity,
                     labels (+ create inline), due date, estimate, custom fields, watchers, timestamps
```
Pattern: **every edit calls `save(changes)` → PATCH → the server returns the full item → replace local state**,
then the History tab refreshes. No client-side guessing of the result.

---

## Hands-on tour (try everything in 15 minutes)

1. **Projects → New project** → choose **Bug tracking**, name "Web App" (key `WA` is suggested).
2. **Create** a bug: fill steps / expected / actual, priority *High*, severity *Major*. Open it (`WA-1`).
3. Assign it to yourself, add a label (create one inline), set a due date.
4. **Members tab** (project settings) → add a teammate as *member*. **Workflow tab** → see the 🔒 on *Verified*.
5. As a *developer*, try moving the bug to **Verified** → refused. As QA (or admin) → allowed, `completed_at` set.
6. Comment `@Teammate please check`, add a 👍 reaction, attach a screenshot (see the preview), link `WA-1 blocks WA-2`.
7. Open the **History** tab — every step above is there.
8. Log out → **Forgot password** → read the email in **Platform → Mailbox** → reset → old sessions are gone.
9. **Platform → Background Jobs** → see the `email.send` jobs that delivered those emails.
10. Run `npm test` in `server/` → 43 green tests prove the rules you just clicked through.

---

## Where to look first (reading order)

| # | File | Why |
|---|---|---|
| 1 | `server/src/database/schema.sql` §1b, §1c | See every Phase 2 table and how they connect |
| 2 | `server/src/jobs/worker.ts` | Understand background work and `SKIP LOCKED` |
| 3 | `server/src/modules/email/email.service.ts` | The 2-step "queue then send" pattern |
| 4 | `server/src/modules/projects/project-access.ts` | The single project access decision |
| 5 | `server/src/modules/work-items/work-items.service.ts` → `update()` | Validation + events + transaction pattern |
| 6 | `server/tests/api/work-items.test.ts` | The rules, written as executable examples |
| 7 | `client/src/pages/projects/item/WorkItemPage.tsx` | How the UI saves and refreshes |

---

## Glossary

| Term | Meaning |
|---|---|
| **Job / queue / worker** | A unit of background work / the `jobs` table / the loop that runs them |
| **Transactional outbox** | Writing the job (or email) in the same DB transaction as the change that caused it |
| **SKIP LOCKED** | PostgreSQL option that lets competing workers skip rows already being processed |
| **Backoff** | Waiting longer after each failed attempt before retrying |
| **Idempotent** | Running it twice has the same effect as once (`schema.sql`) |
| **Migration** | A versioned, one-time database change, tracked in `schema_migrations` |
| **Effective role** | The project role that actually applies after considering org permissions, membership and visibility |
| **Status category** | `todo` / `in_progress` / `done` — the meaning behind any status name |
| **Rank** | Number that orders items inside a status column (used by boards in 2d) |
| **Work item event** | One recorded change of one field (history) |
| **Watcher** | Someone subscribed to an item's updates |
| **Composite foreign key** | A FK over two columns (`id, organization_id`) that also enforces "same tenant" |
| **Generated column** | A column PostgreSQL computes itself (`search_vector`) |

---

## FAQ

**Where do emails go right now?** Into the `email_messages` table — read them in **Platform → Mailbox**.
Set `EMAIL_DRIVER=ethereal` for preview links or `smtp` for real delivery.

**A job failed — what now?** Platform → Background Jobs shows the error; fix the cause (e.g. SMTP credentials) and press **Retry**.

**I added a column — schema.sql or migration?** `schema.sql` (`ALTER TABLE … ADD COLUMN IF NOT EXISTS`). Use a migration only to change existing data.

**Can I edit an applied migration?** No — `db:init` will refuse. Create a new one with `npm run db:new -- <name>`.

**Why can't a teammate see my project?** It's private and they aren't a project member. Add them in Project settings → Members (or make it organization-visible).

**Why can't I move an item to "Verified"?** That status is restricted to certain organization roles (Project settings → Workflow).

**Do tests touch my data?** No. They use `team_flex_test`, rebuilt on every run, and `uploads-test/` for files.

**Where are uploaded files?** `server/uploads/org-<id>/<year>/<month>/` (git-ignored). Back this folder up with the database.

**What's next?** 2d — Kanban board (drag & drop using `rank`), backlog, saved views, Cmd+K, real-time updates.
