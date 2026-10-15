// Work items: one model for epics, stories, tasks, bugs and sub-tasks.
//
// Rules enforced here:
//   * access comes from the project (project-access.ts): viewers read, members/admins edit
//   * numbering is sequential per project (TF-1, TF-2 ...) using a row lock on the project
//   * hierarchy: epic > story / task / bug > subtask (sub-tasks need a parent)
//   * workflow: a status can be restricted to some organization roles (e.g. only QA → "Verified")
//   * every change is recorded in work_item_events (History)
import { db, withTransaction, type Queryable } from '../../database/db.js';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '../../common/exceptions/http.exception.js';
import { audit } from '../../common/utils/audit.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';
import {
  assertCanEdit,
  getProjectAccess,
  isOrgProjectAdmin,
  MEMBER_CAN_ACCESS_SQL,
  peopleVisibility,
  type ProjectAccess,
} from '../projects/project-access.js';
import type { TenantContext } from '../../common/types/auth.types.js';
import { loadFields, loadStatuses, removeFiles, type ProjectField, type ProjectStatus } from '../projects/projects.service.js';
import { publishItems } from '../realtime/realtime.hub.js';
import { listEvents, recordEvents, type NewEvent, type WorkItemEvent } from './work-item-events.js';
import { loadSprint, moveItemsToSprint, sprintEventValue } from './work-item-sprints.js';
import { CommentsService } from './comments.service.js';
import { itemLabel, notify } from '../notifications/notify.js';
import {
  ALLOWED_PARENTS,
  type CreateWorkItemDto,
  type ItemType,
  type BulkUpdateDto,
  type ListWorkItemsQuery,
  type MoveWorkItemDto,
  type QaVerdictDto,
  type UpdateWorkItemDto,
} from './work-items.dto.js';
import { insertChecklist, loadChecklist, type ChecklistItem } from './checklist.js';
import { trashItemTree } from '../trash/trash.service.js';

// ---------------------------------------------------------------- types

export interface UserRef {
  id: number;
  name: string;
}

