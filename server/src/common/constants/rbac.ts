// Must stay in sync with the master data in database/schema.sql (section 4).

/** Role templates (table role_templates) copied into every organization. */
export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  QA: 'qa',
  DEVELOPER: 'developer',
  MEMBER: 'member',
  GUEST: 'guest',
} as const;

/** Role given to someone who joins an organization without a specific role. */
export const DEFAULT_ROLE = ROLES.MEMBER;

/** Organization-scoped permissions (what a member may do inside the ACTIVE organization). */
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
  /** Act as admin of every project in the organization, including private ones. */
  PROJECTS_MANAGE_ALL: 'projects.manage_all',

  /** Production error inbox: view (stack traces, requests, SQL) · resolve / ignore / turn into bugs */
  ERRORS_READ: 'errors.read',
  ERRORS_MANAGE: 'errors.manage',

  /** Leave: request + team calendar · approve / reject · types, allowances and holiday calendars */
  LEAVE_REQUEST: 'leave.request',
  LEAVE_APPROVE: 'leave.approve',
  LEAVE_MANAGE: 'leave.manage',

  /** Organization insights: every project, people, workload, quality (+ the weekly report email) */
  INSIGHTS_VIEW: 'insights.view',
  GUIDE_VIEW: 'guide.view',
  PEOPLE_VIEW: 'people.view',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Header the client sends with every request to say which organization it is working in. */
export const ORGANIZATION_HEADER = 'x-organization-id';
