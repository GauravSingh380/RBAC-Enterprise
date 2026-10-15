import { describe, expect, it } from 'vitest';
import { projectHealth, toCsv } from '../../src/modules/insights/insights.service.js';

const now = Date.parse('2030-01-31T12:00:00Z');
const daysAgo = (n: number) => new Date(now - n * 86_400_000);

describe('project health', () => {
  it('idle when nothing is open, stale after 14 quiet days', () => {
    expect(projectHealth({ open: 0, overdue: 0, criticalBugs: 0, lastActivityAt: daysAgo(40) }, now).health).toBe('idle');
    expect(projectHealth({ open: 3, overdue: 0, criticalBugs: 0, lastActivityAt: daysAgo(20) }, now)).toEqual({ health: 'stale', reasons: ['no activity for 20 days'] });
  });

  it('at risk with critical bugs or many overdue items — with the reasons', () => {
    expect(projectHealth({ open: 10, overdue: 1, criticalBugs: 2, lastActivityAt: daysAgo(1) }, now)).toEqual({ health: 'at_risk', reasons: ['2 critical bugs'] });
    expect(projectHealth({ open: 8, overdue: 2, criticalBugs: 0, lastActivityAt: daysAgo(1) }, now).reasons).toEqual(['2 overdue']); // 25 %
    expect(projectHealth({ open: 40, overdue: 5, criticalBugs: 0, lastActivityAt: daysAgo(1) }, now).health).toBe('at_risk'); // 5 or more
    expect(projectHealth({ open: 40, overdue: 4, criticalBugs: 0, lastActivityAt: daysAgo(1) }, now).health).toBe('healthy');
  });
});

describe('CSV export', () => {
  it('quotes when needed and neutralizes spreadsheet formulas', () => {
    expect(toCsv(['a', 'b'], [['plain', 1], ['with, comma', 'say "hi"'], ['=HYPERLINK("x")', null]])).toBe(
      'a,b\r\nplain,1\r\n"with, comma","say ""hi"""\r\n"\'=HYPERLINK(""x"")",',
    );
  });
});
