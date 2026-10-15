import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants/rbac.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requirePermission } from '../../common/middleware/permission.middleware.js';
import { requireOrganization } from '../../common/middleware/tenant.middleware.js';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { RolesController } from './roles.controller.js';
import { createRoleSchema, setRolePermissionsSchema, updateRoleSchema } from './roles.dto.js';
import { RolesService } from './roles.service.js';

const rolesController = new RolesController(new RolesService());

const router = Router();

router.use(authenticate, requireOrganization);

router.get('/', requirePermission(PERMISSIONS.ROLES_READ), rolesController.findAll);
router.get('/:id', requirePermission(PERMISSIONS.ROLES_READ), rolesController.findOne);
router.post('/', requirePermission(PERMISSIONS.ROLES_CREATE), validateBody(createRoleSchema), rolesController.create);
router.patch('/:id', requirePermission(PERMISSIONS.ROLES_UPDATE), validateBody(updateRoleSchema), rolesController.update);
router.put('/:id/permissions', requirePermission(PERMISSIONS.ROLES_UPDATE), validateBody(setRolePermissionsSchema), rolesController.setPermissions);
router.delete('/:id', requirePermission(PERMISSIONS.ROLES_DELETE), rolesController.remove);

export default router;
