// QA: test suites, test cases, test runs (see server/src/modules/qa) and production errors (modules/errors)
import type { SprintRef, StatusCategory, UserRef } from './projects'

export type CasePriority = 'critical' | 'high' | 'medium' | 'low'
export type CaseType = 'functional' | 'regression' | 'smoke' | 'integration' | 'performance' | 'security' | 'usability' | 'other'
export type CaseStatus = 'draft' | 'ready' | 'deprecated'
export type ResultStatus = 'untested' | 'passed' | 'failed' | 'blocked' | 'skipped'
export type StepResult = 'passed' | 'failed' | 'blocked' | null

export interface TestStep {
  action: string
  expected: string
}

export interface TestSuite {
  id: number
  name: string
  description: string | null
  position: number
  caseCount: number
}

export interface TestCase {
  id: number
  number: number
  key: string
  suite: { id: number; name: string } | null
  title: string
  preconditions: string | null
  steps: TestStep[]
  priority: CasePriority
  caseType: CaseType
  status: CaseStatus
  workItem: { id: number; key: string; title: string } | null
  createdBy: UserRef | null
  createdAt: string
  updatedAt: string
  lastResult: { status: ResultStatus; runId: number; runName: string; executedAt: string | null } | null
}

export interface TestCaseDetail extends TestCase {
  history: {
    id: number
    runId: number
    runName: string
    status: ResultStatus
    comment: string | null
    executedAt: string | null
    executedBy: UserRef | null
    bug: { id: number; key: string; title: string } | null
  }[]
}

export interface RunSummary {
  total: number
  untested: number
  passed: number
  failed: number
  blocked: number
  skipped: number
  progress: number
  passRate: number | null
}

export interface TestRun {
  id: number
  name: string
  description: string | null
  environment: string | null
  buildVersion: string | null
  status: 'in_progress' | 'completed'
  sprint: SprintRef | null
  createdBy: UserRef | null
  createdAt: string
  completedAt: string | null
  summary: RunSummary
}

export interface TestResult {
  id: number
  testCaseId: number | null
  caseNumber: number
  caseKey: string
  title: string
  preconditions: string | null
  steps: TestStep[]
  position: number
  status: ResultStatus
  stepResults: StepResult[]
  comment: string | null
  executedAt: string | null
  executedBy: UserRef | null
  suiteName: string | null
  bug: { id: number; key: string; number: number; title: string; status: { name: string; category: StatusCategory; color: string } } | null
}

export interface TestRunDetail extends TestRun {
  results: TestResult[]
}

// ---------------------------------------------------------------- production errors

export type ErrorStatus = 'unresolved' | 'resolved' | 'ignored'

export interface ErrorGroup {
  id: number
  organizationId: number | null
  organizationName: string | null
  source: 'server' | 'client'
  title: string
  culprit: string | null
  status: ErrorStatus
  occurrences: number
  usersAffected: number
  firstSeenAt: string
  lastSeenAt: string
  resolvedAt: string | null
  regressedAt: string | null
  lastRelease: string | null
  bug: { id: number; key: string; title: string; status: { name: string; category: StatusCategory; color: string } } | null
}

export interface ErrorEvent {
  id: number
  occurredAt: string
  requestId: string | null
  user: UserRef | null
  method: string | null
  url: string | null
  message: string
  stack: string | null
  userAgent: string | null
  release: string | null
  context: {
    route?: string
    frame?: string | null
    code?: string
    environment?: string
    queries?: { sql: string; durationMs: number; error?: string }[]
    componentStack?: string
    kind?: string
    page?: string
  }
}

export interface ErrorGroupDetail extends ErrorGroup {
  events: ErrorEvent[]
  daily: { date: string; count: number }[]
}

export interface ErrorList {
  items: ErrorGroup[]
  total: number
  page: number
  limit: number
  counts: Partial<Record<ErrorStatus, number>>
}
