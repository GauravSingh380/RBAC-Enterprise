// Sprints — the Scrum loop: plan (planned) → start (active) → complete (completed).
//
// Rules:
//   * at most ONE active sprint per project (partial unique index uq_sprints_one_active)
//   * start   → snapshot of the committed scope (points + item count) for velocity
//   * complete → snapshot of what got done; unfinished items go to the backlog or another sprint
//   * completed sprints are read-only history (only name / goal can be fixed) and cannot be deleted
//   * points = sum of `estimate` of stories / tasks / bugs / epics — sub-tasks are not counted twice
import { db, withTransaction, type Queryable } from '../../database/db.js';
import { BadRequestException, ConflictException, NotFoundException } from '../../common/exceptions/http.exception.js';
import { audit } from '../../common/utils/audit.js';
import type { RequestContext } from '../../common/utils/request-context.js';
import { assertCanEdit, getProjectAccess, type ProjectAccess } from '../projects/project-access.js';
import { publishItems, publishSprints } from '../realtime/realtime.hub.js';
import { loadSprint, moveItemsToSprint } from '../work-items/work-item-sprints.js';
import type { CompleteSprintDto, CreateSprintDto, StartSprintDto, UpdateSprintDto } from './sprints.dto.js';

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

export interface Sprint {
  id: number;
  projectId: number;
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
  createdAt: Date;
  /** live numbers (sub-tasks excluded) */
  stats: { itemCount: number; points: number; doneCount: number; donePoints: number };
}

const SPRINT_SELECT = `
  SELECT sp.id, sp.project_id AS "projectId", sp.name, sp.goal, sp.status,
         to_char(sp.start_date, 'YYYY-MM-DD') AS "startDate", to_char(sp.end_date, 'YYYY-MM-DD') AS "endDate",
         sp.started_at AS "startedAt", sp.completed_at AS "completedAt",
         sp.committed_points::float AS "committedPoints", sp.committed_count AS "committedCount",
         sp.completed_points::float AS "completedPoints", sp.completed_count AS "completedCount",
         sp.created_at AS "createdAt",
         (SELECT json_build_object(
                   'itemCount',  COUNT(*)::int,
                   'points',     COALESCE(SUM(w.estimate), 0)::float,
                   'doneCount',  (COUNT(*) FILTER (WHERE s.category = 'done'))::int,
                   'donePoints', COALESCE(SUM(w.estimate) FILTER (WHERE s.category = 'done'), 0)::float)
            FROM work_items w JOIN project_statuses s ON s.id = w.status_id
           WHERE w.sprint_id = sp.id AND w.type <> 'subtask' AND w.deleted_at IS NULL) AS stats
    FROM sprints sp`;

/** active first, then planned (by start date), then completed (newest first) */
const SPRINT_ORDER = `
  ORDER BY CASE sp.status WHEN 'active' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END,
           CASE WHEN sp.status <> 'completed' THEN COALESCE(sp.start_date, DATE '9999-12-31') END,
           CASE WHEN sp.status <> 'completed' THEN sp.id END,
           sp.completed_at DESC`;

function dbError(err: any): never {
  if (err?.code === CHECK_VIOLATION) throw new BadRequestException('The end date must be on or after the start date');
  throw err;
}

export class SprintsService {
  async list(projectRef: string, status: 'open' | 'completed' | 'all', ctx: RequestContext): Promise<Sprint[]> {
    const access = await getProjectAccess(ctx, projectRef);
    const filter = status === 'open' ? `AND sp.status <> 'completed'` : status === 'completed' ? `AND sp.status = 'completed'` : '';
    const { rows } = await db.query<Sprint>(`${SPRINT_SELECT} WHERE sp.project_id = $1 ${filter} ${SPRINT_ORDER}`, [access.project.id]);
    return rows;
  }

  async findOne(projectRef: string, sprintId: number, ctx: RequestContext): Promise<Sprint> {
    const access = await getProjectAccess(ctx, projectRef);
    return this.load(access, sprintId);
  }

