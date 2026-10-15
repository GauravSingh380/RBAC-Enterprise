// Labels and pure helpers for test management (no UI imports → unit-testable).
import type { CasePriority, CaseStatus, CaseType, ResultStatus, RunSummary, StepResult } from '../../../types/qa'

export const RESULT_LABELS: Record<ResultStatus, string> = {
  untested: 'Untested',
  passed: 'Passed',
  failed: 'Failed',
  blocked: 'Blocked',
  skipped: 'Skipped',
}
/** antd Tag colours — status colours are reserved for status, always shown with the label */
export const RESULT_TAG: Record<ResultStatus, string> = { untested: 'default', passed: 'success', failed: 'error', blocked: 'warning', skipped: 'default' }

export const CASE_PRIORITIES: { value: CasePriority; label: string; color: string }[] = [
  { value: 'critical', label: 'Critical', color: 'red' },
  { value: 'high', label: 'High', color: 'orange' },
  { value: 'medium', label: 'Medium', color: 'blue' },
  { value: 'low', label: 'Low', color: 'default' },
]
export const CASE_TYPES: { value: CaseType; label: string }[] = [
  { value: 'functional', label: 'Functional' },
  { value: 'regression', label: 'Regression' },
  { value: 'smoke', label: 'Smoke' },
  { value: 'integration', label: 'Integration' },
  { value: 'performance', label: 'Performance' },
  { value: 'security', label: 'Security' },
  { value: 'usability', label: 'Usability' },
  { value: 'other', label: 'Other' },
]
export const CASE_STATUSES: { value: CaseStatus; label: string; color: string }[] = [
  { value: 'draft', label: 'Draft', color: 'default' },
  { value: 'ready', label: 'Ready', color: 'green' },
  { value: 'deprecated', label: 'Deprecated', color: 'default' },
]

/** Order of the segments in a run progress bar. */
export const SUMMARY_ORDER = ['passed', 'failed', 'blocked', 'skipped', 'untested'] as const

/** The overall outcome a tester's step results imply (mirrors the server rule). */
export function outcomeFromSteps(stepResults: StepResult[], stepCount: number): ResultStatus | null {
  if (stepResults.includes('failed')) return 'failed'
  if (stepResults.includes('blocked')) return 'blocked'
  if (stepCount > 0 && stepResults.length === stepCount && stepResults.every((s) => s === 'passed')) return 'passed'
  return null
}

/** "12 / 40 executed · 75% pass rate" */
export function describeSummary(s: RunSummary): string {
  const executed = s.total - s.untested
  return `${executed} / ${s.total} executed${s.passRate !== null ? ` · ${s.passRate}% pass rate` : ''}`
}
