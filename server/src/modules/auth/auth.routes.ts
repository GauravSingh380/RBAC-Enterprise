import { Router } from 'express';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authRateLimiter, passwordResetRateLimiter } from '../../common/middleware/rate-limit.middleware.js';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { AuthController } from './auth.controller.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  switchOrganizationSchema,
  updateProfileSchema,
} from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { db } from '../../database/db.js';
import { accountPolicy } from '../security/security-policy.js';

const authController = new AuthController(new AuthService());

const router = Router();

// Session
router.post('/register', authRateLimiter, validateBody(registerSchema), authController.register);
router.post('/login', authRateLimiter, validateBody(loginSchema), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.post('/logout-all', authenticate, authController.logoutAll);

// Own profile
router.get('/me', authenticate, authController.me);
// the password rules for this account (strictest of its organizations) — shown next to "new password" fields
router.get('/password-policy', authenticate, async (req, res) => {
  const { minLength, requireSymbol } = await accountPolicy(db, req.user!.id);
  res.json({ success: true, data: { minLength, requireSymbol } });
});
router.patch('/me', authenticate, validateBody(updateProfileSchema), authController.updateProfile);
router.post('/switch-organization', authenticate, validateBody(switchOrganizationSchema), authController.switchOrganization);

// Passwords
router.post('/forgot-password', passwordResetRateLimiter, validateBody(forgotPasswordSchema), authController.forgotPassword);
router.get('/reset-password/:token', authRateLimiter, authController.checkResetToken);
router.post('/reset-password', authRateLimiter, validateBody(resetPasswordSchema), authController.resetPassword);
router.post('/change-password', authenticate, authRateLimiter, validateBody(changePasswordSchema), authController.changePassword);

export default router;
