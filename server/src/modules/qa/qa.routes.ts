// Mounted at /api/projects/:projectRef/{test-suites, test-cases, test-runs}
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import { projectRefOf } from '../projects/project-ref.js';
import {
  bugFromResultSchema,
  createCaseSchema,
  createRunSchema,
  listCasesQuerySchema,
  suiteSchema,
  updateCaseSchema,
  updateResultSchema,
  updateRunSchema,
  updateSuiteSchema,
} from './qa.dto.js';
import { TestCasesService } from './test-cases.service.js';
import { TestRunsService } from './test-runs.service.js';

const cases = new TestCasesService();
const runs = new TestRunsService();
const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });
const created = (res: Response, data: unknown) => ok(res, data, 201);
const num = (req: Request, name: string) => parseId(req.params[name]);
const runStatus = z.object({ status: z.enum(['in_progress', 'completed', 'all']).default('all') });

// ---------------------------------------------------------------- suites
export const suitesRouter = Router({ mergeParams: true });
suitesRouter.get('/', async (req, res) => ok(res, await cases.listSuites(projectRefOf(req), getContext(req))));
suitesRouter.post('/', validateBody(suiteSchema), async (req, res) => created(res, await cases.createSuite(projectRefOf(req), req.body, getContext(req))));
suitesRouter.patch('/:suiteId', validateBody(updateSuiteSchema), async (req, res) =>
  ok(res, await cases.updateSuite(projectRefOf(req), num(req, 'suiteId'), req.body, getContext(req))),
);
suitesRouter.delete('/:suiteId', async (req, res) => ok(res, await cases.deleteSuite(projectRefOf(req), num(req, 'suiteId'), getContext(req))));

// ---------------------------------------------------------------- cases (by number: TC-12 → 12)
export const casesRouter = Router({ mergeParams: true });
casesRouter.get('/', async (req, res) => ok(res, await cases.list(projectRefOf(req), listCasesQuerySchema.parse(req.query), getContext(req))));
casesRouter.post('/', validateBody(createCaseSchema), async (req, res) => created(res, await cases.create(projectRefOf(req), req.body, getContext(req))));
casesRouter.get('/:number', async (req, res) => ok(res, await cases.findOne(projectRefOf(req), num(req, 'number'), getContext(req))));
casesRouter.patch('/:number', validateBody(updateCaseSchema), async (req, res) =>
  ok(res, await cases.update(projectRefOf(req), num(req, 'number'), req.body, getContext(req))),
);
casesRouter.delete('/:number', async (req, res) => {
  await cases.remove(projectRefOf(req), num(req, 'number'), getContext(req));
  res.status(204).send();
});

// ---------------------------------------------------------------- runs
export const runsRouter = Router({ mergeParams: true });
runsRouter.get('/', async (req, res) => ok(res, await runs.list(projectRefOf(req), runStatus.parse(req.query).status, getContext(req))));
runsRouter.post('/', validateBody(createRunSchema), async (req, res) => created(res, await runs.create(projectRefOf(req), req.body, getContext(req))));
runsRouter.get('/:runId', async (req, res) => ok(res, await runs.findOne(projectRefOf(req), num(req, 'runId'), getContext(req))));
runsRouter.patch('/:runId', validateBody(updateRunSchema), async (req, res) =>
  ok(res, await runs.update(projectRefOf(req), num(req, 'runId'), req.body, getContext(req))),
);
runsRouter.post('/:runId/complete', async (req, res) => ok(res, await runs.setCompleted(projectRefOf(req), num(req, 'runId'), true, getContext(req))));
runsRouter.post('/:runId/reopen', async (req, res) => ok(res, await runs.setCompleted(projectRefOf(req), num(req, 'runId'), false, getContext(req))));
runsRouter.delete('/:runId', async (req, res) => {
  await runs.remove(projectRefOf(req), num(req, 'runId'), getContext(req));
  res.status(204).send();
});
runsRouter.patch('/:runId/results/:resultId', validateBody(updateResultSchema), async (req, res) =>
  ok(res, await runs.updateResult(projectRefOf(req), num(req, 'runId'), num(req, 'resultId'), req.body, getContext(req))),
);
runsRouter.post('/:runId/results/:resultId/bug', validateBody(bugFromResultSchema), async (req, res) =>
  created(res, await runs.fileBug(projectRefOf(req), num(req, 'runId'), num(req, 'resultId'), req.body, getContext(req))),
);
