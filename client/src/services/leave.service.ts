// Leave requests, balances, team calendar, leave settings — and the organization dashboard.
import { api } from '../lib/api'
import type { Paginated } from '../types'
import type {
  Dashboard,
  Holiday,
  HolidayCalendar,
  LeaveBalance,
  LeavePreview,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  Portion,
  TeamBalanceRow,
  TeamCalendar,
} from '../types/leave'

export interface LeaveInput {
  leaveTypeId: number
  startDate: string
  endDate: string
  portion: Portion
  reason?: string
}

export type LeaveTypeInput = Partial<Omit<LeaveType, 'id' | 'position' | 'requestCount'>>

export const leaveService = {
  types: () => api.get<LeaveType[]>('/leave/types'),
  balances: (year?: number, userId?: number) => api.get<LeaveBalance[]>('/leave/balances', { year, userId }),
  preview: (data: Omit<LeaveInput, 'reason'>) => api.post<LeavePreview>('/leave/requests/preview', data),
  requests: (query: { scope?: 'mine' | 'team'; status?: LeaveStatus | 'all'; year?: number; userId?: number; page?: number; limit?: number }) =>
    api.get<Paginated<LeaveRequest>>('/leave/requests', query),
  create: (data: LeaveInput) => api.post<LeaveRequest>('/leave/requests', data),
  approve: (id: number, note?: string) => api.post<LeaveRequest>(`/leave/requests/${id}/approve`, { note }),
  reject: (id: number, note: string) => api.post<LeaveRequest>(`/leave/requests/${id}/reject`, { note }),
  cancel: (id: number, note?: string) => api.post<LeaveRequest>(`/leave/requests/${id}/cancel`, { note }),
  calendar: (from: string, to: string) => api.get<TeamCalendar>('/leave/calendar', { from, to }),

  // settings (leave.manage)
  allTypes: () => api.get<LeaveType[]>('/leave/settings/types'),
  createType: (data: LeaveTypeInput & { name: string }) => api.post<LeaveType[]>('/leave/settings/types', data),
  updateType: (id: number, data: LeaveTypeInput) => api.patch<LeaveType[]>(`/leave/settings/types/${id}`, data),
  deleteType: (id: number) => api.delete<LeaveType[]>(`/leave/settings/types/${id}`),
  calendars: () => api.get<HolidayCalendar[]>('/leave/settings/calendars'),
  createCalendar: (data: { name: string; description?: string | null; weekendDays: number[]; isDefault?: boolean }) =>
    api.post<HolidayCalendar[]>('/leave/settings/calendars', data),
  updateCalendar: (id: number, data: { name?: string; description?: string | null; weekendDays?: number[]; isDefault?: true }) =>
    api.patch<HolidayCalendar[]>(`/leave/settings/calendars/${id}`, data),
  deleteCalendar: (id: number) => api.delete<HolidayCalendar[]>(`/leave/settings/calendars/${id}`),
  holidays: (calendarId: number, year: number) => api.get<Holiday[]>(`/leave/settings/calendars/${calendarId}/holidays`, { year }),
  addHoliday: (calendarId: number, data: { date: string; name: string; isOptional: boolean }) =>
    api.post<{ added: number }>(`/leave/settings/calendars/${calendarId}/holidays`, data),
  importHolidays: (calendarId: number, text: string) => api.post<{ added: number }>(`/leave/settings/calendars/${calendarId}/holidays/bulk`, { text }),
  deleteHoliday: (calendarId: number, id: number) => api.delete(`/leave/settings/calendars/${calendarId}/holidays/${id}`),
  members: () => api.get<{ id: number; name: string; email: string; calendarId: number | null }[]>('/leave/settings/members'),
  setMemberCalendar: (userId: number, calendarId: number | null) =>
    api.put<{ id: number; name: string; email: string; calendarId: number | null }[]>(`/leave/settings/members/${userId}/calendar`, { calendarId }),
  teamBalances: (year: number) => api.get<TeamBalanceRow[]>('/leave/settings/balances', { year }),
  setBalance: (data: { userId: number; leaveTypeId: number; year: number; entitled: number; carriedOver: number; note?: string | null }) =>
    api.put<TeamBalanceRow[]>('/leave/settings/balances', data),
}

export const dashboardService = {
  get: () => api.get<Dashboard>('/dashboard'),
}
