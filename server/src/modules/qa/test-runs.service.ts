// Test runs: execute a set of test cases (e.g. "Release 2.4 regression"), record pass / fail per
// case and per step, and turn a failure into a bug that is pre-filled from the test.
//
//   create run  → the chosen READY cases are snapshotted into test_results (status "untested")
//   execute     → PATCH a result: status, per-step results, comment (executed_by / executed_at set)
//   file a bug  → steps to reproduce = preconditions + the steps up to the one that failed,
//                 expected = that step's expected result, actual = the tester's comment,
//                 environment / found-in version = the run's
//   complete    → the run becomes read-only
import { db, withTransaction } from '../../database/db.js';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '../../common/exceptions/http.exception.js';
import { audit } from '../../common/utils/audit.js';
import type { RequestContext } from '../../common/utils/request-context.js';
import { assertCanEdit, getProjectAccess, type ProjectAccess } from '../projects/project-access.js';
import { realtime } from '../realtime/realtime.hub.js';
import { recordEvents } from '../work-items/work-item-events.js';
import { loadSprint } from '../work-items/work-item-sprints.js';
import { WorkItemsService } from '../work-items/work-items.service.js';
import type { BugFromResultDto, CreateRunDto, UpdateResultDto, UpdateRunDto } from './qa.dto.js';
import type { TestStep } from './test-cases.service.js';

const MAX_CASES_PER_RUN = 1000;

export interface RunSummary {
  total: number;
  untested: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  /** executed (anything but untested) ÷ total, % */
  progress: number;
  /** passed ÷ executed (skipped excluded), % */
  passRate: number | null;
}

const RUN_SELECT = `
  SELECT r.id, r.name, r.description, r.environment, r.build_version AS "buildVersion", r.status,
         r.created_at AS "createdAt", r.completed_at AS "completedAt",
         CASE WHEN sp.id IS NULL THEN NULL ELSE json_build_object('id', sp.id, 'name', sp.name, 'status', sp.status) END AS sprint,
         CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name) END AS "createdBy",
         (SELECT json_build_object(
                   'total', COUNT(*)::int,
                   'untested', (COUNT(*) FILTER (WHERE x.status = 'untested'))::int,
                   'passed',   (COUNT(*) FILTER (WHERE x.status = 'passed'))::int,
                   'failed',   (COUNT(*) FILTER (WHERE x.status = 'failed'))::int,
                   'blocked',  (COUNT(*) FILTER (WHERE x.status = 'blocked'))::int,
                   'skipped',  (COUNT(*) FILTER (WHERE x.status = 'skipped'))::int)
            FROM test_results x WHERE x.run_id = r.id) AS counts
    FROM test_runs r
    LEFT JOIN sprints sp ON sp.id = r.sprint_id
    LEFT JOIN users u ON u.id = r.created_by`;

type RunRow = Record<string, unknown> & { id: number; name: string; status: string; environment: string | null; buildVersion: string | null; createdBy: { id: number } | null; counts: Omit<RunSummary, 'progress' | 'passRate'> };

export function summarize(c: Omit<RunSummary, 'progress' | 'passRate'>): RunSummary {
  const executed = c.total - c.untested;
  const judged = executed - c.skipped;
  return {
    ...c,
    progress: c.total ? Math.round((executed / c.total) * 100) : 0,
    passRate: judged > 0 ? Math.round((c.passed / judged) * 100) : null,
  };
}

const withSummary = ({ counts, ...run }: RunRow) => ({ ...run, summary: summarize(counts) });

function publishRun(ctx: RequestContext, access: ProjectAccess, runId: number) {
  return realtime.publish({
    type: 'tests',
    action: 'updated',
    organizationId: access.project.organizationId,
    projectId: access.project.id,
    runId,
    actorId: ctx.user?.id ?? null,
    clientId: ctx.clientId ?? null,
  });
}

export class TestRunsService {
  private readonly items = new WorkItemsService();

  async list(projectRef: string, status: 'in_progress' | 'completed' | 'all', ctx: RequestContext) {
    const { project } = await getProjectAccess(ctx, projectRef);
    const { rows } = await db.query<RunRow>(
      `${RUN_SELECT} WHERE r.project_id = $1 ${status === 'all' ? '' : 'AND r.status = $2'}
        ORDER BY CASE r.status WHEN 'in_progress' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 200`,
      status === 'all' ? [project.id] : [project.id, status],
    );
    return rows.map(withSummary);
  }

