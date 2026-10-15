# Demo — Nimbus Labs

A ready-made organization to present Team-Flex.

* **Recreate it:** `cd server && npm run db:seed-demo -- --reset` (removes only the demo organization and its demo accounts)
* **Source:** `server/scripts/seed-demo.ts`

## Accounts

Every demo account uses the password **`Demo@2026!`**.

| Person | Email | Role | Use it to show |
|---|---|---|---|
| Aarav Mehta | `aarav@nimbuslabs.test` | **Owner** · CEO | everything: insights, settings, roles, trash |
| Sara Khan | `sara@nimbuslabs.test` | Admin · HR & Operations | members, leave settings, Customer Support |
| Rohan Verma | `rohan@nimbuslabs.test` | Developer · Engineering lead | sprints, backlog, approving his team's leave |
| Neha Gupta | `neha@nimbuslabs.test` | Developer · Frontend | My Work, on leave this week |
| Vikram Rao | `vikram@nimbuslabs.test` | Developer · Backend | production errors, repeating "deploy check" |
| Ananya Iyer | `ananya@nimbuslabs.test` | QA lead | QA queue, test runs, leave to approve |
| Kabir Singh | `kabir@nimbuslabs.test` | QA engineer | QA verdicts, pending leave |
| Meera Nair | `meera@nimbuslabs.test` | Member · Designer | 50% capacity, half-day leave |
| Arjun Das | `arjun@nimbuslabs.test` | **Project Manager** (custom role) | client project, insights |
| Zoya Ali | `zoya@nimbuslabs.test` | Member · Marketing | launch docs, UK holiday calendar |
| Lisa Brown | `lisa@globex.test` | **Guest** (client) | sees only the Globex project |

The organization's security rules require 10+ characters and a symbol, and the demo password follows them.

## What's inside

| Project | Template | Shows |
|---|---|---|
| **WEB** Website Redesign | Scrum | 3 epics, stories with sub-tasks, sprints 1–2 completed (velocity, burndown), sprint 3 active, sprint 4 planned, WIP limit, labels, custom field "Area", checklists, comments with @mentions and reactions, links, saved views, docs (overview, architecture, meeting notes, design), templates incl. a **weekly repeating** one, an item and a page in the **trash** |
| **MOB** Mobile App | Kanban | continuous flow, WIP limit 3, overdue work |
| **BUG** Bug Tracker | Bug tracking | severities, bug details, QA flow (verified, reopened, waiting for QA), won't fix, a duplicate, **test suites/cases**, a completed regression run with failures (and a bug filed from one), a smoke run in progress, **production errors** (one turned into a bug, one ignored) |
| **SUP** Customer Support | Kanban | due dates around today (calendar), **daily repeating triage** |
| **GLX** Globex Client Portal | Scrum, **private** | guest client Lisa: she created a story and commented; statement of work in Docs |
| **LCH** Product Launch Q4 | Blank | checklists, launch plan docs, **monthly repeating** report |
| **OLD** Legacy Intranet | Kanban | **archived** |
| **EXP** Experiments 2025 | — | **in the trash** (Projects → Trash) |

The rest of the organization:

* **People:** 5 teams, managers and job titles; a custom role; one pending invitation
* **Leave:** approved, pending, rejected, cancelled and work-from-home requests; holidays; a second calendar ("UK office")
* **Communication:** a dashboard announcement and notifications for everyone

## A 15-minute demo

1. **Owner → Dashboard**
   * Getting-started checklist, announcement, my work, bug trend and who's away (Neha).
   * **Ctrl + K** jumps to any item or page.
2. **Organization → Insights**
   * Every project's health, workload per person (team filter), quality.
   * Export the tables to CSV.
3. **WEB → Board → Backlog → Reports**
   * Drag a card on the board.
   * Backlog: sprints, plus the capacity chip (Meera at 50%).
   * Reports: Sprint 2 burndown and velocity.
4. **WEB → an item ("One-page checkout form")**
   * Checklist, sub-tasks, comments with mentions, links, history.
5. **WEB → Docs, Calendar, Trash**
   * Docs: page history.
   * Calendar: drag an item to another day.
   * Trash: restore the deleted item.
6. **BUG**
   * Board with the QA flow.
   * Open the verified and the reopened bug.
   * **Tests** → the regression run.
   * **Production Errors** (sidebar) → the error that became a bug.
7. **People and leave**
   * People: org chart.
   * Leave → Team calendar.
   * Log in as **Ananya**: My Work shows a bug waiting for her QA verdict and Kabir's leave to approve.
8. **Guest view**
   * Log in as **lisa@globex.test**: only the Globex project, no People or Dashboard.
9. **Settings and safety**
   * Organization → Settings: plan and usage, security rules.
   * Roles & Access: the custom "Project Manager" role.
   * Audit log.
10. **Help Center**
    * Search "trash" or "guest".
    * The "?" next to every page title opens the matching article.
