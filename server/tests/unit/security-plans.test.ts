// Phase 3e: the pure rules behind password / session policy and plan limits.
import { describe, expect, it } from 'vitest';
import { limitProblem, type Usage } from '../../src/modules/plans/plan-limits.js';
import { BASE_POLICY, passwordProblem, sessionEndReason, strictest } from '../../src/modules/security/security-policy.js';

describe('passwordProblem', () => {
  it('checks length, letter, number and (optionally) a symbol', () => {
    const p = { minLength: 10, requireSymbol: true };
    expect(passwordProblem('short1!', p)).toContain('at least 10');
    expect(passwordProblem('1234567890!', p)).toContain('letter');
    expect(passwordProblem('abcdefghij!', p)).toContain('number');
    expect(passwordProblem('abcdefghij1', p)).toContain('symbol');
    expect(passwordProblem('abcdefghi1!', p)).toBeNull();
    expect(passwordProblem('secret123', BASE_POLICY)).toBeNull();
  });
});

describe('sessionEndReason', () => {
  const now = new Date('2026-10-04T12:00:00Z');
  const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

  it('idle = no refresh for longer than the limit; max = signed in too long ago', () => {
    expect(sessionEndReason({ sessionIdleMinutes: 30, sessionMaxHours: null }, { startedAt: ago(600), lastActivityAt: ago(29) }, now)).toBeNull();
    expect(sessionEndReason({ sessionIdleMinutes: 30, sessionMaxHours: null }, { startedAt: ago(600), lastActivityAt: ago(31) }, now)).toBe('idle');
    expect(sessionEndReason({ sessionIdleMinutes: null, sessionMaxHours: 8 }, { startedAt: ago(8 * 60 + 1), lastActivityAt: ago(1) }, now)).toBe('max');
    expect(sessionEndReason({ sessionIdleMinutes: null, sessionMaxHours: null }, { startedAt: ago(99_999), lastActivityAt: ago(99_999) }, now)).toBeNull();
  });
});

describe('strictest', () => {
  it('takes the strongest rule of each kind', () => {
    expect(
      strictest(
        { minLength: 12, requireSymbol: false, sessionIdleMinutes: null, sessionMaxHours: 24 },
        { minLength: 8, requireSymbol: true, sessionIdleMinutes: 60, sessionMaxHours: 12 },
      ),
    ).toEqual({ minLength: 12, requireSymbol: true, sessionIdleMinutes: 60, sessionMaxHours: 12 });
  });
});

describe('limitProblem', () => {
  const usage: Usage = {
    plan: { key: 'free', name: 'Free', limits: { members: 3, guests: 0, projects: null } },
    used: { members: 3, guests: 0, projects: 40 },
    pendingInvitations: { members: 1, guests: 0 },
  };
  it('blocks only what would go over; null = unlimited', () => {
    expect(limitProblem(usage, 'members', 1)).toContain('Free plan includes 3 members; 3 are in use (pending invitations included)');
    expect(limitProblem(usage, 'members', 0)).toBeNull(); // accepting an invitation that is already counted
    expect(limitProblem(usage, 'guests', 1)).toContain('includes 0 guests');
    expect(limitProblem(usage, 'projects', 1)).toBeNull();
  });
});
