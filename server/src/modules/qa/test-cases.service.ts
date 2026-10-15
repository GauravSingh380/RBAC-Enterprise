// Test suites (folders) and test cases (reusable checks with numbered steps).
// Access follows the project: everyone who can see it reads, members / admins write.
import { db, withTransaction, type Queryable } from '../../database/db.js';
import { BadRequestException, ConflictException, NotFoundException } from '../../common/exceptions/http.exception.js';
import type { RequestContext } from '../../common/utils/request-context.js';
import { assertCanEdit, getProjectAccess, type ProjectAccess } from '../projects/project-access.js';
import { resolveItem } from '../work-items/work-items.service.js';
import type { CreateCaseDto, ListCasesQuery, UpdateCaseDto } from './qa.dto.js';

const UNIQUE_VIOLATION = '23505';

export interface TestStep {
  action: string;
  expected: string;
}

export interface TestCase {
  id: number;
  number: number;
  key: string;
  suite: { id: number; name: string } | null;
  title: string;
  preconditions: string | null;
  steps: TestStep[];
  priority: string;
  caseType: string;
  status: string;
  workItem: { id: number; key: string; title: string } | null;
  createdBy: { id: number; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
  lastResult: { status: string; runId: number; runName: string; executedAt: Date | null } | null;
}

const CASE_SELECT = `
  SELECT c.id, c.number, 'TC-' || c.number AS key, c.title, c.preconditions, c.steps, c.priority,
         c.case_type AS "caseType", c.status, c.created_at AS "createdAt", c.updated_at AS "updatedAt",
         CASE WHEN ts.id IS NULL THEN NULL ELSE json_build_object('id', ts.id, 'name', ts.name) END AS suite,
         CASE WHEN w.id IS NULL THEN NULL ELSE json_build_object('id', w.id, 'key', p.key || '-' || w.number, 'title', w.title) END AS "workItem",
         CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name) END AS "createdBy",
         (SELECT json_build_object('status', r.status, 'runId', r.run_id, 'runName', tr.name, 'executedAt', r.executed_at)
            FROM test_results r JOIN test_runs tr ON tr.id = r.run_id
           WHERE r.test_case_id = c.id AND r.status <> 'untested'
           ORDER BY r.executed_at DESC NULLS LAST, r.id DESC LIMIT 1) AS "lastResult"
    FROM test_cases c
    LEFT JOIN test_suites ts ON ts.id = c.suite_id
    LEFT JOIN work_items w ON w.id = c.work_item_id AND w.deleted_at IS NULL
    LEFT JOIN projects p ON p.id = w.project_id
    LEFT JOIN users u ON u.id = c.created_by`;

export class TestCasesService {
  // ---------------------------------------------------------------- suites

  async listSuites(projectRef: string, ctx: RequestContext) {
    const { project } = await getProjectAccess(ctx, projectRef);
    const { rows } = await db.query(
      `SELECT s.id, s.name, s.description, s.position,
              (SELECT COUNT(*)::int FROM test_cases c WHERE c.suite_id = s.id AND c.status <> 'deprecated') AS "caseCount"
         FROM test_suites s WHERE s.project_id = $1 ORDER BY s.position, lower(s.name)`,
      [project.id],
    );
    return rows;
  }

  async createSuite(projectRef: string, dto: { name: string; description?: string | null }, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    try {
      await db.query(
        `INSERT INTO test_suites (organization_id, project_id, name, description, position)
         VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(position), -1) + 1 FROM test_suites WHERE project_id = $2))`,
        [access.project.organizationId, access.project.id, dto.name, dto.description ?? null],
      );
    } catch (err: any) {
      if (err.code === UNIQUE_VIOLATION) throw new ConflictException(`A suite named "${dto.name}" already exists`);
      throw err;
    }
    return this.listSuites(projectRef, ctx);
  }

  async updateSuite(projectRef: string, suiteId: number, dto: { name?: string; description?: string | null }, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    try {
      const { rowCount } = await db.query(
        `UPDATE test_suites SET name = COALESCE($3, name), description = CASE WHEN $4::boolean THEN $5 ELSE description END
          WHERE id = $1 AND project_id = $2`,
        [suiteId, access.project.id, dto.name ?? null, dto.description !== undefined, dto.description ?? null],
      );
      if (!rowCount) throw new NotFoundException('Suite not found');
    } catch (err: any) {
      if (err.code === UNIQUE_VIOLATION) throw new ConflictException(`A suite named "${dto.name}" already exists`);
      throw err;
    }
    return this.listSuites(projectRef, ctx);
  }

  /** Cases of a deleted suite stay (without a suite). */
  async deleteSuite(projectRef: string, suiteId: number, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    const { rowCount } = await db.query('DELETE FROM test_suites WHERE id = $1 AND project_id = $2', [suiteId, access.project.id]);
    if (!rowCount) throw new NotFoundException('Suite not found');
    return this.listSuites(projectRef, ctx);
  }

  // ---------------------------------------------------------------- cases

