// The organization dashboard: one request, everything a person needs when they arrive in the morning.
//   my work · project health · bug trend · who's out · upcoming holidays · my leave · things waiting for me
// Every project figure respects project access (private projects only for their members).
import { db } from '../../database/db.js';
import { PERMISSIONS } from '../../common/constants/rbac.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';
import { isOrgProjectAdmin } from '../projects/project-access.js';
import { ACCESSIBLE_PROJECT_SQL, ITEM_SELECT, type WorkItemSummary } from '../work-items/work-items.service.js';
import { calendarFor, canApproveLeave, LeaveService } from '../leave/leave.service.js';

const PRIORITY_ORDER = `CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`;

export class DashboardService {
  private readonly leave = new LeaveService();

  async get(ctx: RequestContext) {
    const tenant = tenantOf(ctx);
    const userId = ctx.user!.id;
    const orgId = tenant.organizationId;
    const admin = isOrgProjectAdmin(tenant);
    const can = (p: string) => tenant.isOwner || tenant.permissions.includes(p);
    const today = new Date().toISOString().slice(0, 10);
    const in7 = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);
    const ACCESS = ACCESSIBLE_PROJECT_SQL('$2', '$3');

    const [myCounts, myItems, projects, bugTrend] = await Promise.all([
      db.query<{ open: number; inProgress: number; overdue: number; dueThisWeek: number }>(
        `SELECT COUNT(*)::int AS open,
                (COUNT(*) FILTER (WHERE s.category = 'in_progress'))::int AS "inProgress",
                (COUNT(*) FILTER (WHERE w.due_date < CURRENT_DATE))::int AS overdue,
                (COUNT(*) FILTER (WHERE w.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6))::int AS "dueThisWeek"
           FROM work_items w JOIN projects p ON p.id = w.project_id JOIN project_statuses s ON s.id = w.status_id
          WHERE w.organization_id = $1 AND w.assignee_id = $2 AND s.category <> 'done' AND p.status = 'active' AND ${ACCESS}
            AND w.deleted_at IS NULL`,
        [orgId, userId, admin],
      ),
      db.query<WorkItemSummary>(
        `${ITEM_SELECT}
          WHERE w.organization_id = $1 AND w.assignee_id = $2 AND s.category <> 'done' AND p.status = 'active' AND ${ACCESS}
          ORDER BY (w.due_date IS NULL), w.due_date, ${PRIORITY_ORDER}, w.updated_at DESC
          LIMIT 8`,
        [orgId, userId, admin],
      ),
      db.query<{ id: number; key: string; name: string; color: string | null; open: number; openBugs: number; overdue: number; doneLast7: number }>(
        `SELECT p.id, p.key, p.name, p.color,
                (COUNT(w.id) FILTER (WHERE s.category <> 'done'))::int AS open,
                (COUNT(w.id) FILTER (WHERE s.category <> 'done' AND w.type = 'bug'))::int AS "openBugs",
                (COUNT(w.id) FILTER (WHERE s.category <> 'done' AND w.due_date < CURRENT_DATE))::int AS overdue,
                (COUNT(w.id) FILTER (WHERE w.completed_at >= NOW() - INTERVAL '7 days'))::int AS "doneLast7"
           FROM projects p
           LEFT JOIN work_items w ON w.project_id = p.id AND w.deleted_at IS NULL
           LEFT JOIN project_statuses s ON s.id = w.status_id
          WHERE p.organization_id = $1 AND p.status = 'active' AND ${ACCESS}
          GROUP BY p.id
          ORDER BY MAX(w.updated_at) DESC NULLS LAST, p.name
          LIMIT 8`,
        [orgId, userId, admin],
      ),
      db.query<{ week: string; opened: number; closed: number }>(
        `SELECT to_char(wk, 'YYYY-MM-DD') AS week,
                (SELECT COUNT(*)::int FROM work_items w JOIN projects p ON p.id = w.project_id
                  WHERE w.organization_id = $1 AND w.type = 'bug' AND ${ACCESS} AND w.deleted_at IS NULL
                    AND w.created_at >= wk AND w.created_at < wk + INTERVAL '1 week') AS opened,
                (SELECT COUNT(*)::int FROM work_items w JOIN projects p ON p.id = w.project_id
                  WHERE w.organization_id = $1 AND w.type = 'bug' AND ${ACCESS} AND w.deleted_at IS NULL
                    AND w.completed_at >= wk AND w.completed_at < wk + INTERVAL '1 week') AS closed
           FROM generate_series(date_trunc('week', CURRENT_DATE) - INTERVAL '7 weeks', date_trunc('week', CURRENT_DATE), INTERVAL '1 week') wk
          ORDER BY wk`,
        [orgId, userId, admin],
      ),
    ]);

