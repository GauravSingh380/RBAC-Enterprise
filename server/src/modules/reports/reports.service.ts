// Agile reports, computed from data we already keep — no extra tables:
//
//   Burndown  — work remaining in a sprint, day by day. Replayed from work_item_events:
//               the value of a field at time T = the OLD value of the first change after T,
//               or the current value when nothing changed after T. (Works for any past day.)
//   Velocity  — committed vs completed points of the last completed sprints (snapshots taken
//               when each sprint started / completed).
//   Overview  — created vs resolved per day, status / type / priority mix, workload per person,
//               lead time (created → done) and cycle time (work started → done).
//   Quality   — bugs opened vs closed per week + open bugs over time, ageing of open bugs by severity,
//               the oldest open bugs, weekly median lead / cycle time and the cycle time distribution.
import { db } from '../../database/db.js';
import { BadRequestException, NotFoundException } from '../../common/exceptions/http.exception.js';
import type { RequestContext } from '../../common/utils/request-context.js';
import { getProjectAccess } from '../projects/project-access.js';

type Category = 'todo' | 'in_progress' | 'done';

interface BurndownItem {
  id: number;
  key: string;
  title: string;
  type: string;
  estimate: number | null;
  sprintId: number | null;
  statusId: number;
  statusName: string;
  createdAt: Date;
}

interface ItemEvent {
  itemId: number;
  field: 'sprint' | 'status' | 'estimate';
  oldValue: unknown;
  newValue: unknown;
  createdAt: Date;
}

export interface BurndownPoint {
  /** YYYY-MM-DD; the first point is the moment the sprint started */
  date: string;
  kind: 'start' | 'day';
  /** null for days that have not happened yet */
  remainingPoints: number | null;
  remainingCount: number | null;
  scopePoints: number | null;
  scopeCount: number | null;
  idealPoints: number;
  idealCount: number;
}

const DAY_MS = 86_400_000;
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const endOfDay = (date: string) => new Date(`${date}T23:59:59.999`); // server local time
const round1 = (n: number) => Math.round(n * 10) / 10;

/** "value of `field` for item at time t" — replaying history backwards from the current value. */
function valueAt<T>(events: ItemEvent[], field: ItemEvent['field'], t: number, current: T, pick: (v: unknown) => T): T {
  const next = events.find((e) => e.field === field && e.createdAt.getTime() > t);
  return next ? pick(next.oldValue) : current;
}

const idOf = (v: unknown) => (v && typeof v === 'object' && 'id' in v ? Number((v as { id: number }).id) : null);
const numberOf = (v: unknown) => (typeof v === 'number' ? v : v === null || v === undefined ? null : Number(v));

