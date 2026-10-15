// Pure grouping of "my" items by due date (unit-tested; no UI imports).
import type { WorkItemSummary } from '../../types/projects'

export interface DueGroup {
  key: 'overdue' | 'today' | 'week' | 'later'
  title: string
  danger?: boolean
  items: WorkItemSummary[]
}

/** today / in7 = YYYY-MM-DD; "this week" = the next 6 days after today. */
export function groupByDue(items: WorkItemSummary[], today: string, in7: string): DueGroup[] {
  return [
    { key: 'overdue', title: 'Overdue', danger: true, items: items.filter((i) => i.dueDate && i.dueDate < today) },
    { key: 'today', title: 'Due today', items: items.filter((i) => i.dueDate === today) },
    { key: 'week', title: 'This week', items: items.filter((i) => i.dueDate && i.dueDate > today && i.dueDate <= in7) },
    { key: 'later', title: 'Later / no due date', items: items.filter((i) => !i.dueDate || i.dueDate > in7) },
  ]
}