    // ---- leave (only with leave.request)
    let leave = null;
    if (can(PERMISSIONS.LEAVE_REQUEST)) {
      const seeTypes = canApproveLeave(tenant) || can(PERMISSIONS.LEAVE_MANAGE);
      const [out, calendar, balances, pending, approvals] = await Promise.all([
        db.query<{ userId: number; name: string; startDate: string; endDate: string; portion: string; typeName: string; color: string; status: string }>(
          `SELECT u.id AS "userId", u.name, to_char(r.start_date, 'YYYY-MM-DD') AS "startDate", to_char(r.end_date, 'YYYY-MM-DD') AS "endDate",
                  r.portion, t.name AS "typeName", t.color, r.status
             FROM leave_requests r JOIN users u ON u.id = r.user_id JOIN leave_types t ON t.id = r.leave_type_id
            WHERE r.organization_id = $1 AND r.status = 'approved'
              AND daterange(r.start_date, r.end_date, '[]') && daterange($2::date, $3::date, '[]')
            ORDER BY r.start_date, lower(u.name)`,
          [orgId, today, in7],
        ),
        calendarFor(db, orgId, userId, today, `${Number(today.slice(0, 4)) + 1}-12-31`),
        this.leave.balances(Number(today.slice(0, 4)), undefined, ctx),
        db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM leave_requests WHERE organization_id = $1 AND user_id = $2 AND status = 'pending'`, [orgId, userId]),
        canApproveLeave(tenant)
          ? db.query<{ n: number }>(
              `SELECT COUNT(*)::int AS n FROM leave_requests WHERE organization_id = $1 AND status = 'pending' AND (user_id <> $2 OR $3::boolean)`,
              [orgId, userId, tenant.isOwner],
            )
          : null,
      ]);
      const { rows: holidays } = await db.query<{ date: string; name: string; isOptional: boolean }>(
        `SELECT to_char(date, 'YYYY-MM-DD') AS date, name, is_optional AS "isOptional"
           FROM holidays WHERE calendar_id = $1 AND date >= CURRENT_DATE ORDER BY date LIMIT 5`,
        [calendar.id],
      );
      leave = {
        // the leave TYPE (e.g. sick) only for the person and approvers
        out: out.rows.map((o) => (seeTypes || o.userId === userId ? o : { ...o, typeName: 'Out of office', color: '#8c8c8c' })),
        upcomingHolidays: holidays,
        balances: balances.filter((b) => b.entitled !== null),
        myPending: pending.rows[0]!.n,
        approvalsPending: approvals?.rows[0]!.n ?? null,
      };
    }

    const errors = can(PERMISSIONS.ERRORS_READ)
      ? (await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM error_groups WHERE organization_id = $1 AND status = 'unresolved'`, [orgId])).rows[0]!.n
      : null;

    return {
      myWork: { ...myCounts.rows[0]!, items: myItems.rows },
      projects: projects.rows,
      bugTrend: bugTrend.rows,
      leave,
      unresolvedErrors: errors,
    };
  }
}
