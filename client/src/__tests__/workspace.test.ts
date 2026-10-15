import { describe, expect, it } from 'vitest'
import { dayInfo, gridRange, itemsByDay, monthGrid, sprintsOn } from '../pages/projects/calendar/calendarMeta'
import { pageTree } from '../pages/projects/docs/docsMeta'
import { describeRepeat } from '../pages/projects/settings/templateMeta'
import type { WorkItemSummary } from '../types/projects'

describe('month grid', () => {
  it('6 weeks, Monday first, marks the month and weekends', () => {
    const weeks = monthGrid(2030, 0) // January 2030 starts on a Tuesday
    expect(weeks).toHaveLength(6)
    expect(weeks[0]![0]).toMatchObject({ date: '2029-12-31', inMonth: false, weekend: false })
    expect(weeks[0]![1]).toMatchObject({ date: '2030-01-01', day: 1, inMonth: true })
    expect(weeks[0]![5]!.weekend).toBe(true)
    expect(gridRange(weeks)).toEqual({ from: '2029-12-31', to: '2030-02-10' })
  })

  it('groups items, finds sprints and who is away', () => {
    const items = [{ id: 1, dueDate: '2030-01-02' }, { id: 2, dueDate: '2030-01-02' }, { id: 3, dueDate: null }] as WorkItemSummary[]
    expect(itemsByDay(items).get('2030-01-02')?.map((i) => i.id)).toEqual([1, 2])
    expect(sprintsOn([{ id: 1, name: 'S1', status: 'active', startDate: '2030-01-01', endDate: '2030-01-14' }], '2030-01-15')).toEqual([])
    const info = dayInfo(
      [
        { user: { id: 1, name: 'Ana' }, away: [{ startDate: '2030-01-02', endDate: '2030-01-03', portion: 'full', status: 'pending' }], holidays: [], weekendDays: [0, 6] },
        { user: { id: 2, name: 'Bo' }, away: [], holidays: [{ date: '2030-01-02', name: 'Holiday' }], weekendDays: [0, 6] },
      ],
      '2030-01-02',
    )
    expect(info).toEqual({ away: [{ user: { id: 1, name: 'Ana' }, pending: true }], holidays: ['Holiday'] })
  })
})

describe('docs tree and templates', () => {
  it('builds the page tree by position, orphans at the top', () => {
    const tree = pageTree([
      { id: 1, parentId: null, title: 'B', position: 2, updatedAt: '', updatedBy: null },
      { id: 2, parentId: null, title: 'A', position: 1, updatedAt: '', updatedBy: null },
      { id: 3, parentId: 2, title: 'Child', position: 1, updatedAt: '', updatedBy: null },
      { id: 4, parentId: 99, title: 'Orphan', position: 9, updatedAt: '', updatedBy: null },
    ])
    expect(tree.map((n) => n.title)).toEqual(['A', 'B', 'Orphan'])
    expect(tree[0]!.children.map((n) => n.title)).toEqual(['Child'])
  })

  it('describes the repeat rule', () => {
    expect(describeRepeat({ repeat: 'weekly', repeatWeekday: 1, repeatMonthDay: null })).toBe('Every Monday')
    expect(describeRepeat({ repeat: 'monthly', repeatWeekday: null, repeatMonthDay: 22 })).toBe('Monthly on the 22nd')
    expect(describeRepeat({ repeat: 'monthly', repeatWeekday: null, repeatMonthDay: 11 })).toBe('Monthly on the 11th')
    expect(describeRepeat({ repeat: 'weekdays', repeatWeekday: null, repeatMonthDay: null })).toBe('Every weekday')
  })
})
