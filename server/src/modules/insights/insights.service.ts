// Organization insights — the owner's / admin's view of the WHOLE organization (permission insights.view):
// people & activity, project health, work trend, workload per person, quality, leave.
//
// Unlike the personal dashboard this deliberately covers every project (including private ones):
// it shows counts and names for oversight, never item contents. Leave TYPES are only shown to people
// who may approve / manage leave, like everywhere else.
import { db } from '../../database/db.js';
import { PERMISSIONS } from '../../common/constants/rbac.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';

const STALE_DAYS = 14;

export type ProjectHealth = 'healthy' | 'at_risk' | 'stale' | 'idle';

export interface ProjectRow {
  id: number;
  key: string;
  name: string;
  color: string | null;
  visibility: string;
  lead: { id: number; name: string } | null;
  members: number;
  open: number;
  overdue: number;
  openBugs: number;
  criticalBugs: number;
  createdInPeriod: number;
  doneInPeriod: number;
  lastActivityAt: Date | null;
  health: ProjectHealth;
  reasons: string[];
}

export interface WorkloadRow {
  user: { id: number; name: string };
  open: number;
  inProgress: number;
  overdue: number;
  points: number;
  projects: number;
  doneInPeriod: number;
  lastActiveAt: Date | null;
  away: { startDate: string; endDate: string } | null;
}

/** Why a project needs attention (pure; exported for unit tests). */
export function projectHealth(p: Pick<ProjectRow, 'open' | 'overdue' | 'criticalBugs' | 'lastActivityAt'>, now = Date.now()): { health: ProjectHealth; reasons: string[] } {
  if (p.open === 0) return { health: 'idle', reasons: ['no open work'] };
  const reasons: string[] = [];
  const inactiveDays = p.lastActivityAt ? Math.floor((now - new Date(p.lastActivityAt).getTime()) / 86_400_000) : Infinity;
  if (inactiveDays >= STALE_DAYS) return { health: 'stale', reasons: [p.lastActivityAt ? `no activity for ${inactiveDays} days` : 'no activity yet'] };
  if (p.criticalBugs > 0) reasons.push(`${p.criticalBugs} critical bug${p.criticalBugs === 1 ? '' : 's'}`);
  if (p.overdue >= 5 || p.overdue / p.open >= 0.25) reasons.push(`${p.overdue} overdue`);
  return reasons.length ? { health: 'at_risk', reasons } : { health: 'healthy', reasons: [] };
}

export class InsightsService {
  /** For the API: the active organization, leave types visible only to approvers / leave managers. */
  async overview(days: number, ctx: RequestContext) {
    const t = tenantOf(ctx);
    const seeTypes = t.isOwner || t.permissions.includes(PERMISSIONS.LEAVE_APPROVE) || t.permissions.includes(PERMISSIONS.LEAVE_MANAGE);
    return this.compute(t.organizationId, days, seeTypes);
  }

