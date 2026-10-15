import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants/rbac.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requirePermission } from '../../common/middleware/permission.middleware.js';
import { requireOrganization } from '../../common/middleware/tenant.middleware.js';
import { AuditLogsController } from './audit-logs.controller.js';
import { AuditLogsService } from './audit-logs.service.js';

export const auditLogsController = new AuditLogsController(new AuditLogsService());

const router = Router();

// Organization audit log (the platform-wide log is under /api/platform/audit-logs)
router.get(
  '/',
  authenticate,
  requireOrganization,
  requirePermission(PERMISSIONS.AUDIT_READ),
  auditLogsController.findForOrganization,
);

export default router;
