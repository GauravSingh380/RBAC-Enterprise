import { api } from '../lib/api'
import type { AuthSession, InvitationPreview, PasswordPolicy, Profile } from '../types'

export interface RegisterInput {
  name: string
  email: string
  password: string
  /** Create a new organization... */
  organizationName?: string
  /** ...or join one through an invitation link */
  invitationToken?: string
}

export const authService = {
  login: (data: { email: string; password: string }) => api.post<AuthSession>('/auth/login', data),
  register: (data: RegisterInput) => api.post<AuthSession>('/auth/register', data),
  logout: () => api.post<void>('/auth/logout'),
  logoutAll: () => api.post<void>('/auth/logout-all'),
  me: () => api.get<Profile>('/auth/me'),
  passwordPolicy: () => api.get<PasswordPolicy>('/auth/password-policy'),
  updateProfile: (name: string) => api.patch<Profile>('/auth/me', { name }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<void>('/auth/change-password', { currentPassword, newPassword }),
  forgotPassword: (email: string) => api.post<{ message: string }>('/auth/forgot-password', { email }),
  checkResetToken: (token: string) => api.get<{ valid: boolean; email?: string }>(`/auth/reset-password/${token}`),
  resetPassword: (token: string, password: string) => api.post<void>('/auth/reset-password', { token, password }),
  switchOrganization: (organizationId: number) => api.post<Profile>('/auth/switch-organization', { organizationId }),
  /** Self-serve: create another organization (the caller becomes its owner). */
  createOrganization: (name: string) => api.post<Profile>('/organizations', { name }),

  previewInvitation: (token: string) => api.get<InvitationPreview>(`/invitations/token/${token}`),
  acceptInvitation: (token: string) => api.post<Profile>(`/invitations/token/${token}/accept`),
}
