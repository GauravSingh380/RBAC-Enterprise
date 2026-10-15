import type { AuthUser, TenantContext } from '../common/types/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      tenant?: TenantContext;
    }
  }
}

export {};