export class ReportsService {
  async burndown(projectRef: string, sprintId: number, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    const projectId = access.project.id;

    const { rows: sprints } = await db.query<{
      id: number;
      name: string;
      goal: string | null;
      status: 'planned' | 'active' | 'completed';
      startDate: string | null;
      endDate: string | null;
      startedAt: Date | null;
      completedAt: Date | null;
      committedPoints: number | null;
      committedCount: number | null;
      completedPoints: number | null;
      completedCount: number | null;
    }>(
      `SELECT id, name, goal, status, to_char(start_date, 'YYYY-MM-DD') AS "startDate", to_char(end_date, 'YYYY-MM-DD') AS "endDate",
              started_at AS "startedAt", completed_at AS "completedAt",
              committed_points::float AS "committedPoints", committed_count AS "committedCount",
              completed_points::float AS "completedPoints", completed_count AS "completedCount"
         FROM sprints WHERE id = $1 AND project_id = $2`,
      [sprintId, projectId],
    );
    const sprint = sprints[0];
    if (!sprint) throw new NotFoundException('Sprint not found');
    if (sprint.status === 'planned' || !sprint.startedAt || !sprint.startDate || !sprint.endDate) {
      return { sprint, series: [] as BurndownPoint[], summary: null, completedItems: [], notCompletedItems: [], scopeChanges: [] };
    }

    // every item that is or ever was in this sprint (sub-tasks are not counted, like the snapshots)
    const { rows: items } = await db.query<BurndownItem>(
      `SELECT w.id, p.key || '-' || w.number AS key, w.title, w.type, w.estimate::float AS estimate,
              w.sprint_id AS "sprintId", w.status_id AS "statusId", s.name AS "statusName", w.created_at AS "createdAt"
         FROM work_items w
         JOIN projects p ON p.id = w.project_id
         JOIN project_statuses s ON s.id = w.status_id
        WHERE w.project_id = $1 AND w.deleted_at IS NULL AND w.type <> 'subtask'
          AND (w.sprint_id = $2 OR EXISTS (
                SELECT 1 FROM work_item_events e
                 WHERE e.work_item_id = w.id AND e.field = 'sprint'
                   AND ((e.old_value->>'id')::int = $2 OR (e.new_value->>'id')::int = $2)))`,
      [projectId, sprintId],
    );
    const ids = items.map((i) => i.id);
    const [{ rows: events }, { rows: statuses }] = await Promise.all([
      db.query<ItemEvent>(
        `SELECT work_item_id AS "itemId", field, old_value AS "oldValue", new_value AS "newValue", created_at AS "createdAt"
           FROM work_item_events
          WHERE work_item_id = ANY($1::int[]) AND field IN ('sprint', 'status', 'estimate') AND created_at > $2
          ORDER BY created_at, id`,
        [ids, sprint.startedAt],
      ),
      db.query<{ id: number; category: Category }>('SELECT id, category FROM project_statuses WHERE project_id = $1', [projectId]),
    ]);
    const categoryOf = new Map(statuses.map((s) => [s.id, s.category]));
    const eventsOf = new Map<number, ItemEvent[]>();
    for (const e of events) eventsOf.set(e.itemId, [...(eventsOf.get(e.itemId) ?? []), e]);

    const stateAt = (item: BurndownItem, t: number) => {
      const ev = eventsOf.get(item.id) ?? [];
      const exists = item.createdAt.getTime() <= t;
      const inSprint = exists && valueAt(ev, 'sprint', t, item.sprintId, idOf) === sprintId;
      const statusId = valueAt(ev, 'status', t, item.statusId, idOf);
      const done = statusId !== null && categoryOf.get(statusId) === 'done';
      const points = valueAt(ev, 'estimate', t, item.estimate, numberOf) ?? 0;
      return { inSprint, done, points };
    };
    const totalsAt = (t: number) => {
      let scopePoints = 0, scopeCount = 0, remainingPoints = 0, remainingCount = 0;
      for (const item of items) {
        const s = stateAt(item, t);
        if (!s.inSprint) continue;
        scopePoints += s.points;
        scopeCount++;
        if (!s.done) {
          remainingPoints += s.points;
          remainingCount++;
        }
      }
      return { scopePoints: round1(scopePoints), scopeCount, remainingPoints: round1(remainingPoints), remainingCount };
    };

    const startT = sprint.startedAt.getTime();
    // for a completed sprint: look just BEFORE completion (unfinished items move out at completion time)
    const endT = sprint.completedAt ? sprint.completedAt.getTime() - 1 : Date.now();
    const plannedEndT = endOfDay(sprint.endDate).getTime();
    const start = totalsAt(startT);
    const ideal = (t: number) => {
      const f = Math.min(1, Math.max(0, (t - startT) / Math.max(1, plannedEndT - startT)));
      return { idealPoints: round1(start.scopePoints * (1 - f)), idealCount: round1(start.scopeCount * (1 - f)) };
    };

    const series: BurndownPoint[] = [{ date: isoDate(sprint.startedAt), kind: 'start', ...start, ...ideal(startT) }];
    // one point per calendar day from the start date to the later of (planned end, actual end)
    const lastDate = sprint.completedAt && sprint.completedAt.getTime() > plannedEndT ? isoDate(sprint.completedAt) : sprint.endDate;
    for (let d = new Date(`${sprint.startDate}T12:00:00`); isoDate(d) <= lastDate && series.length < 120; d = new Date(d.getTime() + DAY_MS)) {
      const date = isoDate(d);
      const dayEnd = endOfDay(date).getTime();
      const t = Math.min(dayEnd, endT);
      const future = new Date(`${date}T00:00:00`).getTime() > endT;
      series.push({
        date,
        kind: 'day',
        ...(future ? { scopePoints: null, scopeCount: null, remainingPoints: null, remainingCount: null } : totalsAt(Math.max(t, startT))),
        ...ideal(dayEnd),
      });
    }

    // item lists at the end (or now)
    const toRow = (item: BurndownItem) => ({
      id: item.id,
      key: item.key,
      title: item.title,
      type: item.type,
      status: item.statusName,
      points: stateAt(item, endT).points,
      addedAfterStart: !stateAt(item, startT).inSprint,
    });
    const atEnd = items.map((item) => ({ item, state: stateAt(item, endT) })).filter((x) => x.state.inSprint);
    const completedItems = atEnd.filter((x) => x.state.done).map((x) => toRow(x.item));
    const notCompletedItems = atEnd.filter((x) => !x.state.done).map((x) => toRow(x.item));

    // scope changes during the sprint (moves at completion are "carried over", not scope changes)
    const keyOf = new Map(items.map((i) => [i.id, i]));
    const scopeChanges = events
      .filter((e) => e.field === 'sprint' && e.createdAt.getTime() <= endT)
      .map((e) => {
        const added = idOf(e.newValue) === sprintId;
        const removed = idOf(e.oldValue) === sprintId;
        if (!added && !removed) return null;
        const item = keyOf.get(e.itemId)!;
        return { at: e.createdAt, change: added ? ('added' as const) : ('removed' as const), key: item.key, title: item.title };
      })
      .filter((x) => x !== null);

    const end = totalsAt(endT);
    return {
      sprint,
      series,
      summary: {
        committedPoints: sprint.committedPoints ?? start.scopePoints,
        committedCount: sprint.committedCount ?? start.scopeCount,
        completedPoints: sprint.completedPoints ?? round1(end.scopePoints - end.remainingPoints),
        completedCount: sprint.completedCount ?? end.scopeCount - end.remainingCount,
        remainingPoints: end.remainingPoints,
        remainingCount: end.remainingCount,
        addedCount: scopeChanges.filter((c) => c.change === 'added').length,
        removedCount: scopeChanges.filter((c) => c.change === 'removed').length,
        daysLeft: sprint.status === 'active' ? Math.max(0, Math.ceil((plannedEndT - Date.now()) / DAY_MS)) : 0,
      },
      completedItems,
      notCompletedItems,
      scopeChanges,
    };
  }

