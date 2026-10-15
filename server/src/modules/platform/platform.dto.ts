import { z } from 'zod';

export const updateOrganizationAdminSchema = z
  .object({
    status: z.enum(['active', 'suspended']).optional(),
    plan: z.string().trim().min(1).max(30).optional(), // must be a key of the plans table (checked in the service)
  })
  .refine((d) => d.status || d.plan, { message: 'Nothing to update' });

export const updateUserAdminSchema = z
  .object({
    isActive: z.boolean().optional(),
    isPlatformAdmin: z.boolean().optional(),
  })
  .refine((d) => d.isActive !== undefined || d.isPlatformAdmin !== undefined, { message: 'Nothing to update' });

export type UpdateOrganizationAdminDto = z.infer<typeof updateOrganizationAdminSchema>;
export type UpdateUserAdminDto = z.infer<typeof updateUserAdminSchema>;
