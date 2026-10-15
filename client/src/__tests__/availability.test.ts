import { describe, expect, it } from 'vitest'
import { absenceOn, awayLabel } from '../pages/projects/shared/availability'
import type { Availability } from '../types/notifications'

const dev: Availability = {
  user: { id: 1, name: 'Dev' },
  away: [
    { startDate: '2030-01-14', endDate: '2030-01-15', portion: 'full', status: 'approved' },
    { startDate: '2030-02-04', endDate: '2030-02-04', portion: 'am', status: 'pending' },
  ],
  holidays: [{ date: '2030-01-09', name: 'Founders day' }],
  weekendDays: [0, 6],
}

describe('availability helpers', () => {
  it('labels the next absence only', () => {
    expect(awayLabel(dev.away, '2030-01-01')).toMatch(/^away 14 Jan – 15 Jan$/)
    expect(awayLabel(dev.away, '2030-01-20')).toMatch(/^away 4 Feb \(pending\)$/)
    expect(awayLabel(dev.away, '2030-03-01')).toBeNull()
  })

  it('explains why someone is not working on a date', () => {
    expect(absenceOn(dev, '2030-01-14')).toBe('is on leave')
    expect(absenceOn(dev, '2030-02-04')).toBe('has pending leave')
    expect(absenceOn(dev, '2030-01-09')).toBe('has a holiday (Founders day)')
    expect(absenceOn(dev, '2030-01-12')).toBe('does not work that day (weekend)')
    expect(absenceOn(dev, '2030-01-10')).toBeNull()
    expect(absenceOn(undefined, '2030-01-10')).toBeNull()
  })
})
