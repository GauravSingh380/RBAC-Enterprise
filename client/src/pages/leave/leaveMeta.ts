// Pure helpers for the leave pages (no UI imports → unit-testable).
import type { LeaveStatus, Portion } from '../../types/leave'

export const STATUS_TAG: Record<LeaveStatus, string> = { pending: 'processing', approved: 'success', rejected: 'error', cancelled: 'default' }
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const PORTION_LABEL: Record<Portion, string> = { full: 'Full day', am: 'Morning', pm: 'Afternoon' }

const fmt = (iso: string, withYear = false) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' })

/** "Mon, 6 Oct" · "Mon, 6 Oct (morning)" · "Mon, 6 Oct – Fri, 10 Oct" */
export function describeLeaveDates(startDate: string, endDate: string, portion: Portion = 'full'): string {
  if (startDate === endDate) return `${fmt(startDate)}${portion === 'am' ? ' (morning)' : portion === 'pm' ? ' (afternoon)' : ''}`
  return `${fmt(startDate)} – ${fmt(endDate)}`
}

export const pluralDays = (n: number) => `${n} day${n === 1 ? '' : 's'}`

/** Every date (YYYY-MM-DD) of a month; month is 0-based like Date. */
export function monthDates(year: number, month: number): string[] {
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return Array.from({ length: days }, (_, i) => new Date(Date.UTC(year, month, i + 1)).toISOString().slice(0, 10))
}

export const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay()

/** Is `date` inside [start, end]? (ISO strings compare correctly) */
export const covers = (start: string, end: string, date: string) => start <= date && date <= end
