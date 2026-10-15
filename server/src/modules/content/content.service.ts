// Editable content.
//   organizationId = null  -> public / platform content (home page), edited by platform admins
//   organizationId = N     -> content of one organization (dashboard announcement)
import { db } from '../../database/db.js';
import { audit } from '../../common/utils/audit.js';
import type { RequestContext } from '../../common/utils/request-context.js';

export interface SiteContent {
  key: string;
  content: Record<string, unknown>;
  updatedAt: Date | null;
}

export class ContentService {
  /** Returns the content, or an empty object if nothing was saved yet. */
  async findOne(organizationId: number | null, key: string): Promise<SiteContent> {
    const { rows } = await db.query<SiteContent>(
      `SELECT key, content, updated_at AS "updatedAt" FROM site_content
        WHERE organization_id IS NOT DISTINCT FROM $1 AND key = $2`,
      [organizationId, key],
    );
    return rows[0] ?? { key, content: {}, updatedAt: null };
  }

  async save(organizationId: number | null, key: string, content: Record<string, unknown>, ctx: RequestContext): Promise<SiteContent> {
    const json = JSON.stringify(content);
    const updated = await db.query(
      `UPDATE site_content SET content = $3, updated_by = $4, updated_at = NOW()
        WHERE organization_id IS NOT DISTINCT FROM $1 AND key = $2`,
      [organizationId, key, json, ctx.user!.id],
    );
    if (!updated.rowCount) {
      await db.query('INSERT INTO site_content (organization_id, key, content, updated_by) VALUES ($1, $2, $3, $4)', [
        organizationId,
        key,
        json,
        ctx.user!.id,
      ]);
    }
    await audit(ctx, { action: 'content.update', entity: 'content', entityId: key, organizationId });
    return this.findOne(organizationId, key);
  }
}
