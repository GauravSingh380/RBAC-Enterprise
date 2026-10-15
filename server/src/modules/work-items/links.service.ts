// Links between work items: blocks / duplicates / relates to.
// Stored once (source → target); the reverse wording ("is blocked by") is computed when reading.
import { db, withTransaction } from '../../database/db.js';
import { BadRequestException, ConflictException, NotFoundException } from '../../common/exceptions/http.exception.js';
import type { RequestContext } from '../../common/utils/request-context.js';
import { assertCanEdit } from '../projects/project-access.js';
import { recordEvents } from './work-item-events.js';
import { LINK_TYPES } from './work-items.dto.js';
import { resolveItem } from './work-items.service.js';
import { publishItems } from '../realtime/realtime.hub.js';

const UNIQUE_VIOLATION = '23505';

/** Normalizes the 5 user-facing link types to the 3 stored ones (+ direction). */
function normalize(linkType: (typeof LINK_TYPES)[number], itemId: number, otherId: number) {
  switch (linkType) {
    case 'blocks':
      return { source: itemId, target: otherId, type: 'blocks' };
    case 'blocked_by':
      return { source: otherId, target: itemId, type: 'blocks' };
    case 'duplicates':
      return { source: itemId, target: otherId, type: 'duplicates' };
    case 'duplicated_by':
      return { source: otherId, target: itemId, type: 'duplicates' };
    default:
      return { source: itemId, target: otherId, type: 'relates_to' };
  }
}

async function keyOf(id: number) {
  const { rows } = await db.query<{ key: string }>(
    `SELECT p.key || '-' || w.number AS key FROM work_items w JOIN projects p ON p.id = w.project_id WHERE w.id = $1`,
    [id],
  );
  return rows[0]?.key ?? String(id);
}

export class LinksService {
  async create(ref: string, target: string | number, linkType: (typeof LINK_TYPES)[number], ctx: RequestContext): Promise<void> {
    const { itemId, access } = await resolveItem(ctx, ref);
    assertCanEdit(access);
    const other = await resolveItem(ctx, target); // must be visible to the user too
    if (other.itemId === itemId) throw new BadRequestException('An item cannot be linked to itself');

    const link = normalize(linkType, itemId, other.itemId);
    if (link.type === 'relates_to') {
      const reverse = await db.query(
        `SELECT 1 FROM work_item_links WHERE link_type = 'relates_to' AND source_id = $1 AND target_id = $2`,
        [link.target, link.source],
      );
      if (reverse.rowCount) throw new ConflictException('These items are already linked');
    }

    const [itemKey, otherKey] = await Promise.all([keyOf(itemId), keyOf(other.itemId)]);
    try {
      await withTransaction(async (client) => {
        await client.query(
          'INSERT INTO work_item_links (organization_id, source_id, target_id, link_type, created_by) VALUES ($1, $2, $3, $4, $5)',
          [access.project.organizationId, link.source, link.target, link.type, ctx.user!.id],
        );
        const orgId = access.project.organizationId;
        await recordEvents(client, { id: itemId, organizationId: orgId }, ctx.user!.id, [
          { type: 'link_added', newValue: { linkType, item: otherKey } },
        ]);
        await recordEvents(client, { id: other.itemId, organizationId: orgId }, ctx.user!.id, [
          { type: 'link_added', newValue: { linkType: `${linkType}:reverse`, item: itemKey } },
        ]);
      });
    } catch (err: any) {
      if (err.code === UNIQUE_VIOLATION) throw new ConflictException('These items are already linked this way');
      throw err;
    }
    await publishItems(ctx, access.project, 'updated', [itemId]);
  }

  async remove(ref: string, linkId: number, ctx: RequestContext): Promise<void> {
    const { itemId, access } = await resolveItem(ctx, ref);
    assertCanEdit(access);
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ sourceId: number; targetId: number; linkType: string }>(
        `DELETE FROM work_item_links WHERE id = $1 AND (source_id = $2 OR target_id = $2)
         RETURNING source_id AS "sourceId", target_id AS "targetId", link_type AS "linkType"`,
        [linkId, itemId],
      );
      const link = rows[0];
      if (!link) throw new NotFoundException('Link not found');
      const otherId = link.sourceId === itemId ? link.targetId : link.sourceId;
      const orgId = access.project.organizationId;
      await recordEvents(client, { id: itemId, organizationId: orgId }, ctx.user!.id, [
        { type: 'link_removed', oldValue: { linkType: link.linkType, item: await keyOf(otherId) } },
      ]);
      await recordEvents(client, { id: otherId, organizationId: orgId }, ctx.user!.id, [
        { type: 'link_removed', oldValue: { linkType: link.linkType, item: await keyOf(itemId) } },
      ]);
    });
    await publishItems(ctx, access.project, 'updated', [itemId]);
  }
}
