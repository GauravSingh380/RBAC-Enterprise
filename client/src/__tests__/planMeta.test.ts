import { describe, expect, it } from 'vitest'
import { sessionFromForm, sessionToForm, usageRows, withCurrent, IDLE_CHOICES } from '../pages/org/settings/planMeta'
import { describePasswordPolicy } from '../lib/validation'

describe('plan usage rows', () => {
  it('shows used / limit, unlimited, full and pending invitations', () => {
    const rows = usageRows({
      plan: { key: 'free', name: 'Free', limits: { members: 10, guests: 0, projects: null } },
      used: { members: 10, guests: 0, projects: 7 },
      pendingInvitations: { members: 2, guests: 0 },
    })
    expect(rows[0]).toMatchObject({ kind: 'members', text: '10 of 10', percent: 100, full: true, hint: '2 pending invitations included' })
    expect(rows[1]).toMatchObject({ kind: 'guests', text: '0 of 0', percent: 100, full: true, hint: null })
    expect(rows[2]).toMatchObject({ kind: 'projects', text: '7 · unlimited', percent: null, full: false })
  })
})

describe('security form helpers', () => {
  it('maps "off" between the API (null) and the select (0)', () => {
    const api = { minLength: 8, requireSymbol: false, sessionIdleMinutes: null, sessionMaxHours: 12 }
    expect(sessionToForm(api)).toMatchObject({ sessionIdleMinutes: 0, sessionMaxHours: 12 })
    expect(sessionFromForm(sessionToForm(api))).toEqual(api)
    expect(withCurrent(IDLE_CHOICES, 90, 'minutes').at(-1)).toEqual({ value: 90, label: '90 minutes' })
    expect(withCurrent(IDLE_CHOICES, null, 'minutes')).toBe(IDLE_CHOICES)
  })

  it('describes the password rules', () => {
    expect(describePasswordPolicy({ minLength: 12, requireSymbol: true })).toBe('At least 12 characters, with a letter, a number and a symbol.')
  })
})
