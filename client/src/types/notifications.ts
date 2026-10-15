// Notifications (server/src/modules/notifications) and capacity planning (modules/capacity)
import type { Portion } from './leave'
import type { UserRef } from './projects'

export type NotificationCategory = 'assignments' | 'mentions' | 'watching' | 'qa' | 'leave' | 'errors' | 'reports'
export type EmailMode = 'off' | 'instant' | 'daily'

export interface AppNotification {
  id: number
  category: NotificationCategory
  type: string
  title: string
  body: string | null
  url: string
  count: number
  actor: UserRef | null
  readAt: string | null
  createdAt: string
  updatedAt: string
}

export interface NotificationList {
  items: AppNotification[]
  total: number
  page: number
  limit: number
  unread: number
}

export interface NotificationPreference {
  category: NotificationCategory
  label: string
  description: string
  inApp: boolean
  email: EmailMode
  isDefault: boolean
}

// ---------------------------------------------------------------- capacity

export interface AwaySpan {
  startDate: string
  endDate: string
  portion: Portion
  status: 'approved' | 'pending'
}

export interface PersonCapacity {
  workingDays: number
  holidays: number
  leaveDays: number
  pendingLeaveDays: number
  allocation: number
  availableDays: number
}

export type LoadStatus = 'unknown' | 'idle' | 'ok' | 'high' | 'over'

export interface SprintCapacity {
  sprint: { id: number; name: string; status: string; startDate: string | null; endDate: string | null }
  needsDates: boolean
  range?: { start: string; end: string }
  people?: {
    user: UserRef
    projectRole: string | null
    note: string | null
    capacity: PersonCapacity
    away: AwaySpan[]
    assignedPoints: number
    assignedCount: number
    remainingPoints: number
    expectedPoints: number | null
    load: number | null
    status: LoadStatus
  }[]
  unassigned?: { points: number; count: number; remainingPoints: number }
  totals?: {
    people: number
    workingDays: number
    leaveDays: number
    pendingLeaveDays: number
    availableDays: number
    committedPoints: number
    forecastPoints: number | null
    load: number | null
  }
  history?: { sprints: { id: number; name: string; completedPoints: number; availableDays: number }[]; pointsPerDay: number | null }
}

export interface Availability {
  user: UserRef
  away: AwaySpan[]
  holidays: { date: string; name: string }[]
  weekendDays: number[]
}
