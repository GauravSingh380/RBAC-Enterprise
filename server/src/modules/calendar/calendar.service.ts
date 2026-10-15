// Calendar: work items by due date (+ sprints) for a month view.
//   GET /api/projects/:ref/calendar?from=&to=   project calendar (anyone who can see the project)
//   GET /api/my-work/calendar?from=&to=         my items across every project I can access
// Leave and holidays come from the existing availability endpoint (/projects/:ref/availability).
import { z } from 'zod';
import { db } from '../../database/db.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';
import { getProjectAccess, isOrgProjectAdmin } from '../projects/project-access.js';
import { ACCESSIBLE_PROJECT_SQL, ITEM_SELECT, type WorkItemSummary } from '../work-items/work-items.service.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const calendarQuery = z
  .object({ from: day, to: day })
  .refine((q) => q.from <= q.to, { message: '"from" must be before "to"' })
  .refine((q) => (new Date(q.to).getTime() - new Date(q.from).getTime()) / 86_400_000 <= 62, { message: 'At most 62 days at a time' });

export interface CalendarSprint {
  id: number;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
}

export class CalendarService {
  async project(projectRef: string, from: string, to: string, ctx: RequestContext) {
    const { project } = await getProjectAccess(ctx, projectRef);
    const [items, sprints] = await Promise.all([
      db.query<WorkItemSummary>(
        `${ITEM_SELECT} WHERE w.project_id = $1 AND w.due_date BETWEEN $2::date AND $3::date ORDER BY w.due_date, w.rank`,
        [project.id, from, to],
      ),
      db.query<CalendarSprint>(
        `SELECT id, name, status, to_char(start_date, 'YYYY-MM-DD') AS "startDate", to_char(end_date, 'YYYY-MM-DD') AS "endDate"
           FROM sprints
          WHERE project_id = $1 AND start_date IS NOT NULL AND end_date IS NOT NULL
            AND start_date <= $3::date AND end_date >= $2::date
          ORDER BY start_date`,
        [project.id, from, to],
      ),
    ]);
    return { items: items.rows, sprints: sprints.rows };
  }

  async mine(from: string, to: string, ctx: RequestContext) {
    const tenant = tenantOf(ctx);
    const { rows } = await db.query<WorkItemSummary>(
      `${ITEM_SELECT}
        WHERE w.organization_id = $1 AND w.assignee_id = $2 AND p.status = 'active' AND ${ACCESSIBLE_PROJECT_SQL('$2', '$3')}
          AND w.due_date BETWEEN $4::date AND $5::date
        ORDER BY w.due_date, w.rank`,
      [tenant.organizationId, ctx.user!.id, isOrgProjectAdmin(tenant), from, to],
    );
    return { items: rows, sprints: [] as CalendarSprint[] };
  }
}
