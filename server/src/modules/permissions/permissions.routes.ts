// Permissions are defined in database/schema.sql (master data) and are read-only through the API.
import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants/rbac.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requirePermission } from '../../common/middleware/permission.middleware.js';
import { requireOrganization } from '../../common/middleware/tenant.middleware.js';
import { PermissionsController } from './permissions.controller.js';
import { PermissionsService } from './permissions.service.js';

const permissionsController = new PermissionsController(new PermissionsService());

const router = Router();

router.get('/', authenticate, requireOrganization, requirePermission(PERMISSIONS.ROLES_READ), permissionsController.findAll);

export default router;
