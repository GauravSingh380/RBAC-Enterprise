import type { Request } from 'express';
import { ORGANIZATION_HEADER } from '../constants/rbac.js';
import type { AuthUser, TenantContext } from '../types/auth.types.js';

/** Request info passed from controllers to services (keeps services free of Express). */
export interface RequestContext {
  user: AuthUser | null;
  tenant: TenantContext | null;
  ip: string | null;
  userAgent: string | null;
  /** random id of the browser tab (X-Client-Id) — realtime events tell a tab "this change was yours" */
  clientId?: string | null;
}

export function getContext(req: Request): RequestContext {
  return {
    user: req.user ?? null,
    tenant: req.tenant ?? null,
    ip: req.ip ?? null,
    userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
    clientId: /^[\w-]{1,64}$/.test(req.get('x-client-id') ?? '') ? req.get('x-client-id')! : null,
  };
}

/** Organization id requested by the client (X-Organization-Id header), if any. */
export function getRequestedOrganizationId(req: Request): number | null {
  const id = Number(req.get(ORGANIZATION_HEADER));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** For tenant-scoped services: the active organization (guaranteed by requireOrganization). */
export function tenantOf(ctx: RequestContext): TenantContext {
  if (!ctx.tenant) throw new Error('No active organization — is requireOrganization missing on this route?');
  return ctx.tenant;
}
