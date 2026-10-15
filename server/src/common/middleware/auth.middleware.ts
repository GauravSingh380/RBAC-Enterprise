import type { RequestHandler } from 'express';
import { ForbiddenException, UnauthorizedException } from '../exceptions/http.exception.js';
import { getLogContext } from '../logger/context.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { rbacService } from '../../modules/rbac/rbac.service.js';

/**
 * Verifies the Bearer access token and loads the (global) account on every request,
 * so a disabled account is locked out immediately. Organization access is checked
 * separately by requireOrganization.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedException('Authentication required');
  }

  const userId = verifyAccessToken(header.slice(7));
  const user = await rbacService.getAuthUser(userId);
  if (!user) {
    throw new UnauthorizedException('Account is inactive or no longer exists');
  }

  // A new password is required (the organization's rules changed, or an admin asked):
  // only the account endpoints work until it is set (/api/auth/me, /change-password, /logout, ...).
  if (user.passwordChangeRequired && !req.originalUrl.startsWith('/api/auth/')) {
    throw new ForbiddenException('Please choose a new password to continue').withCode('PASSWORD_CHANGE_REQUIRED');
  }

  req.user = user;
  const logCtx = getLogContext();
  if (logCtx) logCtx.userId = user.id; // every later log line of this request shows the user
  next();
};