  async findOne(projectRef: string, runId: number, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    const run = await this.load(access, runId);
    const { rows: results } = await db.query(
      `SELECT r.id, r.test_case_id AS "testCaseId", r.case_number AS "caseNumber", 'TC-' || r.case_number AS "caseKey",
              r.title, r.preconditions, r.steps, r.position, r.status, r.step_results AS "stepResults", r.comment,
              r.executed_at AS "executedAt",
              CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name) END AS "executedBy",
              CASE WHEN b.id IS NULL THEN NULL ELSE json_build_object(
                'id', b.id, 'key', p.key || '-' || b.number, 'number', b.number, 'title', b.title,
                'status', json_build_object('name', s.name, 'category', s.category, 'color', s.color)) END AS bug,
              ts.name AS "suiteName"
         FROM test_results r
         LEFT JOIN users u ON u.id = r.executed_by
         LEFT JOIN work_items b ON b.id = r.bug_id AND b.deleted_at IS NULL
         LEFT JOIN projects p ON p.id = b.project_id
         LEFT JOIN project_statuses s ON s.id = b.status_id
         LEFT JOIN test_cases tc ON tc.id = r.test_case_id
         LEFT JOIN test_suites ts ON ts.id = tc.suite_id
        WHERE r.run_id = $1 ORDER BY r.position, r.id`,
      [runId],
    );
    return { ...run, results };
  }

  async create(projectRef: string, dto: CreateRunDto, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    const { project } = access;

    const runId = await withTransaction(async (client) => {
      if (dto.sprintId) await loadSprint(dto.sprintId, project.id, client);
      // only READY cases are executed (drafts are unfinished, deprecated ones retired)
      const { rows: cases } = await client.query<{ id: number; number: number; title: string; preconditions: string | null; steps: TestStep[] }>(
        `SELECT c.id, c.number, c.title, c.preconditions, c.steps
           FROM test_cases c LEFT JOIN test_suites s ON s.id = c.suite_id
          WHERE c.project_id = $1 AND c.status = 'ready'
            AND ($2::boolean OR c.suite_id = ANY($3::int[]) OR c.id = ANY($4::int[]))
          ORDER BY s.position NULLS LAST, lower(s.name), c.number`,
        [project.id, !!dto.scope.all, dto.scope.suiteIds ?? [], dto.scope.caseIds ?? []],
      );
      if (!cases.length) throw new BadRequestException('No ready test cases match this selection');
      if (cases.length > MAX_CASES_PER_RUN) throw new BadRequestException(`A run can hold at most ${MAX_CASES_PER_RUN} cases`);

      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO test_runs (organization_id, project_id, name, description, sprint_id, environment, build_version, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [project.organizationId, project.id, dto.name, dto.description ?? null, dto.sprintId ?? null, dto.environment ?? null, dto.buildVersion ?? null, ctx.user!.id],
      );
      const id = rows[0]!.id;
      // snapshot every case in one statement
      await client.query(
        `INSERT INTO test_results (organization_id, project_id, run_id, test_case_id, case_number, title, preconditions, steps, position)
         SELECT $1, $2, $3, (c->>'id')::int, (c->>'number')::int, c->>'title', c->>'preconditions', c->'steps', ord - 1
           FROM jsonb_array_elements($4::jsonb) WITH ORDINALITY AS t(c, ord)`,
        [project.organizationId, project.id, id, JSON.stringify(cases)],
      );
      await audit(ctx, { action: 'test_run.create', entity: 'project', entityId: project.id, details: { run: dto.name, cases: cases.length } }, client);
      return id;
    });
    await publishRun(ctx, access, runId);
    return this.findOne(projectRef, runId, ctx);
  }

  async update(projectRef: string, runId: number, dto: UpdateRunDto, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    await this.load(access, runId);
    await db.query(
      `UPDATE test_runs SET name = COALESCE($2, name),
              description   = CASE WHEN $3::boolean THEN $4 ELSE description END,
              environment   = CASE WHEN $5::boolean THEN $6 ELSE environment END,
              build_version = CASE WHEN $7::boolean THEN $8 ELSE build_version END
        WHERE id = $1`,
      [runId, dto.name ?? null, dto.description !== undefined, dto.description ?? null, dto.environment !== undefined, dto.environment ?? null,
        dto.buildVersion !== undefined, dto.buildVersion ?? null],
    );
    await publishRun(ctx, access, runId);
    return this.findOne(projectRef, runId, ctx);
  }

  async setCompleted(projectRef: string, runId: number, completed: boolean, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    await this.load(access, runId);
    await db.query(
      `UPDATE test_runs SET status = $2::text, completed_at = CASE WHEN $2::text = 'completed' THEN NOW() ELSE NULL END WHERE id = $1`,
      [runId, completed ? 'completed' : 'in_progress'],
    );
    await publishRun(ctx, access, runId);
    return this.findOne(projectRef, runId, ctx);
  }

  /** Project admins, or the person who created the run. */
  async remove(projectRef: string, runId: number, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    const run = await this.load(access, runId);
    if (!access.canManage && run.createdBy?.id !== ctx.user!.id) throw new ForbiddenException('Only project admins or the creator can delete a run');
    await db.query('DELETE FROM test_runs WHERE id = $1', [runId]);
    await audit(ctx, { action: 'test_run.delete', entity: 'project', entityId: access.project.id, details: { run: run.name } });
    await publishRun(ctx, access, runId);
  }

