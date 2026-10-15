// /api/platform/plans — the platform owner edits plans and their limits (mounted in platform.routes.ts).
//   GET    /            plans + how many organizations use each
//   POST   /            { key, name, description?, maxMembers, maxProjects, maxGuests, sortOrder? }
//   PATCH  /:key        any of the above except key
//   DELETE /:key        only when no organization uses it
// The organization side (usage of the active organization) is GET /api/organizations/current/usage.
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../database/db.js';
import { ConflictException, NotFoundException } from '../../common/exceptions/http.exception.js';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { audit } from '../../common/utils/audit.js';
import { getContext } from '../../common/utils/request-context.js';

const limit = (min: number) => z.number().int().min(min).max(1_000_000).nullable(); // null = unlimited
export const planSchema = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9_-]{0,29}$/, 'Lowercase letters, digits, - and _'),
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).nullable().optional(),
  maxMembers: limit(1),
  maxProjects: limit(0),
  maxGuests: limit(0),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});
const updatePlanSchema = planSchema.omit({ key: true }).partial().refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

const PLAN_SELECT = `
  SELECT pl.key, pl.name, pl.description, pl.max_members AS "maxMembers", pl.max_projects AS "maxProjects",
         pl.max_guests AS "maxGuests", pl.sort_order AS "sortOrder",
         (SELECT COUNT(*)::int FROM organizations o WHERE o.plan = pl.key) AS organizations
    FROM plans pl`;

export async function planExists(key: string): Promise<boolean> {
  const { rowCount } = await db.query('SELECT 1 FROM plans WHERE key = $1', [key]);
  return !!rowCount;
}

export const platformPlansRouter = Router();

platformPlansRouter.get('/', async (_req, res) => {
  const { rows } = await db.query(`${PLAN_SELECT} ORDER BY pl.sort_order, pl.key`);
  res.json({ success: true, data: rows });
});

platformPlansRouter.post('/', validateBody(planSchema), async (req, res) => {
  const d = req.body as z.infer<typeof planSchema>;
  try {
    await db.query(
      `INSERT INTO plans (key, name, description, max_members, max_projects, max_guests, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM plans)))`,
      [d.key, d.name, d.description ?? null, d.maxMembers, d.maxProjects, d.maxGuests, d.sortOrder ?? null],
    );
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new ConflictException(`A plan "${d.key}" already exists`);
    throw err;
  }
  await audit(getContext(req), { action: 'plan.create', entity: 'plan', entityId: d.key, details: d, organizationId: null });
  res.status(201).json({ success: true, data: (await db.query(`${PLAN_SELECT} WHERE pl.key = $1`, [d.key])).rows[0] });
});

platformPlansRouter.patch('/:key', validateBody(updatePlanSchema), async (req, res) => {
  const d = req.body as z.infer<typeof updatePlanSchema>;
  const key = String(req.params.key);
  const set: string[] = [];
  const values: unknown[] = [key];
  const col = (name: string, value: unknown) => {
    values.push(value);
    set.push(`${name} = $${values.length}`);
  };
  if (d.name !== undefined) col('name', d.name);
  if (d.description !== undefined) col('description', d.description);
  if (d.maxMembers !== undefined) col('max_members', d.maxMembers);
  if (d.maxProjects !== undefined) col('max_projects', d.maxProjects);
  if (d.maxGuests !== undefined) col('max_guests', d.maxGuests);
  if (d.sortOrder !== undefined) col('sort_order', d.sortOrder);
  const { rowCount } = await db.query(`UPDATE plans SET ${set.join(', ')}, updated_at = NOW() WHERE key = $1`, values);
  if (!rowCount) throw new NotFoundException('Plan not found');
  await audit(getContext(req), { action: 'plan.update', entity: 'plan', entityId: key, details: d, organizationId: null });
  res.json({ success: true, data: (await db.query(`${PLAN_SELECT} WHERE pl.key = $1`, [key])).rows[0] });
});

platformPlansRouter.delete('/:key', async (req, res) => {
  const key = String(req.params.key);
  const { rows } = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM organizations WHERE plan = $1', [key]);
  if (rows[0]!.n > 0) throw new ConflictException(`${rows[0]!.n} organization(s) use this plan — move them to another plan first`);
  const { rowCount } = await db.query('DELETE FROM plans WHERE key = $1', [key]);
  if (!rowCount) throw new NotFoundException('Plan not found');
  await audit(getContext(req), { action: 'plan.delete', entity: 'plan', entityId: key, organizationId: null });
  res.json({ success: true });
});
