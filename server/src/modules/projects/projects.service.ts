// Projects of the active organization + project members.
import { db, withTransaction, type Queryable } from '../../database/db.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions/http.exception.js';
import { logger } from '../../common/logger/logger.js';
import { storage } from '../../common/storage/storage.js';
import { audit } from '../../common/utils/audit.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';
import {
  PROJECT_COLUMNS,
  assertCanManage,
  getProjectAccess,
  isOrgProjectAdmin,
  MEMBER_CAN_ACCESS_SQL,
  peopleVisibility,
  type ProjectAccess,
  type ProjectRole,
  type ProjectRow,
} from './project-access.js';
import { assertWithinPlan } from '../plans/plan-limits.js';
import { PROJECT_TEMPLATES } from './project-templates.js';
import type { CreateProjectDto, UpdateProjectDto } from './projects.dto.js';
import { trashProject } from '../trash/trash.service.js';

const UNIQUE_VIOLATION = '23505';

export interface ProjectSummary extends ProjectRow {
  myRole: ProjectRole;
  lead: { id: number; name: string } | null;
  itemCount: number;
  openItemCount: number;
  memberCount: number;
}

export interface ProjectMember {
  id: number;
  name: string;
  email: string;
  role: ProjectRole;
  addedAt: Date;
  isGuest: boolean;
}

export interface ProjectStatus {
  id: number;
  name: string;
  category: 'todo' | 'in_progress' | 'done';
  color: string;
  position: number;
  restrictedRoles: string[];
  wipLimit: number | null;
  itemCount: number;
}

export interface ProjectLabel {
  id: number;
  name: string;
  color: string;
}

export interface ProjectField {
  id: number;
  name: string;
  fieldType: 'text' | 'number' | 'date' | 'select' | 'multi_select' | 'checkbox';
  options: string[];
  required: boolean;
  position: number;
}

export interface ProjectDetail extends ProjectSummary {
  canEdit: boolean;
  canManage: boolean;
  defaultItemType: string;
  statuses: ProjectStatus[];
  labels: ProjectLabel[];
  fields: ProjectField[];
}

// ---------------------------------------------------------------- shared loaders

export async function loadStatuses(projectId: number, executor: Queryable = db): Promise<ProjectStatus[]> {
  const { rows } = await executor.query<ProjectStatus>(
    `SELECT s.id, s.name, s.category, s.color, s.position, s.restricted_roles AS "restrictedRoles", s.wip_limit AS "wipLimit",
            -- trash included: deleting a status must move those items too
            (SELECT COUNT(*)::int FROM work_items w WHERE w.status_id = s.id) AS "itemCount"
       FROM project_statuses s WHERE s.project_id = $1 ORDER BY s.position, s.id`,
    [projectId],
  );
  return rows;
}

export async function loadLabels(projectId: number, executor: Queryable = db): Promise<ProjectLabel[]> {
  const { rows } = await executor.query<ProjectLabel>(
    'SELECT id, name, color FROM project_labels WHERE project_id = $1 ORDER BY lower(name)',
    [projectId],
  );
  return rows;
}

export async function loadFields(projectId: number, executor: Queryable = db): Promise<ProjectField[]> {
  const { rows } = await executor.query<ProjectField>(
    `SELECT id, name, field_type AS "fieldType", options, required, position
       FROM project_custom_fields WHERE project_id = $1 ORDER BY position, id`,
    [projectId],
  );
  return rows;
}

async function assertActiveOrgMember(organizationId: number, userId: number, executor: Queryable) {
  const { rowCount } = await executor.query(
    `SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active'`,
    [organizationId, userId],
  );
  if (!rowCount) throw new BadRequestException('User is not an active member of this organization');
}

/** Guests can work in a project (member / viewer) but never administer it. */
async function assertNotGuest(organizationId: number, userId: number, executor: Queryable) {
  const { rowCount } = await executor.query(
    'SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND is_guest',
    [organizationId, userId],
  );
  if (rowCount) throw new BadRequestException('Guests cannot be project admins');
}

/** Deletes stored files after the database rows are gone (best effort — never fails the request). */
export async function removeFiles(keys: string[]) {
  await Promise.all(
    keys.map((key) => storage.remove(key).catch((err) => logger.warn(`Could not delete file ${key}: ${(err as Error).message}`))),
  );
}

// ---------------------------------------------------------------- service