  async updateResult(projectRef: string, runId: number, resultId: number, dto: UpdateResultDto, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    const run = await this.load(access, runId);
    if (run.status === 'completed') throw new ConflictException('This run is completed — reopen it to change results');
    const result = await this.loadResult(runId, resultId);
    if (dto.stepResults && dto.stepResults.length > result.steps.length) throw new BadRequestException('More step results than steps');

    // a failed / blocked step decides the case unless a status is given explicitly
    let status = dto.status;
    if (!status && dto.stepResults) {
      status = dto.stepResults.includes('failed')
        ? 'failed'
        : dto.stepResults.includes('blocked')
          ? 'blocked'
          : dto.stepResults.length === result.steps.length && dto.stepResults.every((s) => s === 'passed')
            ? 'passed'
            : undefined;
    }
    await db.query(
      `UPDATE test_results
          SET status       = COALESCE($2, status),
              step_results = COALESCE($3::jsonb, step_results),
              comment      = CASE WHEN $4::boolean THEN $5 ELSE comment END,
              executed_by  = CASE WHEN $2 IS NULL THEN executed_by WHEN $2 = 'untested' THEN NULL ELSE $6::int END,
              executed_at  = CASE WHEN $2 IS NULL THEN executed_at WHEN $2 = 'untested' THEN NULL ELSE NOW() END
        WHERE id = $1`,
      [resultId, status ?? null, dto.stepResults ? JSON.stringify(dto.stepResults) : null, dto.comment !== undefined, dto.comment ?? null, ctx.user!.id],
    );
    await publishRun(ctx, access, runId);
    return (await this.findOne(projectRef, runId, ctx)).results.find((r: { id: number }) => r.id === resultId);
  }

  /** Files a bug pre-filled from a failed (or blocked) result and links it to the result. */
  async fileBug(projectRef: string, runId: number, resultId: number, dto: BugFromResultDto, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    const run = await this.load(access, runId);
    const result = await this.loadResult(runId, resultId);
    if (result.status !== 'failed' && result.status !== 'blocked') throw new BadRequestException('Only failed or blocked tests can become bugs');
    if (result.bugId) throw new ConflictException('A bug was already filed for this result');

    const failedAt = result.stepResults.findIndex((s) => s === 'failed' || s === 'blocked');
    const upTo = failedAt >= 0 ? failedAt + 1 : result.steps.length;
    const steps = result.steps.slice(0, upTo).map((s, i) => `${i + 1}. ${s.action}${i === failedAt ? '  ← fails here' : ''}`);
    const stepsToReproduce = [result.preconditions ? `**Preconditions:** ${result.preconditions}\n` : '', ...steps].filter(Boolean).join('\n');
    const expected = failedAt >= 0 ? result.steps[failedAt]?.expected : result.steps.map((s) => s.expected).filter(Boolean).join('\n');

    const bug = await this.items.create(
      projectRef,
      {
        type: 'bug',
        title: (dto.title ?? `[TC-${result.caseNumber}] ${result.title} fails`).slice(0, 500),
        description: `Found by test run **${run.name}** — TC-${result.caseNumber} *${result.title}*.`,
        priority: dto.priority ?? 'high',
        severity: dto.severity ?? 'major',
        assigneeId: dto.assigneeId ?? undefined,
        stepsToReproduce,
        expectedResult: expected || null,
        actualResult: result.comment || null,
        environment: run.environment,
        foundInVersion: run.buildVersion,
      },
      ctx,
    );
    await withTransaction(async (client) => {
      await client.query('UPDATE test_results SET bug_id = $2 WHERE id = $1', [resultId, bug.id]);
      await recordEvents(client, { id: bug.id, organizationId: access.project.organizationId }, ctx.user!.id, [
        { type: 'test_failed', newValue: { run: run.name, runId, testCase: `TC-${result.caseNumber}` } },
      ]);
    });
    await publishRun(ctx, access, runId);
    return this.items.findOne(String(bug.id), ctx);
  }

  private async load(access: ProjectAccess, runId: number): Promise<RunRow & { summary: RunSummary }> {
    const { rows } = await db.query<RunRow>(`${RUN_SELECT} WHERE r.id = $1 AND r.project_id = $2`, [runId, access.project.id]);
    if (!rows[0]) throw new NotFoundException('Test run not found');
    return { ...rows[0], summary: summarize(rows[0].counts) };
  }

  private async loadResult(runId: number, resultId: number) {
    const { rows } = await db.query<{
      id: number;
      caseNumber: number;
      title: string;
      preconditions: string | null;
      steps: TestStep[];
      status: string;
      stepResults: (string | null)[];
      comment: string | null;
      bugId: number | null;
    }>(
      `SELECT id, case_number AS "caseNumber", title, preconditions, steps, status, step_results AS "stepResults", comment, bug_id AS "bugId"
         FROM test_results WHERE id = $1 AND run_id = $2`,
      [resultId, runId],
    );
    if (!rows[0]) throw new NotFoundException('Result not found');
    return rows[0];
  }
}
