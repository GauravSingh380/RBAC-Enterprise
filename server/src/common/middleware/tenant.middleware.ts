import type { RequestHandler } from 'express';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '../exceptions/http.exception.js';
import { getLogContext } from '../logger/context.js';
import { getRequestedOrganizationId } from '../utils/request-context.js';
import { rbacService } from '../../modules/rbac/rbac.service.js';

/**
 * TENANT BOUNDARY. Every organization-scoped route runs this after `authenticate`:
 *   1. reads the active organization from the X-Organization-Id header
 *   2. verifies the user is an ACTIVE member of an ACTIVE organization
 *   3. loads the user's roles + permissions for THAT organization into req.tenant
 * Services then use req.tenant.organizationId in every query — never an id from the body/URL.
 */
export const requireOrganization: RequestHandler = async (req, _res, next) => {
  if (!req.user) throw new UnauthorizedException('Authentication required');

  const organizationId = getRequestedOrganizationId(req);
  if (!organizationId) throw new BadRequestException('No organization selected (X-Organization-Id header missing)');

  const tenant = await rbacService.getMembership(req.user.id, organizationId);
  if (!tenant) {
    throw new ForbiddenException('You are not an active member of this organization, or it is suspended');
  }

  req.tenant = tenant;
  const logCtx = getLogContext();
  if (logCtx) logCtx.organizationId = organizationId; // shows "org #N" on every log line
  next();
};
