import type { AuthUser } from '../../common/types/auth.types.js';

export interface MenuNode {
  id: number;
  key: string;
  label: string;
  path: string | null;
  icon: string | null;
  scope: 'organization' | 'platform';
  children: MenuNode[];
}

/** An organization the user belongs to (for the organization switcher). */
export interface OrganizationSummary {
  id: number;
  name: string;
  slug: string;
  roles: string[];
}

/** What the client receives after login / refresh / GET /auth/me / switching organization. */
export interface Profile extends AuthUser {
  organizations: OrganizationSummary[];
  /** The active organization (null = user has no organization yet -> onboarding). */
  organization: { id: number; name: string; slug: string; plan: string } | null;
  /** Roles / permissions in the ACTIVE organization. */
  roles: string[];
  permissions: string[];
  isOwner: boolean;
  /** guest in the active organization: only their projects */
  isGuest: boolean;
  menus: MenuNode[];
}
