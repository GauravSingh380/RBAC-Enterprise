// QA API: test suites / cases / runs of a project, and the production error inbox.
import { api } from '../lib/api'
import type { Paginated } from '../types'
import type { Priority, Severity, WorkItemDetail } from '../types/projects'
import type {
  CasePriority,
  CaseStatus,
  CaseType,
  ErrorGroup,
  ErrorGroupDetail,
  ErrorList,
  ErrorStatus,
  ResultStatus,
  StepResult,
  TestCase,
  TestCaseDetail,
  TestResult,
  TestRun,
  TestRunDetail,
  TestStep,
  TestSuite,
} from '../types/qa'

type Ref = string | number

export interface TestCaseInput {
  title?: string
  suiteId?: number | null
  preconditions?: string | null
  steps?: TestStep[]
  priority?: CasePriority
  caseType?: CaseType
  status?: CaseStatus
  workItemRef?: string | number | null
}

export interface BugDefaults {
  title?: string
  priority?: Priority
  severity?: Severity
  assigneeId?: number | null
}

export const qaService = {
  suites: (p: Ref) => api.get<TestSuite[]>(`/projects/${p}/test-suites`),
  createSuite: (p: Ref, data: { name: string; description?: string | null }) => api.post<TestSuite[]>(`/projects/${p}/test-suites`, data),
  updateSuite: (p: Ref, id: number, data: { name?: string; description?: string | null }) => api.patch<TestSuite[]>(`/projects/${p}/test-suites/${id}`, data),
  deleteSuite: (p: Ref, id: number) => api.delete<TestSuite[]>(`/projects/${p}/test-suites/${id}`),

  cases: (p: Ref, query: { suiteId?: number | 'none'; status?: CaseStatus; search?: string; page?: number; limit?: number; workItemId?: number }) =>
    api.get<Paginated<TestCase>>(`/projects/${p}/test-cases`, query),
  getCase: (p: Ref, number: number) => api.get<TestCaseDetail>(`/projects/${p}/test-cases/${number}`),
  createCase: (p: Ref, data: TestCaseInput & { title: string }) => api.post<TestCase>(`/projects/${p}/test-cases`, data),
  updateCase: (p: Ref, number: number, data: TestCaseInput) => api.patch<TestCase>(`/projects/${p}/test-cases/${number}`, data),
  deleteCase: (p: Ref, number: number) => api.delete(`/projects/${p}/test-cases/${number}`),

  runs: (p: Ref, status: 'in_progress' | 'completed' | 'all' = 'all') => api.get<TestRun[]>(`/projects/${p}/test-runs`, { status }),
  getRun: (p: Ref, id: number) => api.get<TestRunDetail>(`/projects/${p}/test-runs/${id}`),
  createRun: (
    p: Ref,
    data: {
      name: string
      description?: string | null
      sprintId?: number | null
      environment?: string | null
      buildVersion?: string | null
      scope: { all?: boolean; suiteIds?: number[]; caseIds?: number[] }
    },
  ) => api.post<TestRunDetail>(`/projects/${p}/test-runs`, data),
  updateRun: (p: Ref, id: number, data: { name?: string; description?: string | null; environment?: string | null; buildVersion?: string | null }) =>
    api.patch<TestRunDetail>(`/projects/${p}/test-runs/${id}`, data),
  completeRun: (p: Ref, id: number) => api.post<TestRunDetail>(`/projects/${p}/test-runs/${id}/complete`),
  reopenRun: (p: Ref, id: number) => api.post<TestRunDetail>(`/projects/${p}/test-runs/${id}/reopen`),
  deleteRun: (p: Ref, id: number) => api.delete(`/projects/${p}/test-runs/${id}`),
  updateResult: (p: Ref, runId: number, resultId: number, data: { status?: ResultStatus; stepResults?: StepResult[]; comment?: string | null }) =>
    api.patch<TestResult>(`/projects/${p}/test-runs/${runId}/results/${resultId}`, data),
  fileBug: (p: Ref, runId: number, resultId: number, data: BugDefaults) =>
    api.post<WorkItemDetail>(`/projects/${p}/test-runs/${runId}/results/${resultId}/bug`, data),
}

type ErrorQuery = { status?: ErrorStatus | 'all'; source?: 'server' | 'client'; search?: string; sort?: string; page?: number; limit?: number }

/** `platform` = all organizations (platform admins); otherwise the active organization. */
export const errorsService = {
  list: (query: ErrorQuery, platform = false) => api.get<ErrorList>(platform ? '/platform/errors' : '/errors', query),
  get: (id: number, platform = false) => api.get<ErrorGroupDetail>(`${platform ? '/platform/errors' : '/errors'}/${id}`),
  setStatus: (id: number, status: ErrorStatus, platform = false) => api.patch<ErrorGroup>(`${platform ? '/platform/errors' : '/errors'}/${id}`, { status }),
  createBug: (id: number, data: BugDefaults & { projectRef: string | number }) =>
    api.post<{ group: ErrorGroup; bug: WorkItemDetail }>(`/errors/${id}/bug`, data),
  linkBug: (id: number, itemRef: string) => api.post<ErrorGroup>(`/errors/${id}/link`, { itemRef }),
  /** development only — produces a real server error to try the inbox */
  simulate: (kind: 'generic' | 'type') => api.post(`/errors/simulate/${kind}`),
}