export interface WorkItemSummary {
  id: number;
  key: string;
  number: number;
  projectId: number;
  type: ItemType;
  title: string;
  priority: string;
  severity: string | null;
  resolution: string | null;
  status: { id: number; name: string; category: string; color: string };
  assignee: UserRef | null;
  labels: { id: number; name: string; color: string }[];
  dueDate: string | null;
  estimate: number | null;
  parentId: number | null;
  sprint: { id: number; name: string; status: 'planned' | 'active' | 'completed' } | null;
  rank: number;
  childCount: number;
  commentCount: number;
  /** checklist progress — total 0 = no checklist */
  checklist: { done: number; total: number };
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface LinkedItem {
  linkId: number;
  linkType: 'blocks' | 'duplicates' | 'relates_to';
  /** how to read it from THIS item's point of view, e.g. "is blocked by" */
  label: string;
  direction: 'outward' | 'inward';
  item: Pick<WorkItemSummary, 'id' | 'key' | 'title' | 'type' | 'status' | 'priority'>;
}

export interface WorkItemDetail extends WorkItemSummary {
  description: string | null;
  environment: string | null;
  stepsToReproduce: string | null;
  expectedResult: string | null;
  actualResult: string | null;
  browser: string | null;
  os: string | null;
  foundInVersion: string | null;
  fixedInVersion: string | null;
  reopenCount: number;
  customFields: Record<string, unknown>;
  reporter: UserRef | null;
  project: { id: number; key: string; name: string };
  parent: Pick<WorkItemSummary, 'id' | 'key' | 'title' | 'type' | 'status'> | null;
  children: WorkItemSummary[];
  links: LinkedItem[];
  watchers: UserRef[];
  isWatching: boolean;
  attachmentCount: number;
  /** production errors turned into / linked to this item */
  productionErrors: { id: number; title: string; source: string; status: string; occurrences: number; lastSeenAt: Date }[];
  /** test cases that cover this item (stories) with their latest result */
  testCases: { id: number; number: number; title: string; status: string; lastResult: string | null }[];
  /** the failed test this bug was filed from */
  foundByTest: { runId: number; runName: string; resultId: number; caseNumber: number; caseTitle: string } | null;
  permissions: { canEdit: boolean; canDelete: boolean; canComment: boolean };
  checklistItems: ChecklistItem[];
}

// ---------------------------------------------------------------- SQL helpers

export const ITEM_SELECT = `
  SELECT w.id, p.key || '-' || w.number AS key, w.number, w.project_id AS "projectId", w.type, w.title,
         w.priority, w.severity, w.resolution, to_char(w.due_date, 'YYYY-MM-DD') AS "dueDate", w.estimate::float AS estimate,
         w.parent_id AS "parentId", w.rank, w.created_at AS "createdAt", w.updated_at AS "updatedAt",
         w.completed_at AS "completedAt",
         json_build_object('id', s.id, 'name', s.name, 'category', s.category, 'color', s.color) AS status,
         CASE WHEN a.id IS NULL THEN NULL ELSE json_build_object('id', a.id, 'name', a.name) END AS assignee,
         CASE WHEN sp.id IS NULL THEN NULL ELSE json_build_object('id', sp.id, 'name', sp.name, 'status', sp.status) END AS sprint,
         COALESCE((SELECT json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color) ORDER BY lower(l.name))
                     FROM work_item_labels wl JOIN project_labels l ON l.id = wl.label_id
                    WHERE wl.work_item_id = w.id), '[]') AS labels,
         (SELECT COUNT(*)::int FROM work_items c WHERE c.parent_id = w.id AND c.deleted_at IS NULL) AS "childCount",
         (SELECT COUNT(*)::int FROM work_item_comments cm WHERE cm.work_item_id = w.id) AS "commentCount",
         (SELECT json_build_object('done', COUNT(*) FILTER (WHERE ci.done), 'total', COUNT(*))
            FROM work_item_checklist_items ci WHERE ci.work_item_id = w.id) AS checklist
    FROM work_items w
    -- "AND w.deleted_at IS NULL": items in the trash never appear in lists, boards, search, reports …
    JOIN projects p          ON p.id = w.project_id AND w.deleted_at IS NULL
    JOIN project_statuses s  ON s.id = w.status_id
    LEFT JOIN users a        ON a.id = w.assignee_id
    LEFT JOIN sprints sp     ON sp.id = w.sprint_id`;

/** SQL condition: the user may see project `p` (used by cross-project queries). */
// guests never see organization-visible projects they are not a member of
export const ACCESSIBLE_PROJECT_SQL = (userParam: string, adminParam: string) =>
  `(p.deleted_at IS NULL AND ((p.visibility = 'organization' AND NOT EXISTS (SELECT 1 FROM organization_members gm
        WHERE gm.organization_id = p.organization_id AND gm.user_id = ${userParam} AND gm.is_guest))
     OR ${adminParam}::boolean
     OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = ${userParam})))`;

const PRIORITY_ORDER = `CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`;

const SORTS: Record<ListWorkItemsQuery['sort'], string> = {
  rank: 'w.rank', // manual order (board columns, backlog)
  number: 'w.number',
  created: 'w.created_at',
  updated: 'w.updated_at',
  priority: PRIORITY_ORDER,
  due: 'w.due_date',
};

const KEY_PATTERN = /^([A-Za-z][A-Za-z0-9]{1,9})-(\d+)$/;

/** Ranks are doubles with gaps of 1024; a drop between two items takes the midpoint. */
const RANK_STEP = 1024;
const MIN_RANK_GAP = 1e-6;

/** Fields that update / move / bulk edit can change (one code path = same rules and history everywhere). */
type ChangeSet = Partial<UpdateWorkItemDto>;

/**
 * Finds a work item by id or key ("TF-12") inside the active organization and checks project access.
 * Items in projects the user cannot see are reported as "not found".
 */
export async function resolveItem(ctx: RequestContext, ref: string | number, executor: Queryable = db) {
  const tenant = tenantOf(ctx);
  const key = typeof ref === 'string' ? KEY_PATTERN.exec(ref) : null;
  const { rows } = key
    ? await executor.query<{ id: number; projectId: number }>(
        `SELECT w.id, w.project_id AS "projectId" FROM work_items w JOIN projects p ON p.id = w.project_id
          WHERE w.organization_id = $1 AND p.key = upper($2) AND w.number = $3 AND w.deleted_at IS NULL`,
        [tenant.organizationId, key[1], Number(key[2])],
      )
    : /^\d+$/.test(String(ref))
      ? await executor.query<{ id: number; projectId: number }>(
          `SELECT id, project_id AS "projectId" FROM work_items WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
          [tenant.organizationId, Number(ref)],
        )
      : { rows: [] };
  const found = rows[0];
  if (!found) throw new NotFoundException('Work item not found');

  try {
    const access = await getProjectAccess(ctx, found.projectId, executor);
    return { itemId: found.id, access };
  } catch {
    throw new NotFoundException('Work item not found');
  }
}

async function assertAssignable(access: ProjectAccess, userId: number, executor: Queryable, tenant: TenantContext) {
  const { rowCount } = await executor.query(
    `SELECT 1 FROM organization_members m JOIN users u ON u.id = m.user_id
      WHERE m.organization_id = $1 AND m.user_id = $2 AND m.status = 'active' AND u.is_active = TRUE
        AND ${MEMBER_CAN_ACCESS_SQL('$3', '$4')}`,
    [access.project.organizationId, userId, peopleVisibility(tenant, access.project), access.project.id],
  );
  if (!rowCount) throw new BadRequestException('The assignee must be a member who can access this project');
}

function validateCustomFields(fields: ProjectField[], values: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(values)) {
    const field = fields.find((f) => String(f.id) === id);
    if (!field) throw new BadRequestException(`Unknown custom field ${id}`);
    if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) continue;

    const invalid = () => new BadRequestException(`Invalid value for "${field.name}"`);
    switch (field.fieldType) {
      case 'text':
        if (typeof value !== 'string' || value.length > 5000) throw invalid();
        break;
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid();
        break;
      case 'date':
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid();
        break;
      case 'checkbox':
        if (typeof value !== 'boolean') throw invalid();
        break;
      case 'select':
        if (typeof value !== 'string' || !field.options.includes(value)) throw invalid();
        break;
      case 'multi_select':
        if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !field.options.includes(v))) throw invalid();
        break;
    }
    clean[id] = value;
  }
  return clean;
}

function assertRequiredFields(fields: ProjectField[], values: Record<string, unknown>) {
  const missing = fields.filter((f) => f.required && f.fieldType !== 'checkbox' && values[String(f.id)] === undefined);
  if (missing.length) throw new BadRequestException(`Required field(s) missing: ${missing.map((f) => f.name).join(', ')}`);
}

function assertTransitionAllowed(status: ProjectStatus, access: ProjectAccess, ctx: RequestContext) {
  if (!status.restrictedRoles.length || access.role === 'admin') return;
  const myRoles = tenantOf(ctx).roles;
  if (!status.restrictedRoles.some((r) => myRoles.includes(r))) {
    throw new ForbiddenException(`Only ${status.restrictedRoles.join(' / ')} can move items to "${status.name}"`);
  }
}

async function loadParent(parentId: number, projectId: number, executor: Queryable) {
  const { rows } = await executor.query<{ id: number; type: ItemType; parentId: number | null; sprintId: number | null }>(
    'SELECT id, type, parent_id AS "parentId", sprint_id AS "sprintId" FROM work_items WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL',
    [parentId, projectId],
  );
  if (!rows[0]) throw new BadRequestException('The parent must be an item of the same project');
  return rows[0];
}

function assertHierarchy(type: ItemType, parentType: ItemType | null) {
  const allowed = ALLOWED_PARENTS[type];
  if (parentType === null) {
    if (type === 'subtask') throw new BadRequestException('A sub-task needs a parent story, task or bug');
    return;
  }
  if (!allowed.includes(parentType)) {
    throw new BadRequestException(
      allowed.length ? `A ${type} can only be under: ${allowed.join(', ')}` : `An ${type} cannot have a parent`,
    );
  }
}

// ---------------------------------------------------------------- service

export class WorkItemsService {
  async list(projectRef: string, query: ListWorkItemsQuery, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    const where: string[] = ['w.project_id = $1', 'w.deleted_at IS NULL'];
    const params: unknown[] = [access.project.id];
    const add = (sql: (p: string) => string, value: unknown) => {
      params.push(value);
      where.push(sql(`$${params.length}`));
    };

    if (query.statusIds?.length) add((p) => `w.status_id = ANY(${p}::int[])`, query.statusIds);
    if (query.categories?.length) add((p) => `s.category = ANY(${p}::text[])`, query.categories);
    if (query.types?.length) add((p) => `w.type = ANY(${p}::text[])`, query.types);
    if (query.priorities?.length) add((p) => `w.priority = ANY(${p}::text[])`, query.priorities);
    if (query.labelIds?.length) {
      add((p) => `EXISTS (SELECT 1 FROM work_item_labels wl WHERE wl.work_item_id = w.id AND wl.label_id = ANY(${p}::int[]))`, query.labelIds);
    }
    if (query.assignees?.length) {
      const ids = query.assignees.map((a) => (a === 'me' ? ctx.user!.id : a)).filter((a): a is number => typeof a === 'number');
      const none = query.assignees.includes('none');
      add((p) => `(w.assignee_id = ANY(${p}::int[])${none ? ' OR w.assignee_id IS NULL' : ''})`, ids);
    }
    if (query.sprint === 'backlog') where.push('w.sprint_id IS NULL');
    else if (query.sprint === 'active') where.push(`w.sprint_id = (SELECT id FROM sprints WHERE project_id = $1 AND status = 'active')`);
    else if (query.sprint === 'planning') {
      // backlog screen: everything in open sprints + unfinished items without a sprint
      where.push(`(w.sprint_id IN (SELECT id FROM sprints WHERE project_id = $1 AND status <> 'completed')
                   OR (w.sprint_id IS NULL AND s.category <> 'done'))`);
    } else if (query.sprint) add((p) => `w.sprint_id = ${p}`, query.sprint);
    if (query.parent === 'none') where.push('w.parent_id IS NULL');
    else if (query.parent) add((p) => `w.parent_id = ${p}`, query.parent);
    if (query.search) {
      const key = KEY_PATTERN.exec(query.search);
      const number = key ? Number(key[2]) : /^\d+$/.test(query.search) ? Number(query.search) : null;
      params.push(query.search, `%${query.search}%`, number);
      const n = params.length;
      where.push(`(w.search_vector @@ websearch_to_tsquery('simple', $${n - 2}) OR w.title ILIKE $${n - 1} OR w.number = $${n}::int)`);
    }

    const whereSql = where.join(' AND ');
    const order = `${SORTS[query.sort]} ${query.order.toUpperCase()} NULLS LAST, w.id ${query.order.toUpperCase()}`;
    const [items, total] = await Promise.all([
      db.query<WorkItemSummary>(`${ITEM_SELECT} WHERE ${whereSql} ORDER BY ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [
        ...params,
        query.limit,
        (query.page - 1) * query.limit,
      ]),
      db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM work_items w JOIN project_statuses s ON s.id = w.status_id WHERE ${whereSql}`,
        params,
      ),
    ]);
    return { items: items.rows, total: total.rows[0]!.count, page: query.page, limit: query.limit };
  }

  /** Organization-wide search across the projects the user can see (link picker, quick search). */
  async search(query: { search: string; limit: number; excludeId?: number }, ctx: RequestContext): Promise<WorkItemSummary[]> {
    const tenant = tenantOf(ctx);
    const key = KEY_PATTERN.exec(query.search);
    const { rows } = await db.query<WorkItemSummary>(
      `${ITEM_SELECT}
        WHERE w.organization_id = $1 AND p.status = 'active'
          AND ${ACCESSIBLE_PROJECT_SQL('$2', '$3')}
          AND ($4::int IS NULL OR w.id <> $4)
          AND ( ($5::text IS NOT NULL AND p.key = upper($5) AND w.number = $6::int)
             OR w.search_vector @@ websearch_to_tsquery('simple', $7) OR w.title ILIKE $8 )
        ORDER BY w.updated_at DESC
        LIMIT $9`,
      [
        tenant.organizationId,
        ctx.user!.id,
        isOrgProjectAdmin(tenant),
        query.excludeId ?? null,
        key?.[1] ?? null,
        key ? Number(key[2]) : null,
        query.search,
        `%${query.search}%`,
        query.limit,
      ],
    );
    return rows;
  }

  async findOne(ref: string, ctx: RequestContext): Promise<WorkItemDetail> {
    const { itemId, access } = await resolveItem(ctx, ref);
    return this.loadDetail(itemId, access, ctx);
  }

  async loadDetail(itemId: number, access: ProjectAccess, ctx: RequestContext, executor: Queryable = db): Promise<WorkItemDetail> {
    const tenant = tenantOf(ctx);
    const userId = ctx.user!.id;

    const { rows } = await executor.query<WorkItemSummary & Omit<WorkItemDetail, keyof WorkItemSummary | 'parent' | 'children' | 'links' | 'watchers' | 'isWatching' | 'permissions'> & { reporterId: number | null }>(
      `SELECT x.*, w.description, w.environment, w.steps_to_reproduce AS "stepsToReproduce",
              w.expected_result AS "expectedResult", w.actual_result AS "actualResult", w.custom_fields AS "customFields",
              w.browser, w.os, w.found_in_version AS "foundInVersion", w.fixed_in_version AS "fixedInVersion",
              w.reopen_count AS "reopenCount",
              w.reporter_id AS "reporterId",
              CASE WHEN r.id IS NULL THEN NULL ELSE json_build_object('id', r.id, 'name', r.name) END AS reporter,
              json_build_object('id', p.id, 'key', p.key, 'name', p.name) AS project,
              (SELECT COUNT(*)::int FROM work_item_attachments at WHERE at.work_item_id = w.id) AS "attachmentCount"
         FROM (${ITEM_SELECT} WHERE w.id = $1) x
         JOIN work_items w ON w.id = x.id
         JOIN projects p ON p.id = w.project_id
         LEFT JOIN users r ON r.id = w.reporter_id`,
      [itemId],
    );
    const item = rows[0];
    if (!item) throw new NotFoundException('Work item not found');

    const [parent, children, links, watchers, errors, cases, foundBy, checklistItems] = await Promise.all([
      item.parentId
        ? executor.query(`SELECT x.id, x.key, x.title, x.type, x.status FROM (${ITEM_SELECT} WHERE w.id = $1) x`, [item.parentId])
        : null,
      executor.query<WorkItemSummary>(`${ITEM_SELECT} WHERE w.parent_id = $1 ORDER BY w.number`, [itemId]),
      executor.query<LinkedItem>(
        `SELECT l.id AS "linkId", l.link_type AS "linkType",
                CASE WHEN l.source_id = $1 THEN 'outward' ELSE 'inward' END AS direction,
                CASE WHEN l.source_id = $1
                     THEN CASE l.link_type WHEN 'blocks' THEN 'blocks' WHEN 'duplicates' THEN 'duplicates' ELSE 'relates to' END
                     ELSE CASE l.link_type WHEN 'blocks' THEN 'is blocked by' WHEN 'duplicates' THEN 'is duplicated by' ELSE 'relates to' END
                END AS label,
                json_build_object('id', w.id, 'key', p.key || '-' || w.number, 'title', w.title, 'type', w.type, 'priority', w.priority,
                  'status', json_build_object('id', s.id, 'name', s.name, 'category', s.category, 'color', s.color)) AS item
           FROM work_item_links l
           JOIN work_items w ON w.id = CASE WHEN l.source_id = $1 THEN l.target_id ELSE l.source_id END AND w.deleted_at IS NULL
           JOIN projects p ON p.id = w.project_id
           JOIN project_statuses s ON s.id = w.status_id
          WHERE (l.source_id = $1 OR l.target_id = $1) AND ${ACCESSIBLE_PROJECT_SQL('$2', '$3')}
          ORDER BY l.link_type, l.id`,
        [itemId, userId, isOrgProjectAdmin(tenant)],
      ),
      executor.query<UserRef>(
        `SELECT u.id, u.name FROM work_item_watchers ww JOIN users u ON u.id = ww.user_id WHERE ww.work_item_id = $1 ORDER BY lower(u.name)`,
        [itemId],
      ),
      executor.query<WorkItemDetail['productionErrors'][number]>(
        `SELECT id, title, source, status, occurrences, last_seen_at AS "lastSeenAt"
           FROM error_groups WHERE work_item_id = $1 ORDER BY last_seen_at DESC LIMIT 20`,
        [itemId],
      ),
      executor.query<WorkItemDetail['testCases'][number]>(
        `SELECT c.id, c.number, c.title, c.status,
                (SELECT r.status FROM test_results r WHERE r.test_case_id = c.id AND r.status <> 'untested'
                  ORDER BY r.executed_at DESC NULLS LAST LIMIT 1) AS "lastResult"
           FROM test_cases c WHERE c.work_item_id = $1 ORDER BY c.number`,
        [itemId],
      ),
      executor.query<NonNullable<WorkItemDetail['foundByTest']>>(
        `SELECT r.run_id AS "runId", tr.name AS "runName", r.id AS "resultId", r.case_number AS "caseNumber", r.title AS "caseTitle"
           FROM test_results r JOIN test_runs tr ON tr.id = r.run_id
          WHERE r.bug_id = $1 ORDER BY r.executed_at DESC NULLS LAST LIMIT 1`,
        [itemId],
      ),
      loadChecklist(executor, itemId),
    ]);

    const { reporterId, ...rest } = item;
    const isAdmin = access.role === 'admin';
    return {
      ...rest,
      parent: (parent?.rows[0] as WorkItemDetail['parent']) ?? null,
      children: children.rows,
      links: links.rows,
      watchers: watchers.rows,
      productionErrors: errors.rows,
      testCases: cases.rows,
      foundByTest: foundBy.rows[0] ?? null,
      checklistItems,
      isWatching: watchers.rows.some((w) => w.id === userId),
      permissions: {
        canEdit: access.canEdit,
        canDelete: access.canEdit && (isAdmin || reporterId === userId),
        canComment: access.project.status === 'active',
      },
    };
  }

  async create(projectRef: string, dto: CreateWorkItemDto, ctx: RequestContext): Promise<WorkItemDetail> {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    const { project } = access;
    const userId = ctx.user!.id;

    const itemId = await withTransaction(async (client) => {
      const statuses = await loadStatuses(project.id, client);
      const status = dto.statusId ? statuses.find((s) => s.id === dto.statusId) : statuses[0];
      if (!status) throw new BadRequestException('Unknown status for this project');
      if (dto.statusId) assertTransitionAllowed(status, access, ctx);

      const parent = dto.parentId ? await loadParent(dto.parentId, project.id, client) : null;
      assertHierarchy(dto.type, parent?.type ?? null);
      if (dto.assigneeId) await assertAssignable(access, dto.assigneeId, client, tenantOf(ctx));

      // sub-tasks follow their parent's sprint unless one is given
      const sprintId = dto.sprintId !== undefined ? dto.sprintId : dto.type === 'subtask' ? (parent?.sprintId ?? null) : null;
      const sprint = sprintId ? await loadSprint(sprintId, project.id, client) : null;
      if (sprint?.status === 'completed') throw new BadRequestException(`"${sprint.name}" is completed — items cannot be added to it`);

      const fields = await loadFields(project.id, client);
      const customFields = validateCustomFields(fields, dto.customFields ?? {});
      assertRequiredFields(fields, customFields);

      // Next number in this project — the UPDATE locks the project row, so numbers never collide
      const counter = await client.query<{ n: number }>(
        'UPDATE projects SET item_counter = item_counter + 1 WHERE id = $1 RETURNING item_counter AS n',
        [project.id],
      );

      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO work_items (organization_id, project_id, number, type, title, description, status_id, priority, severity,
                                 assignee_id, reporter_id, parent_id, due_date, estimate, environment, steps_to_reproduce,
                                 expected_result, actual_result, custom_fields, sprint_id,
                                 browser, os, found_in_version, fixed_in_version, resolution, rank, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $21,
                 $22, $23, $24, $25, $26,
                 (SELECT COALESCE(MAX(rank), 0) + ${RANK_STEP} FROM work_items WHERE project_id = $2), -- new items go to the bottom
                 CASE WHEN $20 THEN NOW() END)
         RETURNING id`,
        [
          project.organizationId,
          project.id,
          counter.rows[0]!.n,
          dto.type,
          dto.title,
          dto.description ?? null,
          status.id,
          dto.priority ?? 'medium',
          dto.severity ?? null,
          dto.assigneeId ?? null,
          userId,
          dto.parentId ?? null,
          dto.dueDate ?? null,
          dto.estimate ?? null,
          dto.environment ?? null,
          dto.stepsToReproduce ?? null,
          dto.expectedResult ?? null,
          dto.actualResult ?? null,
          JSON.stringify(customFields),
          status.category === 'done',
          sprint?.id ?? null,
          dto.browser ?? null,
          dto.os ?? null,
          dto.foundInVersion ?? null,
          dto.fixedInVersion ?? null,
          dto.resolution ?? (status.category === 'done' && dto.type === 'bug' ? 'fixed' : null),
        ],
      );
      const id = rows[0]!.id;

