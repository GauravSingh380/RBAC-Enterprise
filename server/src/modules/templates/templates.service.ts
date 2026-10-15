// Item templates of a project (+ repeating ones).
//   reading: anyone who can see the project (the create dialog offers them) · changing: project admins
//   repeating: the hourly job "work-items.recurring" creates the item AS the template's author (they need edit
//   rights in the project — if they lost them, the repetition stops and the template says why)
import { z } from 'zod';
import { db, withTransaction } from '../../database/db.js';
import { logger } from '../../common/logger/logger.js';
import { BadRequestException, ConflictException, NotFoundException } from '../../common/exceptions/http.exception.js';
import { audit } from '../../common/utils/audit.js';
import type { RequestContext } from '../../common/utils/request-context.js';
import { defineJob } from '../../jobs/worker.js';
import { assertCanManage, getProjectAccess, MEMBER_CAN_ACCESS_SQL } from '../projects/project-access.js';
import { rbacService } from '../rbac/rbac.service.js';
import { WorkItemsService } from '../work-items/work-items.service.js';
import { addDays, fillTitle, nextRunOn, type RepeatRule } from './repeat-schedule.js';

const today = () => new Date().toISOString().slice(0, 10);

const base = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(['epic', 'story', 'task', 'bug']),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(50_000).nullable().optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low', 'none']),
  labelIds: z.array(z.number().int().positive()).max(20),
  checklist: z.array(z.string().trim().min(1).max(500)).max(100),
  repeat: z.enum(['never', 'weekdays', 'weekly', 'monthly']),
  repeatWeekday: z.number().int().min(0).max(6).nullable(),
  repeatMonthDay: z.number().int().min(1).max(28).nullable(),
  assigneeId: z.number().int().positive().nullable(),
  dueInDays: z.number().int().min(0).max(365).nullable(),
});
/** weekly needs a weekday, monthly a day of the month */
const ruleOk = (d: Partial<z.infer<typeof base>>) =>
  (d.repeat !== 'weekly' || (d.repeatWeekday !== null && d.repeatWeekday !== undefined)) &&
  (d.repeat !== 'monthly' || (d.repeatMonthDay !== null && d.repeatMonthDay !== undefined));
const RULE_MESSAGE = { message: 'Choose the day it repeats on', path: ['repeat'] };

export const templateSchema = base
  .extend({
    priority: base.shape.priority.default('medium'),
    labelIds: base.shape.labelIds.default([]),
    checklist: base.shape.checklist.default([]),
    repeat: base.shape.repeat.default('never'),
    repeatWeekday: base.shape.repeatWeekday.default(null),
    repeatMonthDay: base.shape.repeatMonthDay.default(null),
    assigneeId: base.shape.assigneeId.default(null),
    dueInDays: base.shape.dueInDays.default(null),
  })
  .refine(ruleOk, RULE_MESSAGE);
export const updateTemplateSchema = base.partial().refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

export interface Template {
  id: number;
  name: string;
  type: string;
  title: string;
  description: string | null;
  priority: string;
  labelIds: number[];
  checklist: string[];
  repeat: RepeatRule['repeat'];
  repeatWeekday: number | null;
  repeatMonthDay: number | null;
  assignee: { id: number; name: string } | null;
  dueInDays: number | null;
  nextRunOn: string | null;
  lastRunAt: Date | null;
  createdBy: { id: number; name: string } | null;
}

const SELECT = `
  SELECT t.id, t.name, t.type, t.title, t.description, t.priority, t.label_ids AS "labelIds", t.checklist,
         t.repeat, t.repeat_weekday AS "repeatWeekday", t.repeat_month_day AS "repeatMonthDay",
         CASE WHEN a.id IS NULL THEN NULL ELSE json_build_object('id', a.id, 'name', a.name) END AS assignee,
         t.due_in_days AS "dueInDays", to_char(t.next_run_on, 'YYYY-MM-DD') AS "nextRunOn", t.last_run_at AS "lastRunAt",
         CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('id', c.id, 'name', c.name) END AS "createdBy"
    FROM work_item_templates t
    LEFT JOIN users a ON a.id = t.assignee_id
    LEFT JOIN users c ON c.id = t.created_by`;

const items = new WorkItemsService();

export class TemplatesService {
  async list(projectRef: string, ctx: RequestContext): Promise<Template[]> {
    const { project } = await getProjectAccess(ctx, projectRef);
    const { rows } = await db.query<Template>(`${SELECT} WHERE t.project_id = $1 ORDER BY lower(t.name)`, [project.id]);
    return rows;
  }

