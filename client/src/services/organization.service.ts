// API calls scoped to the ACTIVE organization.
// The X-Organization-Id header is added automatically by the http client.
import { api } from '../lib/api'
import type { AuditLog, Invitation, Member, Organization, Paginated, Permission, PlanUsage, Role, SecurityPolicy, SiteContent } from '../types'

type ListQuery = { page?: number; limit?: number; search?: string }

export const organizationService = {
  current: () => api.get<Organization>('/organizations/current'),
  update: (name: string) => api.patch<Organization>('/organizations/current', { name }),
  leave: () => api.post<void>('/organizations/current/leave'),
  /** plan + what is used (members, guests, active projects) */
  usage: () => api.get<PlanUsage>('/organizations/current/usage'),
  /** password & session rules (organization.manage) */
  security: () => api.get<SecurityPolicy>('/organizations/current/security'),
  updateSecurity: (data: Partial<SecurityPolicy>) => api.patch<SecurityPolicy>('/organizations/current/security', data),
  requirePasswordChange: () => api.post<{ affected: number }>('/organizations/current/security/require-password-change'),
}

export const membersService = {
  list: (query: ListQuery) => api.get<Paginated<Member>>('/members', query),
  setStatus: (userId: number, isActive: boolean) => api.patch<Member>(`/members/${userId}`, { isActive }),
  setRoles: (userId: number, roleIds: number[]) => api.put<Member>(`/members/${userId}/roles`, { roleIds }),
  /** guest → full member (uses a member seat) */
  makeMember: (userId: number, roleIds: number[]) => api.post<Member>(`/members/${userId}/make-member`, { roleIds }),
  remove: (userId: number) => api.delete(`/members/${userId}`),
}

export const invitationsService = {
  listPending: () => api.get<Invitation[]>('/invitations'),
  /** member: { email, roleId } · guest: { email, projectId, projectRole } */
  create: (data: { email: string; roleId?: number; projectId?: number; projectRole?: 'member' | 'viewer' }) =>
    api.post<{ invitation: Invitation; inviteUrl: string }>('/invitations', data),
  revoke: (id: number) => api.delete(`/invitations/${id}`),
}

export const rolesService = {
  list: () => api.get<Role[]>('/roles'),
  create: (data: { name: string; displayName: string; description?: string; permissionIds?: number[] }) =>
    api.post<Role>('/roles', data),
  update: (id: number, data: { displayName?: string; description?: string }) => api.patch<Role>(`/roles/${id}`, data),
  setPermissions: (id: number, permissionIds: number[]) => api.put<Role>(`/roles/${id}/permissions`, { permissionIds }),
  remove: (id: number) => api.delete(`/roles/${id}`),
}

export const permissionsService = {
  list: () => api.get<Permission[]>('/permissions'),
}

export const contentService = {
  /** Public content (home page) — no login needed. */
  getPublic: <T>(key: string) => api.get<SiteContent<T>>(`/content/public/${key}`),
  /** Content of the active organization. */
  get: <T>(key: string) => api.get<SiteContent<T>>(`/content/${key}`),
  save: <T>(key: string, content: T) => api.put<SiteContent<T>>(`/content/${key}`, { content }),
}

export const auditLogsService = {
  list: (query: ListQuery) => api.get<Paginated<AuditLog>>('/audit-logs', query),
}
