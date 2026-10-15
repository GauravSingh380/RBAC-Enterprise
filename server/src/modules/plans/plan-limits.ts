// Plan limits — checked on the server whenever something would ADD to the organization:
//   members  invite a member · accept a member invitation · re-activate a member · guest → member
//   guests   invite a guest · accept a guest invitation · re-activate a guest
//   projects create a project · restore an archived project
// Nothing is ever removed when an organization is over its limit; it just can't grow.
import type { Queryable } from '../../database/db.js';
import { ForbiddenException } from '../../common/exceptions/http.exception.js';

export type LimitKind = 'members' | 'guests' | 'projects';

export interface PlanInfo {
  key: string;
  name: string;
  limits: Record<LimitKind, number | null>;
}

export interface Usage {
  plan: PlanInfo;
  /** active + pending invitations (members and guests); active projects */
  used: Record<LimitKind, number>;
  pendingInvitations: { members: number; guests: number };
}

export async function usageOf(executor: Queryable, organizationId: number): Promise<Usage> {
  const { rows } = await executor.query<{
    key: string;
    name: string | null;
    maxMembers: number | null;
    maxProjects: number | null;
    maxGuests: number | null;
    members: number;
    guests: number;
    pendingMembers: number;
    pendingGuests: number;
    projects: number;
  }>(
    `SELECT o.plan AS key, pl.name, pl.max_members AS "maxMembers", pl.max_projects AS "maxProjects", pl.max_guests AS "maxGuests",
            (SELECT COUNT(*)::int FROM organization_members m WHERE m.organization_id = o.id AND m.status = 'active' AND NOT m.is_guest) AS members,
            (SELECT COUNT(*)::int FROM organization_members m WHERE m.organization_id = o.id AND m.status = 'active' AND m.is_guest)     AS guests,
            (SELECT COUNT(*)::int FROM invitations i WHERE i.organization_id = o.id AND i.accepted_at IS NULL AND i.revoked_at IS NULL
                AND i.expires_at > NOW() AND i.project_id IS NULL)     AS "pendingMembers",
            (SELECT COUNT(*)::int FROM invitations i WHERE i.organization_id = o.id AND i.accepted_at IS NULL AND i.revoked_at IS NULL
                AND i.expires_at > NOW() AND i.project_id IS NOT NULL) AS "pendingGuests",
            (SELECT COUNT(*)::int FROM projects p WHERE p.organization_id = o.id AND p.status = 'active') AS projects
       FROM organizations o LEFT JOIN plans pl ON pl.key = o.plan
      WHERE o.id = $1`,
    [organizationId],
  );
  const r = rows[0]!;
  return {
    // an unknown plan key (no row in plans) has no limits — the platform owner should fix the organization's plan
    plan: { key: r.key, name: r.name ?? r.key, limits: { members: r.maxMembers, guests: r.maxGuests, projects: r.maxProjects } },
    used: { members: r.members + r.pendingMembers, guests: r.guests + r.pendingGuests, projects: r.projects },
    pendingInvitations: { members: r.pendingMembers, guests: r.pendingGuests },
  };
}

const NOUN: Record<LimitKind, [string, string]> = {
  members: ['member', 'members'],
  guests: ['guest', 'guests'],
  projects: ['active project', 'active projects'],
};

/** Pure: the message when `adding` more would go over the limit, else null. Unit tested. */
export function limitProblem(usage: Usage, kind: LimitKind, adding: number): string | null {
  const max = usage.plan.limits[kind];
  if (max === null || usage.used[kind] + adding <= max) return null;
  const [one, many] = NOUN[kind];
  const counted = kind === 'projects' ? '' : ' (pending invitations included)';
  return (
    `Your ${usage.plan.name} plan includes ${max} ${max === 1 ? one : many}; ${usage.used[kind]} are in use${counted}. ` +
    (kind === 'projects' ? 'Archive a project you no longer need, or ask the platform team for a bigger plan.' : 'Free a place, or ask the platform team for a bigger plan.')
  );
}

/**
 * Throws 403 PLAN_LIMIT_REACHED when `adding` more would go over the plan.
 * Locks the organization row first, so two parallel invitations can't both take the last seat.
 * Must run inside a transaction (pass the transaction client).
 */
export async function assertWithinPlan(client: Queryable, organizationId: number, kind: LimitKind, adding = 1): Promise<void> {
  await client.query('SELECT 1 FROM organizations WHERE id = $1 FOR UPDATE', [organizationId]);
  const problem = limitProblem(await usageOf(client, organizationId), kind, adding);
  if (problem) throw new ForbiddenException(problem).withCode('PLAN_LIMIT_REACHED');
}