  private async manageable(projectRef: string, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanManage(access);
    return access;
  }

  private async checkAssignee(projectId: number, visibility: string, organizationId: number, userId: number | null | undefined) {
    if (!userId) return;
    const { rowCount } = await db.query(
      `SELECT 1 FROM organization_members m WHERE m.organization_id = $1 AND m.user_id = $2 AND m.status = 'active'
          AND ${MEMBER_CAN_ACCESS_SQL('$3', '$4')}`,
      [organizationId, userId, visibility, projectId],
    );
    if (!rowCount) throw new BadRequestException('The assignee must be someone who can access this project');
  }

  async create(projectRef: string, dto: z.infer<typeof templateSchema>, ctx: RequestContext): Promise<Template> {
    const { project } = await this.manageable(projectRef, ctx);
    await this.checkAssignee(project.id, project.visibility, project.organizationId, dto.assigneeId);
    try {
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO work_item_templates (organization_id, project_id, name, type, title, description, priority, label_ids, checklist,
                                          repeat, repeat_weekday, repeat_month_day, assignee_id, due_in_days, next_run_on, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
        [project.organizationId, project.id, dto.name, dto.type, dto.title, dto.description ?? null, dto.priority, dto.labelIds,
         JSON.stringify(dto.checklist), dto.repeat, dto.repeatWeekday, dto.repeatMonthDay, dto.assigneeId, dto.dueInDays,
         nextRunOn(dto, today(), true), ctx.user!.id],
      );
      await audit(ctx, { action: 'template.create', entity: 'project', entityId: project.id, details: { name: dto.name, repeat: dto.repeat } });
      return this.one(rows[0]!.id);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new ConflictException(`A template "${dto.name}" already exists`);
      throw err;
    }
  }

  async update(projectRef: string, id: number, dto: z.infer<typeof updateTemplateSchema>, ctx: RequestContext): Promise<Template> {
    const { project } = await this.manageable(projectRef, ctx);
    const current = await this.one(id, project.id);
    const merged = {
      repeat: dto.repeat ?? current.repeat,
      repeatWeekday: dto.repeatWeekday !== undefined ? dto.repeatWeekday : current.repeatWeekday,
      repeatMonthDay: dto.repeatMonthDay !== undefined ? dto.repeatMonthDay : current.repeatMonthDay,
    };
    if (!ruleOk(merged)) throw new BadRequestException(RULE_MESSAGE.message);
    if (dto.assigneeId !== undefined) await this.checkAssignee(project.id, project.visibility, project.organizationId, dto.assigneeId);

    const set: string[] = [];
    const values: unknown[] = [id];
    const col = (name: string, value: unknown) => {
      values.push(value);
      set.push(`${name} = $${values.length}`);
    };
    if (dto.name !== undefined) col('name', dto.name);
    if (dto.type !== undefined) col('type', dto.type);
    if (dto.title !== undefined) col('title', dto.title);
    if (dto.description !== undefined) col('description', dto.description);
    if (dto.priority !== undefined) col('priority', dto.priority);
    if (dto.labelIds !== undefined) col('label_ids', dto.labelIds);
    if (dto.checklist !== undefined) col('checklist', JSON.stringify(dto.checklist));
    if (dto.assigneeId !== undefined) col('assignee_id', dto.assigneeId);
    if (dto.dueInDays !== undefined) col('due_in_days', dto.dueInDays);
    col('repeat', merged.repeat);
    col('repeat_weekday', merged.repeat === 'weekly' ? merged.repeatWeekday : null);
    col('repeat_month_day', merged.repeat === 'monthly' ? merged.repeatMonthDay : null);
    // saving (re)starts the schedule — also after it was paused
    col('next_run_on', nextRunOn(merged, today(), true));
    // saving also makes you the author the repeating items are created by
    col('created_by', ctx.user!.id);
    try {
      await db.query(`UPDATE work_item_templates SET ${set.join(', ')}, updated_at = NOW() WHERE id = $1`, values);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new ConflictException('A template with this name already exists');
      throw err;
    }
    await audit(ctx, { action: 'template.update', entity: 'project', entityId: project.id, details: { id, changed: Object.keys(dto) } });
    return this.one(id);
  }

