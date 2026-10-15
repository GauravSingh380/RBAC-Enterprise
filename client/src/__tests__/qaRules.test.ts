import { describe, expect, it } from 'vitest'
import { timeAgo } from '../pages/errors/errorMeta'
import { describeSummary, outcomeFromSteps } from '../pages/projects/tests/qaMeta'
import { detectBrowser, qaState } from '../pages/projects/shared/itemRules'

describe('QA verification state', () => {
  const project = { qaReadyStatusId: 3, qaPassedStatusId: 4, qaFailedStatusId: 5 }
  it('maps statuses to the QA flow', () => {
    expect(qaState(project, 3)).toBe('waiting')
    expect(qaState(project, 4)).toBe('passed')
    expect(qaState(project, 5)).toBe('failed')
    expect(qaState(project, 1)).toBe('other')
  })
  it('is off unless all three statuses are configured', () => {
    expect(qaState({ ...project, qaFailedStatusId: null }, 3)).toBe('none')
  })
})

describe('test execution', () => {
  it('derives the outcome from step results like the server', () => {
    expect(outcomeFromSteps(['passed', 'failed', null], 3)).toBe('failed')
    expect(outcomeFromSteps(['passed', 'blocked'], 2)).toBe('blocked')
    expect(outcomeFromSteps(['passed', 'passed'], 2)).toBe('passed')
    expect(outcomeFromSteps(['passed'], 2)).toBeNull() // not finished
    expect(outcomeFromSteps([], 0)).toBeNull()
  })
  it('summarizes a run', () => {
    expect(describeSummary({ total: 40, untested: 28, passed: 9, failed: 3, blocked: 0, skipped: 0, progress: 30, passRate: 75 })).toBe(
      '12 / 40 executed · 75% pass rate',
    )
    expect(describeSummary({ total: 2, untested: 2, passed: 0, failed: 0, blocked: 0, skipped: 0, progress: 0, passRate: null })).toBe('0 / 2 executed')
  })
})

describe('bug report helpers', () => {
  it('detects browser and OS for the "Use my browser" button', () => {
    expect(detectBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0')).toEqual({ browser: 'Edge 128', os: 'Windows 10/11' })
    expect(detectBrowser('Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0')).toEqual({ browser: 'Firefox 130', os: 'Linux' })
  })
  it('formats relative times', () => {
    const now = Date.parse('2026-10-04T12:00:00Z')
    expect(timeAgo('2026-10-04T11:59:30Z', now)).toBe('just now')
    expect(timeAgo('2026-10-04T11:15:00Z', now)).toBe('45m ago')
    expect(timeAgo('2026-10-01T12:00:00Z', now)).toBe('3d ago')
  })
})