  async compute(orgId: number, days: number, seeLeaveTypes: boolean) {
    const P = [orgId, days];
    const [people, totals, projects, trend, workload, quality, leave] = await Promise.all([
      this.people(orgId, days),
      db.query<{ activeProjects: number; archivedProjects: number; open: number; overdue: number; createdInPeriod: number; doneInPeriod: number }>(
        `SELECT (SELECT COUNT(*)::int FROM projects WHERE organization_id = $1 AND status = 'active') AS "activeProjects",
                (SELECT COUNT(*)::int FROM projects WHERE organization_id = $1 AND status = 'archived') AS "archivedProjects",
                (COUNT(*) FILTER (WHERE s.category <> 'done'))::int AS open,
                (COUNT(*) FILTER (WHERE s.category <> 'done' AND w.due_date < CURRENT_DATE))::int AS overdue,
                (COUNT(*) FILTER (WHERE w.created_at >= NOW() - make_interval(days => $2)))::int AS "createdInPeriod",
                (COUNT(*) FILTER (WHERE w.completed_at >= NOW() - make_interval(days => $2)))::int AS "doneInPeriod"
           FROM work_items w
           JOIN projects p ON p.id = w.project_id AND p.status = 'active'
           JOIN project_statuses s ON s.id = w.status_id
          WHERE w.organization_id = $1 AND w.type <> 'epic' AND w.deleted_at IS NULL`,
        P,
      ),
      db.query<Omit<ProjectRow, 'health' | 'reasons'>>(
        `SELECT p.id, p.key, p.name, p.color, p.visibility,
                CASE WHEN l.id IS NULL THEN NULL ELSE json_build_object('id', l.id, 'name', l.name) END AS lead,
                (SELECT COUNT(*)::int FROM project_members pm WHERE pm.project_id = p.id) AS members,
                (COUNT(w.id) FILTER (WHERE s.category <> 'done'))::int AS open,
                (COUNT(w.id) FILTER (WHERE s.category <> 'done' AND w.due_date < CURRENT_DATE))::int AS overdue,
                (COUNT(w.id) FILTER (WHERE s.category <> 'done' AND w.type = 'bug'))::int AS "openBugs",
                (COUNT(w.id) FILTER (WHERE s.category <> 'done' AND w.type = 'bug' AND w.severity = 'critical'))::int AS "criticalBugs",
                (COUNT(w.id) FILTER (WHERE w.created_at >= NOW() - make_interval(days => $2)))::int AS "createdInPeriod",
                (COUNT(w.id) FILTER (WHERE w.completed_at >= NOW() - make_interval(days => $2)))::int AS "doneInPeriod",
                GREATEST(MAX(w.updated_at), p.created_at) AS "lastActivityAt"
           FROM projects p
           LEFT JOIN users l ON l.id = p.lead_id
           LEFT JOIN work_items w ON w.project_id = p.id AND w.type <> 'epic' AND w.deleted_at IS NULL
           LEFT JOIN project_statuses s ON s.id = w.status_id
          WHERE p.organization_id = $1 AND p.status = 'active'
          GROUP BY p.id, l.id`,
        P,
      ),
      db.query<{ week: string; created: number; done: number }>(
        `SELECT to_char(wk, 'YYYY-MM-DD') AS week,
                (SELECT COUNT(*)::int FROM work_items w WHERE w.organization_id = $1 AND w.type <> 'epic' AND w.deleted_at IS NULL
                    AND w.created_at >= wk AND w.created_at < wk + INTERVAL '1 week') AS created,
                (SELECT COUNT(*)::int FROM work_items w WHERE w.organization_id = $1 AND w.type <> 'epic' AND w.deleted_at IS NULL
                    AND w.completed_at >= wk AND w.completed_at < wk + INTERVAL '1 week') AS done
           FROM generate_series(date_trunc('week', CURRENT_DATE) - INTERVAL '11 weeks', date_trunc('week', CURRENT_DATE), INTERVAL '1 week') wk
          ORDER BY wk`,
        [orgId],
      ),
      db.query<WorkloadRow>(
        `SELECT json_build_object('id', u.id, 'name', u.name) AS "user",
                (COUNT(w.id) FILTER (WHERE s.category <> 'done'))::int AS open,
                (COUNT(w.id) FILTER (WHERE s.category = 'in_progress'))::int AS "inProgress",
                (COUNT(w.id) FILTER (WHERE s.category <> 'done' AND w.due_date < CURRENT_DATE))::int AS overdue,
                COALESCE(SUM(w.estimate) FILTER (WHERE s.category <> 'done' AND w.type <> 'subtask'), 0)::float AS points,
                (COUNT(DISTINCT w.project_id) FILTER (WHERE s.category <> 'done'))::int AS projects,
                (COUNT(w.id) FILTER (WHERE w.completed_at >= NOW() - make_interval(days => $2)))::int AS "doneInPeriod",
                GREATEST(u.last_login_at,
                         (SELECT MAX(rt.created_at) FROM refresh_tokens rt WHERE rt.user_id = u.id),
                         (SELECT MAX(e.created_at) FROM work_item_events e WHERE e.organization_id = $1 AND e.actor_id = u.id)) AS "lastActiveAt",
                (SELECT json_build_object('startDate', to_char(r.start_date, 'YYYY-MM-DD'), 'endDate', to_char(r.end_date, 'YYYY-MM-DD'))
                   FROM leave_requests r
                  WHERE r.organization_id = $1 AND r.user_id = u.id AND r.status = 'approved'
                    AND r.end_date >= CURRENT_DATE AND r.start_date <= CURRENT_DATE + 14
                  ORDER BY r.start_date LIMIT 1) AS away
           FROM organization_members m
           JOIN users u ON u.id = m.user_id AND u.is_active
           LEFT JOIN (work_items w JOIN projects p ON p.id = w.project_id AND p.status = 'active')
                  ON w.assignee_id = u.id AND w.organization_id = $1 AND w.type <> 'epic' AND w.deleted_at IS NULL
           LEFT JOIN project_statuses s ON s.id = w.status_id
          WHERE m.organization_id = $1 AND m.status = 'active'
          GROUP BY u.id
          ORDER BY open DESC, lower(u.name)`,
        P,
      ),
      this.quality(orgId, days),
      this.leave(orgId, seeLeaveTypes),
    ]);

    const projectRows: ProjectRow[] = projects.rows
      .map((p) => ({ ...p, ...projectHealth(p) }))
      .sort((a, b) => ['at_risk', 'stale', 'healthy', 'idle'].indexOf(a.health) - ['at_risk', 'stale', 'healthy', 'idle'].indexOf(b.health) || b.open - a.open);

    return {
      days,
      people: people,
      totals: {
        ...totals.rows[0]!,
        atRiskProjects: projectRows.filter((p) => p.health === 'at_risk').length,
        staleProjects: projectRows.filter((p) => p.health === 'stale').length,
      },
      projects: projectRows,
      trend: trend.rows,
      workload: workload.rows,
      quality,
      leave,
    };
  }

