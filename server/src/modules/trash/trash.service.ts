// Trash: deleting a work item, a doc page or a project only marks it (deleted_at). For 30 days it can be restored;
// then the nightly job "trash.purge" removes it for good (with its files).
//
//   items   — "delete" takes the item AND its live sub-items (same deleted_at = one "batch"); restore brings the batch back
//   pages   — same, with sub-pages
//   project — an archived project; organization project admins restore it (it comes back archived)
//
// Every query that reads work items / pages / projects skips deleted_at IS NOT NULL.
import { db, withTransaction, type Queryable } from '../../database/db.js';
import { logger } from '../../common/logger/logger.js';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '../../common/exceptions/http.exception.js';
import { audit } from '../../common/utils/audit.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';
import { defineJob } from '../../jobs/worker.js';
import { getProjectAccess, isOrgProjectAdmin, type ProjectAccess } from '../projects/project-access.js';
import { removeFiles } from '../projects/projects.service.js';
import { publishItems } from '../realtime/realtime.hub.js';
import { recordEvents } from '../work-items/work-item-events.js';

export const TRASH_DAYS = 30;

// ---------------------------------------------------------------- marking (used by the delete endpoints)

/** Moves an item and its live descendants to the trash (one batch = the same deleted_at). Returns their ids. */
export async function trashItemTree(client: Queryable, itemId: number, userId: number): Promise<number[]> {
  const { rows } = await client.query<{ id: number }>(
    `WITH RECURSIVE tree AS (
       SELECT id FROM work_items WHERE id = $1 AND deleted_at IS NULL
       UNION ALL
       SELECT w.id FROM work_items w JOIN tree t ON w.parent_id = t.id WHERE w.deleted_at IS NULL
     )
     UPDATE work_items SET deleted_at = NOW(), deleted_by = $2 WHERE id IN (SELECT id FROM tree) RETURNING id`,
    [itemId, userId],
  );
  return rows.map((r) => r.id);
}

/** Same for doc pages and their sub-pages. */
export async function trashPageTree(client: Queryable, pageId: number, userId: number): Promise<number> {
  const { rowCount } = await client.query(
    `WITH RECURSIVE tree AS (
       SELECT id FROM project_pages WHERE id = $1 AND deleted_at IS NULL
       UNION ALL
       SELECT p.id FROM project_pages p JOIN tree t ON p.parent_id = t.id WHERE p.deleted_at IS NULL
     )
     UPDATE project_pages SET deleted_at = NOW(), deleted_by = $2 WHERE id IN (SELECT id FROM tree)`,
    [pageId, userId],
  );
  return rowCount ?? 0;
}

export interface TrashEntry {
  kind: 'item' | 'page';
  id: number;
  /** items: "WEB-12" */
  key: string | null;
  title: string;
  type: string | null;
  /** sub-items / sub-pages deleted with it */
  withChildren: number;
  deletedAt: Date;
  deletedBy: { id: number; name: string } | null;
  purgeAt: Date;
  canRestore: boolean;
}

export class TrashService {
  /** Project trash — people who can edit the project (viewers can't delete, so they have nothing to restore). */
  async projectTrash(projectRef: string, ctx: RequestContext): Promise<TrashEntry[]> {
    const access = await getProjectAccess(ctx, projectRef);
    if (!access.canEdit && !access.canManage) throw new ForbiddenException('Only project members can see its trash');
    const me = ctx.user!.id;
    const admin = access.canManage;
    // roots only: the item itself was deleted, not as part of its parent's batch
    const { rows } = await db.query<Omit<TrashEntry, 'canRestore' | 'purgeAt'> & { deletedById: number | null }>(
      `SELECT 'item' AS kind, w.id, p.key || '-' || w.number AS key, w.title, w.type, w.deleted_at AS "deletedAt",
              w.deleted_by AS "deletedById",
              CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name) END AS "deletedBy",
              (SELECT COUNT(*)::int FROM work_items c WHERE c.project_id = w.project_id AND c.deleted_at = w.deleted_at AND c.id <> w.id) AS "withChildren"
         FROM work_items w
         JOIN projects p ON p.id = w.project_id
         LEFT JOIN users u ON u.id = w.deleted_by
         LEFT JOIN work_items parent ON parent.id = w.parent_id
        WHERE w.project_id = $1 AND w.deleted_at IS NOT NULL AND parent.deleted_at IS DISTINCT FROM w.deleted_at
       UNION ALL
       SELECT 'page', pg.id, NULL, pg.title, NULL, pg.deleted_at, pg.deleted_by,
              CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name) END,
              (SELECT COUNT(*)::int FROM project_pages c WHERE c.project_id = pg.project_id AND c.deleted_at = pg.deleted_at AND c.id <> pg.id)
         FROM project_pages pg
         LEFT JOIN users u ON u.id = pg.deleted_by
         LEFT JOIN project_pages parent ON parent.id = pg.parent_id
        WHERE pg.project_id = $1 AND pg.deleted_at IS NOT NULL AND parent.deleted_at IS DISTINCT FROM pg.deleted_at
        ORDER BY "deletedAt" DESC
        LIMIT 500`,
      [access.project.id],
    );
    return rows.map(({ deletedById, ...r }) => ({
      ...r,
      purgeAt: new Date(new Date(r.deletedAt).getTime() + TRASH_DAYS * 86_400_000),
      canRestore: access.project.status === 'active' && (admin || deletedById === me),
    }));
  }

