// File attachments on work items. Files go to the storage layer (local disk now, S3 later);
// the database keeps the metadata. Downloads always go through an access check.
import type { Readable } from 'node:stream';
import { db, withTransaction } from '../../database/db.js';
import { BadRequestException, ForbiddenException, NotFoundException } from '../../common/exceptions/http.exception.js';
import { logger } from '../../common/logger/logger.js';
import { buildStorageKey, storage } from '../../common/storage/storage.js';
import type { RequestContext } from '../../common/utils/request-context.js';
import { assertCanEdit } from '../projects/project-access.js';
import { removeFiles } from '../projects/projects.service.js';
import { recordEvents } from './work-item-events.js';
import { resolveItem } from './work-items.service.js';
import { publishItems } from '../realtime/realtime.hub.js';

export interface Attachment {
  id: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: { id: number; name: string } | null;
  createdAt: Date;
  canDelete: boolean;
}

/** Types that are safe to show inline in the browser; everything else is downloaded. */
export const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain']);

export class AttachmentsService {
  async list(ref: string, ctx: RequestContext): Promise<Attachment[]> {
    const { itemId, access } = await resolveItem(ctx, ref);
    const { rows } = await db.query<Omit<Attachment, 'canDelete'> & { uploaderId: number | null }>(
      `SELECT a.id, a.file_name AS "fileName", a.mime_type AS "mimeType", a.size_bytes::int AS "sizeBytes",
              a.uploaded_by AS "uploaderId", a.created_at AS "createdAt",
              CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name) END AS "uploadedBy"
         FROM work_item_attachments a LEFT JOIN users u ON u.id = a.uploaded_by
        WHERE a.work_item_id = $1 ORDER BY a.created_at DESC`,
      [itemId],
    );
    return rows.map(({ uploaderId, ...a }) => ({
      ...a,
      canDelete: access.canEdit && (uploaderId === ctx.user!.id || access.role === 'admin'),
    }));
  }

  async upload(ref: string, file: Express.Multer.File | undefined, ctx: RequestContext): Promise<Attachment[]> {
    if (!file) throw new BadRequestException('Choose a file to upload (form field "file")');
    const { itemId, access } = await resolveItem(ctx, ref);
    assertCanEdit(access);

    const fileName = file.originalname.replace(/[\\/\r\n"]/g, '_').slice(0, 255) || 'file';
    const key = buildStorageKey(access.project.organizationId, fileName);
    await storage.save(key, file.buffer);

    try {
      await withTransaction(async (client) => {
        const { rows } = await client.query<{ id: number }>(
          `INSERT INTO work_item_attachments (organization_id, work_item_id, uploaded_by, file_name, mime_type, size_bytes, storage_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [access.project.organizationId, itemId, ctx.user!.id, fileName, file.mimetype || 'application/octet-stream', file.size, key],
        );
        await client.query('UPDATE work_items SET updated_at = NOW() WHERE id = $1', [itemId]);
        await recordEvents(client, { id: itemId, organizationId: access.project.organizationId }, ctx.user!.id, [
          { type: 'attachment_added', newValue: { id: rows[0]!.id, fileName } },
        ]);
      });
    } catch (err) {
      await removeFiles([key]); // keep disk and database consistent
      throw err;
    }
    logger.info(`Attachment uploaded: ${fileName} (${file.size} bytes)`, { itemId });
    await publishItems(ctx, access.project, 'updated', [itemId]);
    return this.list(String(itemId), ctx);
  }

  async download(ref: string, attachmentId: number, ctx: RequestContext): Promise<{ meta: Attachment; stream: Readable }> {
    const { itemId } = await resolveItem(ctx, ref);
    const { rows } = await db.query<Attachment & { storageKey: string }>(
      `SELECT id, file_name AS "fileName", mime_type AS "mimeType", size_bytes::int AS "sizeBytes", storage_key AS "storageKey"
         FROM work_item_attachments WHERE id = $1 AND work_item_id = $2`,
      [attachmentId, itemId],
    );
    const meta = rows[0];
    if (!meta) throw new NotFoundException('Attachment not found');
    try {
      return { meta, stream: await storage.read(meta.storageKey) };
    } catch {
      throw new NotFoundException('The file is missing from storage');
    }
  }

  async remove(ref: string, attachmentId: number, ctx: RequestContext): Promise<void> {
    const { itemId, access } = await resolveItem(ctx, ref);
    assertCanEdit(access);
    const key = await withTransaction(async (client) => {
      const { rows } = await client.query<{ key: string; fileName: string; uploadedBy: number | null }>(
        `SELECT storage_key AS key, file_name AS "fileName", uploaded_by AS "uploadedBy"
           FROM work_item_attachments WHERE id = $1 AND work_item_id = $2`,
        [attachmentId, itemId],
      );
      const att = rows[0];
      if (!att) throw new NotFoundException('Attachment not found');
      if (att.uploadedBy !== ctx.user!.id && access.role !== 'admin') {
        throw new ForbiddenException('Only the uploader or a project admin can delete this file');
      }
      await client.query('DELETE FROM work_item_attachments WHERE id = $1', [attachmentId]);
      await recordEvents(client, { id: itemId, organizationId: access.project.organizationId }, ctx.user!.id, [
        { type: 'attachment_removed', oldValue: { id: attachmentId, fileName: att.fileName } },
      ]);
      return att.key;
    });
    await removeFiles([key]);
    await publishItems(ctx, access.project, 'updated', [itemId]);
  }
}