  private async people(orgId: number, days: number) {
    // "active" = signed in / refreshed a session, or did something in this organization
    const activeSince = (interval: string) => `
      (SELECT COUNT(*)::int FROM organization_members m JOIN users u ON u.id = m.user_id AND u.is_active
        WHERE m.organization_id = $1 AND m.status = 'active'
          AND (u.last_login_at >= NOW() - ${interval}
               OR EXISTS (SELECT 1 FROM refresh_tokens rt WHERE rt.user_id = u.id AND rt.created_at >= NOW() - ${interval})
               OR EXISTS (SELECT 1 FROM work_item_events e WHERE e.organization_id = $1 AND e.actor_id = u.id AND e.created_at >= NOW() - ${interval})))`;
    const { rows } = await db.query<{ active: number; deactivated: number; invited: number; joinedInPeriod: number; active7: number; activeInPeriod: number }>(
      `SELECT (SELECT COUNT(*)::int FROM organization_members m JOIN users u ON u.id = m.user_id AND u.is_active
                WHERE m.organization_id = $1 AND m.status = 'active') AS active,
              (SELECT COUNT(*)::int FROM organization_members m WHERE m.organization_id = $1 AND m.status = 'inactive') AS deactivated,
              (SELECT COUNT(*)::int FROM invitations i WHERE i.organization_id = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > NOW()) AS invited,
              (SELECT COUNT(*)::int FROM organization_members m WHERE m.organization_id = $1 AND m.joined_at >= NOW() - make_interval(days => $2)) AS "joinedInPeriod",
              ${activeSince("INTERVAL '7 days'")} AS active7,
              ${activeSince('make_interval(days => $2)')} AS "activeInPeriod"`,
      [orgId, days],
    );
    return rows[0]!;
  }

