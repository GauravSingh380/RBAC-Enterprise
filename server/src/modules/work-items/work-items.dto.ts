import { z } from 'zod';

export const ITEM_TYPES = ['epic', 'story', 'task', 'bug', 'subtask'] as const;
export const PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'] as const;
export const SEVERITIES = ['critical', 'major', 'minor', 'trivial'] as const;
/** Why a bug was closed (set automatically to "fixed" when a bug reaches a done status). */
export const RESOLUTIONS = ['fixed', 'duplicate', 'wont_fix', 'cannot_reproduce', 'by_design'] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

/** Which types an item of each type may have as parent (epic > story/task/bug > subtask). */
export const ALLOWED_PARENTS: Record<ItemType, ItemType[]> = {
  epic: [],
  story: ['epic'],
  task: ['epic'],
  bug: ['epic'],
  subtask: ['story', 'task', 'bug'],
};

const longText = z.string().max(20000);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const customFieldsSchema = z.record(z.string().regex(/^\d+$/), z.unknown());

const itemFields = {
  title: z.string().trim().min(1, 'Title is required').max(500),
  description: longText.nullable().optional(),
  statusId: z.number().int().positive().optional(),
  priority: z.enum(PRIORITIES).optional(),
  severity: z.enum(SEVERITIES).nullable().optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
  parentId: z.number().int().positive().nullable().optional(),
  /** null = backlog */
  sprintId: z.number().int().positive().nullable().optional(),
  dueDate: dateString.nullable().optional(),
  estimate: z.number().min(0).max(99999).nullable().optional(),
  labelIds: z.array(z.number().int().positive()).max(50).optional(),
  customFields: customFieldsSchema.optional(),
  environment: optionalText(255),
  stepsToReproduce: longText.nullable().optional(),
  expectedResult: longText.nullable().optional(),
  actualResult: longText.nullable().optional(),
  browser: optionalText(100),
  os: optionalText(100),
  foundInVersion: optionalText(50),
  fixedInVersion: optionalText(50),
  resolution: z.enum(RESOLUTIONS).nullable().optional(),
};

export const createWorkItemSchema = z.object({
  type: z.enum(ITEM_TYPES),
  ...itemFields,
  /** checklist lines to start with (e.g. from a template) */
  checklist: z.array(z.string().trim().min(1).max(500)).max(100).optional(),
});

export const updateWorkItemSchema = z
  .object({
    type: z.enum(ITEM_TYPES).optional(),
    ...itemFields,
    title: itemFields.title.optional(),
    /** position inside the status column (boards) */
    rank: z.number().finite().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

/** Query string list: "?types=bug,task" → ['bug', 'task'], each item validated by `item`. */
function csv<T extends z.ZodType>(item: T) {
  return z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined))
    .pipe(z.array(item).optional() as unknown as z.ZodType<z.output<T>[] | undefined, string[] | undefined>);
}

export const listWorkItemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  search: z.string().trim().max(200).optional(),
  statusIds: csv(z.coerce.number().int().positive()),
  categories: csv(z.enum(['todo', 'in_progress', 'done'])),
  types: csv(z.enum(ITEM_TYPES)),
  priorities: csv(z.enum(PRIORITIES)),
  labelIds: csv(z.coerce.number().int().positive()),
  /** user ids, or "me" / "none" */
  assignees: csv(z.union([z.literal('me'), z.literal('none'), z.coerce.number().int().positive()])),
  /** item id, or "none" for top-level items only */
  parent: z.union([z.literal('none'), z.coerce.number().int().positive()]).optional(),
  /** sprint id, "active", "backlog" (no sprint) or "planning" (open sprints + unfinished backlog) */
  sprint: z.union([z.enum(['active', 'backlog', 'planning']), z.coerce.number().int().positive()]).optional(),
  sort: z.enum(['rank', 'number', 'created', 'updated', 'priority', 'due']).default('number'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

/** Drag & drop on boards / backlog: new column and/or sprint + the neighbours it was dropped between. */
export const moveWorkItemSchema = z
  .object({
    statusId: z.number().int().positive().optional(),
    sprintId: z.number().int().positive().nullable().optional(),
    /** item directly ABOVE the new position */
    prevId: z.number().int().positive().nullable().optional(),
    /** item directly BELOW the new position */
    nextId: z.number().int().positive().nullable().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined && v !== null) || d.sprintId === null, { message: 'Nothing to move' });

/** Same change applied to many items (list view selection). */
export const bulkUpdateSchema = z.object({
  itemIds: z.array(z.number().int().positive()).min(1).max(200),
  changes: z
    .object({
      statusId: z.number().int().positive().optional(),
      priority: z.enum(PRIORITIES).optional(),
      assigneeId: z.number().int().positive().nullable().optional(),
      sprintId: z.number().int().positive().nullable().optional(),
      addLabelIds: z.array(z.number().int().positive()).max(20).optional(),
      removeLabelIds: z.array(z.number().int().positive()).max(20).optional(),
    })
    .refine((d) => Object.keys(d).length > 0, { message: 'Choose at least one change' }),
});

/** "Possible duplicates" while typing a title. */
export const similarItemsQuerySchema = z.object({
  title: z.string().trim().min(3).max(500),
  excludeId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

/** QA verdict on an item waiting for QA. */
export const qaVerdictSchema = z
  .object({
    verdict: z.enum(['pass', 'fail']),
    comment: z.string().trim().max(20000).optional(),
    fixedInVersion: z.string().trim().max(50).optional(),
  })
  .refine((d) => d.verdict === 'pass' || (d.comment?.length ?? 0) >= 3, {
    message: 'Explain what still fails (at least a few words)',
    path: ['comment'],
  });

/** Close an item as a duplicate of another one (id or key). */
export const closeDuplicateSchema = z.object({
  duplicateOf: z.union([z.number().int().positive(), z.string().trim().regex(/^[A-Za-z][A-Za-z0-9]{1,9}-\d+$/, 'Use a key like TF-12')]),
});

/** Organization-wide quick search (link picker, Cmd+K later). */
export const searchWorkItemsQuerySchema = z.object({
  search: z.string().trim().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  excludeId: z.coerce.number().int().positive().optional(),
});

export const LINK_TYPES = ['blocks', 'blocked_by', 'duplicates', 'duplicated_by', 'relates_to'] as const;

export const createLinkSchema = z.object({
  /** id or key of the other item, e.g. "TF-12" */
  target: z.union([z.number().int().positive(), z.string().trim().regex(/^[A-Za-z][A-Za-z0-9]{1,9}-\d+$/, 'Use a key like TF-12')]),
  linkType: z.enum(LINK_TYPES),
});

export const REACTIONS = ['👍', '👎', '❤️', '🎉', '😄', '😕', '👀', '🚀'] as const;

export const commentSchema = z.object({
  body: z.string().trim().min(1, 'Comment cannot be empty').max(20000),
});

export const reactionSchema = z.object({
  emoji: z.enum(REACTIONS),
});

export type CreateWorkItemDto = z.infer<typeof createWorkItemSchema>;
export type UpdateWorkItemDto = z.infer<typeof updateWorkItemSchema>;
export type ListWorkItemsQuery = z.infer<typeof listWorkItemsQuerySchema>;
export type MoveWorkItemDto = z.infer<typeof moveWorkItemSchema>;
export type BulkUpdateDto = z.infer<typeof bulkUpdateSchema>;
export type QaVerdictDto = z.infer<typeof qaVerdictSchema>;