  async list(projectRef: string, query: ListCasesQuery, ctx: RequestContext) {
    const { project } = await getProjectAccess(ctx, projectRef);
    const where = ['c.project_id = $1'];
    const params: unknown[] = [project.id];
    const add = (sql: (p: string) => string, v: unknown) => {
      params.push(v);
      where.push(sql(`$${params.length}`));
    };
    if (query.suiteId === 'none') where.push('c.suite_id IS NULL');
    else if (query.suiteId) add((p) => `c.suite_id = ${p}`, query.suiteId);
    if (query.status) add((p) => `c.status = ${p}`, query.status);
    if (query.priority) add((p) => `c.priority = ${p}`, query.priority);
    if (query.caseType) add((p) => `c.case_type = ${p}`, query.caseType);
    if (query.workItemId) add((p) => `c.work_item_id = ${p}`, query.workItemId);
    if (query.search) {
      const number = /^(?:TC-)?(\d+)$/i.exec(query.search)?.[1];
      params.push(query.search, `%${query.search}%`, number ? Number(number) : null);
      const n = params.length;
      where.push(`(c.search_vector @@ websearch_to_tsquery('simple', $${n - 2}) OR c.title ILIKE $${n - 1} OR c.number = $${n}::int)`);
    }
    const whereSql = where.join(' AND ');
    const [items, total] = await Promise.all([
      db.query<TestCase>(`${CASE_SELECT} WHERE ${whereSql} ORDER BY c.number LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [
        ...params,
        query.limit,
        (query.page - 1) * query.limit,
      ]),
      db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM test_cases c WHERE ${whereSql}`, params),
    ]);
    return { items: items.rows, total: total.rows[0]!.count, page: query.page, limit: query.limit };
  }

  async findOne(projectRef: string, number: number, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    const testCase = await this.load(access, number);
    // execution history across runs (newest first)
    const { rows: history } = await db.query(
      `SELECT r.id, r.run_id AS "runId", tr.name AS "runName", r.status, r.comment, r.executed_at AS "executedAt",
              CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name) END AS "executedBy",
              CASE WHEN b.id IS NULL THEN NULL ELSE json_build_object('id', b.id, 'key', p.key || '-' || b.number, 'title', b.title) END AS bug
         FROM test_results r
         JOIN test_runs tr ON tr.id = r.run_id
         LEFT JOIN users u ON u.id = r.executed_by
         LEFT JOIN work_items b ON b.id = r.bug_id AND b.deleted_at IS NULL
         LEFT JOIN projects p ON p.id = b.project_id
        WHERE r.test_case_id = $1 AND r.status <> 'untested'
        ORDER BY r.executed_at DESC NULLS LAST LIMIT 20`,
      [testCase.id],
    );
    return { ...testCase, history };
  }

  async create(projectRef: string, dto: CreateCaseDto, ctx: RequestContext): Promise<TestCase> {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    const { project } = access;
    const workItemId = dto.workItemRef ? await this.resolveCovered(ctx, access, dto.workItemRef) : null;

    const number = await withTransaction(async (client) => {
      if (dto.suiteId) await assertSuite(client, dto.suiteId, project.id);
      const counter = await client.query<{ n: number }>(
        'UPDATE projects SET test_case_counter = test_case_counter + 1 WHERE id = $1 RETURNING test_case_counter AS n',
        [project.id],
      );
      const n = counter.rows[0]!.n;
      await client.query(
        `INSERT INTO test_cases (organization_id, project_id, number, suite_id, title, preconditions, steps, priority, case_type, status, work_item_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [project.organizationId, project.id, n, dto.suiteId ?? null, dto.title, dto.preconditions ?? null, JSON.stringify(dto.steps),
          dto.priority, dto.caseType, dto.status, workItemId, ctx.user!.id],
      );
      return n;
    });
    return this.load(access, number);
  }

  async update(projectRef: string, number: number, dto: UpdateCaseDto, ctx: RequestContext): Promise<TestCase> {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    const current = await this.load(access, number);
    if (dto.suiteId) await assertSuite(db, dto.suiteId, access.project.id);
    const workItemId =
      dto.workItemRef === undefined ? undefined : dto.workItemRef === null ? null : await this.resolveCovered(ctx, access, dto.workItemRef);

    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (dto.title !== undefined) set('title', dto.title);
    if (dto.suiteId !== undefined) set('suite_id', dto.suiteId);
    if (dto.preconditions !== undefined) set('preconditions', dto.preconditions);
    if (dto.steps !== undefined) set('steps', JSON.stringify(dto.steps));
    if (dto.priority !== undefined) set('priority', dto.priority);
    if (dto.caseType !== undefined) set('case_type', dto.caseType);
    if (dto.status !== undefined) set('status', dto.status);
    if (workItemId !== undefined) set('work_item_id', workItemId);
    values.push(current.id);
    await db.query(`UPDATE test_cases SET ${[...sets, 'updated_at = NOW()'].join(', ')} WHERE id = $${values.length}`, values);
    return this.load(access, number);
  }

  /** Past runs keep their snapshot of the case. */
  async remove(projectRef: string, number: number, ctx: RequestContext): Promise<void> {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    const { rowCount } = await db.query('DELETE FROM test_cases WHERE project_id = $1 AND number = $2', [access.project.id, number]);
    if (!rowCount) throw new NotFoundException('Test case not found');
  }

  private async load(access: ProjectAccess, number: number): Promise<TestCase> {
    const { rows } = await db.query<TestCase>(`${CASE_SELECT} WHERE c.project_id = $1 AND c.number = $2`, [access.project.id, number]);
    if (!rows[0]) throw new NotFoundException('Test case not found');
    return rows[0];
  }

  /** A case covers an item of the SAME project (the database enforces it too). */
  private async resolveCovered(ctx: RequestContext, access: ProjectAccess, ref: string | number) {
    const { itemId, access: itemAccess } = await resolveItem(ctx, ref);
    if (itemAccess.project.id !== access.project.id) throw new BadRequestException('A test case can only cover items of its own project');
    return itemId;
  }
}

async function assertSuite(executor: Queryable, suiteId: number, projectId: number) {
  const { rowCount } = await executor.query('SELECT 1 FROM test_suites WHERE id = $1 AND project_id = $2', [suiteId, projectId]);
  if (!rowCount) throw new BadRequestException('Unknown suite for this project');
}
