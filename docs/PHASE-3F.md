# Phase 3f — How it works (checklists, templates, trash, docs, calendar)

A short **learning guide** (previous: [3e](PHASE-3E.md)). Reference tables are in the [README](README.md).
Users read the same features explained in the Help Center: *Checklists, templates and recurring work*, *Trash*,
*Project docs* and *Calendar*.

## 1. Checklists

```
work_item_checklist_items   item · text · done (+ who / when) · position
```

Every change answers with the **whole checklist**, so the client simply replaces its copy. Reordering sends all
the ids in their new order (the server refuses a partial list). Cards get the progress from one sub-query in
`ITEM_SELECT`:

```sql
(SELECT json_build_object('done', COUNT(*) FILTER (WHERE ci.done), 'total', COUNT(*))
   FROM work_item_checklist_items ci WHERE ci.work_item_id = w.id) AS checklist
```

## 2. Templates and repeating work

A template is a pre-filled item: type, title, description, priority, labels and checklist. "Use a template" in the
create dialog just **fills the form**, so nothing new happens on the server except `checklist: string[]` on create.

A template can **repeat**. The pure function `nextRunOn(rule, day, inclusive)` (unit-tested) gives the next date:

| repeat | runs on |
|---|---|
| `weekdays` | Monday–Friday |
| `weekly` | one weekday (0 = Sunday) |
| `monthly` | day 1–28 (exists in every month) |

The hourly job `work-items.recurring`:

```
loop:
  BEGIN
    SELECT … WHERE next_run_on <= today … LIMIT 1 FOR UPDATE SKIP LOCKED   -- claim one
    UPDATE … SET next_run_on = <next date after today>                     -- in the same transaction
  COMMIT
  create the item as the template's author (normal create = same rules, history, notifications)
```

The next date is set **before** the item is created. Two workers can't both create it, and a server that was off for
a week creates **one** item, not seven. If the author can't edit the project any more, the template **pauses**
(`next_run_on = NULL`); saving it again restarts it and makes the saver the author.

## 3. Trash — "deleted" is a mark, not a DELETE

```
work_items · project_pages · projects   + deleted_at, deleted_by
```

* **Deleting** marks the row and its live descendants with the **same** `deleted_at` (a recursive CTE). That
  timestamp is the "batch".
* **Restoring** clears the batch: the row plus descendants with the same `deleted_at`. The timestamp is compared
  **inside SQL**, because a JavaScript `Date` loses the microseconds Postgres keeps.
* **Reading:** every query must skip deleted rows. The central places do it for everything that uses them:
  * `ITEM_SELECT`: `JOIN projects p ON p.id = w.project_id AND w.deleted_at IS NULL` (an inner-join condition
    drops the row, so every list, board, search and calendar is covered)
  * `resolveItem()` and `getProjectAccess()`: a deleted item or project is "not found"
  * `ACCESSIBLE_PROJECT_SQL`: cross-project lists
  * plus each report, insights, dashboard, sprint and capacity count, which got `AND w.deleted_at IS NULL`
* **The status `itemCount` deliberately counts the trash.** Deleting a status must also move the items in the
  trash, so they can be restored later.
* **Purging:** `trash.purge` runs at 03:00 and deletes what is older than 30 days, with the files.

## 4. Docs

```
project_pages          title · body (markdown) · parent_id (sub-pages) · search_vector (generated)
project_page_versions  every saved state (last 100 per page)
```

**Conflicts without locking.** The editor sends the `updatedAt` it started from. If the page changed meanwhile, the
server answers `409 PAGE_CHANGED` with the name of the person who saved. The client keeps the draft, so nothing
typed is lost. Restoring an old version is just a new save, so history only grows.

**Moving a page** under another one checks for loops by walking **up** from the new parent (the same idea as
managers in 3c).

## 5. Calendar

`GET /projects/:ref/calendar?from&to` returns the items due in the range plus the sprints that overlap it.
**Who is away** comes from the existing availability endpoint (capacity, 3a), so leave types stay private. The month
grid is pure (`monthGrid`, `itemsByDay`, `dayInfo`; unit-tested). Dragging uses `@dnd-kit` (cells are droppable,
chips are draggable) and the drop is a normal `PATCH dueDate`, so permissions, history and notifications apply.

## Hands-on

1. Open an item → **Checklist**: add 3 steps, tick one, drag one. The board card shows **☑ 1/3**.
2. **Settings → Templates → New template** "Deploy check — {date}", repeat **Every weekday**, assigned to you.
   Run the job right away:
   `UPDATE work_item_templates SET next_run_on = CURRENT_DATE` → wait for the next hour, or call
   `runRecurringTemplates()` in a test.
3. Delete a story that has sub-tasks, then open **Trash** (right of the project tabs) → **Restore**. Everything is
   back, including comments.
4. **Docs → New page**, edit it in two browser tabs, save both: the second save gets the conflict message.
   **History → Restore** an older version.
5. **Calendar**: drag an item to another day, open the item, and see the new due date in History.

## Where to look

`server/src/modules/work-items/checklist.ts` · `modules/templates/` (`repeat-schedule.ts`, `templates.service.ts`) ·
`modules/trash/trash.service.ts` · `modules/pages/pages.service.ts` · `modules/calendar/calendar.service.ts` ·
client: `pages/projects/item/ItemChecklist.tsx`, `settings/TemplatesSettings.tsx`, `trash/TrashPage.tsx`,
`docs/DocsPage.tsx`, `calendar/MonthCalendar.tsx`, `pages/my-work/MyCalendar.tsx` ·
tests: `server/tests/api/trash.test.ts`, `checklists-templates.test.ts`, `pages-calendar.test.ts`,
`tests/unit/repeat-schedule.test.ts`, `client/src/__tests__/workspace.test.ts`.
