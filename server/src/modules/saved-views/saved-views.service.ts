// Saved views: a named set of filters for the list or board of a project ("My open bugs").
//   * private views: only the owner sees them — anyone who can see the project may create one
//   * shared views: everyone who can see the project sees them — members / admins may share
//   * the owner can change / delete a view; project admins can also tidy up shared views
// `filters` is the page's URL query (e.g. {"types":"bug","assignees":"me"}), so the client
// simply navigates to it — the API validates filters again when the list is loaded.
import { z } from 'zod';
import { db } from '../../database/db.js';
import { BadRequestException, ForbiddenException, NotFoundException } from '../../common/exceptions/http.exception.js';
import type { RequestContext } from '../../common/utils/request-context.js';
import { getProjectAccess, type ProjectAccess } from '../projects/project-access.js';

const MAX_VIEWS_PER_USER = 50;

export const VIEW_TYPES = ['list', 'board'] as const;

const filtersSchema = z
  .record(z.string().regex(/^[a-zA-Z]{1,30}$/), z.string().max(500))
  .refine((f) => Object.keys(f).length <= 20, { message: 'Too many filters' });

export const createViewSchema = z.object({
  name: z.string().trim().min(1).max(100),
  viewType: z.enum(VIEW_TYPES),
  filters: filtersSchema.default({}),
  isShared: z.boolean().default(false),
});

export const updateViewSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    filters: filtersSchema.optional(),
    isShared: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

export type CreateViewDto = z.infer<typeof createViewSchema>;
export type UpdateViewDto = z.infer<typeof updateViewSchema>;

export interface SavedView {
  id: number;
  name: string;
  viewType: (typeof VIEW_TYPES)[number];
  filters: Record<string, string>;
  isShared: boolean;
  owner: { id: number; name: string };
  canEdit: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VIEW_SELECT = `
  SELECT v.id, v.name, v.view_type AS "viewType", v.filters, v.is_shared AS "isShared",
         json_build_object('id', u.id, 'name', u.name) AS owner, v.created_at AS "createdAt", v.updated_at AS "updatedAt"
    FROM saved_views v JOIN users u ON u.id = v.owner_id`;

export class SavedViewsService {
  async list(projectRef: string, ctx: RequestContext): Promise<SavedView[]> {
    const access = await getProjectAccess(ctx, projectRef);
    const { rows } = await db.query<Omit<SavedView, 'canEdit'>>(
      `${VIEW_SELECT} WHERE v.project_id = $1 AND (v.owner_id = $2 OR v.is_shared) ORDER BY v.is_shared, lower(v.name)`,
      [access.project.id, ctx.user!.id],
    );
    return rows.map((v) => ({ ...v, canEdit: canChange(v, access, ctx) }));
  }

  async create(projectRef: string, dto: CreateViewDto, ctx: RequestContext): Promise<SavedView> {
    const access = await getProjectAccess(ctx, projectRef);
    if (dto.isShared && !access.canEdit) throw new ForbiddenException('Viewers can save private views only');
    const { rows: count } = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM saved_views WHERE project_id = $1 AND owner_id = $2', [
      access.project.id,
      ctx.user!.id,
    ]);
    if (count[0]!.n >= MAX_VIEWS_PER_USER) throw new BadRequestException(`You can save up to ${MAX_VIEWS_PER_USER} views per project`);

    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO saved_views (organization_id, project_id, owner_id, name, view_type, filters, is_shared)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [access.project.organizationId, access.project.id, ctx.user!.id, dto.name, dto.viewType, JSON.stringify(dto.filters), dto.isShared],
    );
    return this.load(rows[0]!.id, access, ctx);
  }

  async update(projectRef: string, viewId: number, dto: UpdateViewDto, ctx: RequestContext): Promise<SavedView> {
    const access = await getProjectAccess(ctx, projectRef);
    const view = await this.load(viewId, access, ctx);
    if (!view.canEdit) throw new ForbiddenException('Only the owner can change this view');
    if (dto.isShared && !access.canEdit) throw new ForbiddenException('Viewers can save private views only');
    await db.query(
      `UPDATE saved_views SET name = COALESCE($2, name), filters = COALESCE($3::jsonb, filters),
              is_shared = COALESCE($4, is_shared), updated_at = NOW()
        WHERE id = $1`,
      [viewId, dto.name ?? null, dto.filters ? JSON.stringify(dto.filters) : null, dto.isShared ?? null],
    );
    return this.load(viewId, access, ctx);
  }

  async remove(projectRef: string, viewId: number, ctx: RequestContext): Promise<void> {
    const access = await getProjectAccess(ctx, projectRef);
    const view = await this.load(viewId, access, ctx);
    if (!view.canEdit) throw new ForbiddenException('Only the owner can delete this view');
    await db.query('DELETE FROM saved_views WHERE id = $1', [viewId]);
  }

  private async load(viewId: number, access: ProjectAccess, ctx: RequestContext): Promise<SavedView> {
    const { rows } = await db.query<Omit<SavedView, 'canEdit'>>(
      `${VIEW_SELECT} WHERE v.id = $1 AND v.project_id = $2 AND (v.owner_id = $3 OR v.is_shared)`,
      [viewId, access.project.id, ctx.user!.id],
    );
    if (!rows[0]) throw new NotFoundException('View not found');
    return { ...rows[0], canEdit: canChange(rows[0], access, ctx) };
  }
}

function canChange(view: Pick<SavedView, 'owner' | 'isShared'>, access: ProjectAccess, ctx: RequestContext) {
  return view.owner.id === ctx.user!.id || (view.isShared && access.role === 'admin');
}