  async restore(projectRef: string, kind: 'item' | 'page', id: number, ctx: RequestContext): Promise<{ restored: number }> {
    const access = await getProjectAccess(ctx, projectRef);
    if (access.project.status !== 'active') throw new BadRequestException('This project is archived (read-only)');
    const table = kind === 'item' ? 'work_items' : 'project_pages';

    const restoredIds = await withTransaction(async (client) => {
      const { rows } = await client.query<{ deletedAt: Date | null; deletedBy: number | null; parentDeleted: boolean; title: string }>(
        `SELECT x.deleted_at AS "deletedAt", x.deleted_by AS "deletedBy", x.title,
                (parent.id IS NOT NULL AND parent.deleted_at IS NOT NULL) AS "parentDeleted"
           FROM ${table} x LEFT JOIN ${table} parent ON parent.id = x.parent_id
          WHERE x.id = $1 AND x.project_id = $2 FOR UPDATE OF x`,
        [id, access.project.id],
      );
      const row = rows[0];
      if (!row?.deletedAt) throw new NotFoundException('Not in the trash');
      if (!access.canManage && row.deletedBy !== ctx.user!.id) {
        throw new ForbiddenException('Only project admins or the person who deleted it can restore it');
      }
      if (row.parentDeleted) throw new ConflictException(`Its parent is in the trash too — restore the parent first`);

      // the whole batch: this row and its descendants deleted at the same moment
      const { rows: back } = await client.query<{ id: number }>(
        // (deleted_at compared in SQL: a JavaScript Date would lose the microseconds)
        `WITH RECURSIVE root AS (SELECT deleted_at FROM ${table} WHERE id = $1),
         tree AS (
           SELECT id FROM ${table} WHERE id = $1
           UNION ALL
           SELECT c.id FROM ${table} c JOIN tree t ON c.parent_id = t.id WHERE c.deleted_at = (SELECT deleted_at FROM root)
         )
         UPDATE ${table} SET deleted_at = NULL, deleted_by = NULL WHERE id IN (SELECT id FROM tree) RETURNING id`,
        [id],
      );
      if (kind === 'item') {
        await recordEvents(client, { id, organizationId: access.project.organizationId }, ctx.user!.id, [{ type: 'restored' }]);
      }
      await audit(ctx, { action: `${kind === 'item' ? 'work_item' : 'page'}.restore`, entity: kind === 'item' ? 'work_item' : 'page', entityId: id, details: { title: row.title, count: back.length } }, client);
      return back.map((r) => r.id);
    });
    if (kind === 'item') await publishItems(ctx, access.project, 'created', restoredIds);
    return { restored: restoredIds.length };
  }

  /** Removes it now (project admins). */
  async deleteForever(projectRef: string, kind: 'item' | 'page', id: number, ctx: RequestContext): Promise<void> {
    const access = await getProjectAccess(ctx, projectRef);
    if (!access.canManage) throw new ForbiddenException('Only project admins can delete for good');
    const keys = await withTransaction(async (client) => {
      const { rows } = await client.query<{ deletedAt: Date | null; title: string }>(
        `SELECT deleted_at AS "deletedAt", title FROM ${kind === 'item' ? 'work_items' : 'project_pages'} WHERE id = $1 AND project_id = $2 FOR UPDATE`,
        [id, access.project.id],
      );
      if (!rows[0]?.deletedAt) throw new NotFoundException('Not in the trash');
      const files = kind === 'item' ? await purgeItemBatch(client, id) : (await purgePageBatch(client, id), []);
      await audit(ctx, { action: `${kind === 'item' ? 'work_item' : 'page'}.delete_forever`, entity: kind, entityId: id, details: { title: rows[0].title } }, client);
      return files;
    });
    await removeFiles(keys);
  }

  // ---------------------------------------------------------------- projects (organization project admins)

  async deletedProjects(ctx: RequestContext) {
    if (!isOrgProjectAdmin(tenantOf(ctx))) throw new ForbiddenException('Only organization admins can see deleted projects');
    const { rows } = await db.query(
      `SELECT p.id, p.key, p.name, p.color, p.deleted_at AS "deletedAt",
              p.deleted_at + make_interval(days => $2) AS "purgeAt",
              CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name) END AS "deletedBy",
              (SELECT COUNT(*)::int FROM work_items w WHERE w.project_id = p.id) AS "itemCount"
         FROM projects p LEFT JOIN users u ON u.id = p.deleted_by
        WHERE p.organization_id = $1 AND p.deleted_at IS NOT NULL
        ORDER BY p.deleted_at DESC`,
      [tenantOf(ctx).organizationId, TRASH_DAYS],
    );
    return rows;
  }

