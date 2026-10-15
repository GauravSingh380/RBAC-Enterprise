// Notifications of the current user + capacity planning of a sprint / project availability.
import { api } from '../lib/api'
import type { Availability, EmailMode, NotificationCategory, NotificationList, NotificationPreference, SprintCapacity } from '../types/notifications'

export const notificationsService = {
  list: (query: { unread?: boolean; category?: NotificationCategory; page?: number; limit?: number } = {}) =>
    api.get<NotificationList>('/notifications', { ...query, unread: query.unread ? 'true' : undefined }),
  unreadCount: () => api.get<{ unread: number }>('/notifications/unread-count'),
  markRead: (ids: number[]) => api.post<{ unread: number }>('/notifications/read', { ids }),
  markAllRead: () => api.post<{ unread: number }>('/notifications/read', { all: true }),
  markUnread: (id: number) => api.post<{ unread: number }>(`/notifications/${id}/unread`),
  preferences: () => api.get<NotificationPreference[]>('/notifications/preferences'),
  savePreferences: (preferences: { category: NotificationCategory; inApp: boolean; email: EmailMode }[]) =>
    api.put<NotificationPreference[]>('/notifications/preferences', { preferences }),
}

export const capacityService = {
  sprint: (projectRef: string | number, sprintId: number) => api.get<SprintCapacity>(`/projects/${projectRef}/sprints/${sprintId}/capacity`),
  setAllocation: (projectRef: string | number, sprintId: number, userId: number, allocation: number, note?: string | null) =>
    api.put<SprintCapacity>(`/projects/${projectRef}/sprints/${sprintId}/capacity/${userId}`, { allocation, note }),
  availability: (projectRef: string | number, from: string, to: string) => api.get<Availability[]>(`/projects/${projectRef}/availability`, { from, to }),
}
