import { describe, expect, it } from 'vitest'
import { ALLOWED_PARENTS, formatBytes, isOverdue } from '../pages/projects/shared/itemRules'

describe('work item helpers', () => {
  it('formats file sizes', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('flags overdue items only when not done', () => {
    expect(isOverdue('2000-01-01', 'todo')).toBe(true)
    expect(isOverdue('2000-01-01', 'done')).toBe(false)
    expect(isOverdue('2999-01-01', 'todo')).toBe(false)
    expect(isOverdue(null, 'todo')).toBe(false)
  })

  it('mirrors the server hierarchy rules', () => {
    expect(ALLOWED_PARENTS.subtask).toEqual(['story', 'task', 'bug'])
    expect(ALLOWED_PARENTS.epic).toEqual([])
  })
})
