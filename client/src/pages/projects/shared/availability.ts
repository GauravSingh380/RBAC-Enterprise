// Who is away when — pure helpers for assignee pickers and due-date warnings (unit-tested).
import type { Availability, AwaySpan } from '../../../types/notifications'

const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** "away 14–15 Jan" · "away 9 Jan (pending)" — the next absence only. */
export function awayLabel(spans: AwaySpan[], today = new Date().toISOString().slice(0, 10)): string | null {
  const next = spans.filter((s) => s.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
  if (!next) return null
  const dates = next.startDate === next.endDate ? short(next.startDate) : `${short(next.startDate)} – ${short(next.endDate)}`
  return `away ${dates}${next.status === 'pending' ? ' (pending)' : ''}`
}

/** Why is this person not working on `date`? (leave, holiday, weekend) — null when they are. */
export function absenceOn(a: Availability | undefined, date: string): string | null {
  if (!a) return null
  const leave = a.away.find((s) => s.startDate <= date && date <= s.endDate)
  if (leave) return leave.status === 'pending' ? 'has pending leave' : leave.portion === 'full' ? 'is on leave' : 'is on leave for half the day'
  const holiday = a.holidays.find((h) => h.date === date)
  if (holiday) return `has a holiday (${holiday.name})`
  if (a.weekendDays.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) return 'does not work that day (weekend)'
  return null
}
