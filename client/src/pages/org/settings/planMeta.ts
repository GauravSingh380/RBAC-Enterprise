// Plan usage → display rows, and session-rule choices (pure helpers, unit tested)
import type { LimitKind, PlanUsage } from '../../../types'

const LABELS: Record<LimitKind, string> = { members: 'Members', guests: 'Guests', projects: 'Active projects' }

export interface UsageRow {
  kind: LimitKind
  label: string
  /** "7 of 10" or "7 · unlimited" */
  text: string
  /** null when unlimited */
  percent: number | null
  full: boolean
  hint: string | null
}

export function usageRows(usage: PlanUsage): UsageRow[] {
  return (['members', 'guests', 'projects'] as LimitKind[]).map((kind) => {
    const used = usage.used[kind]
    const max = usage.plan.limits[kind]
    const pending = kind === 'projects' ? 0 : usage.pendingInvitations[kind]
    return {
      kind,
      label: LABELS[kind],
      text: max === null ? `${used} · unlimited` : `${used} of ${max}`,
      percent: max === null ? null : max === 0 ? 100 : Math.min(100, Math.round((used / max) * 100)),
      full: max !== null && used >= max,
      hint: pending > 0 ? `${pending} pending invitation${pending === 1 ? '' : 's'} included` : null,
    }
  })
}

/** Choices for "sign out after inactivity" (minutes) and "maximum session length" (hours); 0 = off (the API uses null) */
export const IDLE_CHOICES: { value: number; label: string }[] = [
  { value: 0, label: 'Never' },
  { value: 30, label: 'After 30 minutes' },
  { value: 60, label: 'After 1 hour' },
  { value: 240, label: 'After 4 hours' },
  { value: 480, label: 'After 8 hours' },
  { value: 1440, label: 'After 24 hours' },
]

export const MAX_SESSION_CHOICES: { value: number; label: string }[] = [
  { value: 0, label: 'No limit' },
  { value: 8, label: 'Every 8 hours' },
  { value: 12, label: 'Every 12 hours' },
  { value: 24, label: 'Every day' },
  { value: 72, label: 'Every 3 days' },
  { value: 168, label: 'Every week' },
]

/** Keeps a value set elsewhere (e.g. through the API) selectable: adds it to the choices if it isn't one. */
export function withCurrent(choices: { value: number; label: string }[], current: number | null, unit: 'minutes' | 'hours') {
  const v = current ?? 0
  return choices.some((c) => c.value === v) ? choices : [...choices, { value: v, label: `${v} ${unit}` }]
}

/** API (null = off) ⇄ form (0 = off) */
export const sessionToForm = <T extends { sessionIdleMinutes: number | null; sessionMaxHours: number | null }>(p: T) => ({
  ...p,
  sessionIdleMinutes: p.sessionIdleMinutes ?? 0,
  sessionMaxHours: p.sessionMaxHours ?? 0,
})
export const sessionFromForm = <T extends { sessionIdleMinutes: number | null; sessionMaxHours: number | null }>(p: T) => ({
  ...p,
  sessionIdleMinutes: p.sessionIdleMinutes || null,
  sessionMaxHours: p.sessionMaxHours || null,
})
