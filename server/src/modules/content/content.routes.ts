// Content endpoints:
//   GET /api/content/public/:key   public content (home page), no login
//   GET /api/content/:key          content of the active organization
//   PUT /api/content/:key          (content.manage)
// Public content is edited from the platform module: PUT /api/platform/content/:key
import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../common/constants/rbac.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requirePermission } from '../../common/middleware/permission.middleware.js';
import { requireOrganization } from '../../common/middleware/tenant.middleware.js';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { ContentController } from './content.controller.js';
import { ContentService } from './content.service.js';

export const updateContentSchema = z.object({
  content: z.record(z.string(), z.unknown()),
});

export const contentController = new ContentController(new ContentService());

const router = Router();

router.get('/public/:key', contentController.findPublic);

router.get('/:key', authenticate, requireOrganization, contentController.findForOrganization);
router.put(
  '/:key',
  authenticate,
  requireOrganization,
  requirePermission(PERMISSIONS.CONTENT_MANAGE),
  validateBody(updateContentSchema),
  contentController.saveForOrganization,
);

export default router;
