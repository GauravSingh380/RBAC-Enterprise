// People directory, teams (server/src/modules/people) and My Work (modules/my-work)
import type { UserRef, WorkItemSummary } from './projects'

export interface Person {
  id: number
  name: string
  email: string
  jobTitle: string | null
  manager: UserRef | null
  teams: { id: number; name: string; color: string }[]
  roles: string[]
  directReports: number
  awayToday: boolean
  joinedAt: string
}

export interface PersonDetail extends Person {
  reports: { id: number; name: string; jobTitle: string | null }[]
}

export interface Team {
  id: number
  name: string
  description: string | null
  color: string
  lead: UserRef | null
  members: { id: number; name: string; jobTitle: string | null }[]
}

export interface MyWork {
  counts: { assigned: number; overdue: number; dueToday: number; dueThisWeek: number; inProgress: number; qa: number; leave: number; mentions: number }
  assigned: WorkItemSummary[]
  qa: WorkItemSummary[]
  leave: { id: number; user: UserRef; typeName: string; color: string; startDate: string; endDate: string; portion: string; days: number; reason: string | null }[]
  mentions: { id: number; title: string; body: string | null; url: string; updatedAt: string }[]
}
