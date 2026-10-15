// Organization insights (server/src/modules/insights)
import type { UserRef } from './projects'

export type ProjectHealth = 'healthy' | 'at_risk' | 'stale' | 'idle'

export interface InsightsProject {
  id: number
  key: string
  name: string
  color: string | null
  visibility: 'private' | 'organization'
  lead: UserRef | null
  members: number
  open: number
  overdue: number
  openBugs: number
  criticalBugs: number
  createdInPeriod: number
  doneInPeriod: number
  lastActivityAt: string | null
  health: ProjectHealth
  reasons: string[]
}

export interface InsightsWorkload {
  user: UserRef
  open: number
  inProgress: number
  overdue: number
  points: number
  projects: number
  doneInPeriod: number
  lastActiveAt: string | null
  away: { startDate: string; endDate: string } | null
}

export interface Insights {
  days: number
  people: { active: number; deactivated: number; invited: number; joinedInPeriod: number; active7: number; activeInPeriod: number }
  totals: {
    activeProjects: number
    archivedProjects: number
    open: number
    overdue: number
    createdInPeriod: number
    doneInPeriod: number
    atRiskProjects: number
    staleProjects: number
  }
  projects: InsightsProject[]
  trend: { week: string; created: number; done: number }[]
  workload: InsightsWorkload[]
  quality: {
    openBugsBySeverity: { severity: 'critical' | 'major' | 'minor' | 'trivial' | 'none'; count: number }[]
    bugs: { opened: number; closed: number; reopened: number }
    errors: { unresolved: number; newInPeriod: number; regressedInPeriod: number }
    tests: { executed: number; passed: number; failed: number; runsInProgress: number; passRate: number | null }
  }
  leave: {
    outToday: { userId: number; name: string; startDate: string; endDate: string; portion: string; typeName: string; color: string }[]
    outThisWeek: { userId: number; name: string; startDate: string; endDate: string; portion: string; typeName: string; color: string }[]
    pendingApprovals: number
    daysTakenThisYear: { name: string; color: string; days: number }[] | null
  }
}
