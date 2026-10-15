// Checklist of a work item: small steps ticked off one by one ("2 / 5" on the card).
//   GET is part of the item detail (checklistItems); changes: /api/work-items/:itemRef/checklist[...]
//   anyone who can edit the item can change its checklist
import { z } from 'zod';
import { db, withTransaction, type Queryable } from '../../database/db.js';
import { BadRequestException, NotFoundException } from '../../common/exceptions/http.exception.js';
import type { RequestContext } from '../../common/utils/request-context.js';
import { assertCanEdit } from '../projects/project-access.js';
import { publishItems } from '../realtime/realtime.hub.js';
import { resolveItem } from './work-items.service.js';

const MAX_ITEMS = 100;

export const checklistAddSchema = z.object({ text: z.string().trim().min(1).max(500) });
export const checklistUpdateSchema = z
  .object({ text: z.string().trim().min(1).max(500), done: z.boolean() })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });
export const checklistOrderSchema = z.object({ ids: z.array(z.number().int().positive()).max(MAX_ITEMS) });

export interface ChecklistItem {
  id: number;
  text: string;
  done: boolean;
  position: number;
  doneBy: { id: number; name: string } | null;
  doneAt: Date | null;
}

export async function loadChecklist(executor: Queryable, itemId: number): Promise<ChecklistItem[]> {
  const { rows } = await executor.query<ChecklistItem>(
    `SELECT ci.id, ci.text, ci.done, ci.position, ci.done_at AS "doneAt",
            CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name) END AS "doneBy"
       FROM work_item_checklist_items ci LEFT JOIN users u ON u.id = ci.done_by
      WHERE ci.work_item_id = $1 ORDER BY ci.position, ci.id`,
    [itemId],
  );
  return rows;
}

/** Appends lines at the end (used by create and templates). */
export async function insertChecklist(executor: Queryable, itemId: number, organizationId: number, lines: string[], userId: number | null) {
  const clean = lines.map((l) => l.trim()).filter(Boolean).slice(0, MAX_ITEMS);
  if (!clean.length) return;
  await executor.query(
    `INSERT INTO work_item_checklist_items (organization_id, work_item_id, text, position, created_by)
     SELECT $1, $2, t.text, (SELECT COALESCE(MAX(position), 0) FROM work_item_checklist_items WHERE work_item_id = $2) + t.n, $4
       FROM unnest($3::text[]) WITH ORDINALITY AS t(text, n)`,
    [organizationId, itemId, clean, userId],
  );
}

export class ChecklistService {
  private async editable(ref: string, ctx: RequestContext) {
    const found = await resolveItem(ctx, ref);
    assertCanEdit(found.access);
    return found;
  }

  private async done(ref: string, ctx: RequestContext, itemId: number, project: Parameters<typeof publishItems>[1]) {
    await db.query('UPDATE work_items SET updated_at = NOW() WHERE id = $1', [itemId]);
    await publishItems(ctx, project, 'updated', [itemId]);
    return loadChecklist(db, itemId);
  }

  async add(ref: string, text: string, ctx: RequestContext) {
    const { itemId, access } = await this.editable(ref, ctx);
    const { rows } = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM work_item_checklist_items WHERE work_item_id = $1', [itemId]);
    if (rows[0]!.n >= MAX_ITEMS) throw new BadRequestException(`A checklist can have at most ${MAX_ITEMS} steps`);
    await insertChecklist(db, itemId, access.project.organizationId, [text], ctx.user!.id);
    return this.done(ref, ctx, itemId, access.project);
  }

  async update(ref: string, checklistId: number, dto: z.infer<typeof checklistUpdateSchema>, ctx: RequestContext) {
    const { itemId, access } = await this.editable(ref, ctx);
    const { rowCount } = await db.query(
      `UPDATE work_item_checklist_items SET
          text = COALESCE($3, text),
          done = COALESCE($4, done),
          done_by = CASE WHEN $4::boolean IS NULL THEN done_by WHEN $4 THEN $5 ELSE NULL END,
          done_at = CASE WHEN $4::boolean IS NULL THEN done_at WHEN $4 THEN NOW() ELSE NULL END
        WHERE id = $1 AND work_item_id = $2`,
      [checklistId, itemId, dto.text ?? null, dto.done ?? null, ctx.user!.id],
    );
    if (!rowCount) throw new NotFoundException('Checklist step not found');
    return this.done(ref, ctx, itemId, access.project);
  }

  async remove(ref: string, checklistId: number, ctx: RequestContext) {
    const { itemId, access } = await this.editable(ref, ctx);
    const { rowCount } = await db.query('DELETE FROM work_item_checklist_items WHERE id = $1 AND work_item_id = $2', [checklistId, itemId]);
    if (!rowCount) throw new NotFoundException('Checklist step not found');
    return this.done(ref, ctx, itemId, access.project);
  }

  /** New order: the ids of ALL steps, top to bottom. */
  async reorder(ref: string, ids: number[], ctx: RequestContext) {
    const { itemId, access } = await this.editable(ref, ctx);
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: number }>('SELECT id FROM work_item_checklist_items WHERE work_item_id = $1 FOR UPDATE', [itemId]);
      const current = new Set(rows.map((r) => r.id));
      if (ids.length !== current.size || !ids.every((id) => current.has(id))) throw new BadRequestException('Send every step of the checklist once');
      await client.query(
        `UPDATE work_item_checklist_items ci SET position = t.n
           FROM unnest($1::int[]) WITH ORDINALITY AS t(id, n) WHERE ci.id = t.id`,
        [ids],
      );
    });
    return this.done(ref, ctx, itemId, access.project);
  }
}
