import { describe, expect, it } from 'vitest';
import { countLeaveDays, daysBetween } from '../../src/modules/leave/leave-days.js';

const SAT_SUN = [0, 6];
const none = new Map<string, string>();

describe('leave day counting', () => {
  it('counts working days only (weekends and holidays skipped)', () => {
    // Mon 7 – Sun 13 Jan 2030, with a holiday on Wednesday
    const r = countLeaveDays('2030-01-07', '2030-01-13', 'full', SAT_SUN, new Map([['2030-01-09', 'Founders day']]));
    expect(r.days).toBe(4);
    expect(r.skipped).toEqual([
      { date: '2030-01-09', reason: 'Founders day' },
      { date: '2030-01-12', reason: 'weekend' },
      { date: '2030-01-13', reason: 'weekend' },
    ]);
  });

  it('respects the calendar weekend (e.g. Friday + Saturday)', () => {
    expect(countLeaveDays('2030-01-07', '2030-01-13', 'full', [5, 6], none).days).toBe(5); // Sun–Thu working
  });

  it('half days cost 0.5 and only exist for single days', () => {
    expect(countLeaveDays('2030-01-08', '2030-01-08', 'am', SAT_SUN, none).days).toBe(0.5);
    expect(countLeaveDays('2030-01-12', '2030-01-12', 'pm', SAT_SUN, none).days).toBe(0); // Saturday
    expect(() => countLeaveDays('2030-01-08', '2030-01-09', 'am', SAT_SUN, none)).toThrow(/single-day/);
  });

  it('rejects reversed and huge ranges; handles month and leap boundaries', () => {
    expect(() => countLeaveDays('2030-01-09', '2030-01-08', 'full', SAT_SUN, none)).toThrow(/before/);
    expect(() => countLeaveDays('2030-01-01', '2031-06-01', 'full', SAT_SUN, none)).toThrow(/at most/);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(3); // 2028 is a leap year
    expect(countLeaveDays('2030-01-31', '2030-02-01', 'full', SAT_SUN, none).days).toBe(2); // Thu + Fri
  });
});
