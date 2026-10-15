// /api/dashboard — the organization dashboard (permission dashboard.view)
import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants/rbac.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requirePermission } from '../../common/middleware/permission.middleware.js';
import { requireOrganization } from '../../common/middleware/tenant.middleware.js';
import { getContext } from '../../common/utils/request-context.js';
import { DashboardService } from './dashboard.service.js';

const dashboard = new DashboardService();
const router = Router();

router.get('/', authenticate, requireOrganization, requirePermission(PERMISSIONS.DASHBOARD_VIEW), async (req, res) => {
  res.json({ success: true, data: await dashboard.get(getContext(req)) });
});

export default router;