export class ProjectsService {
  /** Projects the user can see: all for org project admins, else organization-visible + their own. */
  async findAll(query: { status: 'active' | 'archived' | 'all'; search?: string }, ctx: RequestContext): Promise<ProjectSummary[]> {
    const tenant = tenantOf(ctx);
    const seeAll = isOrgProjectAdmin(tenant);
    const { rows } = await db.query<ProjectSummary & { memberRole: ProjectRole | null }>(
      `SELECT ${PROJECT_COLUMNS}, pm.role AS "memberRole",
              CASE WHEN l.id IS NULL THEN NULL ELSE json_build_object('id', l.id, 'name', l.name) END AS lead,
              (SELECT COUNT(*)::int FROM work_items w WHERE w.project_id = p.id AND w.deleted_at IS NULL) AS "itemCount",
              (SELECT COUNT(*)::int FROM work_items w JOIN project_statuses s ON s.id = w.status_id
                WHERE w.project_id = p.id AND s.category <> 'done' AND w.deleted_at IS NULL) AS "openItemCount",
              (SELECT COUNT(*)::int FROM project_members x WHERE x.project_id = p.id) AS "memberCount"
         FROM projects p
         LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
         LEFT JOIN users l ON l.id = p.lead_id
        WHERE p.organization_id = $1 AND p.deleted_at IS NULL
          AND ($3::boolean OR (p.visibility = 'organization' AND NOT $6::boolean) OR pm.user_id IS NOT NULL)
          AND ($4::text = 'all' OR p.status = $4)
          AND ($5::text IS NULL OR p.name ILIKE $5 OR p.key ILIKE $5)
        ORDER BY p.status, lower(p.name)`,
      [tenant.organizationId, ctx.user!.id, seeAll, query.status, query.search ? `%${query.search}%` : null, tenant.isGuest],
    );
    return rows.map(({ memberRole, ...p }) => ({ ...p, myRole: seeAll ? 'admin' : (memberRole ?? 'viewer') }));
  }

  async findOne(ref: string, ctx: RequestContext): Promise<ProjectDetail> {
    const access = await getProjectAccess(ctx, ref);
    return this.buildDetail(access);
  }

  async buildDetail(access: ProjectAccess, executor: Queryable = db): Promise<ProjectDetail> {
    const { project } = access;
    const [counts, lead, statuses, labels, fields] = await Promise.all([
      executor.query<{ itemCount: number; openItemCount: number; memberCount: number }>(
        `SELECT (SELECT COUNT(*)::int FROM work_items WHERE project_id = $1 AND deleted_at IS NULL) AS "itemCount",
                (SELECT COUNT(*)::int FROM work_items w JOIN project_statuses s ON s.id = w.status_id
                  WHERE w.project_id = $1 AND s.category <> 'done' AND w.deleted_at IS NULL) AS "openItemCount",
                (SELECT COUNT(*)::int FROM project_members WHERE project_id = $1) AS "memberCount"`,
        [project.id],
      ),
      project.leadId ? executor.query<{ id: number; name: string }>('SELECT id, name FROM users WHERE id = $1', [project.leadId]) : null,
      loadStatuses(project.id, executor),
      loadLabels(project.id, executor),
      loadFields(project.id, executor),
    ]);
    return {
      ...project,
      ...counts.rows[0]!,
      myRole: access.role,
      lead: lead?.rows[0] ?? null,
      canEdit: access.canEdit,
      canManage: access.canManage,
      defaultItemType: PROJECT_TEMPLATES[project.template]?.defaultItemType ?? 'task',
      statuses,
      labels,
      fields,
    };
  }

