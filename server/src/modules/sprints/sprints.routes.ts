// Mounted at /api/projects/:projectRef/sprints (auth + organization already checked by the parent router).
import { Router, type Request, type Response } from 'express';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import { projectRefOf } from '../projects/project-ref.js';
import {
  completeSprintSchema,
  createSprintSchema,
  listSprintsQuerySchema,
  startSprintSchema,
  updateSprintSchema,
} from './sprints.dto.js';
import { SprintsService } from './sprints.service.js';
import { allocationSchema, CapacityService } from '../capacity/capacity.service.js';

const sprints = new SprintsService();
const capacity = new CapacityService();
const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });
const sprintId = (req: Request) => parseId(req.params.sprintId);

const router = Router({ mergeParams: true });

router.get('/', async (req, res) => ok(res, await sprints.list(projectRefOf(req), listSprintsQuerySchema.parse(req.query).status, getContext(req))));
router.post('/', validateBody(createSprintSchema), async (req, res) => ok(res, await sprints.create(projectRefOf(req), req.body, getContext(req)), 201));
router.get('/:sprintId', async (req, res) => ok(res, await sprints.findOne(projectRefOf(req), sprintId(req), getContext(req))));
router.patch('/:sprintId', validateBody(updateSprintSchema), async (req, res) =>
  ok(res, await sprints.update(projectRefOf(req), sprintId(req), req.body, getContext(req))),
);
router.delete('/:sprintId', async (req, res) => {
  await sprints.remove(projectRefOf(req), sprintId(req), getContext(req));
  res.status(204).send();
});
router.post('/:sprintId/start', validateBody(startSprintSchema), async (req, res) =>
  ok(res, await sprints.start(projectRefOf(req), sprintId(req), req.body, getContext(req))),
);
router.post('/:sprintId/complete', validateBody(completeSprintSchema), async (req, res) =>
  ok(res, await sprints.complete(projectRefOf(req), sprintId(req), req.body, getContext(req))),
);

// capacity planning: who can work how much in this sprint (leave + holidays + allocation)
router.get('/:sprintId/capacity', async (req, res) => ok(res, await capacity.sprintCapacity(projectRefOf(req), sprintId(req), getContext(req))));
router.put('/:sprintId/capacity/:userId', validateBody(allocationSchema), async (req, res) =>
  ok(res, await capacity.setAllocation(projectRefOf(req), sprintId(req), parseId(req.params.userId), req.body, getContext(req))),
);

export default router;
