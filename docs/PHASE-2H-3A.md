# Phase 2h · 3a — How it works (notifications, capacity planning)

A **learning guide** like the earlier ones ([2a–2c](PHASE-2.md) · [2d–2e](PHASE-2D-2E.md) · [2f](PHASE-2F.md) · [2g](PHASE-2G.md)).
The [README](README.md) is the reference; this file explains **how it works inside, why, and where to look**.

| Part | What it adds | Read time |
|---|---|---|
| [2h — Notifications](#part-2h--notifications) | `notify()`, collapsing, preferences, delayed email, digest, recurring jobs, live bell | 15 min |
| [3a — Capacity planning](#part-3a--capacity-planning) | Availability from calendars + leave, allocation, forecast, load, "away" hints | 10 min |
| [Hands-on tour](#hands-on-tour-10-minutes) · [Where to look](#where-to-look-first) · [FAQ](#faq) | | — |

---

# Part 2h — Notifications

## 1. One function: `notify()`

```ts
await notify(client, {
  organizationId, userIds: [assigneeId], actorId: me,
  type: 'assigned', title: 'Asha assigned you TF-12', body: 'Cart total is wrong',
  url: '/projects/TF/items/12', workItemId: 12,
})
```

Every module calls it **with the transaction client** of the change it is making:

```
BEGIN
  UPDATE work_items SET assignee_id = 7 …          ← the change
  INSERT INTO notifications …                       ← notify()
  INSERT INTO jobs (notifications.email, run_at = now + 60 s)   ← instant email, same transaction (outbox)
  SELECT pg_notify('tf_events', '{"type":"notifications","userIds":[7]}')
COMMIT        ← only now does PostgreSQL deliver the NOTIFY → the bell of user 7 lights up
```

If anything fails and the transaction rolls back, there is no notification, no email job and no bell ping — PostgreSQL
holds `NOTIFY` messages until `COMMIT` and drops them on `ROLLBACK`. No "ghost" notifications, with no extra code.

Built-in rules (in `notify.ts`, so every caller gets them):

* the **actor** is never notified about their own action
* only **active** members of the organization
* the person's **preference** for the category decides (see 3.)
* **collapsing**: an unread notification of the same type on the same item from the last 30 minutes is *updated*
  (`count + 1`, newest text) instead of adding a row — five comments become one notification "(+4)", and only one email

## 2. What triggers what

| Event | Who | Type / category |
|---|---|---|
| item created / edited / bulk-edited with an assignee | the assignee | `assigned` / assignments |
| comment with `@[Name](user:12)` | mentioned people | `mentioned` / mentions |
| comment | other watchers (not the mentioned ones — never both) | `commented` / watching |
| status change | watchers | `status_changed` / watching |
| QA pass / fail | assignee + reporter — **one** specific notification (the generic status / comment ones are suppressed) | `qa_passed` · `qa_failed` / qa |
| leave requested · decided · cancelled | approvers · the person | `leave_*` / leave |
| new production error · regression | people with `errors.manage` (+ the bug's watchers on regression) | `error_new` · `error_regressed` / errors |

## 3. Preferences

Six categories × (in-app on/off, email `off` · `instant` · `daily`), per person **and organization**
(`notification_preferences`; no row = the defaults in `notification-types.ts`: assignments / mentions / QA / leave
instant, watched items and errors daily). The choice is copied onto each notification (`in_app`, `email` columns), so
changing preferences later doesn't rewrite history.

## 4. Email: instant (but polite) and daily

* **Instant** → job `notifications.email`, scheduled `NOTIFY_EMAIL_DELAY_SECONDS` (60) later. When it runs, it skips the
  email if you already **read it in the app** — no "you have a notification" email about something you just saw.
* **Daily** → one digest per person and organization with everything unread marked `daily` (last 2 days), at 08:00.

## 5. Recurring jobs (new building block)

The job queue could run jobs *later* (`run_at`) but not *every day*. `job_schedules` adds that:

```sql
UPDATE job_schedules
   SET last_run_at = NOW(),
       next_run_at = next_run_at + interval × (missed periods + 1)    -- skip runs missed while the server was down
 WHERE enabled AND next_run_at <= NOW()
RETURNING name, queue                                                 -- → enqueue(queue) in the same transaction
```

The worker runs it in its one-minute maintenance tick. With several servers, the row lock of `UPDATE` means exactly
one of them gets the row back; the others see `next_run_at` already moved forward. Schedules are master data in
`schema.sql` (`ON CONFLICT DO NOTHING`, so an admin's change to the time is kept).

## 6. The bell

`NotificationBell` loads the unread count, and the realtime hub sends `notifications` events **only to the recipients**
(not to everyone in the organization like item events). The count is also shown in the browser tab — `(3) Team-Flex`.
Clicking a notification marks it read and opens its `url`. `/notifications` has the full inbox and the settings.

---

# Part 3a — Capacity planning

The question every sprint planning asks: **can these people do this much work in these two weeks?** Most tools only
count story points; Team-Flex also knows who is away.

## 1. Available days per person — `capacity.ts` (pure, unit-tested)

```
working days   = sprint days − weekend days of THEIR calendar − (non-optional) holidays of THEIR calendar
leave days     = approved leave inside the sprint, in working days (half days = 0.5)   — pending: shown, not subtracted
available days = (working days − leave days) × allocation %
```

Example (Mon 7 – Fri 18 Jan, holiday on the 9th): 9 working days; Dev with 2 days of leave → **7**; QA at 50 % → **4.5**.

It reuses the leave module's `countLeaveDays()` and `calendarFor()` — the same rules as when people request leave, so
the two features can never disagree.

## 2. Who is in the sprint

Project members (admin / member) + anyone who has work in the sprint + anyone with an allocation row. **Allocation**
(`sprint_capacity`, default 100 %) handles part-timers and people shared between projects; 0 % = not in this sprint.

## 3. Forecast — learned, not guessed

```
points per person-day = completed points ÷ available days     (last 3 completed sprints; their availability is
                                                               recomputed from today's calendars + the leave history)
forecast              = points per person-day × this sprint's available days
load                  = planned points ÷ forecast               (team, and per person with their own available days)
```

No history yet (no completed sprint with estimates) → no forecast, the drawer says so instead of inventing a number.
Load labels: *nothing planned* · *ok* · *nearly full* (> 90 %) · *overloaded* (> 110 %) — colours always come with the label.

## 4. Everyday hints

* **Backlog**: every sprint shows a capacity chip ("11.5 days · 113 % load"); click → the capacity drawer (allocations
  are editable inline).
* **Assignee pickers** (item page, create dialog): "🌴 away 14 – 15 Jan" next to people with leave in the next ~10 weeks.
* **Due date**: a warning when the assignee is on leave, has a holiday or doesn't work that day.

`GET /projects/:key/availability` returns only *that* someone is away (dates, half / full, pending / approved) — never the
leave type, so it is safe to show to the whole project.

---

## Hands-on tour (10 minutes)

1. As **A**, assign an item to **B**. As **B**, the bell shows **1** and the tab title says `(1)`. Click it → the item opens.
2. As **A**, comment three times on an item B watches → B sees **one** notification "(+2)".
3. As **B**, open **Notifications → Settings**: set *Watched items* email to *Off*.
4. **Platform → Mailbox**: B's instant email for the assignment (if B didn't read it within a minute).
5. As **B**, request leave next week; approve it as an admin → B's bell: "… approved your Annual leave".
6. **Backlog** → a planned sprint with dates → click the capacity chip: B has fewer available days. Set someone to 50 %.
7. Open an item, pick the assignee → "🌴 away …" next to B. Set a due date on B's leave day → warning.

---

## Where to look first

| Order | File | Why |
|---|---|---|
| 1 | `server/src/modules/notifications/notify.ts` | the rules: actor, active members, preferences, collapsing, email job, NOTIFY |
| 2 | `server/src/modules/notifications/notification-jobs.ts` | instant email (skip if read) and the daily digest |
| 3 | `server/src/jobs/worker.ts` → `runDueSchedules` | recurring jobs |
| 4 | `server/src/modules/work-items/work-items.service.ts` → `notifyChanges`, `qaVerdict` | how triggers are wired |
| 5 | `server/src/modules/capacity/capacity.ts` + `capacity.service.ts` | the maths and the forecast |
| 6 | `client/src/components/NotificationBell.tsx` · `pages/projects/backlog/CapacityDrawer.tsx` | the UI |
| 7 | `server/tests/api/notifications.test.ts` · `capacity.test.ts` | executable documentation |

---

## FAQ

**Why not send emails right away?** Most people have the app open; a one-minute delay plus "skip if read" removes most of the noise.

**Why is the digest at 08:00 server time?** Per-user time zones are not stored yet — on the roadmap.

**Why doesn't pending leave reduce capacity?** It may be rejected. It is shown next to the person so planners can decide.

**Why points per person-day and not per person?** A person-day is comparable across sprints of different lengths, team sizes,
holidays and leave; "per person" isn't.

**Can capacity be in hours?** Not yet — days fit how leave and holidays work; hours are on the roadmap.
