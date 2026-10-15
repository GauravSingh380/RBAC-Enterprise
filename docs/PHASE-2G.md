# Phase 2g — How it works (dashboards, reports, leave & holidays)

A **learning guide**, like the earlier ones ([2a–2c](PHASE-2.md) · [2d–2e](PHASE-2D-2E.md) · [2f](PHASE-2F.md)).
The [README](README.md) is the reference; this file explains **how the new parts work inside, why, and where to look**.

| Part | What it adds | Read time |
|---|---|---|
| [1. Dashboard](#part-1--the-organization-dashboard) | One aggregated request, access-aware | 5 min |
| [2. Bug & flow reports](#part-2--bugs-and-cycle-time-reports) | Opened vs closed per week, ageing, cycle / lead time | 10 min |
| [3. Leave & holidays](#part-3--leave--holidays) | Types, calendars, working-day maths, balances, approvals, privacy, DB-level rules | 15 min |
| [Hands-on tour](#hands-on-tour-10-minutes) · [Where to look](#where-to-look-first) · [FAQ](#faq) | | — |
| **Next:** [PHASE-2H-3A.md](PHASE-2H-3A.md) | Notifications, capacity planning | 25 min |

---

# Part 1 — The organization dashboard

`GET /api/dashboard` (`DashboardService.get`) answers everything in **one request** — fewer round trips, one loading state:

| Block | Query idea |
|---|---|
| Tiles + **My work** | items assigned to me, not done, in active projects I can see; ordered *due date first (NULLs last) → priority → recently updated* |
| **Projects** | per accessible project: open, open bugs, overdue, done in the last 7 days (`COUNT(*) FILTER (WHERE …)`) |
| **Bug trend** | 8 weeks of `generate_series` → bugs created / completed per week across my projects |
| **Team & leave** | approved leave overlapping *today … +6 days*, my balances, the next holidays of **my** calendar, pending approvals |

Every project number goes through `ACCESSIBLE_PROJECT_SQL` (the same rule as everywhere: private projects only for
members), so two people see different dashboards — tested in `tests/api/dashboard.test.ts`.

---

# Part 2 — Bugs and cycle time reports

`GET /projects/:key/reports/quality?weeks=12` (`ReportsService.quality`), shown in two tabs.

## 1. Opened vs closed per week + open bugs over time

```sql
FROM generate_series(date_trunc('week', CURRENT_DATE) - (weeks-1) * INTERVAL '1 week',
                     date_trunc('week', CURRENT_DATE), INTERVAL '1 week') wk     -- Monday of each week, even empty ones
opened    = bugs with created_at   in [wk, wk + 1 week)
closed    = bugs with completed_at in [wk, wk + 1 week)
openAtEnd = bugs created before the week ended and not completed by then          -- the backlog line
```

If *opened* keeps beating *closed*, the open-bugs line climbs — the two charts tell that story together. (The open line
uses today's `completed_at`; a bug that was closed and reopened counts as open for the whole time — a known simplification.)

## 2. Ageing of open bugs

Open bugs are bucketed by age (0–7, 8–30, 31–90, 90+ days) and split by severity, then pivoted in TypeScript into one row
per bucket. The chart answers *"do we have old critical bugs?"* at a glance; the **oldest open bugs** table names them.

**Colour choice (from the dataviz rules):** severity is *ordered*, so it is drawn with **one hue in steps** (light =
trivial → dark = critical; brighter = more severe in dark mode), not four unrelated colours. Both ramps were validated
for monotone lightness and contrast. Bugs without a severity are neutral grey.

## 3. Lead time vs cycle time

| | from | to | answers |
|---|---|---|---|
| **Lead time** | created | done | *how long does a requester wait?* |
| **Cycle time** | first move into a non-"to do" status (from `work_item_events`) | done | *how long does the team actually work on it?* |

Weekly **medians** (`percentile_cont(0.5)`) — one ancient item can't distort them like an average would. Weeks with
nothing finished are **gaps** in the line (null), not zeros. The distribution chart (< 1 day … 4+ weeks) shows the spread.

---

# Part 3 — Leave & holidays

## 1. The model

```
leave_type_templates (master data, schema.sql) ──copied at signup──▶ leave_types (per organization)
holiday_calendars (weekend_days, is_default) ──▶ holidays (date, name, is_optional)
organization_members.holiday_calendar_id  (NULL = the default calendar)
leave_balances (person × type × year overrides: entitled, carried_over)   — no row = the type's default_days
leave_requests (start, end, portion full/am/pm, days, status, decided_by …)
```

New organizations get the defaults in `createOrganization()` → `seedLeaveDefaults()`; existing ones got them from
migration `0003` — the same "template + copy" pattern as roles.

## 2. What does a request cost? — `leave-days.ts` (pure, unit-tested)

```
for each date from start to end (UTC — no daylight-saving surprises):
    weekend day of THE PERSON'S calendar?  → skipped ("weekend")
    non-optional holiday of that calendar? → skipped (holiday name)
    otherwise                              → 1 working day
half day (am / pm, single date only)       → 0.5
```

Mon 7 – Sun 13 Jan with a Wednesday holiday = **4 days**; the same week on a Fri + Sat calendar = **5**.
The request dialog calls `POST /leave/requests/preview` as you type and shows the cost, what was skipped, the balance
afterwards and who else is away.

## 3. Balances

```
available = (override or type default) + carried over − approved days − pending days     (same year)
```

Pending days are **reserved**, so you can't request the same days twice while waiting. Limited types can't go negative.
Two requests submitted at the same moment could both see "3 days left" — `pg_advisory_xact_lock(org, user)` serializes a
person's requests inside the transaction, so the second one sees the first.

## 4. Rules the database enforces

```sql
CONSTRAINT no_overlapping_leave EXCLUDE USING gist (
  user_id WITH =, daterange(start_date, end_date, '[]') WITH &&
) WHERE (status IN ('pending', 'approved'))
```

*"No two pending / approved requests of the same person may overlap"* — checked by PostgreSQL itself, even under
concurrency, and cancelled / rejected requests don't count. `btree_gist` lets one GiST index combine `=` (user) with `&&`
(date ranges overlap). The API turns the violation (`23P01`) into a friendly 409. Also as CHECKs: end ≥ start, half days
only for single days, one calendar year per request.

## 5. Approvals, emails, cancelling

* Approvers = `leave.approve` (Admin by default) or owners. **Nobody decides their own leave**, except an owner (someone
  has to approve the owner's holiday).
* Types with `requires_approval = false` (Work from home) are approved immediately.
* People are **notified** inside the same transaction (since 2h: `notify()` → bell + email per their preferences):
  approvers on a new request, the person on approval / rejection / cancellation by someone else. Emails appear in
  Platform → Mailbox. See [PHASE-2H-3A.md](PHASE-2H-3A.md).
* The person can cancel pending leave or approved leave that hasn't started; approvers can cancel any pending / approved.
* Every decision is in the **audit log**.

## 6. Privacy on the team calendar

Everyone with `leave.request` sees **who** is out (that's what a team calendar is for). The **type** — e.g. *Sick
leave* — is personal: the API replaces it with *"Out of office"* (grey) unless the viewer is the person or an approver /
leave manager. Same rule on the dashboard. Done on the server, so it can't be bypassed in the browser.

---

## Hands-on tour (10 minutes)

1. **Organization → Leave & Holidays → Holiday calendars**: paste a few holidays for this year
   (`2026-12-25, Christmas`). Create a second calendar with Fri + Sat weekend and assign someone to it.
2. **Leave → My leave → Request leave**: pick a week containing a holiday — the preview shows the holiday and weekend as
   "not counted" and your balance afterwards. Request it.
3. Try requesting an overlapping day → refused. Try a half day (afternoon) → 0.5 days.
4. As an **Admin**: **Leave → Approvals** → approve it (or reject with a reason). Watch the **bell** — and **Platform → Mailbox** for the emails.
5. **Leave → Team calendar**: the leave appears; as a non-approver colleague it shows as *Out of office*.
6. **Organization → Leave & Holidays → Allowances**: give someone 25 days + 3 carried over.
7. **Dashboard**: my work, bug trend, project health, who's out, holidays, my balances.
8. A project → **Reports → Bugs** and **Cycle & lead time**; flip a chart to *Table*.

---

## Where to look first

| Order | File | Why |
|---|---|---|
| 1 | `server/src/modules/leave/leave-days.ts` (+ `tests/unit/leave-days.test.ts`) | the day maths |
| 2 | `server/src/modules/leave/leave.service.ts` → `create`, `balanceOf`, `decide`, `calendar` | the rules |
| 3 | `server/src/database/schema.sql` → section 1f (look for `no_overlapping_leave`) | rules in the database |
| 4 | `server/src/modules/reports/reports.service.ts` → `quality` | weekly series, ageing, medians |
| 5 | `server/src/modules/dashboard/dashboard.service.ts` | one aggregated, access-aware request |
| 6 | `client/src/pages/leave/RequestLeaveModal.tsx` · `TeamCalendarPage.tsx` | live preview · month grid |
| 7 | `client/src/pages/projects/reports/QualityReports.tsx` · `chartTheme.ts` (severity ramp) | charts |

---

## FAQ

**Why are half days only for single days?** It keeps every request unambiguous ("Mon afternoon to Wed morning" is two
requests). It covers almost all real cases and keeps the overlap rule simple.

**Two half days on the same date (morning + afternoon)?** The overlap rule treats them as overlapping — book a full day instead.

**What about carry-over at year end / monthly accrual?** Today an admin sets "carried over" per person in Allowances. Automatic
accrual and carry-over rules are on the roadmap.

**Why not show everyone's leave type?** Health information is personal data. Approvers need it to decide; teammates only need to
know you're away.

**The dashboard says nobody is out, but someone has a pending request.** Only **approved** leave counts as "out"; pending leave is
shown (dashed) on the team calendar.