  async velocity(projectRef: string, limit: number, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    const { rows } = await db.query<{
      id: number;
      name: string;
      startDate: string | null;
      endDate: string | null;
      committedPoints: number;
      completedPoints: number;
      committedCount: number;
      completedCount: number;
    }>(
      `SELECT id, name, "startDate", "endDate", "committedPoints", "completedPoints", "committedCount", "completedCount" FROM (
         SELECT id, name, to_char(start_date, 'YYYY-MM-DD') AS "startDate", to_char(end_date, 'YYYY-MM-DD') AS "endDate",
                COALESCE(committed_points, 0)::float AS "committedPoints", COALESCE(completed_points, 0)::float AS "completedPoints",
                COALESCE(committed_count, 0) AS "committedCount", COALESCE(completed_count, 0) AS "completedCount", completed_at
           FROM sprints WHERE project_id = $1 AND status = 'completed'
          ORDER BY completed_at DESC LIMIT $2) last
        ORDER BY completed_at`,
      [access.project.id, limit],
    );
    const avg = (pick: (r: (typeof rows)[number]) => number) => (rows.length ? round1(rows.reduce((s, r) => s + pick(r), 0) / rows.length) : 0);
    return {
      sprints: rows,
      averageCompletedPoints: avg((r) => r.completedPoints),
      averageCompletedCount: avg((r) => r.completedCount),
      /** share of committed points that got done, over these sprints */
      sayDoRatio: (() => {
        const committed = rows.reduce((s, r) => s + r.committedPoints, 0);
        return committed ? Math.round((rows.reduce((s, r) => s + r.completedPoints, 0) / committed) * 100) : null;
      })(),
    };
  }

