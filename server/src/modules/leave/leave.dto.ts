import { z } from 'zod';

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const color = z.string().trim().max(20);

// ---------------------------------------------------------------- requests

const requestFields = {
  leaveTypeId: z.number().int().positive(),
  startDate: dateString,
  endDate: dateString,
  /** am / pm = half day (single-day requests only) */
  portion: z.enum(['full', 'am', 'pm']).default('full'),
};

export const previewLeaveSchema = z.object(requestFields);
export const createLeaveSchema = z.object({ ...requestFields, reason: z.string().trim().max(2000).optional() });
export const decisionSchema = z.object({ note: z.string().trim().max(2000).optional() });
export const rejectSchema = z.object({ note: z.string().trim().min(3, 'Tell the person why').max(2000) });

export const listLeaveQuerySchema = z.object({
  /** mine = my requests; team = everyone's (needs leave.approve) */
  scope: z.enum(['mine', 'team']).default('mine'),
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled', 'all']).default('all'),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  userId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const calendarQuerySchema = z
  .object({ from: dateString, to: dateString })
  .refine((d) => d.to >= d.from, { message: '"to" must be after "from"' })
  .refine((d) => (new Date(d.to).getTime() - new Date(d.from).getTime()) / 86_400_000 <= 62, { message: 'At most two months at a time' });

export const balancesQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  userId: z.coerce.number().int().positive().optional(),
});

// ---------------------------------------------------------------- settings (leave.manage)

export const leaveTypeSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: color.default('#1677ff'),
  isPaid: z.boolean().default(true),
  /** yearly allowance; null = unlimited */
  defaultDays: z.number().min(0).max(365).multipleOf(0.5).nullable().default(null),
  allowHalfDay: z.boolean().default(true),
  requiresApproval: z.boolean().default(true),
});
export const updateLeaveTypeSchema = z
  .object({
    name: z.string().trim().min(1).max(50).optional(),
    color: color.optional(),
    isPaid: z.boolean().optional(),
    defaultDays: z.number().min(0).max(365).multipleOf(0.5).nullable().optional(),
    allowHalfDay: z.boolean().optional(),
    requiresApproval: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

const weekendDays = z.array(z.number().int().min(0).max(6)).max(6);

export const calendarSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).nullable().optional(),
  weekendDays: weekendDays.default([0, 6]),
  isDefault: z.boolean().optional(),
});
export const updateCalendarSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    weekendDays: weekendDays.optional(),
    isDefault: z.literal(true).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

export const holidaySchema = z.object({
  date: dateString,
  name: z.string().trim().min(1).max(100),
  isOptional: z.boolean().default(false),
});
/** Paste a list: one holiday per line, "2026-01-26, Republic Day" (", optional" at the end = optional holiday). */
export const bulkHolidaysSchema = z.object({ text: z.string().max(20000) });

export const memberCalendarSchema = z.object({ calendarId: z.number().int().positive().nullable() });

export const setBalanceSchema = z.object({
  userId: z.number().int().positive(),
  leaveTypeId: z.number().int().positive(),
  year: z.number().int().min(2000).max(2100),
  entitled: z.number().min(0).max(365).multipleOf(0.5),
  carriedOver: z.number().min(0).max(365).multipleOf(0.5).default(0),
  note: z.string().trim().max(255).nullable().optional(),
});

export type CreateLeaveDto = z.infer<typeof createLeaveSchema>;
export type PreviewLeaveDto = z.infer<typeof previewLeaveSchema>;
export type ListLeaveQuery = z.infer<typeof listLeaveQuerySchema>;
export type LeaveTypeDto = z.infer<typeof leaveTypeSchema>;
export type UpdateLeaveTypeDto = z.infer<typeof updateLeaveTypeSchema>;
export type CalendarDto = z.infer<typeof calendarSchema>;
export type UpdateCalendarDto = z.infer<typeof updateCalendarSchema>;
export type SetBalanceDto = z.infer<typeof setBalanceSchema>;
