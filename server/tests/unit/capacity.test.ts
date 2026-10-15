import { describe, expect, it } from 'vitest';
import { loadStatus, personCapacity } from '../../src/modules/capacity/capacity.js';

// Mon 7 – Fri 18 Jan 2030: 10 weekdays, Wed 9 Jan is a holiday → 9 working days
const range = { start: '2030-01-07', end: '2030-01-18' };
const calendar = { weekendDays: [0, 6], holidays: new Map([['2030-01-09', 'Founders day']]) };

describe('person capacity', () => {
  it('working days minus holidays minus approved leave, times allocation', () => {
    const c = personCapacity(range, calendar, [{ startDate: '2030-01-14', endDate: '2030-01-15', portion: 'full', status: 'approved' }]);
    expect(c).toEqual({ workingDays: 9, holidays: 1, leaveDays: 2, pendingLeaveDays: 0, allocation: 100, availableDays: 7 });
    expect(personCapacity(range, calendar, [], 50).availableDays).toBe(4.5);
  });

  it('counts only the part of leave inside the sprint, half days as 0.5, pending separately', () => {
    const c = personCapacity(range, calendar, [
      { startDate: '2030-01-01', endDate: '2030-01-08', portion: 'full', status: 'approved' }, // only Mon 7 + Tue 8 are inside
      { startDate: '2030-01-10', endDate: '2030-01-10', portion: 'am', status: 'approved' },
      { startDate: '2030-01-17', endDate: '2030-01-17', portion: 'full', status: 'pending' },
    ]);
    expect(c).toMatchObject({ leaveDays: 2.5, pendingLeaveDays: 1, availableDays: 6.5 });
  });

  it('classifies load', () => {
    expect(loadStatus(10, null)).toBe('unknown');
    expect(loadStatus(0, 5)).toBe('idle');
    expect(loadStatus(4, 5)).toBe('ok');
    expect(loadStatus(5, 5)).toBe('high');
    expect(loadStatus(6, 5)).toBe('over');
    expect(loadStatus(1, 0)).toBe('over');
  });
});
