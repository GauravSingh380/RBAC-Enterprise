// People directory, managers and teams.
//   * everyone in the organization can see the directory and the teams
//   * changing a job title / manager or the teams needs users.update (Admin)
//   * a manager approves their direct reports' leave (see leave.service.ts)
import { z } from 'zod';
import { db, withTransaction, type Queryable } from '../../database/db.js';
import { BadRequestException, ConflictException, NotFoundException } from '../../common/exceptions/http.exception.js';
import { audit } from '../../common/utils/audit.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';

const UNIQUE_VIOLATION = '23505';

export const updatePersonSchema = z
  .object({
    jobTitle: z.string().trim().max(100).nullable().optional(),
    managerId: z.number().int().positive().nullable().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

export const teamSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).nullable().optional(),
  color: z.string().trim().max(20).optional(),
  leadId: z.number().int().positive().nullable().optional(),
  memberIds: z.array(z.number().int().positive()).max(500).optional(),
});
export const updateTeamSchema = teamSchema.omit({ memberIds: true }).partial().refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });
export const teamMembersSchema = z.object({ userIds: z.array(z.number().int().positive()).max(500) });

export interface Person {
  id: number;
  name: string;
  email: string;
  jobTitle: string | null;
  manager: { id: number; name: string } | null;
  teams: { id: number; name: string; color: string }[];
  roles: string[];
  directReports: number;
  awayToday: boolean;
  joinedAt: Date;
}

const PERSON_SELECT = `
  SELECT u.id, u.name, u.email, m.job_title AS "jobTitle", m.joined_at AS "joinedAt",
         CASE WHEN mg.id IS NULL THEN NULL ELSE json_build_object('id', mg.id, 'name', mg.name) END AS manager,
         COALESCE((SELECT json_agg(json_build_object('id', t.id, 'name', t.name, 'color', t.color) ORDER BY lower(t.name))
                     FROM team_members tm JOIN teams t ON t.id = tm.team_id WHERE tm.user_id = u.id AND tm.organization_id = m.organization_id), '[]') AS teams,
         COALESCE((SELECT array_agg(r.display_name ORDER BY r.display_name) FROM member_roles mr JOIN roles r ON r.id = mr.role_id
                    WHERE mr.organization_id = m.organization_id AND mr.user_id = u.id), '{}') AS roles,
         (SELECT COUNT(*)::int FROM organization_members d WHERE d.organization_id = m.organization_id AND d.manager_id = u.id AND d.status = 'active') AS "directReports",
         EXISTS (SELECT 1 FROM leave_requests lr WHERE lr.organization_id = m.organization_id AND lr.user_id = u.id
                   AND lr.status = 'approved' AND CURRENT_DATE BETWEEN lr.start_date AND lr.end_date) AS "awayToday"
    FROM organization_members m
    JOIN users u ON u.id = m.user_id AND u.is_active
    LEFT JOIN users mg ON mg.id = m.manager_id
   WHERE m.organization_id = $1 AND m.status = 'active' AND NOT m.is_guest`; // guests are outside collaborators, not staff

export class PeopleService {
  async directory(ctx: RequestContext): Promise<Person[]> {
    const { rows } = await db.query<Person>(`${PERSON_SELECT} ORDER BY lower(u.name)`, [tenantOf(ctx).organizationId]);
    return rows;
  }

  async person(userId: number, ctx: RequestContext) {
    const orgId = tenantOf(ctx).organizationId;
    const { rows } = await db.query<Person>(`${PERSON_SELECT} AND u.id = $2`, [orgId, userId]);
    if (!rows[0]) throw new NotFoundException('Person not found');
    const { rows: reports } = await db.query<{ id: number; name: string; jobTitle: string | null }>(
      `SELECT u.id, u.name, m.job_title AS "jobTitle" FROM organization_members m JOIN users u ON u.id = m.user_id
        WHERE m.organization_id = $1 AND m.manager_id = $2 AND m.status = 'active' ORDER BY lower(u.name)`,
      [orgId, userId],
    );
    return { ...rows[0], reports };
  }

  async update(userId: number, dto: z.infer<typeof updatePersonSchema>, ctx: RequestContext) {
    const orgId = tenantOf(ctx).organizationId;
    await withTransaction(async (client) => {
      await assertActiveMember(client, orgId, userId);
      if (dto.managerId) {
        if (dto.managerId === userId) throw new BadRequestException('Someone cannot be their own manager');
        await assertActiveMember(client, orgId, dto.managerId);
        // no loops: walk up from the new manager — we must not meet the person on the way
        const { rows } = await client.query<{ found: boolean }>(
          `WITH RECURSIVE chain AS (
             SELECT user_id, manager_id, 1 AS depth FROM organization_members WHERE organization_id = $1 AND user_id = $2
             UNION ALL
             SELECT m.user_id, m.manager_id, c.depth + 1 FROM organization_members m
               JOIN chain c ON m.organization_id = $1 AND m.user_id = c.manager_id
              WHERE c.depth < 50)
           SELECT EXISTS (SELECT 1 FROM chain WHERE user_id = $3) AS found`,
          [orgId, dto.managerId, userId],
        );
        if (rows[0]!.found) throw new BadRequestException('That would create a loop in the reporting line');
      }
      await client.query(
        `UPDATE organization_members
            SET job_title  = CASE WHEN $3::boolean THEN $4 ELSE job_title END,
                manager_id = CASE WHEN $5::boolean THEN $6::int ELSE manager_id END
          WHERE organization_id = $1 AND user_id = $2`,
        [orgId, userId, dto.jobTitle !== undefined, dto.jobTitle || null, dto.managerId !== undefined, dto.managerId ?? null],
      );
      await audit(ctx, { action: 'member.profile_update', entity: 'user', entityId: userId, details: dto }, client);
    });
    return this.person(userId, ctx);
  }

