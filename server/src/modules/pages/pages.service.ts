// Project docs (wiki): markdown pages and sub-pages inside a project.
//   reading: anyone who can see the project · writing: project members (canEdit) · deleting → trash (30 days)
//   every save keeps a version (history, restore an older one)
//   edit conflicts: the client sends the updatedAt it started from; if someone saved in between → 409
import { z } from 'zod';
import { db, withTransaction, type Queryable } from '../../database/db.js';
import { BadRequestException, ConflictException, NotFoundException } from '../../common/exceptions/http.exception.js';
import { audit } from '../../common/utils/audit.js';
import type { RequestContext } from '../../common/utils/request-context.js';
import { assertCanEdit, getProjectAccess } from '../projects/project-access.js';
import { trashPageTree } from '../trash/trash.service.js';

const MAX_VERSIONS = 100; // per page — older ones are dropped

export const createPageSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(200_000).default(''),
  parentId: z.number().int().positive().nullable().optional(),
});
export const updatePageSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().max(200_000).optional(),
    parentId: z.number().int().positive().nullable().optional(),
    position: z.number().int().min(0).max(100_000).optional(),
    /** the page's updatedAt when editing started (conflict check for title / body changes) */
    baseUpdatedAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine((d) => d.title !== undefined || d.body !== undefined || d.parentId !== undefined || d.position !== undefined, { message: 'Nothing to update' });
export const searchPagesQuery = z.object({ q: z.string().trim().min(2).max(100) });

const PAGE_LIST = `
  SELECT pg.id, pg.parent_id AS "parentId", pg.title, pg.position, pg.updated_at AS "updatedAt",
         CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name) END AS "updatedBy"
    FROM project_pages pg LEFT JOIN users u ON u.id = pg.updated_by`;

export class PagesService {
  /** Flat list (the client builds the tree): live pages only. */
  async list(projectRef: string, ctx: RequestContext) {
    const { project } = await getProjectAccess(ctx, projectRef);
    const { rows } = await db.query(`${PAGE_LIST} WHERE pg.project_id = $1 AND pg.deleted_at IS NULL ORDER BY pg.position, lower(pg.title)`, [project.id]);
    return rows;
  }

  async search(projectRef: string, q: string, ctx: RequestContext) {
    const { project } = await getProjectAccess(ctx, projectRef);
    const { rows } = await db.query(
      `SELECT pg.id, pg.title,
              ts_headline('simple', regexp_replace(pg.body, '[#*>\`_\\[\\]()]', '', 'g'), plainto_tsquery('simple', $2),
                          'StartSel=[[, StopSel=]], MaxFragments=1, MaxWords=20, MinWords=8') AS snippet
         FROM project_pages pg
        WHERE pg.project_id = $1 AND pg.deleted_at IS NULL
          AND (pg.search_vector @@ plainto_tsquery('simple', $2) OR pg.title ILIKE '%' || $3 || '%')
        ORDER BY ts_rank(pg.search_vector, plainto_tsquery('simple', $2)) DESC, pg.title
        LIMIT 20`,
      [project.id, q, q.replace(/[\\%_]/g, '\\$&')],
    );
    return rows;
  }

  async get(projectRef: string, pageId: number, ctx: RequestContext) {
    const { project, canEdit } = await getProjectAccess(ctx, projectRef);
    const page = await loadPage(db, project.id, pageId);
    return { ...page, canEdit };
  }

