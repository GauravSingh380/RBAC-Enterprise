// Project configuration: workflow statuses, labels and custom fields.
import { db, withTransaction } from '../../database/db.js';
import { BadRequestException, ConflictException, NotFoundException } from '../../common/exceptions/http.exception.js';
import { audit } from '../../common/utils/audit.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';
import { assertCanEdit, assertCanManage, getProjectAccess } from './project-access.js';
import type { CreateFieldDto, CreateStatusDto, UpdateFieldDto, UpdateStatusDto } from './projects.dto.js';
import { loadFields, loadLabels, loadStatuses, type ProjectField, type ProjectLabel, type ProjectStatus } from './projects.service.js';

const UNIQUE_VIOLATION = '23505';

export class ProjectConfigService {
  // ---------------------------------------------------------------- statuses (workflow)

  async listStatuses(ref: string, ctx: RequestContext): Promise<ProjectStatus[]> {
    const { project } = await getProjectAccess(ctx, ref);
    return loadStatuses(project.id);
  }

  async createStatus(ref: string, dto: CreateStatusDto, ctx: RequestContext): Promise<ProjectStatus[]> {
    const access = await getProjectAccess(ctx, ref);
    assertCanManage(access);
    await this.assertRolesExist(dto.restrictedRoles, ctx);
    try {
      await db.query(
        `INSERT INTO project_statuses (organization_id, project_id, name, category, color, position, restricted_roles, wip_limit)
         VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(position), -1) + 1 FROM project_statuses WHERE project_id = $2), $6, $7)`,
        [access.project.organizationId, access.project.id, dto.name, dto.category, dto.color, dto.restrictedRoles, dto.wipLimit ?? null],
      );
    } catch (err: any) {
      if (err.code === UNIQUE_VIOLATION) throw new ConflictException(`A status named "${dto.name}" already exists`);
      throw err;
    }
    await audit(ctx, { action: 'project.status_create', entity: 'project', entityId: access.project.id, details: { name: dto.name } });
    return loadStatuses(access.project.id);
  }

  async updateStatus(ref: string, statusId: number, dto: UpdateStatusDto, ctx: RequestContext): Promise<ProjectStatus[]> {
    const access = await getProjectAccess(ctx, ref);
    assertCanManage(access);
    if (dto.restrictedRoles) await this.assertRolesExist(dto.restrictedRoles, ctx);

    try {
      await withTransaction(async (client) => {
        const { rowCount } = await client.query(
          `UPDATE project_statuses
              SET name = COALESCE($1, name), category = COALESCE($2, category), color = COALESCE($3, color),
                  restricted_roles = COALESCE($4, restricted_roles),
                  wip_limit = CASE WHEN $7::boolean THEN $8::int ELSE wip_limit END -- null clears the limit
            WHERE id = $5 AND project_id = $6`,
          [dto.name ?? null, dto.category ?? null, dto.color ?? null, dto.restrictedRoles ?? null, statusId, access.project.id,
           dto.wipLimit !== undefined, dto.wipLimit ?? null],
        );
        if (!rowCount) throw new NotFoundException('Status not found');
        if (dto.category) {
          // keep completed_at consistent with the new category
          await client.query(
            `UPDATE work_items SET completed_at = CASE WHEN $1 = 'done' THEN COALESCE(completed_at, NOW()) ELSE NULL END
              WHERE status_id = $2`,
            [dto.category, statusId],
          );
        }
      });
    } catch (err: any) {
      if (err.code === UNIQUE_VIOLATION) throw new ConflictException(`A status named "${dto.name}" already exists`);
      throw err;
    }
    await audit(ctx, { action: 'project.status_update', entity: 'project', entityId: access.project.id, details: { statusId, ...dto } });
    return loadStatuses(access.project.id);
  }

  async reorderStatuses(ref: string, statusIds: number[], ctx: RequestContext): Promise<ProjectStatus[]> {
    const access = await getProjectAccess(ctx, ref);
    assertCanManage(access);
    const current = await loadStatuses(access.project.id);
    const same = current.length === statusIds.length && current.every((s) => statusIds.includes(s.id));
    if (!same) throw new BadRequestException('Send every status of the project exactly once');

    await db.query(
      `UPDATE project_statuses s SET position = o.pos - 1
         FROM unnest($1::int[]) WITH ORDINALITY AS o(id, pos)
        WHERE s.id = o.id AND s.project_id = $2`,
      [statusIds, access.project.id],
    );
    return loadStatuses(access.project.id);
  }

  /** Deletes a status; its work items are moved to `moveToStatusId` first. */
  async deleteStatus(ref: string, statusId: number, moveToStatusId: number | null, ctx: RequestContext): Promise<ProjectStatus[]> {
    const access = await getProjectAccess(ctx, ref);
    assertCanManage(access);
    const statuses = await loadStatuses(access.project.id);
    const status = statuses.find((s) => s.id === statusId);
    if (!status) throw new NotFoundException('Status not found');
    if (statuses.length === 1) throw new BadRequestException('A project needs at least one status');

    await withTransaction(async (client) => {
      if (status.itemCount > 0) {
        const target = statuses.find((s) => s.id === moveToStatusId && s.id !== statusId);
        if (!target) throw new BadRequestException(`This status has ${status.itemCount} item(s). Choose a status to move them to.`);
        await client.query(
          `UPDATE work_items SET status_id = $1, updated_at = NOW(),
                  completed_at = CASE WHEN $3 = 'done' THEN COALESCE(completed_at, NOW()) ELSE NULL END
            WHERE status_id = $2`,
          [target.id, statusId, target.category],
        );
      }
      await client.query('DELETE FROM project_statuses WHERE id = $1 AND project_id = $2', [statusId, access.project.id]);
      await audit(ctx, { action: 'project.status_delete', entity: 'project', entityId: access.project.id, details: { name: status.name, movedTo: moveToStatusId } }, client);
    });
    return loadStatuses(access.project.id);
  }

