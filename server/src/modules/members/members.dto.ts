import { z } from 'zod';

export const updateMemberSchema = z.object({
  isActive: z.boolean(),
});

export const setMemberRolesSchema = z.object({
  roleIds: z.array(z.number().int().positive()).min(1, 'At least one role is required'),
});

/** guest → full member, with these roles */
export const makeMemberSchema = setMemberRolesSchema;

export type UpdateMemberDto = z.infer<typeof updateMemberSchema>;
export type SetMemberRolesDto = z.infer<typeof setMemberRolesSchema>;