  async create(projectRef: string, dto: CreateSprintDto, ctx: RequestContext): Promise<Sprint> {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    const { project } = access;
    const { rows } = await db
      .query<{ id: number }>(
        `INSERT INTO sprints (organization_id, project_id, name, goal, start_date, end_date, created_by)
         VALUES ($1, $2, COALESCE($3, $4 || ' Sprint ' || ((SELECT COUNT(*) FROM sprints WHERE project_id = $2) + 1)), $5, $6, $7, $8)
         RETURNING id`,
        [project.organizationId, project.id, dto.name ?? null, project.key, dto.goal ?? null, dto.startDate ?? null, dto.endDate ?? null, ctx.user!.id],
      )
      .catch(dbError);
    const sprint = await this.load(access, rows[0]!.id);
    await audit(ctx, { action: 'sprint.create', entity: 'project', entityId: project.id, details: { sprint: sprint.name } });
    await publishSprints(ctx, project, 'created', sprint.id);
    return sprint;
  }

  async update(projectRef: string, sprintId: number, dto: UpdateSprintDto, ctx: RequestContext): Promise<Sprint> {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    const current = await this.load(access, sprintId);
    if (current.status === 'completed' && (dto.startDate !== undefined || dto.endDate !== undefined)) {
      throw new BadRequestException('The dates of a completed sprint cannot change (they belong to its report)');
    }
    await db
      .query(
        `UPDATE sprints
            SET name = COALESCE($2, name),
                goal = CASE WHEN $3::boolean THEN $4 ELSE goal END,
                start_date = CASE WHEN $5::boolean THEN $6::date ELSE start_date END,
                end_date = CASE WHEN $7::boolean THEN $8::date ELSE end_date END,
                updated_at = NOW()
          WHERE id = $1`,
        [
          sprintId,
          dto.name ?? null,
          dto.goal !== undefined,
          dto.goal ?? null,
          dto.startDate !== undefined,
          dto.startDate ?? null,
          dto.endDate !== undefined,
          dto.endDate ?? null,
        ],
      )
      .catch(dbError);
    await publishSprints(ctx, access.project, 'updated', sprintId);
    return this.load(access, sprintId);
  }

  async start(projectRef: string, sprintId: number, dto: StartSprintDto, ctx: RequestContext): Promise<Sprint> {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    const current = await this.load(access, sprintId);
    if (current.status !== 'planned') throw new BadRequestException(`"${current.name}" is already ${current.status}`);

    try {
      // committed_* = the scope at the moment the team commits to the sprint (used by velocity)
      await db.query(
        `UPDATE sprints
            SET status = 'active', started_at = NOW(),
                name = COALESCE($2, name),
                goal = CASE WHEN $3::boolean THEN $4 ELSE goal END,
                start_date = COALESCE($5::date, start_date, CURRENT_DATE),
                end_date = COALESCE($6::date, end_date, COALESCE($5::date, start_date, CURRENT_DATE) + 14),
                committed_points = (SELECT COALESCE(SUM(estimate), 0) FROM work_items WHERE sprint_id = $1 AND type <> 'subtask' AND deleted_at IS NULL),
                committed_count  = (SELECT COUNT(*) FROM work_items WHERE sprint_id = $1 AND type <> 'subtask' AND deleted_at IS NULL),
                updated_at = NOW()
          WHERE id = $1 AND status = 'planned'`,
        [sprintId, dto.name ?? null, dto.goal !== undefined, dto.goal ?? null, dto.startDate ?? null, dto.endDate ?? null],
      );
    } catch (err: any) {
      if (err.code === UNIQUE_VIOLATION) throw new ConflictException('Another sprint is already active — complete it first');
      dbError(err);
    }
    const sprint = await this.load(access, sprintId);
    await audit(ctx, { action: 'sprint.start', entity: 'project', entityId: access.project.id, details: { sprint: sprint.name } });
    await publishSprints(ctx, access.project, 'started', sprintId);
    return sprint;
  }