  async remove(projectRef: string, id: number, ctx: RequestContext) {
    const { project } = await this.manageable(projectRef, ctx);
    const { rows } = await db.query<{ name: string }>('DELETE FROM work_item_templates WHERE id = $1 AND project_id = $2 RETURNING name', [id, project.id]);
    if (!rows[0]) throw new NotFoundException('Template not found');
    await audit(ctx, { action: 'template.delete', entity: 'project', entityId: project.id, details: { name: rows[0].name } });
  }

  private async one(id: number, projectId?: number): Promise<Template> {
    const { rows } = await db.query<Template>(`${SELECT} WHERE t.id = $1 AND ($2::int IS NULL OR t.project_id = $2)`, [id, projectId ?? null]);
    if (!rows[0]) throw new NotFoundException('Template not found');
    return rows[0];
  }
}

// ---------------------------------------------------------------- the repeating job

/**
 * Creates today's items of every repeating template that is due. Each template is claimed first
 * (next_run_on moves to the next date in the same statement), so two workers never create the same item.
 * If the server was off for days, ONE item is created and the schedule continues from today — no flood.
 */
export async function runRecurringTemplates(day = today()): Promise<number> {
  let created = 0;
  for (;;) {
    const claimed = await withTransaction(async (client) => {
      const { rows } = await client.query<{
        id: number; organizationId: number; projectId: number; createdBy: number | null; name: string; type: string; title: string;
        description: string | null; priority: string; labelIds: number[]; checklist: string[]; assigneeId: number | null;
        dueInDays: number | null; repeat: RepeatRule['repeat']; repeatWeekday: number | null; repeatMonthDay: number | null;
      }>(
        `SELECT id, organization_id AS "organizationId", project_id AS "projectId", created_by AS "createdBy", name, type, title,
                description, priority, label_ids AS "labelIds", checklist, assignee_id AS "assigneeId", due_in_days AS "dueInDays",
                repeat, repeat_weekday AS "repeatWeekday", repeat_month_day AS "repeatMonthDay"
           FROM work_item_templates
          WHERE repeat <> 'never' AND next_run_on IS NOT NULL AND next_run_on <= $1::date
          ORDER BY next_run_on, id LIMIT 1 FOR UPDATE SKIP LOCKED`,
        [day],
      );
      const t = rows[0];
      if (!t) return null;
      await client.query('UPDATE work_item_templates SET next_run_on = $2, last_run_at = NOW() WHERE id = $1', [t.id, nextRunOn(t, day, false)]);
      return t;
    });
    if (!claimed) break;

    // the template's author creates the item — with their rights in the project
    const author = claimed.createdBy ? await rbacService.getAuthUser(claimed.createdBy) : null;
    const tenant = author ? await rbacService.getMembership(author.id, claimed.organizationId) : null;
    const ctx: RequestContext = { user: author, tenant, ip: null, userAgent: 'recurring-template', clientId: null };
    try {
      if (!author || !tenant) throw new Error('the author is no longer a member');
      const access = await getProjectAccess(ctx, claimed.projectId);
      if (!access.canEdit) throw new Error('the author can no longer edit this project (or it is archived)');
      const { rows: labels } = await db.query<{ id: number }>('SELECT id FROM project_labels WHERE project_id = $1 AND id = ANY($2::int[])', [claimed.projectId, claimed.labelIds]);
      const dto = {
        type: claimed.type as 'task',
        title: fillTitle(claimed.title, day).slice(0, 500),
        description: claimed.description ?? undefined,
        priority: claimed.priority as 'medium',
        labelIds: labels.map((l) => l.id),
        checklist: claimed.checklist,
        dueDate: claimed.dueInDays !== null ? addDays(day, claimed.dueInDays) : undefined,
        assigneeId: claimed.assigneeId ?? undefined,
      };
      try {
        await items.create(String(claimed.projectId), dto, ctx);
      } catch (err) {
        if (!dto.assigneeId) throw err;
        // the assignee left the project: create it unassigned rather than not at all
        await items.create(String(claimed.projectId), { ...dto, assigneeId: undefined }, ctx);
      }
      created++;
    } catch (err) {
      // pause the repetition; a project admin restarts it by saving the template
      await db.query('UPDATE work_item_templates SET next_run_on = NULL WHERE id = $1', [claimed.id]);
      logger.warn(`Repeating template "${claimed.name}" (#${claimed.id}) paused: ${(err as Error).message}`);
    }
  }
  return created;
}

defineJob('work-items.recurring', async () => {
  const n = await runRecurringTemplates();
  if (n) logger.info(`Repeating templates: ${n} item(s) created`);
});
