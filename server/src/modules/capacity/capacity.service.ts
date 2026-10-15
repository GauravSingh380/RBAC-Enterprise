// Capacity planning — leave and holidays meet sprints.
//
//   GET /projects/:ref/sprints/:id/capacity
//     who is in the sprint, their working days (own holiday calendar), approved / pending leave,
//     allocation %, available days, and how many points they already carry
//     + a FORECAST: points per available person-day learned from the last completed sprints
//   PUT /projects/:ref/sprints/:id/capacity/:userId   { allocation, note }
//   GET /projects/:ref/availability?from&to   who is away when (assignee picker, due dates)
//
// The team of a sprint = project members with edit rights + anyone with work in the sprint + anyone with
// an allocation row. Leave TYPES are never shown here — only that someone is away.
import { z } from 'zod';
import { db, type Queryable } from '../../database/db.js';
import { BadRequestException, NotFoundException } from '../../common/exceptions/http.exception.js';
import { audit } from '../../common/utils/audit.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';
import { assertCanEdit, getProjectAccess, MEMBER_CAN_ACCESS_SQL, peopleVisibility, type ProjectAccess } from '../projects/project-access.js';
import { calendarFor } from '../leave/leave.service.js';
import { loadStatus, personCapacity, type LeaveSpan } from './capacity.js';

const HISTORY_SPRINTS = 3;
const round1 = (n: number) => Math.round(n * 10) / 10;

export const allocationSchema = z.object({
  allocation: z.number().int().min(0).max(100),
  note: z.string().trim().max(255).nullable().optional(),
});

export const availabilityQuerySchema = z
  .object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
  .refine((d) => d.to >= d.from && (new Date(d.to).getTime() - new Date(d.from).getTime()) / 86_400_000 <= 92, {
    message: 'Use a range of at most three months',
  });

interface SprintRow {
  id: number;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  completedPoints: number | null;
}

export class CapacityService {
  async sprintCapacity(projectRef: string, sprintId: number, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    const sprint = await this.loadSprint(access, sprintId);
    if (!sprint.startDate || !sprint.endDate) {
      return { sprint, needsDates: true as const };
    }
    const range = { start: sprint.startDate, end: sprint.endDate };
    const [team, history] = await Promise.all([this.team(db, access, sprintId, range), this.pointsPerDay(access, sprintId)]);

    // work already in the sprint, per person (sub-tasks not counted — their parent's estimate covers them)
    const { rows: work } = await db.query<{ userId: number | null; points: number; count: number; remainingPoints: number }>(
      `SELECT w.assignee_id AS "userId", COALESCE(SUM(w.estimate), 0)::float AS points, COUNT(*)::int AS count,
              COALESCE(SUM(w.estimate) FILTER (WHERE s.category <> 'done'), 0)::float AS "remainingPoints"
         FROM work_items w JOIN project_statuses s ON s.id = w.status_id
        WHERE w.sprint_id = $1 AND w.type <> 'subtask' AND w.deleted_at IS NULL
        GROUP BY w.assignee_id`,
      [sprintId],
    );
    const workOf = (userId: number | null) => work.find((w) => w.userId === userId) ?? { points: 0, count: 0, remainingPoints: 0 };

    const people = team.map((p) => {
      const w = workOf(p.user.id);
      const expectedPoints = history.pointsPerDay === null ? null : round1(p.capacity.availableDays * history.pointsPerDay);
      return {
        ...p,
        assignedPoints: w.points,
        assignedCount: w.count,
        remainingPoints: w.remainingPoints,
        expectedPoints,
        load: expectedPoints ? Math.round((w.points / expectedPoints) * 100) : null,
        status: loadStatus(w.points, expectedPoints),
      };
    });
    const availableDays = round1(people.reduce((s, p) => s + p.capacity.availableDays, 0));
    const committedPoints = round1(work.reduce((s, w) => s + w.points, 0));
    const forecastPoints = history.pointsPerDay === null ? null : round1(availableDays * history.pointsPerDay);

    return {
      sprint,
      needsDates: false as const,
      range,
      people: people.sort((a, b) => a.user.name.localeCompare(b.user.name)),
      unassigned: workOf(null),
      totals: {
        people: people.filter((p) => p.capacity.allocation > 0).length,
        workingDays: round1(people.reduce((s, p) => s + (p.capacity.allocation > 0 ? p.capacity.workingDays : 0), 0)),
        leaveDays: round1(people.reduce((s, p) => s + p.capacity.leaveDays, 0)),
        pendingLeaveDays: round1(people.reduce((s, p) => s + p.capacity.pendingLeaveDays, 0)),
        availableDays,
        committedPoints,
        forecastPoints,
        load: forecastPoints ? Math.round((committedPoints / forecastPoints) * 100) : null,
      },
      history,
    };
  }

