# Phase 2f — How it works (bug flow, test management, production errors)

A **learning guide**, like [PHASE-2.md](PHASE-2.md) and [PHASE-2D-2E.md](PHASE-2D-2E.md). The [README](README.md) is the
reference (every endpoint and setting); this file explains **how the quality features work inside, why, and where to look**.

| Part | What it adds | Read time |
|---|---|---|
| [1. Bug flow](#part-1--bug-flow) | Severity vs priority, bug fields, resolution, QA verification, duplicate detection | 10 min |
| [2. Test management](#part-2--test-management) | Suites, test cases, runs (snapshots), execution, failure → bug | 10 min |
| [3. Production errors → bugs](#part-3--production-errors--bugs) | Capture, fingerprints, the SQL of the request, auto-resolve, regressions | 15 min |
| [Hands-on tour](#hands-on-tour-10-minutes) · [Where to look](#where-to-look-first) · [FAQ](#faq) | | — |
| **Next:** [PHASE-2G.md](PHASE-2G.md) | Dashboards, reports, leave & holidays | 30 min |

---

## The big picture — one quality loop

```
   QA runs tests ──fail──▶ bug (pre-filled from the test) ─┐
                                                          │
   production 500 / browser crash ──▶ error group ──▶ bug ┤──▶ developer fixes ──▶ "Ready for QA"
                                                          │                              │
   anyone files a bug ──(possible duplicates?)────────────┘                     QA: Pass │ Fail
                                                                                    │     └─▶ Reopened (+1, reason as comment)
                                                                                    ▼
                                                                    Verified (resolution "fixed")
                                                                    └─▶ linked production errors → resolved
                                                                        …happens again? → regression, bug history says so
```

Everything reuses what already existed: work items, the history table, comments, links, project statuses with role
restrictions, the SQL logger and the request id from Phase 1.

---

# Part 1 — Bug flow

## 1. Severity is not priority

| | Severity (`severity`) | Priority (`priority`) |
|---|---|---|
| Question | *How bad is it?* (impact) | *How soon do we fix it?* (urgency) |
| Who sets it | usually the reporter / QA | usually the product owner / lead |
| Example | typo on the invoice → **minor** | …but a big customer complains → **urgent** |

Both are separate columns, so a "critical but low priority" bug (rare edge case) is expressible.

Bug-only fields: environment, **browser, OS, found-in version, fixed-in version**, steps to reproduce, expected vs actual.
The create form has **Use my browser** (parses `navigator.userAgent`, `detectBrowser()` in `itemRules.ts`).

## 2. Resolution follows the workflow

`resolution` answers *why* a bug was closed: `fixed`, `duplicate`, `wont_fix`, `cannot_reproduce`, `by_design`.
Inside `applyChanges()` (the one change engine from 2d):

```ts
if (next.category === 'done' && prev.category !== 'done' && type === 'bug' && !current.resolution) → resolution = 'fixed'
if (next.category !== 'done' && current.resolution)                                              → resolution = null
```

So nobody has to remember to set it, and an explicit choice ("won't fix") is kept.

## 3. QA verification flow

Each project can name three statuses (`projects.qa_ready_status_id / qa_passed_status_id / qa_failed_status_id`,
Settings → Workflow → *QA verification flow*). The Bug tracking template sets **Ready for QA → Verified / Reopened**;
migration `0002` did the same for existing Bug tracking projects.

`POST /work-items/TF-7/qa { verdict, comment, fixedInVersion }` → `WorkItemsService.qaVerdict()`:

1. the item must be in the *ready* status (else **409** — stale screens can't double-verify)
2. **who may judge** = whoever may enter the *passed* status → reuses the status role restriction (Verified is
   restricted to `qa / admin / owner`, so a developer gets **403** — even for "fail")
3. pass → `applyChanges({ statusId: passed, fixedInVersion })` (resolution becomes *fixed* automatically)
4. fail → `applyChanges({ statusId: failed })`, `reopen_count + 1`, the reason is posted as a **comment** (so the
   developer gets the context where they already look), event `qa_failed` in history

`reopen_count` is a quality signal: bugs that bounce back often show a "reopened ×2" tag on the item.

## 4. Duplicate detection

While you type a title, the form calls `GET /projects/TF/items/similar?title=…` (debounced 400 ms):

```sql
similarity(w.title, $title)                       -- pg_trgm: compares 3-letter chunks → typos & word order
+ 0.5 * ts_rank(search_vector, 'login | safari | crash …')   -- any meaningful word (full-text)
WHERE w.title % $title OR search_vector @@ …       -- % uses the GIN trigram index
```

`pg_trgm` is a standard PostgreSQL extension (`CREATE EXTENSION IF NOT EXISTS pg_trgm` at the top of `schema.sql`).
"safari login crash with empty pasword" still finds "Login page crashes on Safari when password is empty".

**Close as duplicate** (item menu) → `closeAsDuplicate()`: a `duplicates` link, resolution *duplicate*, the first
unrestricted done status, and the duplicate's watchers start watching the original (they still get the fix).

> 💡 **A bug found while building this** (worth knowing): `ITEM_SELECT` already uses the alias `s` for statuses. The
> similarity subquery was first also called `s`, so inside the joined `ITEM_SELECT` `s.id` meant the *status* id — wrong
> rows, but only sometimes. Lesson: when composing SQL fragments, give outer aliases names the fragment can't use.

---

# Part 2 — Test management

## 1. The model

```
test_suites (folders)   test_cases (TC-1 … reusable checks)      test_runs ("Release 2.4 regression")
      │                        │ steps: [{action, expected}]            │ environment, build, sprint
      └──── suite_id ──────────┤                                        │
                               │ work_item_id → the story it covers     │
                               └──── snapshot at run creation ──▶ test_results (one per case per run)
                                                                     status, step_results, comment, bug_id
```

* `TC-<n>` numbering per project uses the same row-lock counter trick as items (`projects.test_case_counter`).
* A case **covers** a story → the story page lists its test cases with their latest result ("test coverage").

## 2. Why runs snapshot the cases

`test_results` copies title, preconditions and steps when the run is created (one `INSERT … SELECT FROM
jsonb_array_elements(...)`). If someone edits TC-12 next week, last month's run still shows exactly what was tested;
deleting a case keeps the history (`test_case_id` becomes NULL, the copy stays). Only **ready** cases join a run —
drafts are unfinished, deprecated ones retired.

## 3. Executing

`PATCH …/results/:id { stepResults: ['passed','failed'], comment }` — a failed (or blocked) step decides the case
unless an explicit status is sent (`outcomeFromSteps()` mirrors the rule on the client). `executed_by / executed_at`
are set; "untested" clears them. Several testers can work the same run: every change publishes a realtime `tests`
event and the run page reloads. Completed runs are read-only until reopened.

The run page is built for speed: **P** pass · **F** fail · **B** blocked · **S** skip · **J / K** next / previous
(ignored while typing in a field).

## 4. Failure → bug

`POST …/results/:id/bug` → `TestRunsService.fileBug()` creates a normal bug through `WorkItemsService.create()`
(so all the usual rules apply) and fills it from the test:

| Bug field | From |
|---|---|
| Steps to reproduce | preconditions + steps **up to the one that failed** (marked "← fails here") |
| Expected result | that step's expected result |
| Actual result | the tester's notes |
| Environment / found in version | the run's environment / build |
| Title | `[TC-12] <case title> fails` (editable) |

The result stores `bug_id`; the bug shows **Found by test** (history event `test_failed`). A result can file one bug.

---

# Part 3 — Production errors → bugs

## 1. Capture — reusing the logging system

```
server: any unexpected error ──▶ errorHandler: 500 + requestId to the client
                                   └─▶ (after responding) captureServerError(err, req)
browser: error boundary / window.onerror / unhandled promise ──▶ POST /api/client-errors
                                   └─▶ captureClientError(report, { userId, organizationId })
```

What an occurrence (`error_events`) keeps — mostly things Phase 1 logging already had:

| Field | Source |
|---|---|
| `request_id` | the AsyncLocalStorage log context → the same id as in `logs/http-*.log` |
| `context.queries` | **the last 5 SQL statements of this request, values filled in** — straight from the SQL logger (the failing one is usually last) |
| route, method, URL | Express (`routePattern()` turns `/api/projects/WEB/items/9` into `/api/projects/:projectRef/items/:id`) |
| user, organization | `req.user`, `req.tenant` |
| release | `APP_VERSION` (server) / `VITE_APP_VERSION` (bundle) |
| browser extras | component stack, page, user agent |

Rules: capture **never throws** and runs after the response (a failing capture logs a warning, nothing else).
Browser reports are public (a crash can happen on the login page), rate-limited, and only attributed to an
organization if the token's user **is a member** of the organization in the header.

## 2. Grouping: fingerprints

Ten thousand occurrences of the same bug must be **one** row in the inbox. `fingerprint.ts` (pure, unit-tested):

```
sha1( source | error type | normalizeMessage(message) | top frame of OUR code | method + route pattern )

normalizeMessage("User 42 not found (id 9f1c…)")  → "User <n> not found (id <uuid>)"
serverTopFrame(stack)  → "modules/projects/projects.service.ts in ProjectsService.create"   (no line numbers / machine paths)
clientTopFrame(stack)  → "/assets/BoardPage.js in onDrop"   (bundle hash BoardPage-AbC123de.js removed → survives deploys)
```

Storage is one UPSERT on the unique index `(COALESCE(organization_id, 0), source, fingerprint)`:

```sql
INSERT INTO error_groups (...) VALUES (..., 1, ...)
ON CONFLICT ((COALESCE(organization_id, 0)), source, fingerprint) DO UPDATE
   SET occurrences = error_groups.occurrences + 1, last_seen_at = NOW(),
       status       = CASE WHEN error_groups.status = 'resolved' THEN 'unresolved' ELSE error_groups.status END,
       regressed_at = CASE WHEN error_groups.status = 'resolved' THEN NOW() ELSE error_groups.regressed_at END
```

(`COALESCE` because errors outside any organization have `NULL`, and NULLs are never equal in a unique index.)
Only the newest 100 occurrences per group are kept (pruned every 25th occurrence); the counter keeps the true total.

## 3. The loop: bug, auto-resolve, regression

* **Create bug** (`errors.manage` + edit rights in the chosen project) → a pre-filled bug: occurrences, route,
  release, request id, stack in the description; browser / OS parsed from the user agent; severity *critical* from 100
  occurrences. `error_groups.work_item_id` links them; the bug gets an `error_linked` history event and a
  **Production errors** panel.
* **Auto-resolve**: when the linked bug reaches a done status, `applyChanges()` marks its errors resolved.
* **Regression**: the UPSERT above flips a resolved group back to unresolved and sets `regressed_at`; the tracker adds
  an `error_regressed` event to the bug ("it's back, in release 2.5.1").
* Ignored groups keep counting but stay ignored (noise you accepted).

## 4. Who sees what

| Who | Where | Scope |
|---|---|---|
| `errors.read` (Admin, QA, Developer by default) | **Production Errors** in the sidebar | the active organization |
| `errors.manage` | same page: resolve / ignore / create / link bug | — |
| Platform admins | Platform → **All Errors** | every organization + errors outside any organization (shows the organization) |
| Everyone who can see the bug | bug page → Production errors panel | title, status, count (details need `errors.read`) |

Stack traces and SQL can contain internal details, which is why they live behind a permission and not on the bug itself
(the bug description only carries the request id and the top of the stack).

---

## Hands-on tour (10 minutes)

1. Create a project with the **Bug tracking** template. Create a bug "Login crashes on Safari when the password is empty".
2. Start creating another: type "safari login crash" — **Possible duplicates** appears. Create it anyway, then on it use
   **⋯ → Close as duplicate…** and pick the first one.
3. On the first bug: move it to **Ready for QA** → the *Waiting for QA verification* panel appears. As a **QA** member,
   **Fail** it with a reason (comment + "reopened ×1"), move it back, then **Pass** it with a fixed-in version.
4. Open **Tests** → create a suite "Login" and two cases with steps (one *covers* a story). **Test runs → New test run**.
5. Execute: pass one case with **P**, fail a step on the other, write notes, **File bug** → open the bug: steps, expected,
   actual and environment are filled in, and it says *Found by test*.
6. Open **Production Errors** (sidebar) → **Try it (dev) → Simulate a server error** (twice) → one group, 2 events.
   Open it: request id, SQL tab, stack. **Create bug** in your project.
7. Verify that bug → the error shows **resolved**. Simulate again → it is back as **regression**, and the bug's history says so.
8. In the browser console of the app run `setTimeout(() => { throw new Error('demo crash') })` → a **browser** error appears in the inbox.

---

## Where to look first

| Order | File | Why |
|---|---|---|
| 1 | `server/src/modules/work-items/work-items.service.ts` → `qaVerdict`, `closeAsDuplicate`, `similar`, the status block in `applyChanges` | bug flow |
| 2 | `server/src/modules/qa/test-runs.service.ts` → `create` (snapshot), `updateResult`, `fileBug` | test execution |
| 3 | `server/src/modules/errors/fingerprint.ts` | grouping (pure functions + `tests/unit/fingerprint.test.ts`) |
| 4 | `server/src/modules/errors/error-tracker.ts` | capture, UPSERT, regression |
| 5 | `server/src/common/middleware/error.middleware.ts` · `modules/client-errors/` | where capture is hooked in |
| 6 | `client/src/pages/projects/tests/TestRunPage.tsx` | the execution screen |
| 7 | `client/src/pages/errors/ErrorDetailPage.tsx` | how an error is presented |
| 8 | `server/tests/api/bugs.test.ts`, `test-cases.test.ts`, `errors.test.ts` | executable documentation |

---

## FAQ

**Why not use Sentry?** You can, later. Building the core in-house shows how it works, needs no account, keeps data in your
database, and — the differentiator — connects errors to *your* bugs, QA flow and request logs (SQL included).

**Does capturing slow down failing requests?** No — the 500 is sent first; capture runs afterwards and never throws.

**What if the database is down?** Then capture fails too; the error is still in `logs/error-*.log` (Phase 1 logging), and a
warning says capture failed.

**Why are line numbers ignored in fingerprints?** Adding a line above a bug would otherwise create a "new" error.
Function and file are stable enough; the full stack with line numbers is still stored on every occurrence.

**Browser stacks show minified names in production.** Yes — source maps (deminifying stacks) are on the roadmap.

**Can I give a QA verdict on a project without the flow?** No (400). Turn it on in Settings → Workflow, or use any workflow you like without it.

**Why does "Fail" need a comment?** "It doesn't work" without details costs the developer a round-trip. The reason becomes a comment on the bug.
