import { z } from 'zod';
import { paginationSchema } from '../../common/utils/pagination.js';
import { TEMPLATE_KEYS } from './project-templates.js';

const color = z.string().trim().max(20);

export const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Key must be 2–10 letters/digits starting with a letter (e.g. TF, WEB2)');

export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(100),
  key: projectKeySchema,
  description: z.string().trim().max(5000).optional(),
  template: z.enum(TEMPLATE_KEYS).default('kanban'),
  visibility: z.enum(['private', 'organization']).default('organization'),
  icon: z.string().trim().max(50).optional(),
  color: color.optional(),
  leadId: z.number().int().positive().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  visibility: z.enum(['private', 'organization']).optional(),
  icon: z.string().trim().max(50).nullable().optional(),
  color: color.nullable().optional(),
  leadId: z.number().int().positive().nullable().optional(),
  /** QA verification flow (statuses of this project; null clears) */
  qaReadyStatusId: z.number().int().positive().nullable().optional(),
  qaPassedStatusId: z.number().int().positive().nullable().optional(),
  qaFailedStatusId: z.number().int().positive().nullable().optional(),
});

export const listProjectsQuerySchema = paginationSchema.extend({
  status: z.enum(['active', 'archived', 'all']).default('active'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const projectRoleSchema = z.enum(['admin', 'member', 'viewer']);

export const addProjectMemberSchema = z.object({
  userId: z.number().int().positive(),
  role: projectRoleSchema.default('member'),
});

export const updateProjectMemberSchema = z.object({
  role: projectRoleSchema,
});

// ---------------------------------------------------------------- workflow / labels / fields

export const statusCategorySchema = z.enum(['todo', 'in_progress', 'done']);

export const createStatusSchema = z.object({
  name: z.string().trim().min(1).max(50),
  category: statusCategorySchema,
  color: color.default('#8c8c8c'),
  restrictedRoles: z.array(z.string().trim().max(50)).max(20).default([]),
  /** board column soft limit (Kanban "work in progress" limit) */
  wipLimit: z.number().int().min(1).max(999).nullable().optional(),
});

export const updateStatusSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  category: statusCategorySchema.optional(),
  color: color.optional(),
  restrictedRoles: z.array(z.string().trim().max(50)).max(20).optional(),
  wipLimit: z.number().int().min(1).max(999).nullable().optional(),
});

export const reorderStatusesSchema = z.object({
  statusIds: z.array(z.number().int().positive()).min(1),
});

export const createLabelSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: color.default('blue'),
});

export const updateLabelSchema = createLabelSchema.partial();

export const fieldTypeSchema = z.enum(['text', 'number', 'date', 'select', 'multi_select', 'checkbox']);

export const createFieldSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    fieldType: fieldTypeSchema,
    options: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
    required: z.boolean().default(false),
  })
  .refine((f) => !['select', 'multi_select'].includes(f.fieldType) || f.options.length > 0, {
    message: 'Select fields need at least one option',
    path: ['options'],
  });

export const updateFieldSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  options: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
  required: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

export type CreateProjectDto = z.infer<typeof createProjectSchema>;
export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;
export type CreateStatusDto = z.infer<typeof createStatusSchema>;
export type UpdateStatusDto = z.infer<typeof updateStatusSchema>;
export type CreateFieldDto = z.infer<typeof createFieldSchema>;
export type UpdateFieldDto = z.infer<typeof updateFieldSchema>;
