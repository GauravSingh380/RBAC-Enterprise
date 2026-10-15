import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const createSprintSchema = z.object({
  /** default: "<KEY> Sprint <n>" */
  name: z.string().trim().min(1).max(100).optional(),
  goal: z.string().trim().max(2000).nullable().optional(),
  startDate: dateString.nullable().optional(),
  endDate: dateString.nullable().optional(),
});

export const updateSprintSchema = createSprintSchema.refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

export const startSprintSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  goal: z.string().trim().max(2000).nullable().optional(),
  /** default: today */
  startDate: dateString.optional(),
  /** default: start + 2 weeks */
  endDate: dateString.optional(),
});

export const completeSprintSchema = z.object({
  /** where unfinished items go: the backlog or a planned sprint (id) */
  moveOpenItemsTo: z.union([z.literal('backlog'), z.number().int().positive()]).default('backlog'),
});

export const listSprintsQuerySchema = z.object({
  status: z.enum(['open', 'completed', 'all']).default('all'),
});

export type CreateSprintDto = z.infer<typeof createSprintSchema>;
export type UpdateSprintDto = z.infer<typeof updateSprintSchema>;
export type StartSprintDto = z.infer<typeof startSprintSchema>;
export type CompleteSprintDto = z.infer<typeof completeSprintSchema>;
