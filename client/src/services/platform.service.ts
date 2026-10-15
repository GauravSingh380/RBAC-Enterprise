// Platform (product owner) console — works across ALL organizations. Platform admins only.
import { api } from '../lib/api'
import type { AuditLog, EmailDetail, EmailSummary, Job, Menu, Paginated, Plan, PlatformOrganization, PlatformStats, PlatformUser, SiteContent } from '../types'

type ListQuery = { page?: number; limit?: number; search?: string }

export type MenuInput = Partial<Omit<Menu, 'id' | 'permission'>>

export const platformService = {
  stats: () => api.get<PlatformStats>('/platform/stats'),

  organizations: (query: ListQuery) => api.get<Paginated<PlatformOrganization>>('/platform/organizations', query),
  updateOrganization: (id: number, data: { status?: 'active' | 'suspended'; plan?: string }) =>
    api.patch<void>(`/platform/organizations/${id}`, data),

  users: (query: ListQuery) => api.get<Paginated<PlatformUser>>('/platform/users', query),
  updateUser: (id: number, data: { isActive?: boolean; isPlatformAdmin?: boolean }) =>
    api.patch<void>(`/platform/users/${id}`, data),

  auditLogs: (query: ListQuery) => api.get<Paginated<AuditLog>>('/platform/audit-logs', query),

  emails: (query: ListQuery & { status?: string }) => api.get<Paginated<EmailSummary>>('/platform/emails', query),
  email: (id: number) => api.get<EmailDetail>(`/platform/emails/${id}`),
  resendEmail: (id: number) => api.post<void>(`/platform/emails/${id}/resend`),

  jobStats: () => api.get<Record<'pending' | 'running' | 'completed' | 'failed', number>>('/platform/jobs/stats'),
  jobs: (query: ListQuery & { status?: string; queue?: string }) => api.get<Paginated<Job>>('/platform/jobs', query),
  retryJob: (id: number) => api.post<void>(`/platform/jobs/${id}/retry`),

  savePublicContent: <T>(key: string, content: T) => api.put<SiteContent<T>>(`/platform/content/${key}`, { content }),
}

export type PlanInput = Omit<Plan, 'organizations' | 'sortOrder'> & { sortOrder?: number }

export const plansService = {
  list: () => api.get<Plan[]>('/platform/plans'),
  create: (data: PlanInput) => api.post<Plan>('/platform/plans', data),
  update: (key: string, data: Partial<Omit<PlanInput, 'key'>>) => api.patch<Plan>(`/platform/plans/${key}`, data),
  remove: (key: string) => api.delete<void>(`/platform/plans/${key}`),
}

export const menusService = {
  list: () => api.get<Menu[]>('/platform/menus'),
  create: (data: MenuInput) => api.post<Menu>('/platform/menus', data),
  update: (id: number, data: MenuInput) => api.patch<Menu>(`/platform/menus/${id}`, data),
  remove: (id: number) => api.delete(`/platform/menus/${id}`),
}

/** Permissions list for the menu editor (organization-scoped endpoint; needs an active organization). */
export { permissionsService } from './organization.service'
