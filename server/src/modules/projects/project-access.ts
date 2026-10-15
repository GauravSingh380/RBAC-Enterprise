// "What can the current user do in this project?" — the single place that decides project access.
//
// Effective project role:
//   admin  — organization owner, anyone with projects.manage_all, or a project member with role admin
//   member — project member (create / edit work items)
//   viewer — project member with role viewer, or ANY organization member on an organization-visible project
//   none   — private project the user is not part of  → 404 (we don't reveal it exists)
//
// Guests (outside collaborators) only ever get their explicit project membership — never "organization-visible"
// access and never organization-wide project admin, whatever permissions their role is given.
import { db, type Queryable } from '../../database/db.js';
import { PERMISSIONS } from '../../common/constants/rbac.js';
import { ForbiddenException, NotFoundException } from '../../common/exceptions/http.exception.js';
import type { TenantContext } from '../../common/types/auth.types.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';

export type ProjectRole = 'admin' | 'member' | 'viewer';

export interface ProjectRow {
  id: number;
  organizationId: number;
  key: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  leadId: number | null;
  visibility: 'private' | 'organization';
  status: 'active' | 'archived';
  template: string;
  /** QA verification flow for bugs (null = not configured) */
  qaReadyStatusId: number | null;
  qaPassedStatusId: number | null;
  qaFailedStatusId: number | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface ProjectAccess {
  project: ProjectRow;
  role: ProjectRole;
  /** explicit project membership role (null = access through visibility / org permission) */
  memberRole: ProjectRole | null;
  canView: true;
  /** create / edit work items, labels, comments on an active project */
  canEdit: boolean;
  /** project settings, members, workflow */
  canManage: boolean;
}

export const PROJECT_COLUMNS = `p.id, p.organization_id AS "organizationId", p.key, p.name, p.description, p.icon, p.color,
  p.lead_id AS "leadId", p.visibility, p.status, p.template,
  p.qa_ready_status_id AS "qaReadyStatusId", p.qa_passed_status_id AS "qaPassedStatusId", p.qa_failed_status_id AS "qaFailedStatusId",
  p.created_at AS "createdAt",
  p.updated_at AS "updatedAt", p.archived_at AS "archivedAt"`;

export const isOrgProjectAdmin = (tenant: TenantContext) =>
  !tenant.isGuest && (tenant.isOwner || tenant.permissions.includes(PERMISSIONS.PROJECTS_MANAGE_ALL));

export function effectiveRole(tenant: TenantContext, project: Pick<ProjectRow, 'visibility'>, memberRole: ProjectRole | null): ProjectRole | null {
  if (isOrgProjectAdmin(tenant)) return 'admin';
  if (memberRole) return memberRole;
  return project.visibility === 'organization' && !tenant.isGuest ? 'viewer' : null;
}

/**
 * SQL: the organization member row `m` (organization_members) can access the project.
 * Guests only through project membership. Pass 'private' as the visibility to list project members only.
 */
export const MEMBER_CAN_ACCESS_SQL = (visibilityParam: string, projectParam: string) =>
  `((${visibilityParam} = 'organization' AND NOT m.is_guest)
     OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = ${projectParam} AND pm.user_id = m.user_id))`;

/** People lists inside a project: a guest only sees the people of the project, never the whole organization. */
export const peopleVisibility = (tenant: TenantContext, project: Pick<ProjectRow, 'visibility'>) =>
  tenant.isGuest ? 'private' : project.visibility;

/** Accepts a numeric id or a project key (e.g. "TF"). */
export async function getProjectAccess(ctx: RequestContext, ref: string | number, executor: Queryable = db): Promise<ProjectAccess> {
  const tenant = tenantOf(ctx);
  const byId = typeof ref === 'number' || /^\d+$/.test(String(ref));

  const { rows } = await executor.query<ProjectRow & { memberRole: ProjectRole | null }>(
    `SELECT ${PROJECT_COLUMNS}, pm.role AS "memberRole"
       FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $2
      WHERE p.organization_id = $1 AND ${byId ? 'p.id = $3::int' : 'p.key = upper($3)'} AND p.deleted_at IS NULL`, // trash: not found
    [tenant.organizationId, ctx.user!.id, String(ref)],
  );
  const row = rows[0];
  const role = row ? effectiveRole(tenant, row, row.memberRole) : null;
  if (!row || !role) throw new NotFoundException('Project not found');

  const { memberRole, ...project } = row;
  const active = project.status === 'active';
  return {
    project,
    role,
    memberRole,
    canView: true,
    canEdit: active && role !== 'viewer',
    canManage: role === 'admin',
  };
}

export function assertCanEdit(access: ProjectAccess) {
  if (access.project.status !== 'active') throw new ForbiddenException('This project is archived (read-only)');
  if (!access.canEdit) throw new ForbiddenException('You have view-only access to this project');
}

export function assertCanManage(access: ProjectAccess) {
  if (!access.canManage) throw new ForbiddenException('Only project admins can change project settings');
}
