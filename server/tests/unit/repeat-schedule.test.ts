// Phase 3f: when does a repeating template run next?
import { describe, expect, it } from 'vitest';
import { addDays, fillTitle, nextRunOn } from '../../src/modules/templates/repeat-schedule.js';

const rule = (repeat: 'never' | 'weekdays' | 'weekly' | 'monthly', repeatWeekday: number | null = null, repeatMonthDay: number | null = null) => ({
  repeat,
  repeatWeekday,
  repeatMonthDay,
});

describe('nextRunOn', () => {
  it('weekdays skip the weekend', () => {
    expect(nextRunOn(rule('weekdays'), '2030-01-11', false)).toBe('2030-01-14'); // Friday → Monday
    expect(nextRunOn(rule('weekdays'), '2030-01-12', true)).toBe('2030-01-14'); // Saturday (inclusive) → Monday
    expect(nextRunOn(rule('weekdays'), '2030-01-08', true)).toBe('2030-01-08'); // Tuesday, today counts
  });

  it('weekly on a day, monthly on a date', () => {
    expect(nextRunOn(rule('weekly', 3), '2030-01-07', true)).toBe('2030-01-09'); // next Wednesday
    expect(nextRunOn(rule('weekly', 1), '2030-01-07', false)).toBe('2030-01-14'); // Monday, exclusive → next Monday
    expect(nextRunOn(rule('monthly', null, 1), '2030-01-15', true)).toBe('2030-02-01');
    expect(nextRunOn(rule('monthly', null, 28), '2030-02-28', false)).toBe('2030-03-28');
    expect(nextRunOn(rule('monthly', null, 31 > 28 ? 28 : 31), '2030-12-29', true)).toBe('2031-01-28'); // across the year
  });

  it('never repeats → null', () => {
    expect(nextRunOn(rule('never'), '2030-01-01', true)).toBeNull();
  });
});

describe('helpers', () => {
  it('adds days and fills {date}', () => {
    expect(addDays('2030-02-27', 3)).toBe('2030-03-02');
    expect(fillTitle('Weekly check — {date}', '2030-01-07')).toBe('Weekly check — 2030-01-07');
  });
});
