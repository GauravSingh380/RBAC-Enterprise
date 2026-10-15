/** The authenticated account (global — not tied to an organization). req.user */
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  /** Product owner / platform staff: can manage all organizations from the Platform console. */
  isPlatformAdmin: boolean;
  /** the organization's password rules changed (or an admin asked): choose a new password before anything else */
  passwordChangeRequired: boolean;
}

/**
 * The active organization for this request and what the user may do in it. req.tenant
 * Set by the requireOrganization middleware after verifying membership.
 */
export interface TenantContext {
  organizationId: number;
  name: string;
  slug: string;
  plan: string;
  roles: string[];
  permissions: string[];
  /** Owners implicitly have every organization permission. */
  isOwner: boolean;
  /** Outside collaborator: sees only the projects they are a member of. */
  isGuest: boolean;
}
