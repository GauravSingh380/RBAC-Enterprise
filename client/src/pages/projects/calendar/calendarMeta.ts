// Month grid helpers (pure, unit tested). Weeks start on Monday; days are 'YYYY-MM-DD'.
import type { Availability } from '../../../types/notifications'
import type { WorkItemSummary } from '../../../types/projects'
import type { CalendarSprint } from '../../../types/workspace'

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

export interface GridDay {
  date: string
  day: number
  inMonth: boolean
  weekend: boolean
}

/** 6 rows × 7 days covering the month (month: 0–11). */
export function monthGrid(year: number, month: number): GridDay[][] {
  const first = new Date(Date.UTC(year, month, 1))
  const offset = (first.getUTCDay() + 6) % 7 // Monday = 0
  const start = new Date(Date.UTC(year, month, 1 - offset))
  const weeks: GridDay[][] = []
  for (let w = 0; w < 6; w++) {
    const week: GridDay[] = []
    for (let d = 0; d < 7; d++) {
      const day = new Date(start)
      day.setUTCDate(start.getUTCDate() + w * 7 + d)
      week.push({ date: iso(day), day: day.getUTCDate(), inMonth: day.getUTCMonth() === month, weekend: d >= 5 })
    }
    weeks.push(week)
  }
  return weeks
}

export const gridRange = (weeks: GridDay[][]) => ({ from: weeks[0]![0]!.date, to: weeks[weeks.length - 1]![6]!.date })

export function itemsByDay(items: WorkItemSummary[]): Map<string, WorkItemSummary[]> {
  const map = new Map<string, WorkItemSummary[]>()
  for (const i of items) {
    if (!i.dueDate) continue
    map.set(i.dueDate, [...(map.get(i.dueDate) ?? []), i])
  }
  return map
}

export const sprintsOn = (sprints: CalendarSprint[], date: string) => sprints.filter((s) => s.startDate <= date && date <= s.endDate)

/** Who is away on a day (approved or pending) and which holidays apply (from any of the people's calendars). */
export function dayInfo(availability: Availability[], date: string) {
  const away = availability
    .filter((a) => a.away.some((s) => s.startDate <= date && date <= s.endDate))
    .map((a) => ({ user: a.user, pending: a.away.some((s) => s.startDate <= date && date <= s.endDate && s.status === 'pending') }))
  const holidays = [...new Set(availability.flatMap((a) => a.holidays.filter((h) => h.date === date).map((h) => h.name)))]
  return { away, holidays }
}
