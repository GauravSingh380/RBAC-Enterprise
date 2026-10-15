# Phase 3b — How it works (organization insights)

A short **learning guide** (previous: [2h · 3a](PHASE-2H-3A.md)). The [README](README.md) has the reference tables.

## 1. Why a second dashboard?

| | Dashboard (`/dashboard`) | Insights (`/org/insights`) |
|---|---|---|
| For | every member | owners / admins (`insights.view`) |
| Scope | *my* work, projects *I* can see | the **whole organization**, including private projects |
| Question | "what do I do today?" | "where is the organization stuck, who is overloaded?" |

Private projects are included on purpose — oversight is the point of this permission — but only as counts and names,
never item contents. That is why it is a separate permission (Admin and owners by default; give it to other roles in
Roles & Access).

## 2. One request, one service

`GET /api/insights?days=30` → `InsightsService.compute(orgId, days, seeLeaveTypes)` runs seven queries in parallel
(people, totals, projects, trend, workload, quality, leave) and returns one object. Patterns worth noticing:

* `COUNT(*) FILTER (WHERE …)` — many numbers from one pass over the rows
* `generate_series(…, INTERVAL '1 week')` — a row for every week, even weeks with nothing
* "active people" = signed in, refreshed a session (`refresh_tokens`), **or** did something (`work_item_events`) —
  `last_login_at` alone would miss people who stay logged in for days
* `compute()` takes an organization id instead of a request, so the **weekly report job** reuses it without a user

## 3. Project health — rules with reasons (`projectHealth()`, unit-tested)

```
no open work                          → Idle
open work, no activity for 14 days    → Stale    ("no activity for 20 days")
critical bugs or ≥ 5 / ≥ 25 % overdue → At risk  ("2 critical bugs", "6 overdue")
otherwise                             → Healthy
```

A label without a reason invites "why?" — so every status carries its reasons, in the table, the "Needs attention"
card and the email.

## 4. Weekly report

```
job_schedules: insights.weekly-report, every 604 800 s, anchored to Monday 08:00
   → job "insights.weekly-report" → for each active organization:
        recipients = members with insights.view (owners included)
                     minus people whose "Weekly organization report" setting is Off (notification_preferences, category reports)
        email "insightsWeekly": last complete week (created / done), open & overdue, bugs, new errors,
                                projects needing attention, most loaded people, who is away, pending approvals
```

It reuses the recurring-job scheduler from 2h (missed runs are skipped, exactly one server sends it) and the email
outbox. "Email me the weekly report" calls the same function for one person, ignoring the opt-out — a preview.

## 5. CSV export — and a security detail

`GET /insights/export/projects|workload` builds CSV on the server (`toCsv()`), with a UTF-8 BOM so Excel shows names
correctly. Cells that start with `=`, `+`, `-` or `@` are prefixed with `'`: otherwise a project named
`=HYPERLINK("http://evil")` would become a live formula when someone opens the file (**CSV / formula injection**).

## Hands-on

1. As the owner: **Organization → Insights**. Switch 7 / 30 / 90 days.
2. Make a bug *critical* in some project → that project becomes **At risk** with the reason.
3. **Export CSV** of projects and open it in Excel.
4. **Email me the weekly report** → Platform → Mailbox.
5. Notifications → Settings → *Weekly organization report* → Off (only people with insights see this row).

## Where to look

`server/src/modules/insights/insights.service.ts` · `insights-report.ts` · `insights.routes.ts` ·
`client/src/pages/org/InsightsPage.tsx` · tests: `server/tests/api/insights.test.ts`, `tests/unit/insights.test.ts`.
