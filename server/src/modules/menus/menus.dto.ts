import { z } from 'zod';

const menuFields = {
  label: z.string().trim().min(1).max(100),
  path: z
    .string()
    .trim()
    .regex(/^\/[A-Za-z0-9\-_/]*$/, 'Path must start with "/"')
    .max(200)
    .nullable(),
  icon: z.string().trim().max(50).nullable(),
  /** organization = inside an organization (by permission); platform = platform admins only */
  scope: z.enum(['organization', 'platform']),
  parentId: z.number().int().positive().nullable(),
  permissionId: z.number().int().positive().nullable(),
  sortOrder: z.number().int().min(0).max(10000),
  isActive: z.boolean(),
};

export const createMenuSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{1,49}$/, 'Key must be a slug like "projects"'),
  label: menuFields.label,
  path: menuFields.path.optional(),
  icon: menuFields.icon.optional(),
  scope: menuFields.scope.optional(),
  parentId: menuFields.parentId.optional(),
  permissionId: menuFields.permissionId.optional(),
  sortOrder: menuFields.sortOrder.optional(),
  isActive: menuFields.isActive.optional(),
});

export const updateMenuSchema = z.object({
  label: menuFields.label.optional(),
  path: menuFields.path.optional(),
  icon: menuFields.icon.optional(),
  scope: menuFields.scope.optional(),
  parentId: menuFields.parentId.optional(),
  permissionId: menuFields.permissionId.optional(),
  sortOrder: menuFields.sortOrder.optional(),
  isActive: menuFields.isActive.optional(),
});

export type CreateMenuDto = z.infer<typeof createMenuSchema>;
export type UpdateMenuDto = z.infer<typeof updateMenuSchema>;