  private async assertRolesExist(roleNames: string[], ctx: RequestContext) {
    if (!roleNames.length) return;
    const { rows } = await db.query<{ name: string }>('SELECT name FROM roles WHERE organization_id = $1 AND name = ANY($2::text[])', [
      tenantOf(ctx).organizationId,
      roleNames,
    ]);
    const missing = roleNames.filter((n) => !rows.some((r) => r.name === n));
    if (missing.length) throw new BadRequestException(`Unknown role(s): ${missing.join(', ')}`);
  }

  // ---------------------------------------------------------------- labels

  async listLabels(ref: string, ctx: RequestContext): Promise<ProjectLabel[]> {
    const { project } = await getProjectAccess(ctx, ref);
    return loadLabels(project.id);
  }

  /** Anyone who can edit items can create labels on the fly; renaming/deleting is for project admins. */
  async createLabel(ref: string, name: string, color: string, ctx: RequestContext): Promise<ProjectLabel> {
    const access = await getProjectAccess(ctx, ref);
    assertCanEdit(access);
    try {
      const { rows } = await db.query<ProjectLabel>(
        'INSERT INTO project_labels (organization_id, project_id, name, color) VALUES ($1, $2, $3, $4) RETURNING id, name, color',
        [access.project.organizationId, access.project.id, name, color],
      );
      return rows[0]!;
    } catch (err: any) {
      if (err.code === UNIQUE_VIOLATION) throw new ConflictException(`Label "${name}" already exists`);
      throw err;
    }
  }

  async updateLabel(ref: string, labelId: number, dto: { name?: string; color?: string }, ctx: RequestContext): Promise<ProjectLabel> {
    const access = await getProjectAccess(ctx, ref);
    assertCanManage(access);
    try {
      const { rows } = await db.query<ProjectLabel>(
        `UPDATE project_labels SET name = COALESCE($1, name), color = COALESCE($2, color)
          WHERE id = $3 AND project_id = $4 RETURNING id, name, color`,
        [dto.name ?? null, dto.color ?? null, labelId, access.project.id],
      );
      if (!rows[0]) throw new NotFoundException('Label not found');
      return rows[0];
    } catch (err: any) {
      if (err.code === UNIQUE_VIOLATION) throw new ConflictException(`Label "${dto.name}" already exists`);
      throw err;
    }
  }

  async deleteLabel(ref: string, labelId: number, ctx: RequestContext): Promise<void> {
    const access = await getProjectAccess(ctx, ref);
    assertCanManage(access);
    const { rowCount } = await db.query('DELETE FROM project_labels WHERE id = $1 AND project_id = $2', [labelId, access.project.id]);
    if (!rowCount) throw new NotFoundException('Label not found');
  }

  // ---------------------------------------------------------------- custom fields

  async listFields(ref: string, ctx: RequestContext): Promise<ProjectField[]> {
    const { project } = await getProjectAccess(ctx, ref);
    return loadFields(project.id);
  }

  async createField(ref: string, dto: CreateFieldDto, ctx: RequestContext): Promise<ProjectField[]> {
    const access = await getProjectAccess(ctx, ref);
    assertCanManage(access);
    await db.query(
      `INSERT INTO project_custom_fields (organization_id, project_id, name, field_type, options, required, position)
       VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(position), -1) + 1 FROM project_custom_fields WHERE project_id = $2))`,
      [access.project.organizationId, access.project.id, dto.name, dto.fieldType, dto.options, dto.required],
    );
    await audit(ctx, { action: 'project.field_create', entity: 'project', entityId: access.project.id, details: { name: dto.name, type: dto.fieldType } });
    return loadFields(access.project.id);
  }

  async updateField(ref: string, fieldId: number, dto: UpdateFieldDto, ctx: RequestContext): Promise<ProjectField[]> {
    const access = await getProjectAccess(ctx, ref);
    assertCanManage(access);
    const { rowCount } = await db.query(
      `UPDATE project_custom_fields
          SET name = COALESCE($1, name), options = COALESCE($2, options), required = COALESCE($3, required), position = COALESCE($4, position)
        WHERE id = $5 AND project_id = $6`,
      [dto.name ?? null, dto.options ?? null, dto.required ?? null, dto.position ?? null, fieldId, access.project.id],
    );
    if (!rowCount) throw new NotFoundException('Field not found');
    return loadFields(access.project.id);
  }

  /** Deletes the field and removes its value from every work item. */
  async deleteField(ref: string, fieldId: number, ctx: RequestContext): Promise<ProjectField[]> {
    const access = await getProjectAccess(ctx, ref);
    assertCanManage(access);
    await withTransaction(async (client) => {
      const { rowCount } = await client.query('DELETE FROM project_custom_fields WHERE id = $1 AND project_id = $2', [fieldId, access.project.id]);
      if (!rowCount) throw new NotFoundException('Field not found');
      await client.query(`UPDATE work_items SET custom_fields = custom_fields - $1::text WHERE project_id = $2`, [String(fieldId), access.project.id]);
      await audit(ctx, { action: 'project.field_delete', entity: 'project', entityId: access.project.id, details: { fieldId } }, client);
    });
    return loadFields(access.project.id);
  }
}
