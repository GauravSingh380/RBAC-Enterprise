import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants/rbac.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requirePermission } from '../../common/middleware/permission.middleware.js';
import { requireOrganization } from '../../common/middleware/tenant.middleware.js';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { getContext, tenantOf } from '../../common/utils/request-context.js';
import { db } from '../../database/db.js';
import { usageOf } from '../plans/plan-limits.js';
import { SecurityService, updateSecuritySchema } from '../security/security.service.js';
import { OrganizationsController } from './organizations.controller.js';
import { createOrganizationSchema, updateOrganizationSchema } from './organizations.dto.js';
import { OrganizationsService } from './organizations.service.js';

const organizationsController = new OrganizationsController(new OrganizationsService());
const security = new SecurityService();

const router = Router();

router.use(authenticate);

// Any logged-in user can create a new organization (self-serve) — no active organization needed
router.post('/', validateBody(createOrganizationSchema), organizationsController.create);

// The active organization (X-Organization-Id)
router.get('/current', requireOrganization, organizationsController.getCurrent);
router.patch(
  '/current',
  requireOrganization,
  requirePermission(PERMISSIONS.ORGANIZATION_MANAGE),
  validateBody(updateOrganizationSchema),
  organizationsController.update,
);
router.post('/current/leave', requireOrganization, organizationsController.leave);

// Plan and what the organization uses of it (every member; the settings page and the members page show it)
router.get('/current/usage', requireOrganization, async (req, res) => {
  res.json({ success: true, data: await usageOf(db, tenantOf(getContext(req)).organizationId) });
});

// Security: password & session rules (organization.manage)
router.get('/current/security', requireOrganization, requirePermission(PERMISSIONS.ORGANIZATION_MANAGE), async (req, res) => {
  res.json({ success: true, data: await security.get(getContext(req)) });
});
router.patch(
  '/current/security',
  requireOrganization,
  requirePermission(PERMISSIONS.ORGANIZATION_MANAGE),
  validateBody(updateSecuritySchema),
  async (req, res) => {
    res.json({ success: true, data: await security.update(req.body, getContext(req)) });
  },
);
router.post('/current/security/require-password-change', requireOrganization, requirePermission(PERMISSIONS.ORGANIZATION_MANAGE), async (req, res) => {
  res.json({ success: true, data: await security.requirePasswordChange(getContext(req)) });
});

export default router;
