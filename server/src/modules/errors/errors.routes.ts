// /api/errors — production error inbox of the active organization
// /api/platform/errors — every error (mounted by the platform router, platform admins only)
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../common/constants/rbac.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requirePermission } from '../../common/middleware/permission.middleware.js';
import { requireOrganization } from '../../common/middleware/tenant.middleware.js';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import { createBugFromErrorSchema, ErrorsService, linkBugSchema, listErrorsQuerySchema, simulateError } from './errors.service.js';

const errors = new ErrorsService();
const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });
const orgId = (req: Request) => req.tenant!.organizationId;
const statusSchema = z.object({ status: z.enum(['resolved', 'ignored', 'unresolved']) });

const router = Router();
router.use(authenticate, requireOrganization);

const read = requirePermission(PERMISSIONS.ERRORS_READ);
const manage = requirePermission(PERMISSIONS.ERRORS_READ, PERMISSIONS.ERRORS_MANAGE);

router.get('/', read, async (req, res) => ok(res, await errors.list(listErrorsQuerySchema.parse(req.query), orgId(req))));
// development only: produce a sample server error — /simulate/generic or /simulate/type (a TypeError)
router.post('/simulate/:kind', manage, (req) => simulateError(String(req.params.kind)));
router.get('/:id', read, async (req, res) => ok(res, await errors.findOne(parseId(req.params.id), orgId(req))));
router.patch('/:id', manage, validateBody(statusSchema), async (req, res) =>
  ok(res, await errors.setStatus(parseId(req.params.id), req.body.status, getContext(req), orgId(req))),
);
router.post('/:id/bug', manage, validateBody(createBugFromErrorSchema), async (req, res) =>
  ok(res, await errors.createBug(parseId(req.params.id), req.body, getContext(req)), 201),
);
router.post('/:id/link', manage, validateBody(linkBugSchema), async (req, res) =>
  ok(res, await errors.linkBug(parseId(req.params.id), req.body.itemRef, getContext(req))),
);

export default router;

/** Platform console: all organizations + errors outside any organization (auth done by the platform router). */
export const platformErrorsRouter = Router();
platformErrorsRouter.get('/', async (req, res) => ok(res, await errors.list(listErrorsQuerySchema.parse(req.query), null)));
platformErrorsRouter.get('/:id', async (req, res) => ok(res, await errors.findOne(parseId(req.params.id), null)));
platformErrorsRouter.patch('/:id', validateBody(statusSchema), async (req, res) =>
  ok(res, await errors.setStatus(parseId(req.params.id), req.body.status, getContext(req), null)),
);