  async create(projectRef: string, dto: z.infer<typeof createPageSchema>, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    const { project } = access;
    const id = await withTransaction(async (client) => {
      if (dto.parentId) await loadPage(client, project.id, dto.parentId);
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO project_pages (organization_id, project_id, parent_id, title, body, position, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5,
                 (SELECT COALESCE(MAX(position), 0) + 1 FROM project_pages WHERE project_id = $2 AND parent_id IS NOT DISTINCT FROM $3),
                 $6, $6) RETURNING id`,
        [project.organizationId, project.id, dto.parentId ?? null, dto.title, dto.body, ctx.user!.id],
      );
      await saveVersion(client, rows[0]!.id, dto.title, dto.body, ctx.user!.id);
      await audit(ctx, { action: 'page.create', entity: 'page', entityId: rows[0]!.id, details: { project: project.key, title: dto.title } }, client);
      return rows[0]!.id;
    });
    return this.get(projectRef, id, ctx);
  }

  async update(projectRef: string, pageId: number, dto: z.infer<typeof updatePageSchema>, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    const { project } = access;
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ title: string; body: string; updatedAt: Date; updatedBy: string | null }>(
        `SELECT pg.title, pg.body, pg.updated_at AS "updatedAt", u.name AS "updatedBy"
           FROM project_pages pg LEFT JOIN users u ON u.id = pg.updated_by
          WHERE pg.id = $1 AND pg.project_id = $2 AND pg.deleted_at IS NULL FOR UPDATE OF pg`,
        [pageId, project.id],
      );
      const current = rows[0];
      if (!current) throw new NotFoundException('Page not found');
      const editsContent = dto.title !== undefined || dto.body !== undefined;
      if (editsContent && dto.baseUpdatedAt && new Date(dto.baseUpdatedAt).getTime() !== new Date(current.updatedAt).getTime()) {
        throw new ConflictException(
          `${current.updatedBy ?? 'Someone'} saved this page while you were editing. Copy your text, reload the page and apply your change again.`,
        ).withCode('PAGE_CHANGED');
      }
      if (dto.parentId !== undefined && dto.parentId !== null) await assertNoCycle(client, project.id, pageId, dto.parentId);

      await client.query(
        `UPDATE project_pages SET
            title = COALESCE($3, title), body = COALESCE($4, body),
            parent_id = CASE WHEN $5::boolean THEN $6 ELSE parent_id END,
            position = COALESCE($7, position),
            updated_by = CASE WHEN $8::boolean THEN $9 ELSE updated_by END,
            updated_at = CASE WHEN $8::boolean THEN NOW() ELSE updated_at END
          WHERE id = $1 AND project_id = $2`,
        [pageId, project.id, dto.title ?? null, dto.body ?? null, dto.parentId !== undefined, dto.parentId ?? null, dto.position ?? null,
         editsContent, ctx.user!.id],
      );
      const title = dto.title ?? current.title;
      const body = dto.body ?? current.body;
      if (editsContent && (title !== current.title || body !== current.body)) await saveVersion(client, pageId, title, body, ctx.user!.id);
    });
    return this.get(projectRef, pageId, ctx);
  }

  /** → trash (with its sub-pages). */
  async remove(projectRef: string, pageId: number, ctx: RequestContext) {
    const access = await getProjectAccess(ctx, projectRef);
    assertCanEdit(access);
    await loadPage(db, access.project.id, pageId);
    const count = await withTransaction(async (client) => {
      const n = await trashPageTree(client, pageId, ctx.user!.id);
      await audit(ctx, { action: 'page.trash', entity: 'page', entityId: pageId, details: { pages: n } }, client);
      return n;
    });
    return { trashed: count };
  }

  async versions(projectRef: string, pageId: number, ctx: RequestContext) {
    const { project } = await getProjectAccess(ctx, projectRef);
    await loadPage(db, project.id, pageId);
    const { rows } = await db.query(
      `SELECT v.id, v.title, v.created_at AS "createdAt", length(v.body) AS length,
              CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name) END AS "editedBy"
         FROM project_page_versions v LEFT JOIN users u ON u.id = v.edited_by
        WHERE v.page_id = $1 ORDER BY v.created_at DESC, v.id DESC`,
      [pageId],
    );
    return rows;
  }

  async version(projectRef: string, pageId: number, versionId: number, ctx: RequestContext) {
    const { project } = await getProjectAccess(ctx, projectRef);
    await loadPage(db, project.id, pageId);
    const { rows } = await db.query(
      `SELECT v.id, v.title, v.body, v.created_at AS "createdAt",
              CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name) END AS "editedBy"
         FROM project_page_versions v LEFT JOIN users u ON u.id = v.edited_by
        WHERE v.page_id = $1 AND v.id = $2`,
      [pageId, versionId],
    );
    if (!rows[0]) throw new NotFoundException('Version not found');
    return rows[0];
  }

  /** An older version becomes the current text (as a new save — nothing is lost). */
  async restoreVersion(projectRef: string, pageId: number, versionId: number, ctx: RequestContext) {
    const v = (await this.version(projectRef, pageId, versionId, ctx)) as { title: string; body: string };
    return this.update(projectRef, pageId, { title: v.title, body: v.body }, ctx);
  }
}

async function loadPage(executor: Queryable, projectId: number, pageId: number) {
  const { rows } = await executor.query(
    `SELECT pg.id, pg.parent_id AS "parentId", pg.title, pg.body, pg.position, pg.created_at AS "createdAt", pg.updated_at AS "updatedAt",
            CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('id', c.id, 'name', c.name) END AS "createdBy",
            CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name) END AS "updatedBy"
       FROM project_pages pg
       LEFT JOIN users c ON c.id = pg.created_by
       LEFT JOIN users u ON u.id = pg.updated_by
      WHERE pg.id = $1 AND pg.project_id = $2 AND pg.deleted_at IS NULL`,
    [pageId, projectId],
  );
  if (!rows[0]) throw new NotFoundException('Page not found');
  return rows[0];
}

async function saveVersion(client: Queryable, pageId: number, title: string, body: string, userId: number) {
  await client.query('INSERT INTO project_page_versions (page_id, title, body, edited_by) VALUES ($1, $2, $3, $4)', [pageId, title, body, userId]);
  await client.query(
    `DELETE FROM project_page_versions WHERE page_id = $1 AND id NOT IN
       (SELECT id FROM project_page_versions WHERE page_id = $1 ORDER BY created_at DESC, id DESC LIMIT ${MAX_VERSIONS})`,
    [pageId],
  );
}

/** A page can't become a sub-page of itself or of one of its own sub-pages. */
async function assertNoCycle(client: Queryable, projectId: number, pageId: number, newParentId: number) {
  if (newParentId === pageId) throw new BadRequestException('A page cannot be inside itself');
  await loadPage(client, projectId, newParentId);
  const { rows } = await client.query<{ loop: boolean }>(
    `WITH RECURSIVE up AS (
       SELECT id, parent_id FROM project_pages WHERE id = $1
       UNION ALL
       SELECT p.id, p.parent_id FROM project_pages p JOIN up ON p.id = up.parent_id
     ) SELECT EXISTS (SELECT 1 FROM up WHERE id = $2) AS loop`,
    [newParentId, pageId],
  );
  if (rows[0]!.loop) throw new BadRequestException('A page cannot be moved inside one of its own sub-pages');
}
