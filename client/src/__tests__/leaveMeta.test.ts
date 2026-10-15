import { describe, expect, it } from 'vitest'
import { covers, monthDates, pluralDays, weekdayOf } from '../pages/leave/leaveMeta'

describe('leave calendar helpers', () => {
  it('lists every day of a month, leap years included', () => {
    expect(monthDates(2030, 0)).toHaveLength(31)
    expect(monthDates(2028, 1)).toHaveLength(29)
    expect(monthDates(2030, 1).at(-1)).toBe('2030-02-28')
    expect(monthDates(2030, 11)[0]).toBe('2030-12-01')
  })
  it('knows week days and ranges without time-zone drift', () => {
    expect(weekdayOf('2030-01-07')).toBe(1) // Monday
    expect(weekdayOf('2030-01-13')).toBe(0) // Sunday
    expect(covers('2030-01-07', '2030-01-11', '2030-01-11')).toBe(true)
    expect(covers('2030-01-07', '2030-01-11', '2030-01-12')).toBe(false)
  })
  it('pluralizes', () => {
    expect(pluralDays(1)).toBe('1 day')
    expect(pluralDays(0.5)).toBe('0.5 days')
  })
})