  async complete(projectRef: string, sprintId: number, dto: CompleteSprintDto, ctx: RequestContext): Promise<Sprint & { movedCount: number }> {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    const { project } = access;

    const moved = await withTransaction(async (client) => {
      const sprint = await loadSprintForUpdate(client, sprintId, project.id);
      if (sprint.status !== 'active') throw new BadRequestException(`Only the active sprint can be completed`);

      const target = dto.moveOpenItemsTo === 'backlog' ? null : await loadSprint(dto.moveOpenItemsTo, project.id, client);
      if (target && (target.id === sprintId || target.status !== 'planned')) {
        throw new BadRequestException('Unfinished items can only move to the backlog or a planned sprint');
      }

      // snapshot BEFORE moving anything (same transaction → consistent numbers)
      await client.query(
        `UPDATE sprints sp
            SET completed_points = d.points, completed_count = d.count
           FROM (SELECT COALESCE(SUM(w.estimate), 0) AS points, COUNT(*) AS count
                   FROM work_items w JOIN project_statuses s ON s.id = w.status_id
                  WHERE w.sprint_id = $1 AND w.type <> 'subtask' AND s.category = 'done' AND w.deleted_at IS NULL) d
          WHERE sp.id = $1`,
        [sprintId],
      );
      const open = await client.query<{ id: number }>(
        `SELECT w.id FROM work_items w JOIN project_statuses s ON s.id = w.status_id
          WHERE w.sprint_id = $1 AND s.category <> 'done'`,
        [sprintId],
      );
      const movedIds = await moveItemsToSprint(client, open.rows.map((r) => r.id), target, project.organizationId, ctx.user!.id);
      // NOW() is the transaction start time → completed_at equals the created_at of the "moved out" events
      await client.query(`UPDATE sprints SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`, [sprintId]);
      await audit(
        ctx,
        { action: 'sprint.complete', entity: 'project', entityId: project.id, details: { sprint: sprint.name, movedOpenItems: movedIds.length, to: target?.name ?? 'backlog' } },
        client,
      );
      return movedIds;
    });

    await publishSprints(ctx, project, 'completed', sprintId);
    if (moved.length) await publishItems(ctx, project, 'moved', moved);
    return { ...(await this.load(access, sprintId)), movedCount: moved.length };
  }

  /** Planned / active sprints only; their items go back to the backlog (recorded in history). */
  async remove(projectRef: string, sprintId: number, ctx: RequestContext): Promise<void> {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    const { project } = access;
    const moved = await withTransaction(async (client) => {
      const sprint = await loadSprintForUpdate(client, sprintId, project.id);
      if (sprint.status === 'completed') throw new BadRequestException('Completed sprints are kept for reports and cannot be deleted');
      const items = await client.query<{ id: number }>('SELECT id FROM work_items WHERE sprint_id = $1', [sprintId]);
      const movedIds = await moveItemsToSprint(client, items.rows.map((r) => r.id), null, project.organizationId, ctx.user!.id);
      await client.query('DELETE FROM sprints WHERE id = $1', [sprintId]);
      await audit(ctx, { action: 'sprint.delete', entity: 'project', entityId: project.id, details: { sprint: sprint.name, itemsToBacklog: movedIds.length } }, client);
      return movedIds;
    });
    await publishSprints(ctx, project, 'deleted', sprintId);
    if (moved.length) await publishItems(ctx, project, 'moved', moved);
  }

  private async load(access: ProjectAccess, sprintId: number, executor: Queryable = db): Promise<Sprint> {
    const { rows } = await executor.query<Sprint>(`${SPRINT_SELECT} WHERE sp.id = $1 AND sp.project_id = $2`, [sprintId, access.project.id]);
    if (!rows[0]) throw new NotFoundException('Sprint not found');
    return rows[0];
  }
}

async function loadSprintForUpdate(client: Queryable, sprintId: number, projectId: number) {
  const { rows } = await client.query<{ id: number; name: string; status: Sprint['status'] }>(
    'SELECT id, name, status FROM sprints WHERE id = $1 AND project_id = $2 FOR UPDATE',
    [sprintId, projectId],
  );
  if (!rows[0]) throw new NotFoundException('Sprint not found');
  return rows[0];
}