      if (dto.labelIds?.length) await this.setLabels(id, project.id, dto.labelIds, client);
      if (dto.checklist?.length) await insertChecklist(client, id, project.organizationId, dto.checklist, userId);
      await this.addWatchers(id, project.organizationId, [userId, dto.assigneeId ?? null], client);
      await recordEvents(client, { id, organizationId: project.organizationId }, userId, [
        { type: 'created', newValue: { type: dto.type, title: dto.title, status: status.name, sprint: sprint?.name } },
      ]);
      if (dto.assigneeId) {
        const key = `${project.key}-${counter.rows[0]!.n}`;
        await notify(client, {
          organizationId: project.organizationId,
          userIds: [dto.assigneeId],
          actorId: userId,
          type: 'assigned',
          title: `${ctx.user!.name} assigned you ${key}`,
          body: dto.title,
          url: `/projects/${project.key}/items/${counter.rows[0]!.n}`,
          workItemId: id,
        });
      }
      return id;
    });

    await publishItems(ctx, project, 'created', [itemId]);
    return this.loadDetail(itemId, access, ctx);
  }

  async update(ref: string, dto: UpdateWorkItemDto, ctx: RequestContext): Promise<WorkItemDetail> {
    const { itemId, access } = await resolveItem(ctx, ref);
    assertCanEdit(access);
    const changed = await withTransaction((client) => this.applyChanges(client, itemId, access, dto, ctx));
    if (changed.length) await publishItems(ctx, access.project, 'updated', changed);
    return this.loadDetail(itemId, access, ctx);
  }

  /**
   * Board / backlog drag & drop: optional new status and/or sprint, and a new position between two
   * neighbours (prevId above, nextId below). Same validation and history as a normal edit.
   */
  async move(ref: string, dto: MoveWorkItemDto, ctx: RequestContext): Promise<WorkItemSummary> {
    const { itemId, access } = await resolveItem(ctx, ref);
    assertCanEdit(access);
    const changed = await withTransaction(async (client) => {
      const rank = await this.rankBetween(client, access.project.id, itemId, dto.prevId ?? null, dto.nextId ?? null);
      const changes: ChangeSet = {};
      if (dto.statusId !== undefined) changes.statusId = dto.statusId;
      if (dto.sprintId !== undefined) changes.sprintId = dto.sprintId;
      if (rank !== null) changes.rank = rank;
      return this.applyChanges(client, itemId, access, changes, ctx);
    });
    if (changed.length) await publishItems(ctx, access.project, 'moved', changed);
    const { rows } = await db.query<WorkItemSummary>(`${ITEM_SELECT} WHERE w.id = $1`, [itemId]);
    return rows[0]!;
  }

  /** Same change on many items of one project, all-or-nothing (one transaction). */
  async bulkUpdate(projectRef: string, dto: BulkUpdateDto, ctx: RequestContext): Promise<{ updated: number }> {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    const ids = [...new Set(dto.itemIds)];
    const { addLabelIds, removeLabelIds, ...fields } = dto.changes;

    const changed = await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: number; labelIds: number[] }>(
        `SELECT w.id, COALESCE((SELECT array_agg(label_id) FROM work_item_labels WHERE work_item_id = w.id), '{}') AS "labelIds"
           FROM work_items w WHERE w.project_id = $1 AND w.id = ANY($2::int[]) AND w.deleted_at IS NULL ORDER BY w.id FOR UPDATE`,
        [access.project.id, ids],
      );
      if (rows.length !== ids.length) throw new BadRequestException('Some items do not exist in this project');

      const all = new Set<number>();
      for (const row of rows) {
        const changes: ChangeSet = { ...fields };
        if (addLabelIds?.length || removeLabelIds?.length) {
          changes.labelIds = [...new Set([...row.labelIds, ...(addLabelIds ?? [])])].filter((l) => !removeLabelIds?.includes(l));
        }
        for (const id of await this.applyChanges(client, row.id, access, changes, ctx)) all.add(id);
      }
      return [...all];
    });

    if (changed.length) await publishItems(ctx, access.project, 'updated', changed);
    return { updated: changed.filter((id) => ids.includes(id)).length };
  }

  /**
   * Applies a change set to one item inside the caller's transaction: validates, updates, and records
   * one history event per changed field. Returns the ids that changed (the item + cascaded sub-tasks).
   */
  private async applyChanges(
    client: Queryable,
    itemId: number,
    access: ProjectAccess,
    dto: ChangeSet,
    ctx: RequestContext,
    opts: { notifyWatchers?: boolean } = {},
  ): Promise<number[]> {
    const { project } = access;
    const userId = ctx.user!.id;
    const { rows } = await client.query<{
      type: ItemType;
      title: string;
      description: string | null;
      statusId: number;
      priority: string;
      severity: string | null;
      assigneeId: number | null;
      parentId: number | null;
      sprintId: number | null;
      dueDate: string | null;
      estimate: number | null;
      environment: string | null;
      stepsToReproduce: string | null;
      expectedResult: string | null;
      actualResult: string | null;
      browser: string | null;
      os: string | null;
      foundInVersion: string | null;
      fixedInVersion: string | null;
      resolution: string | null;
      customFields: Record<string, unknown>;
      labelIds: number[];
    }>(
      `SELECT type, title, description, status_id AS "statusId", priority, severity, assignee_id AS "assigneeId",
              parent_id AS "parentId", sprint_id AS "sprintId", to_char(due_date, 'YYYY-MM-DD') AS "dueDate", estimate::float AS estimate,
              environment, steps_to_reproduce AS "stepsToReproduce", expected_result AS "expectedResult",
              actual_result AS "actualResult", custom_fields AS "customFields",
              browser, os, found_in_version AS "foundInVersion", fixed_in_version AS "fixedInVersion", resolution,
              COALESCE((SELECT array_agg(label_id ORDER BY label_id) FROM work_item_labels WHERE work_item_id = w.id), '{}') AS "labelIds"
         FROM work_items w WHERE id = $1 FOR UPDATE`,
      [itemId],
    );
    const current = rows[0]!;
    const sets: string[] = [];
    const values: unknown[] = [];
    const events: NewEvent[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    // ---- type & parent (hierarchy)
    const nextType = dto.type ?? current.type;
    const nextParentId = dto.parentId !== undefined ? dto.parentId : current.parentId;
    if (dto.type !== undefined || dto.parentId !== undefined) {
      if (nextParentId === itemId) throw new BadRequestException('An item cannot be its own parent');
      const parent = nextParentId ? await loadParent(nextParentId, project.id, client) : null;
      if (parent && parent.parentId === itemId) throw new BadRequestException('That would create a loop');
      assertHierarchy(nextType, parent?.type ?? null);

      if (dto.type !== undefined && dto.type !== current.type) {
        const kids = await client.query<{ type: ItemType }>('SELECT DISTINCT type FROM work_items WHERE parent_id = $1 AND deleted_at IS NULL', [itemId]);
        const bad = kids.rows.find((k) => !ALLOWED_PARENTS[k.type].includes(nextType));
        if (bad) throw new BadRequestException(`Cannot change to ${nextType}: it has ${bad.type} children`);
        set('type', dto.type);
        events.push({ type: 'updated', field: 'type', oldValue: current.type, newValue: dto.type });
      }
      if (dto.parentId !== undefined && dto.parentId !== current.parentId) {
        set('parent_id', dto.parentId);
        const keys = await client.query<{ id: number; key: string }>(
          `SELECT w.id, p.key || '-' || w.number AS key FROM work_items w JOIN projects p ON p.id = w.project_id WHERE w.id = ANY($1::int[])`,
          [[current.parentId, dto.parentId].filter(Boolean)],
        );
        const keyOf = (id: number | null) => (id ? (keys.rows.find((k) => k.id === id) ?? null) : null);
        events.push({ type: 'updated', field: 'parent', oldValue: keyOf(current.parentId), newValue: keyOf(dto.parentId) });
      }
    }

    // ---- status (workflow)
    if (dto.statusId !== undefined && dto.statusId !== current.statusId) {
      const statuses = await loadStatuses(project.id, client);
      const next = statuses.find((s) => s.id === dto.statusId);
      if (!next) throw new BadRequestException('Unknown status for this project');
      assertTransitionAllowed(next, access, ctx);
      const prev = statuses.find((s) => s.id === current.statusId)!;
      set('status_id', next.id);
      if (next.category === 'done' && prev.category !== 'done') sets.push('completed_at = NOW()');
      if (next.category !== 'done') sets.push('completed_at = NULL');
      // resolution follows the workflow: a bug reaching "done" is "fixed" unless told otherwise; reopening clears it
      if (dto.resolution === undefined) {
        if (next.category === 'done' && prev.category !== 'done' && current.type === 'bug' && !current.resolution) dto = { ...dto, resolution: 'fixed' };
        if (next.category !== 'done' && current.resolution) dto = { ...dto, resolution: null };
      }
      // production errors linked to this item count as resolved once it is done (and re-open if they happen again)
      if (next.category === 'done' && prev.category !== 'done') {
        await client.query(
          `UPDATE error_groups SET status = 'resolved', resolved_at = NOW(), resolved_by = $2 WHERE work_item_id = $1 AND status = 'unresolved'`,
          [itemId, userId],
        );
      }
      events.push({ type: 'updated', field: 'status', oldValue: { id: prev.id, name: prev.name }, newValue: { id: next.id, name: next.name } });
    }
    if (dto.rank !== undefined) set('rank', dto.rank); // re-ordering is not written to history

    // ---- sprint (sub-tasks follow their parent)
    const cascaded: number[] = [];
    if (dto.sprintId !== undefined && dto.sprintId !== current.sprintId) {
      const next = dto.sprintId ? await loadSprint(dto.sprintId, project.id, client) : null;
      if (next?.status === 'completed') throw new BadRequestException(`"${next.name}" is completed — items cannot be added to it`);
      const prev = current.sprintId ? await loadSprint(current.sprintId, project.id, client) : null;
      set('sprint_id', dto.sprintId);
      events.push({ type: 'updated', field: 'sprint', oldValue: sprintEventValue(prev), newValue: sprintEventValue(next) });
      const subtasks = await client.query<{ id: number }>(`SELECT id FROM work_items WHERE parent_id = $1 AND type = 'subtask' AND deleted_at IS NULL`, [itemId]);
      cascaded.push(...(await moveItemsToSprint(client, subtasks.rows.map((r) => r.id), next, project.organizationId, userId)));
    }

    // ---- assignee
    if (dto.assigneeId !== undefined && dto.assigneeId !== current.assigneeId) {
      if (dto.assigneeId) await assertAssignable(access, dto.assigneeId, client, tenantOf(ctx));
      set('assignee_id', dto.assigneeId);
      const names = await client.query<UserRef>('SELECT id, name FROM users WHERE id = ANY($1::int[])', [
        [current.assigneeId, dto.assigneeId].filter(Boolean),
      ]);
      const ref = (id: number | null) => (id ? (names.rows.find((u) => u.id === id) ?? { id, name: 'Unknown' }) : null);
      events.push({ type: 'updated', field: 'assignee', oldValue: ref(current.assigneeId), newValue: ref(dto.assigneeId) });
      if (dto.assigneeId) await this.addWatchers(itemId, project.organizationId, [dto.assigneeId], client);
    }

    // ---- simple fields
    const simple: [keyof UpdateWorkItemDto & keyof typeof current, string, boolean][] = [
      ['title', 'title', true],
      ['priority', 'priority', true],
      ['severity', 'severity', true],
      ['dueDate', 'due_date', true],
      ['estimate', 'estimate', true],
      ['description', 'description', false], // long text: record that it changed, not the content
      ['environment', 'environment', true],
      ['stepsToReproduce', 'steps_to_reproduce', false],
      ['expectedResult', 'expected_result', false],
      ['actualResult', 'actual_result', false],
      ['browser', 'browser', true],
      ['os', 'os', true],
      ['foundInVersion', 'found_in_version', true],
      ['fixedInVersion', 'fixed_in_version', true],
      ['resolution', 'resolution', true],
    ];
    for (const [field, column, keepValues] of simple) {
      const next = dto[field];
      if (next === undefined || next === current[field]) continue;
      set(column, next);
      events.push({
        type: 'updated',
        field,
        oldValue: keepValues ? current[field] : undefined,
        newValue: keepValues ? next : undefined,
      });
    }

    // ---- custom fields (merge; null clears a value)
    if (dto.customFields) {
      const fields = await loadFields(project.id, client);
      const cleanedUpdates = validateCustomFields(fields, Object.fromEntries(Object.entries(dto.customFields).filter(([, v]) => v !== null)));
      const merged = { ...current.customFields };
      for (const [id, value] of Object.entries(dto.customFields)) {
        if (value === null || value === '' || (Array.isArray(value) && !value.length)) delete merged[id];
        else merged[id] = cleanedUpdates[id];
      }
      assertRequiredFields(fields, merged);
      for (const f of fields) {
        const id = String(f.id);
        if (JSON.stringify(current.customFields[id]) !== JSON.stringify(merged[id])) {
          events.push({ type: 'updated', field: `custom:${id}`, oldValue: { name: f.name, value: current.customFields[id] ?? null }, newValue: { name: f.name, value: merged[id] ?? null } });
        }
      }
      set('custom_fields', JSON.stringify(merged));
    }

    // ---- labels
    if (dto.labelIds) {
      const next = [...new Set(dto.labelIds)].sort((a, b) => a - b);
      if (next.join() !== current.labelIds.join()) {
        await this.setLabels(itemId, project.id, next, client);
        const names = await client.query<{ id: number; name: string }>('SELECT id, name FROM project_labels WHERE id = ANY($1::int[])', [
          [...current.labelIds, ...next],
        ]);
        const toNames = (ids: number[]) => ids.map((id) => names.rows.find((l) => l.id === id)?.name ?? String(id));
        events.push({ type: 'updated', field: 'labels', oldValue: toNames(current.labelIds), newValue: toNames(next) });
      }
    }

    if (!sets.length && !events.length) return [];
    values.push(itemId);
    await client.query(`UPDATE work_items SET ${[...sets, 'updated_at = NOW()'].join(', ')} WHERE id = $${values.length}`, values);
    await recordEvents(client, { id: itemId, organizationId: project.organizationId }, userId, events);
    await this.notifyChanges(client, itemId, project.organizationId, events, dto, ctx, opts.notifyWatchers !== false);
    return [itemId, ...cascaded];
  }

  /** New assignee → "assigned"; status change → watchers ("status_changed"). */
  private async notifyChanges(
    client: Queryable,
    itemId: number,
    organizationId: number,
    events: NewEvent[],
    dto: ChangeSet,
    ctx: RequestContext,
    notifyWatchers: boolean,
  ) {
    const assigned = events.some((e) => e.field === 'assignee') && dto.assigneeId;
    const status = events.find((e) => e.field === 'status')?.newValue as { name: string } | undefined;
    if (!assigned && !(status && notifyWatchers)) return;
    const item = await itemLabel(client, itemId);
    const base = { organizationId, actorId: ctx.user!.id, url: item.url, workItemId: itemId };
    if (assigned) await notify(client, { ...base, userIds: [dto.assigneeId], type: 'assigned', title: `${ctx.user!.name} assigned you ${item.key}`, body: item.title });
    if (status && notifyWatchers) {
      const watchers = await client.query<{ userId: number }>('SELECT user_id AS "userId" FROM work_item_watchers WHERE work_item_id = $1', [itemId]);
      await notify(client, {
        ...base,
        userIds: watchers.rows.map((w) => w.userId).filter((id) => !assigned || id !== dto.assigneeId),
        type: 'status_changed',
        title: `${ctx.user!.name} moved ${item.key} to ${status.name}`,
        body: item.title,
      });
    }
  }

  /** New rank between two neighbours; re-spaces the whole project when the gap gets too small. */
  private async rankBetween(client: Queryable, projectId: number, itemId: number, prevId: number | null, nextId: number | null) {
    const ids = [prevId, nextId].filter((id): id is number => !!id);
    if (!ids.length) return null;
    if (ids.includes(itemId)) throw new BadRequestException('An item cannot be its own neighbour');

    const read = async () => {
      const { rows } = await client.query<{ id: number; rank: number }>(
        'SELECT id, rank FROM work_items WHERE project_id = $1 AND id = ANY($2::int[])',
        [projectId, ids],
      );
      if (rows.length !== ids.length) throw new BadRequestException('Neighbour items must belong to the same project');
      return { prev: rows.find((r) => r.id === prevId)?.rank, next: rows.find((r) => r.id === nextId)?.rank };
    };

    let { prev, next } = await read();
    if (prev !== undefined && next !== undefined && Math.abs(next - prev) < MIN_RANK_GAP) {
      // after many drops in the same spot the midpoints run out of precision → renumber 1024, 2048, ...
      await client.query(
        `UPDATE work_items w SET rank = r.rn * ${RANK_STEP}
           FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY rank, id) AS rn FROM work_items WHERE project_id = $1) r
          WHERE w.id = r.id`,
        [projectId],
      );
      ({ prev, next } = await read());
    }
    if (prev !== undefined && next !== undefined) return (prev + next) / 2;
    return prev !== undefined ? prev + RANK_STEP : next! - RANK_STEP;
  }

  /** "Delete" moves the item (and its sub-items) to the project's trash — restorable for 30 days (see trash.service.ts). */
  async remove(ref: string, ctx: RequestContext): Promise<void> {
    const { itemId, access } = await resolveItem(ctx, ref);
    const detail = await this.loadDetail(itemId, access, ctx);
    if (!detail.permissions.canDelete) throw new ForbiddenException('Only project admins or the reporter can delete this item');

    const ids = await withTransaction(async (client) => {
      const trashed = await trashItemTree(client, itemId, ctx.user!.id);
      await audit(ctx, { action: 'work_item.trash', entity: 'work_item', entityId: detail.key, details: { title: detail.title, type: detail.type, withChildren: trashed.length - 1 } }, client);
      return trashed;
    });
    await publishItems(ctx, access.project, 'deleted', ids);
  }

  // ---------------------------------------------------------------- bug flow (2f)

  /**
   * "Possible duplicates" for a title being typed: trigram similarity (typos, word order) plus
   * full-text matches on any meaningful word, best first. Closed items are included (and flagged by status).
   */
  async similar(projectRef: string, query: { title: string; excludeId?: number; limit: number }, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    const words = [...new Set(query.title.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])].slice(0, 12);
    const { rows } = await db.query<WorkItemSummary & { score: number }>(
      `SELECT x.*, m.score FROM (
         SELECT w.id,
                round((similarity(w.title, $2) + 0.5 * ts_rank(w.search_vector, to_tsquery('simple', $3)))::numeric, 3)::float AS score
           FROM work_items w
          WHERE w.project_id = $1 AND w.deleted_at IS NULL AND w.id <> COALESCE($4::int, 0)
            AND (w.title % $2 OR ($3 <> '' AND w.search_vector @@ to_tsquery('simple', $3)))
       ) m -- not "s": ITEM_SELECT already uses s for project_statuses
       JOIN LATERAL (${ITEM_SELECT} WHERE w.id = m.id) x ON TRUE
      WHERE m.score >= 0.15
      ORDER BY m.score DESC
      LIMIT $5`,
      [access.project.id, query.title, words.join(' | '), query.excludeId ?? null, query.limit],
    );
    return rows;
  }

  /**
   * QA verdict on an item waiting in the project's "ready for QA" status:
   *   pass → "passed" status (resolution fixed, optional fixed-in version)
   *   fail → "failed" status, reopen count + 1, the reason is posted as a comment
   * Who may give a verdict: whoever may move items into the "passed" status (e.g. QA, admins).
   */
  async qaVerdict(ref: string, dto: QaVerdictDto, ctx: RequestContext): Promise<WorkItemDetail> {
    const { itemId, access } = await resolveItem(ctx, ref);
    assertCanEdit(access);
    const { project } = access;
    if (!project.qaReadyStatusId || !project.qaPassedStatusId || !project.qaFailedStatusId) {
      throw new BadRequestException('This project has no QA verification flow (Project settings → Workflow)');
    }

    const changed = await withTransaction(async (client) => {
      const { rows } = await client.query<{ statusId: number }>('SELECT status_id AS "statusId" FROM work_items WHERE id = $1 FOR UPDATE', [itemId]);
      if (rows[0]!.statusId !== project.qaReadyStatusId) throw new ConflictException('This item is not waiting for QA');
      const statuses = await loadStatuses(project.id, client);
      assertTransitionAllowed(statuses.find((s) => s.id === project.qaPassedStatusId)!, access, ctx); // QA rights for both verdicts

      const pass = dto.verdict === 'pass';
      const ids = await this.applyChanges(
        client,
        itemId,
        access,
        pass
          ? { statusId: project.qaPassedStatusId!, ...(dto.fixedInVersion ? { fixedInVersion: dto.fixedInVersion } : {}) }
          : { statusId: project.qaFailedStatusId! },
        ctx,
        { notifyWatchers: false },
      );
      if (!pass) await client.query('UPDATE work_items SET reopen_count = reopen_count + 1 WHERE id = $1', [itemId]);
      await recordEvents(client, { id: itemId, organizationId: project.organizationId }, ctx.user!.id, [
        { type: pass ? 'qa_passed' : 'qa_failed', newValue: dto.comment ? { comment: dto.comment.slice(0, 300) } : undefined },
      ]);
      // the developer (assignee) and the reporter hear the verdict
      const people = await client.query<{ assigneeId: number | null; reporterId: number | null }>(
        'SELECT assignee_id AS "assigneeId", reporter_id AS "reporterId" FROM work_items WHERE id = $1',
        [itemId],
      );
      const item = await itemLabel(client, itemId);
      await notify(client, {
        organizationId: project.organizationId,
        userIds: [people.rows[0]!.assigneeId, people.rows[0]!.reporterId],
        actorId: ctx.user!.id,
        type: pass ? 'qa_passed' : 'qa_failed',
        title: pass ? `${ctx.user!.name} verified ${item.key} ✅` : `${ctx.user!.name} sent ${item.key} back — QA failed`,
        body: dto.comment ?? item.title,
        url: item.url,
        workItemId: itemId,
      });
      return ids;
    });

    if (dto.comment) {
      await new CommentsService().create(String(itemId), `${dto.verdict === 'pass' ? '✅ **QA passed**' : '❌ **QA failed**'}\n\n${dto.comment}`, ctx, { notify: false });
    }
    await publishItems(ctx, project, 'updated', changed);
    return this.loadDetail(itemId, access, ctx);
  }

  /** Close as duplicate of another item: "duplicates" link, resolution duplicate, first unrestricted done status. */
  async closeAsDuplicate(ref: string, duplicateOf: string | number, ctx: RequestContext): Promise<WorkItemDetail> {
    const { itemId, access } = await resolveItem(ctx, ref);
    assertCanEdit(access);
    const original = await resolveItem(ctx, duplicateOf); // must be visible to the user too
    if (original.itemId === itemId) throw new BadRequestException('An item cannot duplicate itself');
    const { project } = access;

    const changed = await withTransaction(async (client) => {
      const statuses = await loadStatuses(project.id, client);
      const done = statuses.filter((s) => s.category === 'done');
      const target = done.find((s) => !s.restrictedRoles.length) ?? done[0];
      if (!target) throw new BadRequestException('The workflow has no "done" status');

      await client.query(
        `INSERT INTO work_item_links (organization_id, source_id, target_id, link_type, created_by)
         VALUES ($1, $2, $3, 'duplicates', $4) ON CONFLICT DO NOTHING`,
        [project.organizationId, itemId, original.itemId, ctx.user!.id],
      );
      const ids = await this.applyChanges(client, itemId, access, { statusId: target.id, resolution: 'duplicate' }, ctx);
      const key = await client.query<{ key: string }>(
        `SELECT p.key || '-' || w.number AS key FROM work_items w JOIN projects p ON p.id = w.project_id WHERE w.id = $1`,
        [original.itemId],
      );
      await recordEvents(client, { id: itemId, organizationId: project.organizationId }, ctx.user!.id, [
        { type: 'closed_duplicate', newValue: { item: key.rows[0]!.key } },
      ]);
      // whoever followed the duplicate now follows the original
      await client.query(
        `INSERT INTO work_item_watchers (work_item_id, organization_id, user_id)
         SELECT $2, organization_id, user_id FROM work_item_watchers WHERE work_item_id = $1
         ON CONFLICT DO NOTHING`,
        [itemId, original.itemId],
      );
      return ids;
    });

    await publishItems(ctx, project, 'updated', changed);
    return this.loadDetail(itemId, access, ctx);
  }

  async events(ref: string, ctx: RequestContext): Promise<WorkItemEvent[]> {
    const { itemId } = await resolveItem(ctx, ref);
    return listEvents(itemId);
  }

  async setWatching(ref: string, watching: boolean, ctx: RequestContext): Promise<{ isWatching: boolean; watchers: UserRef[] }> {
    const { itemId, access } = await resolveItem(ctx, ref);
    if (watching) await this.addWatchers(itemId, access.project.organizationId, [ctx.user!.id]);
    else await db.query('DELETE FROM work_item_watchers WHERE work_item_id = $1 AND user_id = $2', [itemId, ctx.user!.id]);
    const { rows } = await db.query<UserRef>(
      `SELECT u.id, u.name FROM work_item_watchers ww JOIN users u ON u.id = ww.user_id WHERE ww.work_item_id = $1 ORDER BY lower(u.name)`,
      [itemId],
    );
    return { isWatching: watching, watchers: rows };
  }

  // ---------------------------------------------------------------- helpers

  private async setLabels(itemId: number, projectId: number, labelIds: number[], executor: Queryable) {
    const unique = [...new Set(labelIds)];
    if (unique.length) {
      const { rowCount } = await executor.query('SELECT 1 FROM project_labels WHERE project_id = $1 AND id = ANY($2::int[])', [projectId, unique]);
      if (rowCount !== unique.length) throw new BadRequestException('One or more labels do not belong to this project');
    }
    await executor.query('DELETE FROM work_item_labels WHERE work_item_id = $1', [itemId]);
    if (unique.length) {
      await executor.query(
        'INSERT INTO work_item_labels (work_item_id, label_id, project_id) SELECT $1, unnest($2::int[]), $3',
        [itemId, unique, projectId],
      );
    }
  }

  /** Adds watchers (ignores people who are no longer active organization members). */
  async addWatchers(itemId: number, organizationId: number, userIds: (number | null)[], executor: Queryable = db) {
    const ids = [...new Set(userIds.filter((u): u is number => !!u))];
    if (!ids.length) return;
    await executor.query(
      `INSERT INTO work_item_watchers (work_item_id, organization_id, user_id)
       SELECT $1, $2, m.user_id FROM organization_members m
        WHERE m.organization_id = $2 AND m.user_id = ANY($3::int[]) AND m.status = 'active'
       ON CONFLICT DO NOTHING`,
      [itemId, organizationId, ids],
    );
  }
}
