// When does a repeating template create its next item? Pure date math on 'YYYY-MM-DD' strings (UTC), unit tested.
//   weekdays — Monday to Friday
//   weekly   — one day of the week (0 = Sunday … 6 = Saturday)
//   monthly  — one day of the month (1–28, so it exists in every month)

export type Repeat = 'never' | 'weekdays' | 'weekly' | 'monthly';

export interface RepeatRule {
  repeat: Repeat;
  repeatWeekday: number | null;
  repeatMonthDay: number | null;
}

const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const toStr = (d: Date) => d.toISOString().slice(0, 10);

function matches(rule: RepeatRule, d: Date): boolean {
  const dow = d.getUTCDay();
  switch (rule.repeat) {
    case 'weekdays':
      return dow >= 1 && dow <= 5;
    case 'weekly':
      return dow === rule.repeatWeekday;
    case 'monthly':
      return d.getUTCDate() === rule.repeatMonthDay;
    default:
      return false;
  }
}

/**
 * First matching day ON or after `from` (inclusive) — or strictly after it (exclusive).
 * null when the rule doesn't repeat.
 */
export function nextRunOn(rule: RepeatRule, from: string, inclusive: boolean): string | null {
  if (rule.repeat === 'never') return null;
  const d = toDate(from);
  if (!inclusive) d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < 40; i++) {
    // a month has at most 31 days: always found within 40 tries
    if (matches(rule, d)) return toStr(d);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return null;
}

export function addDays(day: string, n: number): string {
  const d = toDate(day);
  d.setUTCDate(d.getUTCDate() + n);
  return toStr(d);
}

/** "Weekly deploy check — {date}" → "Weekly deploy check — 2026-10-12" */
export const fillTitle = (title: string, day: string) => title.replaceAll('{date}', day);
