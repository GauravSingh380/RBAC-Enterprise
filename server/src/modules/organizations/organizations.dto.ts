import { z } from 'zod';

export const organizationNameSchema = z
  .string()
  .trim()
  .min(2, 'Organization name must be at least 2 characters')
  .max(100);

export const createOrganizationSchema = z.object({
  name: organizationNameSchema,
});

export const updateOrganizationSchema = z.object({
  name: organizationNameSchema,
});

export type CreateOrganizationDto = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationDto = z.infer<typeof updateOrganizationSchema>;
