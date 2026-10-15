// What can notify you, grouped in categories that people switch on / off.

export const CATEGORIES = ['assignments', 'mentions', 'watching', 'qa', 'leave', 'errors', 'reports'] as const;
export type Category = (typeof CATEGORIES)[number];
export type EmailMode = 'off' | 'instant' | 'daily';

export const CATEGORY_META: Record<Category, { label: string; description: string; defaults: { inApp: boolean; email: EmailMode } }> = {
  assignments: { label: 'Assignments', description: 'Work is assigned to you', defaults: { inApp: true, email: 'instant' } },
  mentions: { label: 'Mentions', description: 'Someone @mentions you in a comment', defaults: { inApp: true, email: 'instant' } },
  watching: { label: 'Watched items', description: 'Comments and status changes on items you watch', defaults: { inApp: true, email: 'daily' } },
  qa: { label: 'QA verdicts', description: 'Your fix passed or failed QA', defaults: { inApp: true, email: 'instant' } },
  leave: { label: 'Leave', description: 'Leave requests to approve, decisions on your leave', defaults: { inApp: true, email: 'instant' } },
  errors: { label: 'Production errors', description: 'New errors and regressions (needs errors.manage)', defaults: { inApp: true, email: 'daily' } },
  // email only: "instant" = send the report every Monday, "off" = don't
  reports: { label: 'Weekly organization report', description: 'Every Monday: projects needing attention, workload, quality, who is away', defaults: { inApp: false, email: 'instant' } },
};

export const TYPE_CATEGORY = {
  assigned: 'assignments',
  mentioned: 'mentions',
  commented: 'watching',
  status_changed: 'watching',
  qa_passed: 'qa',
  qa_failed: 'qa',
  leave_requested: 'leave',
  leave_approved: 'leave',
  leave_rejected: 'leave',
  leave_cancelled: 'leave',
  error_new: 'errors',
  error_regressed: 'errors',
} as const satisfies Record<string, Category>;

export type NotificationType = keyof typeof TYPE_CATEGORY;
