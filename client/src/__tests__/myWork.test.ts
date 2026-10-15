import { describe, expect, it } from 'vitest'
import { groupByDue } from '../pages/my-work/myWorkMeta'
import type { WorkItemSummary } from '../types/projects'

const item = (id: number, dueDate: string | null) => ({ id, dueDate }) as WorkItemSummary

describe('my work grouping', () => {
  it('overdue / today / this week / later', () => {
    const groups = groupByDue([item(1, '2030-01-01'), item(2, '2030-01-07'), item(3, '2030-01-10'), item(4, '2030-01-20'), item(5, null)], '2030-01-07', '2030-01-13')
    expect(Object.fromEntries(groups.map((g) => [g.key, g.items.map((i) => i.id)]))).toEqual({ overdue: [1], today: [2], week: [3], later: [4, 5] })
  })
})
