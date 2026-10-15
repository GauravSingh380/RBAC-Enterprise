// Capacity of one person in a date range — pure maths (no database), unit-tested.
//
//   working days   = days of the range minus their calendar's weekend days and (non-optional) holidays
//   leave days     = approved leave overlapping the range, counted in working days (half days = 0.5)
//   available days = (working days − leave days) × allocation %
//
// Pending leave is reported separately (it may still be rejected) and does not reduce availability.
import { countLeaveDays, type Portion } from '../leave/leave-days.js';

export interface LeaveSpan {
  startDate: string;
  endDate: string;
  portion: Portion;
  status: 'approved' | 'pending';
}

export interface PersonCapacity {
  workingDays: number;
  holidays: number;
  leaveDays: number;
  pendingLeaveDays: number;
  allocation: number;
  availableDays: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function personCapacity(
  range: { start: string; end: string },
  calendar: { weekendDays: number[]; holidays: Map<string, string> },
  leaves: LeaveSpan[],
  allocation = 100,
): PersonCapacity {
  const total = countLeaveDays(range.start, range.end, 'full', calendar.weekendDays, calendar.holidays);
  const holidays = total.skipped.filter((s) => s.reason !== 'weekend').length;

  let leaveDays = 0;
  let pendingLeaveDays = 0;
  for (const l of leaves) {
    // only the part of the leave inside the range counts
    const start = l.startDate > range.start ? l.startDate : range.start;
    const end = l.endDate < range.end ? l.endDate : range.end;
    if (end < start) continue;
    const days = countLeaveDays(start, end, start === end ? l.portion : 'full', calendar.weekendDays, calendar.holidays).days;
    if (l.status === 'approved') leaveDays += days;
    else pendingLeaveDays += days;
  }
  leaveDays = Math.min(leaveDays, total.workingDays);
  return {
    workingDays: total.workingDays,
    holidays,
    leaveDays: round1(leaveDays),
    pendingLeaveDays: round1(pendingLeaveDays),
    allocation,
    availableDays: round1(((total.workingDays - leaveDays) * allocation) / 100),
  };
}

/** How full is someone? load = assigned ÷ what they can likely do (null when there is no history yet). */
export function loadStatus(assignedPoints: number, expectedPoints: number | null): 'unknown' | 'idle' | 'ok' | 'high' | 'over' {
  if (expectedPoints === null) return 'unknown';
  if (expectedPoints <= 0) return assignedPoints > 0 ? 'over' : 'idle';
  const load = assignedPoints / expectedPoints;
  return load > 1.1 ? 'over' : load > 0.9 ? 'high' : load === 0 ? 'idle' : 'ok';
}