  // ---------------------------------------------------------------- teams

  async teams(ctx: RequestContext) {
    const { rows } = await db.query(
      `SELECT t.id, t.name, t.description, t.color,
              CASE WHEN l.id IS NULL THEN NULL ELSE json_build_object('id', l.id, 'name', l.name) END AS lead,
              COALESCE((SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'jobTitle', m.job_title) ORDER BY lower(u.name))
                          FROM team_members tm
                          JOIN organization_members m ON m.organization_id = tm.organization_id AND m.user_id = tm.user_id AND m.status = 'active'
                          JOIN users u ON u.id = tm.user_id
                         WHERE tm.team_id = t.id), '[]') AS members
         FROM teams t LEFT JOIN users l ON l.id = t.lead_id
        WHERE t.organization_id = $1 ORDER BY lower(t.name)`,
      [tenantOf(ctx).organizationId],
    );
    return rows;
  }

  async createTeam(dto: z.infer<typeof teamSchema>, ctx: RequestContext) {
    const orgId = tenantOf(ctx).organizationId;
    await withTransaction(async (client) => {
      if (dto.leadId) await assertActiveMember(client, orgId, dto.leadId);
      const { rows } = await client
        .query<{ id: number }>(
          `INSERT INTO teams (organization_id, name, description, color, lead_id) VALUES ($1, $2, $3, COALESCE($4, '#1677ff'), $5) RETURNING id`,
          [orgId, dto.name, dto.description ?? null, dto.color ?? null, dto.leadId ?? null],
        )
        .catch(conflict(dto.name));
      await setMembers(client, orgId, rows[0]!.id, [...(dto.memberIds ?? []), ...(dto.leadId ? [dto.leadId] : [])]);
      await audit(ctx, { action: 'team.create', entity: 'team', entityId: rows[0]!.id, details: { name: dto.name } }, client);
    });
    return this.teams(ctx);
  }

  async updateTeam(teamId: number, dto: z.infer<typeof updateTeamSchema>, ctx: RequestContext) {
    const orgId = tenantOf(ctx).organizationId;
    await withTransaction(async (client) => {
      if (dto.leadId) await assertActiveMember(client, orgId, dto.leadId);
      const { rowCount } = await client
        .query(
          `UPDATE teams SET name = COALESCE($3, name), color = COALESCE($4, color),
                  description = CASE WHEN $5::boolean THEN $6 ELSE description END,
                  lead_id = CASE WHEN $7::boolean THEN $8::int ELSE lead_id END
            WHERE id = $1 AND organization_id = $2`,
          [teamId, orgId, dto.name ?? null, dto.color ?? null, dto.description !== undefined, dto.description ?? null, dto.leadId !== undefined, dto.leadId ?? null],
        )
        .catch(conflict(dto.name ?? ''));
      if (!rowCount) throw new NotFoundException('Team not found');
      // the lead is always a member of their team
      if (dto.leadId) await client.query('INSERT INTO team_members (team_id, organization_id, user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [teamId, orgId, dto.leadId]);
      await audit(ctx, { action: 'team.update', entity: 'team', entityId: teamId, details: dto }, client);
    });
    return this.teams(ctx);
  }

  async setTeamMembers(teamId: number, userIds: number[], ctx: RequestContext) {
    const orgId = tenantOf(ctx).organizationId;
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ leadId: number | null }>('SELECT lead_id AS "leadId" FROM teams WHERE id = $1 AND organization_id = $2', [teamId, orgId]);
      if (!rows[0]) throw new NotFoundException('Team not found');
      await setMembers(client, orgId, teamId, [...userIds, ...(rows[0].leadId ? [rows[0].leadId] : [])]);
      await audit(ctx, { action: 'team.members', entity: 'team', entityId: teamId, details: { userIds } }, client);
    });
    return this.teams(ctx);
  }

  async deleteTeam(teamId: number, ctx: RequestContext) {
    const { rowCount } = await db.query('DELETE FROM teams WHERE id = $1 AND organization_id = $2', [teamId, tenantOf(ctx).organizationId]);
    if (!rowCount) throw new NotFoundException('Team not found');
    await audit(ctx, { action: 'team.delete', entity: 'team', entityId: teamId });
    return this.teams(ctx);
  }
}

async function assertActiveMember(executor: Queryable, orgId: number, userId: number) {
  const { rowCount } = await executor.query(`SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active'`, [orgId, userId]);
  if (!rowCount) throw new BadRequestException('Not an active member of this organization');
}

/** Replaces the members of a team (only active members of the organization are kept). */
async function setMembers(executor: Queryable, orgId: number, teamId: number, userIds: number[]) {
  await executor.query('DELETE FROM team_members WHERE team_id = $1', [teamId]);
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  const { rowCount } = await executor.query(
    `INSERT INTO team_members (team_id, organization_id, user_id)
     SELECT $1, $2, m.user_id FROM organization_members m WHERE m.organization_id = $2 AND m.user_id = ANY($3::int[]) AND m.status = 'active'`,
    [teamId, orgId, ids],
  );
  if (rowCount !== ids.length) throw new BadRequestException('Some people are not active members of this organization');
}

const conflict = (name: string) => (err: any) => {
  if (err?.code === UNIQUE_VIOLATION) throw new ConflictException(`A team named "${name}" already exists`);
  throw err;
};