  /** Restored projects come back ARCHIVED (read-only, not counted by the plan) — restore from archive to use them. */
  async restoreProject(id: number, ctx: RequestContext) {
    if (!isOrgProjectAdmin(tenantOf(ctx))) throw new ForbiddenException('Only organization admins can restore projects');
    const { rows } = await db.query<{ key: string }>(
      `UPDATE projects SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NOT NULL RETURNING key`,
      [id, tenantOf(ctx).organizationId],
    );
    if (!rows[0]) throw new NotFoundException('Project not in the trash');
    await audit(ctx, { action: 'project.restore_from_trash', entity: 'project', entityId: id, details: { key: rows[0].key } });
    return { key: rows[0].key };
  }

  async deleteProjectForever(id: number, ctx: RequestContext) {
    if (!isOrgProjectAdmin(tenantOf(ctx))) throw new ForbiddenException('Only organization admins can delete projects');
    const keys = await withTransaction(async (client) => {
      const { rows } = await client.query<{ key: string; name: string }>(
        'SELECT key, name FROM projects WHERE id = $1 AND organization_id = $2 AND deleted_at IS NOT NULL FOR UPDATE',
        [id, tenantOf(ctx).organizationId],
      );
      if (!rows[0]) throw new NotFoundException('Project not in the trash');
      const files = await purgeProject(client, id);
      await audit(ctx, { action: 'project.delete', entity: 'project', entityId: id, details: rows[0] }, client);
      return files;
    });
    await removeFiles(keys);
  }
}

/** Moves an archived project to the trash (replaces the old permanent delete). */
export async function trashProject(access: ProjectAccess, ctx: RequestContext): Promise<void> {
  if (!isOrgProjectAdmin(tenantOf(ctx))) throw new ForbiddenException('Only organization admins can delete projects');
  if (access.project.status !== 'archived') throw new BadRequestException('Archive the project before deleting it');
  await db.query('UPDATE projects SET deleted_at = NOW(), deleted_by = $2 WHERE id = $1', [access.project.id, ctx.user!.id]);
  await audit(ctx, { action: 'project.trash', entity: 'project', entityId: access.project.id, details: { key: access.project.key, name: access.project.name } });
}

// ---------------------------------------------------------------- permanent removal

async function purgeItemBatch(client: Queryable, rootId: number): Promise<string[]> {
  const { rows } = await client.query<{ id: number }>(
    `WITH RECURSIVE root AS (SELECT deleted_at FROM work_items WHERE id = $1),
     tree AS (
       SELECT id FROM work_items WHERE id = $1
       UNION ALL
       SELECT c.id FROM work_items c JOIN tree t ON c.parent_id = t.id WHERE c.deleted_at = (SELECT deleted_at FROM root)
     ) SELECT id FROM tree`,
    [rootId],
  );
  const ids = rows.map((r) => r.id);
  const files = await client.query<{ key: string }>('SELECT storage_key AS key FROM work_item_attachments WHERE work_item_id = ANY($1::int[])', [ids]);
  await client.query('DELETE FROM work_items WHERE id = ANY($1::int[])', [ids]);
  return files.rows.map((f) => f.key);
}

async function purgePageBatch(client: Queryable, pageId: number) {
  await client.query('DELETE FROM project_pages WHERE id = $1', [pageId]); // sub-pages: ON DELETE CASCADE
}

async function purgeProject(client: Queryable, projectId: number): Promise<string[]> {
  const files = await client.query<{ key: string }>(
    `SELECT a.storage_key AS key FROM work_item_attachments a JOIN work_items w ON w.id = a.work_item_id WHERE w.project_id = $1`,
    [projectId],
  );
  await client.query('DELETE FROM projects WHERE id = $1', [projectId]);
  return files.rows.map((f) => f.key);
}

/** Nightly: everything deleted more than 30 days ago. Returns what was removed. */
export async function purgeTrash(days = TRASH_DAYS) {
  const cutoff = `NOW() - make_interval(days => ${Number(days)})`;
  const result = { projects: 0, items: 0, pages: 0 };
  const keys = await withTransaction(async (client) => {
    const all: string[] = [];
    const projects = await client.query<{ id: number }>(`SELECT id FROM projects WHERE deleted_at < ${cutoff}`);
    for (const p of projects.rows) all.push(...(await purgeProject(client, p.id)));
    result.projects = projects.rows.length;

    const files = await client.query<{ key: string }>(
      `SELECT a.storage_key AS key FROM work_item_attachments a JOIN work_items w ON w.id = a.work_item_id WHERE w.deleted_at < ${cutoff}`,
    );
    all.push(...files.rows.map((f) => f.key));
    result.items = (await client.query(`DELETE FROM work_items WHERE deleted_at < ${cutoff}`)).rowCount ?? 0;
    result.pages = (await client.query(`DELETE FROM project_pages WHERE deleted_at < ${cutoff}`)).rowCount ?? 0;
    return all;
  });
  await removeFiles(keys);
  return result;
}

defineJob('trash.purge', async () => {
  const r = await purgeTrash();
  if (r.projects || r.items || r.pages) logger.info(`Trash emptied: ${r.projects} project(s), ${r.items} item(s), ${r.pages} page(s) older than ${TRASH_DAYS} days`);
});
