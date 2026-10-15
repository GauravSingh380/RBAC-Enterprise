import { z } from 'zod';
import { PRIORITIES, SEVERITIES } from '../work-items/work-items.dto.js';

export const CASE_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export const CASE_TYPES = ['functional', 'regression', 'smoke', 'integration', 'performance', 'security', 'usability', 'other'] as const;
export const CASE_STATUSES = ['draft', 'ready', 'deprecated'] as const;
export const RESULT_STATUSES = ['untested', 'passed', 'failed', 'blocked', 'skipped'] as const;
export const STEP_RESULTS = ['passed', 'failed', 'blocked'] as const;

const stepSchema = z.object({
  action: z.string().trim().min(1, 'Describe the step').max(2000),
  expected: z.string().trim().max(2000).default(''),
});

export const suiteSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).nullable().optional(),
});
export const updateSuiteSchema = suiteSchema.partial().refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

const caseFields = {
  title: z.string().trim().min(1, 'Title is required').max(500),
  suiteId: z.number().int().positive().nullable().optional(),
  preconditions: z.string().max(5000).nullable().optional(),
  steps: z.array(stepSchema).max(100).default([]),
  priority: z.enum(CASE_PRIORITIES).default('medium'),
  caseType: z.enum(CASE_TYPES).default('functional'),
  status: z.enum(CASE_STATUSES).default('ready'),
  /** story / requirement it covers (id or key of an item in the same project) */
  workItemRef: z.union([z.number().int().positive(), z.string().trim().regex(/^[A-Za-z][A-Za-z0-9]{1,9}-\d+$/)]).nullable().optional(),
};

export const createCaseSchema = z.object(caseFields);
export const updateCaseSchema = z
  .object({
    title: caseFields.title.optional(),
    suiteId: caseFields.suiteId,
    preconditions: caseFields.preconditions,
    steps: z.array(stepSchema).max(100).optional(),
    priority: z.enum(CASE_PRIORITIES).optional(),
    caseType: z.enum(CASE_TYPES).optional(),
    status: z.enum(CASE_STATUSES).optional(),
    workItemRef: caseFields.workItemRef,
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

export const listCasesQuerySchema = z.object({
  suiteId: z.union([z.literal('none'), z.coerce.number().int().positive()]).optional(),
  status: z.enum(CASE_STATUSES).optional(),
  priority: z.enum(CASE_PRIORITIES).optional(),
  caseType: z.enum(CASE_TYPES).optional(),
  workItemId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export const createRunSchema = z
  .object({
    name: z.string().trim().min(1).max(150),
    description: z.string().trim().max(5000).nullable().optional(),
    sprintId: z.number().int().positive().nullable().optional(),
    environment: z.string().trim().max(255).nullable().optional(),
    buildVersion: z.string().trim().max(50).nullable().optional(),
    /** which READY cases to include: all, some suites, or picked cases */
    scope: z.object({
      all: z.boolean().optional(),
      suiteIds: z.array(z.number().int().positive()).max(100).optional(),
      caseIds: z.array(z.number().int().positive()).max(1000).optional(),
    }),
  })
  .refine((d) => d.scope.all || d.scope.suiteIds?.length || d.scope.caseIds?.length, {
    message: 'Choose the test cases to run',
    path: ['scope'],
  });

export const updateRunSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    description: z.string().trim().max(5000).nullable().optional(),
    environment: z.string().trim().max(255).nullable().optional(),
    buildVersion: z.string().trim().max(50).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

export const updateResultSchema = z
  .object({
    status: z.enum(RESULT_STATUSES).optional(),
    stepResults: z.array(z.enum(STEP_RESULTS).nullable()).max(100).optional(),
    comment: z.string().max(10000).nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

export const bugFromResultSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  priority: z.enum(PRIORITIES).optional(),
  severity: z.enum(SEVERITIES).optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
});

export type CreateCaseDto = z.infer<typeof createCaseSchema>;
export type UpdateCaseDto = z.infer<typeof updateCaseSchema>;
export type ListCasesQuery = z.infer<typeof listCasesQuerySchema>;
export type CreateRunDto = z.infer<typeof createRunSchema>;
export type UpdateRunDto = z.infer<typeof updateRunSchema>;
export type UpdateResultDto = z.infer<typeof updateResultSchema>;
export type BugFromResultDto = z.infer<typeof bugFromResultSchema>;