  async create(dto: CreateProjectDto, ctx: RequestContext): Promise<ProjectDetail> {
    const tenant = tenantOf(ctx);
    const user = ctx.user!;
    const template = PROJECT_TEMPLATES[dto.template]!;

    try {
      const projectId = await withTransaction(async (client) => {
        await assertWithinPlan(client, tenant.organizationId, 'projects');
        const leadId = dto.leadId ?? user.id;
        if (dto.leadId) await assertActiveOrgMember(tenant.organizationId, dto.leadId, client);

        const { rows } = await client.query<{ id: number }>(
          `INSERT INTO projects (organization_id, key, name, description, icon, color, lead_id, visibility, template, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [tenant.organizationId, dto.key, dto.name, dto.description ?? null, dto.icon ?? null, dto.color ?? null, leadId, dto.visibility, dto.template, user.id],
        );
        const projectId = rows[0]!.id;

        // Workflow + labels from the template
        for (const [i, s] of template.statuses.entries()) {
          await client.query(
            `INSERT INTO project_statuses (organization_id, project_id, name, category, color, position, restricted_roles)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [tenant.organizationId, projectId, s.name, s.category, s.color, i, s.restrictedRoles ?? []],
          );
        }
        if (template.qaFlow) {
          await client.query(
            `UPDATE projects p SET
                qa_ready_status_id  = (SELECT id FROM project_statuses WHERE project_id = p.id AND name = $2),
                qa_passed_status_id = (SELECT id FROM project_statuses WHERE project_id = p.id AND name = $3),
                qa_failed_status_id = (SELECT id FROM project_statuses WHERE project_id = p.id AND name = $4)
              WHERE p.id = $1`,
            [projectId, template.qaFlow.ready, template.qaFlow.passed, template.qaFlow.failed],
          );
        }
        for (const l of template.labels) {
          await client.query('INSERT INTO project_labels (organization_id, project_id, name, color) VALUES ($1, $2, $3, $4)', [
            tenant.organizationId,
            projectId,
            l.name,
            l.color,
          ]);
        }

        // Creator (and lead) become project admins
        await client.query(
          `INSERT INTO project_members (project_id, organization_id, user_id, role, added_by)
           SELECT $1, $2, u, 'admin', $3 FROM unnest($4::int[]) AS u
           ON CONFLICT DO NOTHING`,
          [projectId, tenant.organizationId, user.id, [...new Set([user.id, leadId])]],
        );

        await audit(ctx, { action: 'project.create', entity: 'project', entityId: projectId, details: { key: dto.key, name: dto.name, template: dto.template } }, client);
        return projectId;
      });
      return this.findOne(String(projectId), ctx);
    } catch (err: any) {
      if (err.code === UNIQUE_VIOLATION) throw new ConflictException(`The key "${dto.key}" is already used by another project`);
      throw err;
    }
  }

  async update(ref: string, dto: UpdateProjectDto, ctx: RequestContext): Promise<ProjectDetail> {
    const access = await getProjectAccess(ctx, ref);
    assertCanManage(access);
    const { project } = access;
    if (dto.leadId) await assertActiveOrgMember(project.organizationId, dto.leadId, db);

    const changes: Record<string, unknown> = {};
    const map: Record<string, string> = {
      name: 'name',
      description: 'description',
      visibility: 'visibility',
      icon: 'icon',
      color: 'color',
      leadId: 'lead_id',
      qaReadyStatusId: 'qa_ready_status_id',
      qaPassedStatusId: 'qa_passed_status_id',
      qaFailedStatusId: 'qa_failed_status_id',
    };
    const qaIds = [dto.qaReadyStatusId, dto.qaPassedStatusId, dto.qaFailedStatusId].filter((id): id is number => !!id);
    if (qaIds.length) {
      const { rowCount } = await db.query('SELECT 1 FROM project_statuses WHERE project_id = $1 AND id = ANY($2::int[])', [project.id, [...new Set(qaIds)]]);
      if (rowCount !== new Set(qaIds).size) throw new BadRequestException('QA statuses must belong to this project');
    }
    const entries = Object.entries(dto).filter(([, v]) => v !== undefined);
    if (entries.length) {
      const sets = entries.map(([k], i) => `${map[k]} = $${i + 1}`);
      await db.query(`UPDATE projects SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${entries.length + 1}`, [
        ...entries.map(([, v]) => v),
        project.id,
      ]);
      for (const [k, v] of entries) changes[k] = v;
      await audit(ctx, { action: 'project.update', entity: 'project', entityId: project.id, details: changes });
    }
    return this.findOne(String(project.id), ctx);
  }

  async setArchived(ref: string, archived: boolean, ctx: RequestContext): Promise<ProjectDetail> {
    const access = await getProjectAccess(ctx, ref);
    assertCanManage(access);
    await withTransaction(async (client) => {
      // restoring makes the project count again towards the plan
      if (!archived && access.project.status === 'archived') await assertWithinPlan(client, access.project.organizationId, 'projects');
      await client.query(
        `UPDATE projects SET status = $1::text, archived_at = CASE WHEN $1::text = 'archived' THEN NOW() ELSE NULL END, updated_at = NOW() WHERE id = $2`,
        [archived ? 'archived' : 'active', access.project.id],
      );
      await audit(ctx, { action: archived ? 'project.archive' : 'project.restore', entity: 'project', entityId: access.project.id }, client);
    });
    return this.findOne(String(access.project.id), ctx);
  }

  /** Delete = move to the trash (organization project admins; archived projects only). Restorable for 30 days. */
  async remove(ref: string, ctx: RequestContext): Promise<void> {
    await trashProject(await getProjectAccess(ctx, ref), ctx);
  }

  // ---------------------------------------------------------------- members

  async listMembers(ref: string, ctx: RequestContext): Promise<ProjectMember[]> {
    const { project } = await getProjectAccess(ctx, ref);
    const { rows } = await db.query<ProjectMember>(
      `SELECT u.id, u.name, u.email, pm.role, pm.added_at AS "addedAt", COALESCE(om.is_guest, FALSE) AS "isGuest"
         FROM project_members pm JOIN users u ON u.id = pm.user_id
         LEFT JOIN organization_members om ON om.organization_id = pm.organization_id AND om.user_id = pm.user_id
        WHERE pm.project_id = $1
        ORDER BY CASE pm.role WHEN 'admin' THEN 0 WHEN 'member' THEN 1 ELSE 2 END, lower(u.name)`,
      [project.id],
    );
    return rows;
  }

  /**
   * People who can be assigned work: active organization members who can access the project
   * (everyone for organization-visible projects, project members for private ones).
   */
  async assignableUsers(ref: string, ctx: RequestContext): Promise<{ id: number; name: string; email: string }[]> {
    const { project } = await getProjectAccess(ctx, ref);
    const { rows } = await db.query<{ id: number; name: string; email: string }>(
      `SELECT u.id, u.name, u.email
         FROM organization_members m JOIN users u ON u.id = m.user_id
        WHERE m.organization_id = $1 AND m.status = 'active' AND u.is_active = TRUE
          AND ${MEMBER_CAN_ACCESS_SQL('$2', '$3')}
        ORDER BY lower(u.name)`,
      [project.organizationId, peopleVisibility(tenantOf(ctx), project), project.id],
    );
    return rows;
  }

  /** Active organization members who are not in the project yet (for project admins adding people). */
  async memberCandidates(ref: string, ctx: RequestContext): Promise<{ id: number; name: string; email: string; isGuest: boolean }[]> {
    const access = await getProjectAccess(ctx, ref);
    assertCanManage(access);
    const { rows } = await db.query<{ id: number; name: string; email: string; isGuest: boolean }>(
      `SELECT u.id, u.name, u.email, m.is_guest AS "isGuest"
         FROM organization_members m JOIN users u ON u.id = m.user_id
        WHERE m.organization_id = $1 AND m.status = 'active' AND u.is_active = TRUE
          AND NOT EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = $2 AND pm.user_id = u.id)
        ORDER BY lower(u.name)`,
      [access.project.organizationId, access.project.id],
    );
    return rows;
  }

  async addMember(ref: string, userId: number, role: ProjectRole, ctx: RequestContext): Promise<ProjectMember[]> {
    const access = await getProjectAccess(ctx, ref);
    assertCanManage(access);
    await assertActiveOrgMember(access.project.organizationId, userId, db);
    if (role === 'admin') await assertNotGuest(access.project.organizationId, userId, db);
    const { rowCount } = await db.query(
      `INSERT INTO project_members (project_id, organization_id, user_id, role, added_by)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      [access.project.id, access.project.organizationId, userId, role, ctx.user!.id],
    );
    if (!rowCount) throw new ConflictException('This person is already a member of the project');
    await audit(ctx, { action: 'project.member_add', entity: 'project', entityId: access.project.id, details: { userId, role } });
    return this.listMembers(String(access.project.id), ctx);
  }

  async updateMember(ref: string, userId: number, role: ProjectRole, ctx: RequestContext): Promise<ProjectMember[]> {
    const access = await getProjectAccess(ctx, ref);
    assertCanManage(access);
    await withTransaction(async (client) => {
      const current = await this.memberRole(access.project.id, userId, client);
      if (current === 'admin' && role !== 'admin') await this.assertNotLastAdmin(access.project.id, userId, client);
      if (role === 'admin') await assertNotGuest(access.project.organizationId, userId, client);
      await client.query('UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3', [role, access.project.id, userId]);
      await audit(ctx, { action: 'project.member_role', entity: 'project', entityId: access.project.id, details: { userId, from: current, to: role } }, client);
    });
    return this.listMembers(String(access.project.id), ctx);
  }

  async removeMember(ref: string, userId: number, ctx: RequestContext): Promise<void> {
    const access = await getProjectAccess(ctx, ref);
    // project admins remove anyone; members can remove themselves (leave)
    if (!access.canManage && userId !== ctx.user!.id) assertCanManage(access);
    await withTransaction(async (client) => {
      const current = await this.memberRole(access.project.id, userId, client);
      if (current === 'admin') await this.assertNotLastAdmin(access.project.id, userId, client);
      await client.query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [access.project.id, userId]);
      await audit(ctx, { action: 'project.member_remove', entity: 'project', entityId: access.project.id, details: { userId } }, client);
    });
  }

  private async memberRole(projectId: number, userId: number, executor: Queryable): Promise<ProjectRole> {
    const { rows } = await executor.query<{ role: ProjectRole }>(
      'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2 FOR UPDATE',
      [projectId, userId],
    );
    if (!rows[0]) throw new NotFoundException('Not a member of this project');
    return rows[0].role;
  }

  private async assertNotLastAdmin(projectId: number, userId: number, executor: Queryable) {
    const { rows } = await executor.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM project_members WHERE project_id = $1 AND role = 'admin' AND user_id <> $2`,
      [projectId, userId],
    );
    if (rows[0]!.count === 0) throw new BadRequestException('A project needs at least one project admin');
  }
}
