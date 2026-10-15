// Shapes returned by the API (see server/src/modules/*)

export interface MenuNode {
  id: number
  key: string
  label: string
  path: string | null
  icon: string | null
  scope: 'organization' | 'platform'
  children: MenuNode[]
}

/** An organization the user belongs to (organization switcher). */
export interface OrganizationSummary {
  id: number
  name: string
  slug: string
  roles: string[]
}

export interface ActiveOrganization {
  id: number
  name: string
  slug: string
  plan: string
}

/** The logged-in user + everything needed for multi-tenant RBAC in the UI. */
export interface Profile {
  id: number
  name: string
  email: string
  /** Product owner / platform staff (above all organizations). */
  isPlatformAdmin: boolean
  organizations: OrganizationSummary[]
  /** Active organization — null means the user has none yet (onboarding). */
  organization: ActiveOrganization | null
  /** Roles & permissions in the ACTIVE organization. */
  roles: string[]
  permissions: string[]
  isOwner: boolean
  /** outside collaborator in the active organization: only their projects */
  isGuest: boolean
  /** the organization's password rules changed (or an admin asked): a new password is needed first */
  passwordChangeRequired: boolean
  menus: MenuNode[]
}

export interface AuthSession {
  accessToken: string
  user: Profile
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  limit: number
}

export interface RoleRef {
  id: number
  name: string
  displayName: string
}

/** A user as seen inside the active organization. */
export interface Member {
  id: number
  name: string
  email: string
  isActive: boolean
  joinedAt: string
  lastLoginAt: string | null
  roles: RoleRef[]
  isGuest: boolean
  /** guests: the projects they are in */
  guestProjects: { id: number; key: string; name: string; role: string }[] | null
}

export interface Invitation {
  id: number
  email: string
  role: RoleRef
  /** guest invitation: the project they join */
  project: { id: number; key: string; name: string; role: 'member' | 'viewer' } | null
  invitedBy: { id: number; name: string } | null
  expiresAt: string
  createdAt: string
}

export interface PasswordPolicy {
  minLength: number
  requireSymbol: boolean
}

export interface SecurityPolicy extends PasswordPolicy {
  sessionIdleMinutes: number | null
  sessionMaxHours: number | null
}

export type LimitKind = 'members' | 'guests' | 'projects'

export interface PlanUsage {
  plan: { key: string; name: string; limits: Record<LimitKind, number | null> }
  used: Record<LimitKind, number>
  pendingInvitations: { members: number; guests: number }
}

export interface Plan {
  key: string
  name: string
  description: string | null
  maxMembers: number | null
  maxProjects: number | null
  maxGuests: number | null
  sortOrder: number
  organizations: number
}

export interface InvitationPreview {
  organizationName: string
  email: string
  roleName: string
  /** guest invitation: the project */
  projectName: string | null
  passwordPolicy: PasswordPolicy
  invitedBy: string | null
  expiresAt: string
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
}

export interface Organization {
  id: number
  name: string
  slug: string
  plan: string
  status: string
  memberCount: number
  createdAt: string
}

export interface Role {
  id: number
  name: string
  displayName: string
  description: string | null
  isSystem: boolean
  userCount: number
  permissionIds: number[]
}

export interface Permission {
  id: number
  name: string
  module: string
  description: string | null
}

export interface Menu {
  id: number
  key: string
  label: string
  path: string | null
  icon: string | null
  scope: 'organization' | 'platform'
  parentId: number | null
  permissionId: number | null
  permission: string | null
  sortOrder: number
  isActive: boolean
}

export interface SiteContent<T = Record<string, unknown>> {
  key: string
  content: Partial<T>
  updatedAt: string | null
}

export interface HomeContent {
  title: string
  subtitle: string
  features: { title: string; description: string }[]
}

export interface DashboardContent {
  announcement: string
}

export interface AuditLog {
  id: number
  action: string
  entity: string | null
  entityId: string | null
  details: Record<string, unknown> | null
  ipAddress: string | null
  createdAt: string
  user: { id: number; name: string; email: string } | null
  organization: { id: number; name: string } | null
}

// ---------------------------------------------------------------- platform

export interface PlatformStats {
  organizations: number
  activeOrganizations: number
  users: number
  activeUsers30d: number
  newOrganizations30d: number
  byPlan: Record<string, number>
}

export interface PlatformOrganization {
  id: number
  name: string
  slug: string
  status: 'active' | 'suspended'
  plan: string
  /** active memberships, guests included */
  memberCount: number
  guestCount: number
  projectCount: number
  /** limits of the organization's plan (null = unlimited) */
  limits: { members: number | null; guests: number | null; projects: number | null }
  owners: string[]
  createdAt: string
}

export interface PlatformUser {
  id: number
  name: string
  email: string
  isActive: boolean
  isPlatformAdmin: boolean
  lastLoginAt: string | null
  createdAt: string
  organizations: { id: number; name: string; roles: string[] }[]
}

// ---------------------------------------------------------------- platform operations

export interface EmailSummary {
  id: number
  to: string
  subject: string
  template: string
  status: 'queued' | 'sent' | 'failed'
  driver: string | null
  previewUrl: string | null
  error: string | null
  attempts: number
  organization: string | null
  createdAt: string
  sentAt: string | null
}

export interface EmailDetail extends Omit<EmailSummary, 'organization'> {
  html: string | null
  text: string | null
}

export interface Job {
  id: number
  queue: string
  payload: Record<string, unknown>
  status: 'pending' | 'running' | 'completed' | 'failed'
  attempts: number
  maxAttempts: number
  runAt: string
  lastError: string | null
  organizationId: number | null
  lockedBy: string | null
  createdAt: string
  completedAt: string | null
}
