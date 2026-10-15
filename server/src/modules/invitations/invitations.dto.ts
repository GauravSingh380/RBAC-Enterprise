import { z } from 'zod';
import { emailSchema } from '../auth/auth.dto.js';

/**
 * Member: { email, roleId }.
 * Guest:  { email, projectId, projectRole } — an outside collaborator who only sees that project
 *         (they get the organization's Guest role; roleId is not used).
 */
export const createInvitationSchema = z
  .object({
    email: emailSchema,
    roleId: z.number().int().positive().optional(),
    projectId: z.number().int().positive().optional(),
    projectRole: z.enum(['member', 'viewer']).default('viewer'),
  })
  .refine((d) => d.roleId || d.projectId, { message: 'Choose a role (member) or a project (guest)', path: ['roleId'] });

export type CreateInvitationDto = z.infer<typeof createInvitationSchema>;