  private async quality(orgId: number, days: number) {
    const [bugs, flow, errors, tests] = await Promise.all([
      db.query<{ severity: string; count: number }>(
        `SELECT COALESCE(w.severity, 'none') AS severity, COUNT(*)::int AS count
           FROM work_items w JOIN projects p ON p.id = w.project_id AND p.status = 'active'
           JOIN project_statuses s ON s.id = w.status_id
          WHERE w.organization_id = $1 AND w.type = 'bug' AND s.category <> 'done' AND w.deleted_at IS NULL
          GROUP BY 1`,
        [orgId],
      ),
      db.query<{ opened: number; closed: number; reopened: number }>(
        `SELECT (SELECT COUNT(*)::int FROM work_items WHERE organization_id = $1 AND type = 'bug' AND deleted_at IS NULL AND created_at >= NOW() - make_interval(days => $2)) AS opened,
                (SELECT COUNT(*)::int FROM work_items WHERE organization_id = $1 AND type = 'bug' AND deleted_at IS NULL AND completed_at >= NOW() - make_interval(days => $2)) AS closed,
                (SELECT COUNT(*)::int FROM work_item_events WHERE organization_id = $1 AND event_type = 'qa_failed' AND created_at >= NOW() - make_interval(days => $2)) AS reopened`,
        [orgId, days],
      ),
      db.query<{ unresolved: number; newInPeriod: number; regressedInPeriod: number }>(
        `SELECT (COUNT(*) FILTER (WHERE status = 'unresolved'))::int AS unresolved,
                (COUNT(*) FILTER (WHERE first_seen_at >= NOW() - make_interval(days => $2)))::int AS "newInPeriod",
                (COUNT(*) FILTER (WHERE regressed_at >= NOW() - make_interval(days => $2)))::int AS "regressedInPeriod"
           FROM error_groups WHERE organization_id = $1`,
        [orgId, days],
      ),
      db.query<{ executed: number; passed: number; failed: number; runsInProgress: number }>(
        `SELECT (COUNT(*) FILTER (WHERE r.status IN ('passed', 'failed', 'blocked')))::int AS executed,
                (COUNT(*) FILTER (WHERE r.status = 'passed'))::int AS passed,
                (COUNT(*) FILTER (WHERE r.status = 'failed'))::int AS failed,
                (SELECT COUNT(*)::int FROM test_runs WHERE organization_id = $1 AND status = 'in_progress') AS "runsInProgress"
           FROM test_results r WHERE r.organization_id = $1 AND r.executed_at >= NOW() - make_interval(days => $2)`,
        [orgId, days],
      ),
    ]);
    const t = tests.rows[0]!;
    const order = ['critical', 'major', 'minor', 'trivial', 'none'];
    return {
      openBugsBySeverity: order.map((severity) => ({ severity, count: bugs.rows.find((b) => b.severity === severity)?.count ?? 0 })),
      bugs: flow.rows[0]!,
      errors: errors.rows[0]!,
      tests: { ...t, passRate: t.executed ? Math.round((t.passed / t.executed) * 100) : null },
    };
  }

  private async leave(orgId: number, seeTypes: boolean) {
    const [out, pending, taken] = await Promise.all([
      db.query<{ userId: number; name: string; startDate: string; endDate: string; portion: string; typeName: string; color: string }>(
        `SELECT u.id AS "userId", u.name, to_char(r.start_date, 'YYYY-MM-DD') AS "startDate", to_char(r.end_date, 'YYYY-MM-DD') AS "endDate",
                r.portion, t.name AS "typeName", t.color
           FROM leave_requests r JOIN users u ON u.id = r.user_id JOIN leave_types t ON t.id = r.leave_type_id
          WHERE r.organization_id = $1 AND r.status = 'approved' AND r.end_date >= CURRENT_DATE AND r.start_date <= CURRENT_DATE + 6
          ORDER BY r.start_date, lower(u.name)`,
        [orgId],
      ),
      db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM leave_requests WHERE organization_id = $1 AND status = 'pending'`, [orgId]),
      db.query<{ name: string; color: string; days: number }>(
        `SELECT t.name, t.color, COALESCE(SUM(r.days), 0)::float AS days
           FROM leave_types t
           LEFT JOIN leave_requests r ON r.leave_type_id = t.id AND r.status = 'approved' AND EXTRACT(YEAR FROM r.start_date) = EXTRACT(YEAR FROM CURRENT_DATE)
          WHERE t.organization_id = $1 AND t.is_active
          GROUP BY t.id ORDER BY t.position`,
        [orgId],
      ),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const rows = out.rows.map((o) => (seeTypes ? o : { ...o, typeName: 'Out of office', color: '#8c8c8c' }));
    return {
      outToday: rows.filter((o) => o.startDate <= today && today <= o.endDate),
      outThisWeek: rows,
      pendingApprovals: pending.rows[0]!.n,
      daysTakenThisYear: seeTypes ? taken.rows : null,
    };
  }
}

/** CSV with a header row; values quoted when needed (Excel-friendly, UTF-8 BOM added by the route). */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    // formula injection guard: a cell starting with = + - @ is treated as text by spreadsheets
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}
