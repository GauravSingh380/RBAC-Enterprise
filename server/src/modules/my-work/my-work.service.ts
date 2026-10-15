// "My Work" — everything waiting for ME, across all projects, in one request:
//   * items assigned to me (not done), due soonest first
//   * bugs waiting for my QA verdict (projects with a QA flow where I may verify)
//   * leave requests I can decide (my direct reports, or everyone if I'm a leave approver)
//   * unread @mentions
import { db } from '../../database/db.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';
import { isOrgProjectAdmin } from '../projects/project-access.js';
import { canApproveLeave } from '../leave/leave.service.js';
import { ACCESSIBLE_PROJECT_SQL, ITEM_SELECT, type WorkItemSummary } from '../work-items/work-items.service.js';

const PRIORITY_ORDER = `CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`;

export class MyWorkService {
  async get(ctx: RequestContext) {
    const tenant = tenantOf(ctx);
    const me = ctx.user!.id;
    const orgId = tenant.organizationId;
    const admin = isOrgProjectAdmin(tenant);
    const approver = canApproveLeave(tenant);

    const [assigned, qa, leave, mentions] = await Promise.all([
      db.query<WorkItemSummary>(
        `${ITEM_SELECT}
          WHERE w.organization_id = $1 AND w.assignee_id = $2 AND s.category <> 'done' AND p.status = 'active'
            AND ${ACCESSIBLE_PROJECT_SQL('$2', '$3')}
          ORDER BY (w.due_date IS NULL), w.due_date, ${PRIORITY_ORDER}, w.updated_at DESC
          LIMIT 200`,
        [orgId, me, admin],
      ),
      // QA: items in a project's "ready for QA" status, where I'm allowed to give the verdict
      // (same rule as the API: the passed status' role restriction, or project admin)
      db.query<WorkItemSummary>(
        `${ITEM_SELECT}
           JOIN project_statuses passed ON passed.id = p.qa_passed_status_id
           LEFT JOIN project_members mine ON mine.project_id = p.id AND mine.user_id = $2
          WHERE w.organization_id = $1 AND p.status = 'active' AND w.status_id = p.qa_ready_status_id
            AND p.qa_failed_status_id IS NOT NULL
            AND ($3::boolean OR mine.role = 'admin'
                 OR (mine.role = 'member' AND (passed.restricted_roles = '{}' OR passed.restricted_roles && $4::text[])))
          ORDER BY w.updated_at
          LIMIT 50`,
        [orgId, me, admin, tenant.roles],
      ),
      db.query<{ id: number; user: { id: number; name: string }; typeName: string; color: string; startDate: string; endDate: string; portion: string; days: number; reason: string | null }>(
        `SELECT r.id, json_build_object('id', u.id, 'name', u.name) AS "user", t.name AS "typeName", t.color,
                to_char(r.start_date, 'YYYY-MM-DD') AS "startDate", to_char(r.end_date, 'YYYY-MM-DD') AS "endDate",
                r.portion, r.days::float AS days, r.reason
           FROM leave_requests r
           JOIN users u ON u.id = r.user_id
           JOIN leave_types t ON t.id = r.leave_type_id
           JOIN organization_members m ON m.organization_id = r.organization_id AND m.user_id = r.user_id
          WHERE r.organization_id = $1 AND r.status = 'pending'
            AND (m.manager_id = $2 OR ($3::boolean AND (r.user_id <> $2 OR $4::boolean)))
          ORDER BY r.created_at`,
        [orgId, me, approver, tenant.isOwner],
      ),
      db.query<{ id: number; title: string; body: string | null; url: string; updatedAt: Date }>(
        `SELECT id::int, title, body, url, updated_at AS "updatedAt" FROM notifications
          WHERE organization_id = $1 AND user_id = $2 AND type = 'mentioned' AND read_at IS NULL
          ORDER BY updated_at DESC LIMIT 10`,
        [orgId, me],
      ),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const in7 = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10);
    const items = assigned.rows;
    return {
      counts: {
        assigned: items.length,
        overdue: items.filter((i) => i.dueDate && i.dueDate < today).length,
        dueToday: items.filter((i) => i.dueDate === today).length,
        dueThisWeek: items.filter((i) => i.dueDate && i.dueDate > today && i.dueDate <= in7).length,
        inProgress: items.filter((i) => i.status.category === 'in_progress').length,
        qa: qa.rows.length,
        leave: leave.rows.length,
        mentions: mentions.rows.length,
      },
      assigned: items,
      qa: qa.rows,
      leave: leave.rows,
      mentions: mentions.rows,
    };
  }
}
