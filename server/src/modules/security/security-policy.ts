// Password & session rules of an organization — and the rules that apply to one ACCOUNT.
//
// A person has one account but may belong to several organizations, so the account follows
// the STRICTEST rules of all its active memberships:
//   longest minimum length · symbol if any requires it · shortest inactivity limit · shortest session
import type { Queryable } from '../../database/db.js';

export interface PasswordPolicy {
  minLength: number;
  requireSymbol: boolean;
}

export interface SecurityPolicy extends PasswordPolicy {
  /** sign out after this many minutes without activity (null = no limit) */
  sessionIdleMinutes: number | null;
  /** sign in again after this many hours, even when active (null = no limit besides the refresh-token lifetime) */
  sessionMaxHours: number | null;
}

/** The product's own floor (also enforced by passwordSchema). */
export const BASE_POLICY: SecurityPolicy = { minLength: 8, requireSymbol: false, sessionIdleMinutes: null, sessionMaxHours: null };

/** First rule the password breaks, or null when it is fine. Pure — unit tested. */
export function passwordProblem(password: string, policy: PasswordPolicy): string | null {
  if (password.length < policy.minLength) return `Password must be at least ${policy.minLength} characters`;
  if (!/[A-Za-z]/.test(password)) return 'Password must contain a letter';
  if (!/\d/.test(password)) return 'Password must contain a number';
  if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(password)) return 'Password must contain a symbol (for example ! # % or @)';
  return null;
}

/** "Has this session ended?" — pure, unit tested. lastActivity = when the refresh token was issued. */
export function sessionEndReason(
  policy: Pick<SecurityPolicy, 'sessionIdleMinutes' | 'sessionMaxHours'>,
  times: { startedAt: Date; lastActivityAt: Date },
  now = new Date(),
): 'idle' | 'max' | null {
  if (policy.sessionMaxHours !== null && now.getTime() - times.startedAt.getTime() > policy.sessionMaxHours * 3_600_000) return 'max';
  if (policy.sessionIdleMinutes !== null && now.getTime() - times.lastActivityAt.getTime() > policy.sessionIdleMinutes * 60_000) return 'idle';
  return null;
}

const POLICY_COLUMNS = `
  COALESCE(MAX(o.password_min_length), 8)      AS "minLength",
  COALESCE(BOOL_OR(o.password_require_symbol), FALSE) AS "requireSymbol",
  MIN(o.session_idle_minutes)                  AS "sessionIdleMinutes",
  MIN(o.session_max_hours)                     AS "sessionMaxHours"`;

/** The strictest rules of every organization the user actively belongs to (base rules when none). */
export async function accountPolicy(executor: Queryable, userId: number): Promise<SecurityPolicy> {
  const { rows } = await executor.query<SecurityPolicy>(
    `SELECT ${POLICY_COLUMNS}
       FROM organization_members m JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = $1 AND m.status = 'active' AND o.status = 'active'`,
    [userId],
  );
  return rows[0] ?? BASE_POLICY;
}

/** Rules of one organization (e.g. for someone joining it through an invitation). */
export async function organizationPolicy(executor: Queryable, organizationId: number): Promise<SecurityPolicy> {
  const { rows } = await executor.query<SecurityPolicy>(`SELECT ${POLICY_COLUMNS} FROM organizations o WHERE o.id = $1`, [organizationId]);
  return rows[0] ?? BASE_POLICY;
}

/** Stricter of two policies (an account joining another organization). */
export function strictest(a: SecurityPolicy, b: SecurityPolicy): SecurityPolicy {
  const minOf = (x: number | null, y: number | null) => (x === null ? y : y === null ? x : Math.min(x, y));
  return {
    minLength: Math.max(a.minLength, b.minLength),
    requireSymbol: a.requireSymbol || b.requireSymbol,
    sessionIdleMinutes: minOf(a.sessionIdleMinutes, b.sessionIdleMinutes),
    sessionMaxHours: minOf(a.sessionMaxHours, b.sessionMaxHours),
  };
}
