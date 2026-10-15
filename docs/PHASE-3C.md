# Phase 3c — How it works (teams, managers, people directory, My Work)

A short **learning guide** (previous: [3b](PHASE-3B.md)). Reference tables are in the [README](README.md).

## 1. The model — small on purpose

```
organization_members  + job_title, + manager_id  (→ another member of the same organization)
teams                 name, colour, description, lead_id
team_members          team ↔ person (a person can be in several teams)
```

No new permission: reading is open to every member (a directory is only useful if everyone sees it), changing uses the
existing `users.update` (Admin).

## 2. Managers without loops

Two guards:

* the database: `CHECK (manager_id <> user_id)` — nobody manages themselves
* the API: before setting *M* as the manager of *P*, walk **up** from *M* with a recursive query; if we meet *P*, the
  change would create a loop (P → … → M → P) and is refused:

```sql
WITH RECURSIVE chain AS (
  SELECT user_id, manager_id, 1 AS depth FROM organization_members WHERE organization_id = $1 AND user_id = $2   -- M
  UNION ALL
  SELECT m.user_id, m.manager_id, c.depth + 1 FROM organization_members m JOIN chain c ON m.user_id = c.manager_id …
)
SELECT EXISTS (SELECT 1 FROM chain WHERE user_id = $3)   -- P found → loop
```

When a manager leaves the organization, `ON DELETE SET NULL (manager_id)` clears it for their reports.

## 3. Leave goes to the manager

```
request ──▶ the person has an active manager?  yes → notify the manager
                                                no  → notify the leave approvers (leave.approve / owners), as before
decide  ──▶ allowed for: leave approvers (anyone's leave)  OR  the requester's manager (direct reports only)
```

The approve / reject routes now only require `leave.request`; the service checks *approver or manager*. A manager's
Approvals page lists exactly their direct reports' requests; HR still sees everyone's.

## 4. Team-aware views

Kept simple: the client loads `/api/teams` (with members) and filters what it already shows — the **capacity drawer**
(people and a team total) and the **insights workload** table. No extra server queries.

## 5. My Work

`GET /api/my-work` — four lists in one request:

| List | Rule |
|---|---|
| Assigned to me | open items in active projects I can access; ordered by due date (none last), priority |
| Waiting for my QA | items in a project's *ready for QA* status where I may give the verdict — org project admin, project admin, or project member with a role allowed into the *passed* status (the same rule as `POST /work-items/:ref/qa`) |
| Leave to approve | pending requests of my direct reports, or everyone's if I'm a leave approver (my own only if I'm an owner) |
| Mentions | my unread `mentioned` notifications |

The page groups my items **Overdue · Due today · This week · Later** (`groupByDue()`, unit-tested) and reloads live when
a notification arrives (assignment, mention, leave request).

## Hands-on

1. **People → Teams → New team** "Frontend" with a lead and members.
2. **Directory** → open a person → **Edit** → set their manager. Try making the manager report to that person → refused (loop).
3. As that person, request leave → the **manager's** bell rings (not every admin's). As the manager, **My Work → Leave to approve → Approve**.
4. **Backlog → capacity chip** → pick the team; **Organization → Insights** → workload → pick the team.
5. **My Work** as a developer and as QA.

## Where to look

`server/src/modules/people/people.service.ts` · `server/src/modules/leave/leave.service.ts` (`activeManagerOf`, `decide`) ·
`server/src/modules/my-work/my-work.service.ts` · `client/src/pages/people/PeoplePage.tsx` · `client/src/pages/my-work/MyWorkPage.tsx` ·
tests: `server/tests/api/people.test.ts`, `my-work.test.ts`.
