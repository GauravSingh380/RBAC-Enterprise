// How many leave days does a request cost? Only WORKING days count:
// weekend days of the person's holiday calendar and its (non-optional) holidays are skipped.
// Pure function (no database) → unit-tested in tests/unit/leave-days.test.ts.

export type Portion = 'full' | 'am' | 'pm';

export interface DayCount {
  /** what the request costs: working days, or 0.5 for a half day */
  days: number;
  workingDays: number;
  /** days inside the range that are not counted, and why */
  skipped: { date: string; reason: string }[];
}

export const MAX_RANGE_DAYS = 366;

const DAY_MS = 86_400_000;
export const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`); // UTC: no daylight-saving surprises
export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function daysBetween(start: string, end: string): number {
  return Math.round((toDate(end).getTime() - toDate(start).getTime()) / DAY_MS) + 1;
}

export function countLeaveDays(
  start: string,
  end: string,
  portion: Portion,
  weekendDays: number[],
  holidays: Map<string, string>, // date → holiday name (optional holidays NOT included)
): DayCount {
  if (end < start) throw new RangeError('The end date is before the start date');
  if (daysBetween(start, end) > MAX_RANGE_DAYS) throw new RangeError(`A request can cover at most ${MAX_RANGE_DAYS} days`);
  if (portion !== 'full' && start !== end) throw new RangeError('Half days are only possible for single-day requests');

  const weekend = new Set(weekendDays);
  const skipped: DayCount['skipped'] = [];
  let workingDays = 0;
  for (let t = toDate(start).getTime(); t <= toDate(end).getTime(); t += DAY_MS) {
    const d = new Date(t);
    const date = isoDate(d);
    if (weekend.has(d.getUTCDay())) skipped.push({ date, reason: 'weekend' });
    else if (holidays.has(date)) skipped.push({ date, reason: holidays.get(date)! });
    else workingDays++;
  }
  return { days: portion === 'full' ? workingDays : workingDays * 0.5, workingDays, skipped };
}

/** "Mon 6 Oct" style dates are formatted by the client; the server only deals in YYYY-MM-DD. */
export const yearOf = (iso: string) => Number(iso.slice(0, 4));