  async quality(projectRef: string, weeks: number, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    const projectId = access.project.id;
    // weeks start on Monday (date_trunc('week')); the last one is the current, unfinished week
    const WEEKS = `generate_series(date_trunc('week', CURRENT_DATE) - ($2::int - 1) * INTERVAL '1 week', date_trunc('week', CURRENT_DATE), INTERVAL '1 week')`;
    // when work started = first move into a status that is not "to do" (from history)
    const STARTED = `(SELECT MIN(e.created_at) FROM work_item_events e
                        JOIN project_statuses st ON st.id = CASE WHEN e.field = 'status' THEN (e.new_value->>'id')::int END
                       WHERE e.work_item_id = w.id AND e.field = 'status' AND st.category <> 'todo')`;

    const [bugWeeks, ageing, oldest, flowWeeks, distribution] = await Promise.all([
      db.query<{ week: string; opened: number; closed: number; openAtEnd: number }>(
        `SELECT to_char(wk, 'YYYY-MM-DD') AS week,
                (SELECT COUNT(*)::int FROM work_items w WHERE w.project_id = $1 AND w.deleted_at IS NULL AND w.type = 'bug'
                    AND w.created_at >= wk AND w.created_at < wk + INTERVAL '1 week') AS opened,
                (SELECT COUNT(*)::int FROM work_items w WHERE w.project_id = $1 AND w.deleted_at IS NULL AND w.type = 'bug'
                    AND w.completed_at >= wk AND w.completed_at < wk + INTERVAL '1 week') AS closed,
                (SELECT COUNT(*)::int FROM work_items w WHERE w.project_id = $1 AND w.deleted_at IS NULL AND w.type = 'bug'
                    AND w.created_at < wk + INTERVAL '1 week'
                    AND (w.completed_at IS NULL OR w.completed_at >= wk + INTERVAL '1 week')) AS "openAtEnd"
           FROM ${WEEKS} wk ORDER BY wk`,
        [projectId, weeks],
      ),
      db.query<{ bucket: string; severity: string; count: number }>(
        `SELECT CASE WHEN age <= 7 THEN '0–7 days' WHEN age <= 30 THEN '8–30 days' WHEN age <= 90 THEN '31–90 days' ELSE '90+ days' END AS bucket,
                COALESCE(severity, 'none') AS severity, COUNT(*)::int AS count
           FROM (SELECT w.severity, EXTRACT(EPOCH FROM NOW() - w.created_at) / 86400 AS age
                   FROM work_items w JOIN project_statuses s ON s.id = w.status_id
                  WHERE w.project_id = $1 AND w.deleted_at IS NULL AND w.type = 'bug' AND s.category <> 'done') b
          GROUP BY 1, 2`,
        [projectId],
      ),
      db.query(
        `SELECT w.id, p.key || '-' || w.number AS key, w.number, w.title, w.severity, w.priority,
                FLOOR(EXTRACT(EPOCH FROM NOW() - w.created_at) / 86400)::int AS "ageDays",
                json_build_object('id', s.id, 'name', s.name, 'category', s.category, 'color', s.color) AS status,
                CASE WHEN a.id IS NULL THEN NULL ELSE json_build_object('id', a.id, 'name', a.name) END AS assignee
           FROM work_items w
           JOIN projects p ON p.id = w.project_id
           JOIN project_statuses s ON s.id = w.status_id
           LEFT JOIN users a ON a.id = w.assignee_id
          WHERE w.project_id = $1 AND w.deleted_at IS NULL AND w.type = 'bug' AND s.category <> 'done'
          ORDER BY w.created_at LIMIT 10`,
        [projectId],
      ),
      db.query<{ week: string; count: number; medianLeadDays: number | null; medianCycleDays: number | null }>(
        `WITH done AS (
           SELECT w.created_at, w.completed_at, ${STARTED} AS started_at
             FROM work_items w
            WHERE w.project_id = $1 AND w.deleted_at IS NULL AND w.type <> 'epic'
              AND w.completed_at >= date_trunc('week', CURRENT_DATE) - ($2::int - 1) * INTERVAL '1 week'
         )
         SELECT to_char(wk, 'YYYY-MM-DD') AS week, COUNT(d.completed_at)::int AS count,
                ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM d.completed_at - d.created_at) / 86400))::numeric, 1)::float AS "medianLeadDays",
                ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM d.completed_at - d.started_at) / 86400))::numeric, 1)::float AS "medianCycleDays"
           FROM ${WEEKS} wk
           LEFT JOIN done d ON d.completed_at >= wk AND d.completed_at < wk + INTERVAL '1 week'
          GROUP BY wk ORDER BY wk`,
        [projectId, weeks],
      ),
      db.query<{ bucket: string; count: number }>(
        `WITH done AS (
           SELECT EXTRACT(EPOCH FROM w.completed_at - ${STARTED}) / 86400 AS cycle
             FROM work_items w
            WHERE w.project_id = $1 AND w.deleted_at IS NULL AND w.type <> 'epic'
              AND w.completed_at >= date_trunc('week', CURRENT_DATE) - ($2::int - 1) * INTERVAL '1 week'
         ), buckets(bucket, lo, hi, ord) AS (VALUES
           ('< 1 day', 0, 1, 1), ('1–3 days', 1, 3, 2), ('3–7 days', 3, 7, 3), ('1–2 weeks', 7, 14, 4), ('2–4 weeks', 14, 28, 5), ('4+ weeks', 28, 100000, 6))
         SELECT b.bucket, (SELECT COUNT(*)::int FROM done d WHERE d.cycle >= b.lo AND d.cycle < b.hi) AS count
           FROM buckets b ORDER BY b.ord`,
        [projectId, weeks],
      ),
    ]);

    const BUCKETS = ['0–7 days', '8–30 days', '31–90 days', '90+ days'];
    const SEVERITIES = ['critical', 'major', 'minor', 'trivial', 'none'] as const;
    const ageingRows = BUCKETS.map((bucket) => ({
      bucket,
      ...Object.fromEntries(SEVERITIES.map((sev) => [sev, ageing.rows.find((r) => r.bucket === bucket && r.severity === sev)?.count ?? 0])),
    })) as ({ bucket: string } & Record<(typeof SEVERITIES)[number], number>)[];

    return {
      weeks,
      bugsPerWeek: bugWeeks.rows,
      openBugs: ageing.rows.reduce((s, r) => s + r.count, 0),
      ageing: ageingRows,
      oldestBugs: oldest.rows,
      flowPerWeek: flowWeeks.rows,
      cycleDistribution: distribution.rows,
    };
  }

