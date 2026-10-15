import { z } from 'zod';

const permissionIdsSchema = z.array(z.number().int().positive());

export const createRoleSchema = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{1,49}$/, 'Name must be a slug like "team_lead" (letters, numbers, underscore)'),
  displayName: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  permissionIds: permissionIdsSchema.optional(),
});

export const updateRoleSchema = z.object({
  displayName: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).optional(),
});

export const setRolePermissionsSchema = z.object({
  permissionIds: permissionIdsSchema,
});

export type CreateRoleDto = z.infer<typeof createRoleSchema>;
export type UpdateRoleDto = z.infer<typeof updateRoleSchema>;
