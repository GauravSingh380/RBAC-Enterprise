import type { RequestHandler } from 'express';
import type { Permission } from '../constants/rbac.js';
import { ForbiddenException, UnauthorizedException } from '../exceptions/http.exception.js';

/**
 * Allows the request only if the user has ALL the given permissions in the ACTIVE organization.
 * Organization owners always pass. Must run after `authenticate` + `requireOrganization`.
 *
 *   router.use(authenticate, requireOrganization)
 *   router.get('/', requirePermission(PERMISSIONS.USERS_READ), handler)
 */
export const requirePermission =
  (...required: Permission[]): RequestHandler =>
  (req, _res, next) => {
    const tenant = req.tenant;
    if (!req.user) throw new UnauthorizedException('Authentication required');
    if (!tenant) throw new Error('requirePermission used without requireOrganization');

    if (tenant.isOwner || required.every((p) => tenant.permissions.includes(p))) {
      next();
      return;
    }
    throw new ForbiddenException();
  };

/** Platform (product owner) routes. Must run after `authenticate`. */
export const requirePlatformAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) throw new UnauthorizedException('Authentication required');
  if (!req.user.isPlatformAdmin) throw new ForbiddenException('Platform administrator access required');
  next();
};
