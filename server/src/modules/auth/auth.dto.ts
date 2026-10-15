import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email('A valid email is required').max(255);

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const nameSchema = z.string().trim().min(2, 'Name must be at least 2 characters').max(100);

/**
 * Self-serve signup: either create a new organization (organizationName)
 * or join one through an invitation link (invitationToken).
 */
export const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    organizationName: z.string().trim().min(2, 'Organization name must be at least 2 characters').max(100).optional(),
    invitationToken: z.string().regex(/^[A-Za-z0-9_-]{20,128}$/).optional(),
  })
  .refine((d) => d.organizationName || d.invitationToken, {
    message: 'Organization name is required',
    path: ['organizationName'],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(200),
});

export const switchOrganizationSchema = z.object({
  organizationId: z.number().int().positive(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

const resetTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{20,128}$/, 'Invalid reset link');

export const resetPasswordSchema = z.object({
  token: resetTokenSchema,
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(200),
  newPassword: passwordSchema,
});

export const updateProfileSchema = z.object({
  name: nameSchema,
});

export { resetTokenSchema };

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
