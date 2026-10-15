import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants/rbac.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { createRateLimiter } from '../../common/middleware/rate-limit.middleware.js';
import { requirePermission } from '../../common/middleware/permission.middleware.js';
import { requireOrganization } from '../../common/middleware/tenant.middleware.js';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { InvitationsController } from './invitations.controller.js';
import { createInvitationSchema } from './invitations.dto.js';
import { InvitationsService } from './invitations.service.js';

const invitationsController = new InvitationsController(new InvitationsService());

// Public token lookups are rate-limited against link guessing
const tokenRateLimiter = createRateLimiter(15, 60);

const router = Router();

// --- By link token (the invitee) ---
router.get('/token/:token', tokenRateLimiter, invitationsController.preview);
router.post('/token/:token/accept', tokenRateLimiter, authenticate, invitationsController.accept);

// --- Managing invitations of the active organization ---
router.get('/', authenticate, requireOrganization, requirePermission(PERMISSIONS.USERS_INVITE), invitationsController.findPending);
router.post(
  '/',
  authenticate,
  requireOrganization,
  requirePermission(PERMISSIONS.USERS_INVITE),
  validateBody(createInvitationSchema),
  invitationsController.create,
);
router.delete('/:id', authenticate, requireOrganization, requirePermission(PERMISSIONS.USERS_INVITE), invitationsController.revoke);

export default router;
