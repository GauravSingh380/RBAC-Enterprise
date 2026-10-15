// /api/platform/* — product owner console. Platform admins only; works across ALL organizations.
import { Router } from 'express';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requirePlatformAdmin } from '../../common/middleware/permission.middleware.js';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { auditLogsController } from '../audit-logs/audit-logs.routes.js';
import { contentController, updateContentSchema } from '../content/content.routes.js';
import { platformErrorsRouter } from '../errors/errors.routes.js';
import { platformGuideRouter } from '../guide/guide.routes.js';
import { platformPlansRouter } from '../plans/plans.routes.js';
import { platformWebsiteRouter } from '../website/website.routes.js';
import menusRoutes from '../menus/menus.routes.js';
import { PlatformOpsController } from './platform-ops.controller.js';
import { PlatformOpsService } from './platform-ops.service.js';
import { PlatformController } from './platform.controller.js';
import { updateOrganizationAdminSchema, updateUserAdminSchema } from './platform.dto.js';
import { PlatformService } from './platform.service.js';

const platformController = new PlatformController(new PlatformService());
const opsController = new PlatformOpsController(new PlatformOpsService());

const router = Router();

router.use(authenticate, requirePlatformAdmin);

router.get('/stats', platformController.stats);

router.get('/organizations', platformController.listOrganizations);
router.patch('/organizations/:id', validateBody(updateOrganizationAdminSchema), platformController.updateOrganization);

router.get('/users', platformController.listUsers);
router.patch('/users/:id', validateBody(updateUserAdminSchema), platformController.updateUser);

router.use('/menus', menusRoutes);
router.put('/content/:key', validateBody(updateContentSchema), contentController.savePublic);
router.get('/audit-logs', auditLogsController.findAllPlatform);

// Email outbox ("Mailbox") and background jobs
router.get('/emails', opsController.listEmails);
router.get('/emails/:id', opsController.getEmail);
router.post('/emails/:id/resend', opsController.resendEmail);
router.get('/jobs/stats', opsController.jobStats);
router.get('/jobs', opsController.listJobs);
router.post('/jobs/:id/retry', opsController.retryJob);

// Production errors of every organization (+ errors outside any organization)
router.use('/errors', platformErrorsRouter);

// Help Center content (read by every organization at /api/guide)
router.use('/guide', platformGuideRouter);

// Plans and their limits (members, guests, projects)
router.use('/plans', platformPlansRouter);

// Public website: pages, sections, header & footer, images
router.use('/website', platformWebsiteRouter);

export default router;
