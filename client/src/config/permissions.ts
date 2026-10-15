// Must match server/src/common/constants/rbac.ts and the master data in schema.sql

/** Role templates every organization gets. */
export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  QA: 'qa',
  DEVELOPER: 'developer',
  MEMBER: 'member',
  /** outside collaborator: only the projects they are invited to (given by a guest invitation) */
  GUEST: 'guest',
} as const

/** Organization-scoped permissions (checked against the ACTIVE organization). */
export const PERMISSIONS = {
  DASHBOARD_VIEW: 'dashboard.view',

  USERS_READ: 'users.read',
  USERS_INVITE: 'users.invite',
  USERS_UPDATE: 'users.update',
  USERS_REMOVE: 'users.remove',
  USERS_ASSIGN_ROLES: 'users.assign_roles',

  ROLES_READ: 'roles.read',
  ROLES_CREATE: 'roles.create',
  ROLES_UPDATE: 'roles.update',
  ROLES_DELETE: 'roles.delete',

  CONTENT_MANAGE: 'content.manage',
  AUDIT_READ: 'audit.read',
  ORGANIZATION_MANAGE: 'organization.manage',

  PROJECTS_CREATE: 'projects.create',
  PROJECTS_MANAGE_ALL: 'projects.manage_all',

  ERRORS_READ: 'errors.read',
  ERRORS_MANAGE: 'errors.manage',

  LEAVE_REQUEST: 'leave.request',
  LEAVE_APPROVE: 'leave.approve',
  LEAVE_MANAGE: 'leave.manage',

  INSIGHTS_VIEW: 'insights.view',

  GUIDE_VIEW: 'guide.view',
  PEOPLE_VIEW: 'people.view',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]
