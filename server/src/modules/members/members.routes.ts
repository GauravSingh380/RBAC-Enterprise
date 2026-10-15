// Members of the active organization (tenant-scoped).
import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants/rbac.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requirePermission } from '../../common/middleware/permission.middleware.js';
import { requireOrganization } from '../../common/middleware/tenant.middleware.js';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { MembersController } from './members.controller.js';
import { makeMemberSchema, setMemberRolesSchema, updateMemberSchema } from './members.dto.js';
import { MembersService } from './members.service.js';

const membersController = new MembersController(new MembersService());

const router = Router();

router.use(authenticate, requireOrganization);

router.get('/', requirePermission(PERMISSIONS.USERS_READ), membersController.findAll);
router.get('/:id', requirePermission(PERMISSIONS.USERS_READ), membersController.findOne);
router.patch('/:id', requirePermission(PERMISSIONS.USERS_UPDATE), validateBody(updateMemberSchema), membersController.setStatus);
router.put('/:id/roles', requirePermission(PERMISSIONS.USERS_ASSIGN_ROLES), validateBody(setMemberRolesSchema), membersController.setRoles);
router.post('/:id/make-member', requirePermission(PERMISSIONS.USERS_ASSIGN_ROLES), validateBody(makeMemberSchema), membersController.makeMember);
router.delete('/:id', requirePermission(PERMISSIONS.USERS_REMOVE), membersController.remove);

export default router;