  async setAllocation(projectRef: string, sprintId: number, userId: number, dto: z.infer<typeof allocationSchema>, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    const sprint = await this.loadSprint(access, sprintId);
    if (sprint.status === 'completed') throw new BadRequestException('A completed sprint can no longer change');
    try {
      await db.query(
        `INSERT INTO sprint_capacity (sprint_id, project_id, organization_id, user_id, allocation, note, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (sprint_id, user_id) DO UPDATE SET allocation = EXCLUDED.allocation, note = EXCLUDED.note,
                                                       updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [sprintId, access.project.id, access.project.organizationId, userId, dto.allocation, dto.note ?? null, ctx.user!.id],
      );
    } catch (err: any) {
      if (err.code === '23503') throw new BadRequestException('Not a member of this organization');
      throw err;
    }
    await audit(ctx, { action: 'sprint.capacity', entity: 'project', entityId: access.project.id, details: { sprintId, userId, ...dto } });
    return this.sprintCapacity(projectRef, sprintId, ctx);
  }

  /** Who is away (approved or pending leave) and which holidays apply — for assignee pickers and due dates. */
  async availability(projectRef: string, from: string, to: string, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    const orgId = access.project.organizationId;
    const { rows: people } = await db.query<{ id: number; name: string }>(
      `SELECT u.id, u.name FROM organization_members m JOIN users u ON u.id = m.user_id
        WHERE m.organization_id = $1 AND m.status = 'active' AND u.is_active
          AND ${MEMBER_CAN_ACCESS_SQL('$2', '$3')}
        ORDER BY lower(u.name)`,
      [orgId, peopleVisibility(tenantOf(ctx), access.project), access.project.id],
    );
    const leaves = await this.leavesOf(db, orgId, people.map((p) => p.id), from, to);
    return Promise.all(
      people.map(async (p) => {
        const cal = await calendarFor(db, orgId, p.id, from, to);
        return {
          user: p,
          away: leaves.filter((l) => l.userId === p.id).map(({ userId: _u, ...l }) => l),
          holidays: [...cal.holidays].map(([date, name]) => ({ date, name })),
          weekendDays: cal.weekendDays,
        };
      }),
    );
  }

  // ---------------------------------------------------------------- helpers

  private async team(executor: Queryable, access: ProjectAccess, sprintId: number, range: { start: string; end: string }) {
    const orgId = access.project.organizationId;
    const { rows: members } = await executor.query<{ id: number; name: string; allocation: number | null; note: string | null; projectRole: string | null }>(
      `SELECT u.id, u.name, sc.allocation, sc.note, pm.role AS "projectRole"
         FROM users u
         JOIN organization_members m ON m.user_id = u.id AND m.organization_id = $1 AND m.status = 'active'
         LEFT JOIN sprint_capacity sc ON sc.sprint_id = $2 AND sc.user_id = u.id
         LEFT JOIN project_members pm ON pm.project_id = $3 AND pm.user_id = u.id
        WHERE (pm.role IN ('admin', 'member'))
           OR sc.user_id IS NOT NULL
           OR EXISTS (SELECT 1 FROM work_items w WHERE w.sprint_id = $2 AND w.assignee_id = u.id AND w.deleted_at IS NULL)`,
      [orgId, sprintId, access.project.id],
    );
    const leaves = await this.leavesOf(executor, orgId, members.map((m) => m.id), range.start, range.end);
    return Promise.all(
      members.map(async (m) => {
        const cal = await calendarFor(executor, orgId, m.id, range.start, range.end);
        const away = leaves.filter((l) => l.userId === m.id);
        return {
          user: { id: m.id, name: m.name },
          projectRole: m.projectRole,
          note: m.note,
          capacity: personCapacity(range, cal, away, m.allocation ?? 100),
          away: away.map(({ userId: _u, ...l }) => l),
        };
      }),
    );
  }

  private async leavesOf(executor: Queryable, orgId: number, userIds: number[], from: string, to: string) {
    const { rows } = await executor.query<LeaveSpan & { userId: number }>(
      `SELECT user_id AS "userId", to_char(start_date, 'YYYY-MM-DD') AS "startDate", to_char(end_date, 'YYYY-MM-DD') AS "endDate", portion, status
         FROM leave_requests
        WHERE organization_id = $1 AND user_id = ANY($2::int[]) AND status IN ('approved', 'pending')
          AND daterange(start_date, end_date, '[]') && daterange($3::date, $4::date, '[]')
        ORDER BY start_date`,
      [orgId, userIds, from, to],
    );
    return rows;
  }

  /**
   * Learned focus factor: completed points ÷ available person-days over the last completed sprints
   * (their availability recomputed with today's calendars and the leave history).
   */
  private async pointsPerDay(access: ProjectAccess, excludeSprintId: number) {
    const { rows: past } = await db.query<SprintRow>(
      `SELECT id, name, status, to_char(start_date, 'YYYY-MM-DD') AS "startDate", to_char(end_date, 'YYYY-MM-DD') AS "endDate",
              completed_points::float AS "completedPoints"
         FROM sprints
        WHERE project_id = $1 AND status = 'completed' AND id <> $2 AND start_date IS NOT NULL AND end_date IS NOT NULL
        ORDER BY completed_at DESC LIMIT ${HISTORY_SPRINTS}`,
      [access.project.id, excludeSprintId],
    );
    const sprints = await Promise.all(
      past.map(async (s) => {
        const team = await this.team(db, access, s.id, { start: s.startDate!, end: s.endDate! });
        const availableDays = round1(team.reduce((sum, p) => sum + p.capacity.availableDays, 0));
        return { id: s.id, name: s.name, completedPoints: s.completedPoints ?? 0, availableDays };
      }),
    );
    const days = sprints.reduce((s, x) => s + x.availableDays, 0);
    const points = sprints.reduce((s, x) => s + x.completedPoints, 0);
    return { sprints, pointsPerDay: days > 0 && points > 0 ? Math.round((points / days) * 100) / 100 : null };
  }

  private async loadSprint(access: ProjectAccess, sprintId: number): Promise<SprintRow> {
    const { rows } = await db.query<SprintRow>(
      `SELECT id, name, status, to_char(start_date, 'YYYY-MM-DD') AS "startDate", to_char(end_date, 'YYYY-MM-DD') AS "endDate",
              completed_points::float AS "completedPoints"
         FROM sprints WHERE id = $1 AND project_id = $2`,
      [sprintId, access.project.id],
    );
    if (!rows[0]) throw new NotFoundException('Sprint not found');
    return rows[0];
  }
}
