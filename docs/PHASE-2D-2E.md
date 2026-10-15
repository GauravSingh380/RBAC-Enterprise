# Phase 2d · 2e — How it works (boards, real-time, sprints, reports)

A **learning guide**, like [PHASE-2.md](PHASE-2.md). The [README](README.md) is the reference (every endpoint and
setting); this file explains **how the new parts work inside, why they were built this way, and where to look**.

| Part | What it adds | Read time |
|---|---|---|
| [2d — Daily work](#part-2d--daily-work) | Board, ordering (`rank`), backlog, bulk edit, saved views, Ctrl/⌘ K | 15 min |
| [Real-time](#real-time--how-a-change-reaches-other-screens) | SSE + PostgreSQL LISTEN/NOTIFY, tickets, reconnects | 10 min |
| [2e — Sprints & reports](#part-2e--sprints--reports) | Sprint lifecycle, snapshots, burndown replay, velocity, overview | 15 min |
| [Hands-on tour](#hands-on-tour-10-minutes) · [Where to look](#where-to-look-first) · [FAQ](#faq) | | — |
| **Next:** [PHASE-2F.md](PHASE-2F.md) | Bug flow, test management, production errors | 35 min |

---

## The big picture

```
                 ┌──────────── Board ─────────────┐   ┌──── Backlog ────┐   ┌─ Reports ─┐
 browser tab ─── │ drag card → POST /items/:id/move │   │ drag → move     │   │ burndown   │
                 └────────────────┬─────────────────┘   │ start/complete  │   │ velocity   │
                                  │                     └────────┬────────┘   │ overview   │
                                  ▼                              ▼            └─────┬──────┘
                      WorkItemsService.applyChanges()      SprintsService           │ (read only)
                      (ONE code path for edit/move/bulk)   (snapshots)              ▼
                                  │                              │          ReportsService
                                  ▼                              ▼          (replays work_item_events)
                       work_items + work_item_events  ◀───── same history ─────────┘
                                  │
                         after COMMIT: pg_notify('tf_events')
                                  │
               every API instance LISTENs → SSE stream → other tabs reload what they show
```

Three ideas carry the whole phase:

1. **One change engine.** A normal edit, a drag on the board and a bulk edit all go through
   `applyChanges()` — same validation (workflow restrictions, assignee access, completed sprints), same history.
2. **History is the source of truth for reports.** Every status / sprint / estimate change is already an event,
   so the burndown of *any* past day can be recomputed — no nightly snapshot jobs.
3. **Real-time events are "something changed" signals, not data.** The browser re-fetches through the normal API,
   so access rules are never duplicated in the push channel.

---

# Part 2d — Daily work

## 1. Ordering: the `rank` column

Every item has `rank DOUBLE PRECISION`. Lists sorted by `rank` give the manual order of a board column or a backlog
section. New items get `MAX(rank) + 1024` (bottom of the project).

**Dropping between two items** sends their ids — not positions:

```
POST /api/work-items/TF-7/move   { "statusId": 12, "prevId": 41, "nextId": 39 }
                                   new column     item above     item below
```

`rankBetween()` in `work-items.service.ts` reads the two ranks and takes the **midpoint**:

```
prev 2048 ─┐
           ├─ new rank = (2048 + 3072) / 2 = 2560
next 3072 ─┘        only prev → prev + 1024        only next → next − 1024
```

Why ids instead of "position 3"? Positions depend on the filters each user has on screen; ids of neighbours are
unambiguous for everyone.

**Running out of room.** Halving a gap ~50 times reaches floating-point precision. When two neighbours are closer
than `1e-6`, the project is **re-spaced** in one statement (1024, 2048, 3072 … in the current order) and the midpoint
is computed again. Tested in `tests/api/boards.test.ts` ("re-spaces ranks").

Re-ordering alone is **not** written to history (it would flood the History tab); a status or sprint change is.

## 2. One change engine: `applyChanges()`

```ts
update(ref, dto)        → withTransaction(client => applyChanges(client, item, access, dto, ctx))
move(ref, {statusId, sprintId, prevId, nextId}) → rankBetween(...) + applyChanges(...)
bulkUpdate(project, {itemIds, changes})         → for each item: applyChanges(...)   (one transaction)
```

`applyChanges` locks the row (`FOR UPDATE`), compares every field with the current value, validates, builds one
`UPDATE` and one batch of `work_item_events`, and returns the ids that changed (the item plus sub-tasks that followed
it to another sprint). Because bulk edit runs in **one transaction**, it is all-or-nothing: one item from another
project or one forbidden status rolls back everything (`boards.test.ts` "is all-or-nothing").

## 3. The board (client)

`pages/projects/board/BoardPage.tsx` — columns = `project.statuses`.

| Piece | File | Job |
|---|---|---|
| Pure rules | `shared/boardRules.ts` | `groupInto`, `moveToColumn`, `reorderInColumn`, `neighbours`, `isOverWip` — unit-tested, no React |
| Drag state | `shared/useDragColumns.ts` | @dnd-kit handlers; moves the card between columns **while dragging**; on drop calls your `onDrop` |
| Card | `board/BoardCard.tsx` | sortable wrapper + the visual card (also used in the drag overlay) |

**Optimistic UI without effects.** The hook keeps `{ source, columns }`: the local layout *and* the server data it was
made from. While `source` is still the current data, the local layout wins (the card stays where you dropped it). When
fresh data arrives, `source` no longer matches and the server's version is shown. On error the local layout is dropped
→ the card jumps back and a message explains why (e.g. "Only qa can move items to Verified").

**WIP limits** (`project_statuses.wip_limit`, set in Settings → Workflow) are *soft*: the column turns red with
`5 / 4`; nothing is blocked — that is how Kanban teams use them.

**Scrum vs Kanban.** If the project has an active sprint, the board shows it (`sprint=active`) with a switch to "All
items". Epics never appear as cards (they group work across sprints).

## 4. Backlog

`pages/projects/backlog/BacklogPage.tsx` loads `GET /items?sprint=planning` = everything in planned/active sprints plus
**unfinished** items without a sprint, sorted by rank. Sections are the open sprints + "Backlog"; the same
`useDragColumns` hook moves items between sections (`move` with `sprintId`, `null` = backlog).

Sub-tasks are hidden here: they **follow their parent** (`applyChanges` → `moveItemsToSprint()` for sub-task children,
each with its own history event). Points shown per section skip sub-tasks so nothing is counted twice.

## 5. Saved views & filters in the URL

All list/board filters live in the URL (`?types=bug&assignees=me&priorities=urgent`). That gives bookmarks, sharing and
the back button for free — and a **saved view is just that query stored with a name** (`saved_views.filters` JSONB).
Applying a view = replacing the URL query. `shared/useItemFilters.ts` owns this; `FilterBar` and `SavedViewsMenu` use it.

Rules (`saved-views.service.ts`): private views for anyone who can see the project; **shared** views need edit rights;
the owner can change / delete; project admins can also tidy shared views. Filter keys/values are validated (letters only,
≤ 20 keys) — the API validates them again whenever the list is loaded, so a crafted view cannot do anything a URL cannot.

## 6. Ctrl / ⌘ K

`components/CommandPalette.tsx`, mounted once in `DashboardLayout`. It merges: work-item search (`GET /work-items?search=`,
debounced 200 ms, accepts keys like `TF-12`), projects, the current project's tabs, every page in **your** sidebar (already
permission-filtered by the server), and actions (dark mode). Keyboard: ↑ ↓ Enter Esc. Opened items are kept as
"Recent" in `localStorage` (wrapped in try/catch — private mode just has no recents).

---

# Real-time — how a change reaches other screens

```
Tab A drags TF-7 ──▶ POST /move ──▶ COMMIT ──▶ publishItems(ctx, project, 'moved', [7])
                                                 │  SELECT pg_notify('tf_events', '{"type":"items","projectId":3,"itemIds":[7],…}')
                                                 ▼
                         API instance 1 (LISTEN tf_events)        API instance 2 (LISTEN tf_events)
                                 │ for each open stream:                  │
                                 │   same organization?                   │
                                 │   can this user see project 3?  (getProjectAccess, cached 30 s)
                                 ▼                                        ▼
                         Tab B: event: items  → useLiveReload → GET /items (normal access checks)
```

### Why Server-Sent Events (SSE)?
We only need **server → browser**. SSE is plain HTTP (`Content-Type: text/event-stream`), works through proxies, and the
browser's `EventSource` parses it. WebSockets would add a second protocol and library for a two-way channel we don't need.

### Why LISTEN/NOTIFY?
With two API servers behind a load balancer, Tab A's request may hit server 1 while Tab B is connected to server 2.
`pg_notify` goes through the database both already use, so every instance hears every event — no Redis to run.
(At very large scale you'd swap the hub for Redis pub/sub; the services' `publish…()` calls stay the same.)

### The ticket (authentication)
`EventSource` cannot send an `Authorization` header. So the client first calls `POST /api/realtime/ticket` (normal
Bearer token + organization) and gets a **60-second JWT** with `type: 'realtime'` and audience `realtime`. It is
useless as an access token, and an access token is useless as a ticket (`tokens.ts` checks both). The ticket appears in
the URL, so the HTTP logger replaces it with `[REDACTED]`.

### Keeping streams honest
| Concern | Answer (`realtime.hub.ts`) |
|---|---|
| Private projects | every event is checked with `getProjectAccess` for each stream (cached 30 s) |
| Other organizations | events carry `organizationId`; streams of other orgs never see them (test: "does not leak") |
| Removed member / disabled account | every ~4 min the hub re-loads user + membership; gone → `revoked` + close |
| Idle proxies closing the connection | `: ping` comment every 25 s |
| Too many tabs | max 10 streams per user (429) |
| Server restart / DB blip | client reconnects with a **new** ticket (backoff 1 s → 30 s) and gets `resync` → pages reload |
| Our own change echoing back | every request sends `X-Client-Id` (random per tab); events include it; that tab ignores them |
| Logging noise | the LISTEN connection is created outside any request's log context (`logContext.exit`) so its queries never pile onto one request |

### Client side
`lib/realtime.ts` — one `EventSource` per tab, opened by the first subscriber, closed 5 s after the last one leaves.
`hooks/useRealtime.ts`:

```tsx
useLiveReload(project.id, items.reload)                    // board, list
useLiveReload(project.id, reload, ['items', 'sprints'])     // backlog
useLiveReload(project.id, reloadItem, ['items'], item.id)   // one item page (and its comments)
const status = useRealtimeStatus()                         // "Live" badge in the project header
```

Reloads are debounced (250 ms) so a bulk edit of 50 items causes one fetch, not 50.

---

# Part 2e — Sprints & reports

## 1. Lifecycle

```
 planned ──start──▶ active ──complete──▶ completed (read-only history)
    │                  │
  delete             delete   → items go back to the backlog (history event per item)
```

| Rule | Where it is enforced |
|---|---|
| One active sprint per project | **database**: `CREATE UNIQUE INDEX uq_sprints_one_active ON sprints (project_id) WHERE status = 'active'` — two simultaneous "start" clicks cannot both win; the API turns the violation into `409` |
| Item and sprint in the same project | composite FK `(sprint_id, project_id) → sprints (id, project_id)` |
| Deleting a sprint never deletes items | FK `ON DELETE SET NULL (sprint_id)` (only that column — PostgreSQL 15+) — and the service moves them first to record history |
| No items into completed sprints | `applyChanges` / `create` |
| Completed sprints keep their dates, can't be deleted | `SprintsService.update / remove` |

## 2. Snapshots for velocity

* **Start** stores `committed_points` / `committed_count` = the scope the team committed to.
* **Complete** stores `completed_points` / `completed_count` **before** moving unfinished items out — in the same
  transaction, so the numbers and the moves are consistent.

Velocity then is just `SELECT … FROM sprints WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 7` — no
recalculation, and later edits to old items can't rewrite history. *Say/do ratio* = completed ÷ committed points.

Points = sum of `estimate` of stories / tasks / bugs; **sub-tasks are excluded** (their effort is part of the parent).

## 3. Burndown — replaying history

The question: *"how much work was left in this sprint at the end of day N?"* We never stored that. But we stored every
change. For an item and a field, at time **T**:

```
value(T) = old value of the FIRST change after T      (if there is one)
         = current value                               (otherwise)
```

Example — TF-12's status events: `To Do → In Progress` (Tue 10:00), `In Progress → Done` (Thu 15:00).

| T | first change after T | value(T) |
|---|---|---|
| Mon 23:59 | Tue 10:00 (old = To Do) | To Do |
| Wed 23:59 | Thu 15:00 (old = In Progress) | In Progress |
| Fri 23:59 | none | current = Done |

`ReportsService.burndown()` does this for `sprint`, `status` and `estimate` of every item that is or ever was in the
sprint (found via current `sprint_id` + `sprint` events), at the end of every day. For each day:
`scope` = items in the sprint, `remaining` = those not in a done-category status, plus an `ideal` straight line from the
starting scope to 0 at the planned end date. Days in the future are `null` (the line stops at today).

**The completion trick.** Completing a sprint moves unfinished items out — that is not a "scope removal". The move events
are written in the completion transaction, and PostgreSQL's `NOW()` is the **transaction start time**, so their
`created_at` equals `sprints.completed_at` exactly. The report evaluates "the end" at `completed_at − 1 ms` → it still
sees those items in the sprint (listed under *Not completed*) and ignores the moves as scope changes.

## 4. Overview report

All plain SQL in `reports.service.ts`, run in parallel:

| Card | How |
|---|---|
| Created vs resolved | `generate_series(CURRENT_DATE − (days−1), CURRENT_DATE, '1 day')` → one row per day even with no activity |
| By status / type / priority | `GROUP BY` (status keeps workflow order) |
| Workload | open items per assignee (+ in progress, points), unassigned as its own row |
| Lead time | `completed_at − created_at` (median via `percentile_cont(0.5)`, and average) |
| Cycle time | from the first status event into a non-"to do" status → done (from history) |

## 5. Charts (client)

`pages/projects/reports/` — recharts, loaded **only** on the Reports page (its own ~400 KB chunk; the rest of the app
doesn't pay for it). Colour rules in `chartTheme.ts`: two series = blue + orange (validated for colour-blind readers in
light **and** dark mode, separate dark steps), reference lines grey, text never in series colours, every multi-series
chart has a legend. Every chart has a **Chart ↔ Table** switch (`chartKit.tsx`) — exact numbers and accessibility.

---

## Hands-on tour (10 minutes)

1. Create a project with the **Scrum** template. Open **Backlog** → *Create sprint* (twice).
2. Create a few items with the inline *Create* in the Backlog; give them estimates (item page → Estimate).
3. Drag items into *Sprint 1*, re-order them, drag one back. Open an item → History shows the sprint moves.
4. *Start sprint* (2 weeks). Open **Board**: the active sprint is shown. Drag cards across columns.
5. Settings → Workflow → set *In Progress* WIP limit to 1 and drag two cards there → the column turns red.
6. Open the same board in a **second browser window** (or as another member): drag in one, watch the other update. The
   header badge says **Live**.
7. **List** → select rows → bulk set priority. Save the filters as a view; switch views from the *Views* menu.
8. Press **Ctrl K** (⌘ K on Mac) → type a key like `TF-3` → Enter.
9. Mark some items Done, then **Backlog → Complete sprint** → move the rest to Sprint 2.
10. **Reports** → Sprint burndown (pick Sprint 1), Velocity, Overview. Flip a chart to *Table*.

---

## Where to look first

| Order | File | Why |
|---|---|---|
| 1 | `server/src/modules/work-items/work-items.service.ts` → `move`, `bulkUpdate`, `applyChanges`, `rankBetween` | the change engine |
| 2 | `server/src/modules/work-items/work-item-sprints.ts` | moving items between sprints with history (two statements for any number of items) |
| 3 | `server/src/modules/sprints/sprints.service.ts` | lifecycle + snapshots |
| 4 | `server/src/modules/reports/reports.service.ts` → `valueAt`, `burndown` | history replay |
| 5 | `server/src/modules/realtime/realtime.hub.ts` + `realtime.routes.ts` | SSE + LISTEN/NOTIFY |
| 6 | `client/src/pages/projects/shared/boardRules.ts` → `useDragColumns.ts` → `board/BoardPage.tsx` | drag & drop |
| 7 | `client/src/lib/realtime.ts` → `hooks/useRealtime.ts` | live updates in the browser |
| 8 | `server/tests/api/boards.test.ts`, `sprints.test.ts`, `realtime.test.ts` | executable documentation |

---

## FAQ

**Why not store the board column order separately per column?** One project-wide rank is simpler and works for every
view at once (board column, backlog section, list sorted by rank) — items of a column are just a filtered, rank-sorted list.

**Two people drop into the same spot at the same time?** Both get the same midpoint; ties are broken by `id`. Nothing breaks,
and the next drop there re-spaces if needed.

**Does realtime work with several server instances?** Yes — that's what LISTEN/NOTIFY is for. Each instance holds one extra
database connection for listening.

**What if the realtime connection is down?** Everything still works; screens just don't update by themselves (the badge
shows *Offline*, use refresh). On reconnect, pages reload automatically (`resync`).

**Why can't I see an item's sub-tasks in the backlog?** They follow their parent. Move the story and its sub-tasks move with it.

**The burndown says "Item count" — where are my points?** It switches to points automatically when the sprint's items have
estimates; use the *Story points / Item count* switch.

**I changed an old item's estimate — does velocity change?** No. Velocity uses the snapshots taken at start / completion.
The burndown of that sprint, however, replays history and reflects estimate changes made *during* the sprint.
