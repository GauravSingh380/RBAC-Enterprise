// Leave & holidays (server/src/modules/leave) and the organization dashboard (modules/dashboard)
import type { Priority, Severity, StatusRef, UserRef, WorkItemSummary } from './projects'

export type Portion = 'full' | 'am' | 'pm'
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface LeaveType {
  id: number
  name: string
  color: string
  isPaid: boolean
  defaultDays: number | null
  allowHalfDay: boolean
  requiresApproval: boolean
  isActive: boolean
  position: number
  requestCount: number
}

export interface LeaveBalance {
  type: { id: number; name: string; color: string; isPaid: boolean; allowHalfDay: boolean; requiresApproval: boolean }
  year: number
  /** null = unlimited */
  entitled: number | null
  carriedOver: number
  used: number
  pending: number
  available: number | null
}

export interface LeaveRequest {
  id: number
  user: UserRef
  type: { id: number; name: string; color: string; isPaid: boolean }
  startDate: string
  endDate: string
  portion: Portion
  days: number
  reason: string | null
  status: LeaveStatus
  decidedBy: UserRef | null
  decidedAt: string | null
  decisionNote: string | null
  createdAt: string
  canCancel: boolean
  canDecide: boolean
}

export interface LeavePreview {
  days: number
  workingDays: number
  skipped: { date: string; reason: string }[]
  balance: { entitled: number; carriedOver: number; used: number; pending: number; available: number; after: number } | null
  teammatesOut: { name: string; startDate: string; endDate: string }[]
}

export interface HolidayCalendar {
  id: number
  name: string
  description: string | null
  weekendDays: number[]
  isDefault: boolean
  holidayCount: number
  memberCount: number
}

export interface Holiday {
  id: number
  date: string
  name: string
  isOptional: boolean
}

export interface TeamCalendar {
  members: { id: number; name: string; calendarId: number | null }[]
  leaves: { id: number; userId: number; type: LeaveRequest['type']; startDate: string; endDate: string; portion: Portion; days: number; status: 'approved' | 'pending' }[]
  calendars: { id: number; name: string; weekendDays: number[]; isDefault: boolean }[]
  holidays: { calendarId: number; date: string; name: string; isOptional: boolean }[]
}

export interface TeamBalanceRow {
  userId: number
  name: string
  leaveTypeId: number
  entitled: number | null
  carriedOver: number
  overridden: boolean
  note: string | null
  used: number
  pending: number
}

// ---------------------------------------------------------------- dashboard

export interface Dashboard {
  myWork: { open: number; inProgress: number; overdue: number; dueThisWeek: number; items: WorkItemSummary[] }
  projects: { id: number; key: string; name: string; color: string | null; open: number; openBugs: number; overdue: number; doneLast7: number }[]
  bugTrend: { week: string; opened: number; closed: number }[]
  leave: {
    out: { userId: number; name: string; startDate: string; endDate: string; portion: Portion; typeName: string; color: string }[]
    upcomingHolidays: { date: string; name: string; isOptional: boolean }[]
    balances: LeaveBalance[]
    myPending: number
    approvalsPending: number | null
  } | null
  unresolvedErrors: number | null
}

// ---------------------------------------------------------------- quality report (project)

export interface QualityReport {
  weeks: number
  bugsPerWeek: { week: string; opened: number; closed: number; openAtEnd: number }[]
  openBugs: number
  ageing: ({ bucket: string } & Record<Severity | 'none', number>)[]
  oldestBugs: { id: number; key: string; number: number; title: string; severity: Severity | null; priority: Priority; ageDays: number; status: StatusRef; assignee: UserRef | null }[]
  flowPerWeek: { week: string; count: number; medianLeadDays: number | null; medianCycleDays: number | null }[]
  cycleDistribution: { bucket: string; count: number }[]
}