  async overview(projectRef: string, days: number, ctx: RequestContext) {
    if (days < 7 || days > 365) throw new BadRequestException('days must be between 7 and 365');
    const access = await getProjectAccess(ctx, projectRef);
    const projectId = access.project.id;

    const [totals, flow, byStatus, byType, byPriority, workload, times] = await Promise.all([
      db.query<{ total: number; open: number; done: number; overdue: number; unassigned: number }>(
        `SELECT COUNT(*)::int AS total,
                (COUNT(*) FILTER (WHERE s.category <> 'done'))::int AS open,
                (COUNT(*) FILTER (WHERE s.category = 'done'))::int AS done,
                (COUNT(*) FILTER (WHERE s.category <> 'done' AND w.due_date < CURRENT_DATE))::int AS overdue,
                (COUNT(*) FILTER (WHERE s.category <> 'done' AND w.assignee_id IS NULL))::int AS unassigned
           FROM work_items w JOIN project_statuses s ON s.id = w.status_id
          WHERE w.project_id = $1 AND w.deleted_at IS NULL`,
        [projectId],
      ),
      // one row per day, even days with no activity (generate_series)
      db.query<{ date: string; created: number; resolved: number }>(
        `SELECT to_char(d, 'YYYY-MM-DD') AS date,
                (SELECT COUNT(*)::int FROM work_items w
                  WHERE w.project_id = $1 AND w.deleted_at IS NULL AND w.created_at >= d AND w.created_at < d + INTERVAL '1 day') AS created,
                (SELECT COUNT(*)::int FROM work_items w
                  WHERE w.project_id = $1 AND w.deleted_at IS NULL AND w.completed_at >= d AND w.completed_at < d + INTERVAL '1 day') AS resolved
           FROM generate_series(CURRENT_DATE - ($2::int - 1), CURRENT_DATE, INTERVAL '1 day') d
          ORDER BY d`,
        [projectId, days],
      ),
      db.query<{ id: number; name: string; color: string; category: Category; count: number }>(
        `SELECT s.id, s.name, s.color, s.category, COUNT(w.id)::int AS count
           FROM project_statuses s LEFT JOIN work_items w ON w.status_id = s.id AND w.deleted_at IS NULL
          WHERE s.project_id = $1
          GROUP BY s.id ORDER BY s.position, s.id`,
        [projectId],
      ),
      db.query<{ type: string; count: number }>(
        `SELECT w.type, COUNT(*)::int AS count FROM work_items w JOIN project_statuses s ON s.id = w.status_id
          WHERE w.project_id = $1 AND w.deleted_at IS NULL AND s.category <> 'done' GROUP BY w.type ORDER BY count DESC`,
        [projectId],
      ),
      db.query<{ priority: string; count: number }>(
        `SELECT w.priority, COUNT(*)::int AS count FROM work_items w JOIN project_statuses s ON s.id = w.status_id
          WHERE w.project_id = $1 AND w.deleted_at IS NULL AND s.category <> 'done'
          GROUP BY w.priority
          ORDER BY CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`,
        [projectId],
      ),
      db.query<{ assignee: { id: number; name: string } | null; open: number; inProgress: number; points: number }>(
        `SELECT CASE WHEN a.id IS NULL THEN NULL ELSE json_build_object('id', a.id, 'name', a.name) END AS assignee,
                COUNT(*)::int AS open,
                (COUNT(*) FILTER (WHERE s.category = 'in_progress'))::int AS "inProgress",
                COALESCE(SUM(w.estimate), 0)::float AS points
           FROM work_items w
           JOIN project_statuses s ON s.id = w.status_id
           LEFT JOIN users a ON a.id = w.assignee_id
          WHERE w.project_id = $1 AND w.deleted_at IS NULL AND s.category <> 'done' AND w.type <> 'epic'
          GROUP BY a.id, a.name
          ORDER BY open DESC, a.name NULLS LAST`,
        [projectId],
      ),
      // lead time = created → done; cycle time = first move out of "to do" → done (from history)
      db.query<{ count: number; avgLeadDays: number | null; medianLeadDays: number | null; avgCycleDays: number | null; medianCycleDays: number | null }>(
        `WITH done AS (
           SELECT w.created_at, w.completed_at,
                  (SELECT MIN(e.created_at)
                     FROM work_item_events e
                     JOIN project_statuses st ON st.id = CASE WHEN e.field = 'status' THEN (e.new_value->>'id')::int END
                    WHERE e.work_item_id = w.id AND e.field = 'status' AND st.category <> 'todo') AS started_at
             FROM work_items w
            WHERE w.project_id = $1 AND w.deleted_at IS NULL AND w.type <> 'epic' AND w.completed_at >= NOW() - make_interval(days => $2::int)
         )
         SELECT COUNT(*)::int AS count,
                ROUND(AVG(EXTRACT(EPOCH FROM completed_at - created_at) / 86400)::numeric, 1)::float AS "avgLeadDays",
                ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM completed_at - created_at) / 86400))::numeric, 1)::float AS "medianLeadDays",
                ROUND(AVG(EXTRACT(EPOCH FROM completed_at - started_at) / 86400)::numeric, 1)::float AS "avgCycleDays",
                ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM completed_at - started_at) / 86400))::numeric, 1)::float AS "medianCycleDays"
           FROM done`,
        [projectId, days],
      ),
    ]);

    return {
      days,
      totals: totals.rows[0]!,
      createdVsResolved: flow.rows,
      byStatus: byStatus.rows,
      byType: byType.rows,
      byPriority: byPriority.rows,
      workload: workload.rows,
      times: times.rows[0]!,
    };
  }
}
