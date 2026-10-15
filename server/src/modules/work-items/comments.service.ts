// Comments on work items. Markdown body; mentions are written as @[Name](user:12).
// Mentioned people and the author automatically watch the item (notifications come in Phase 2g).
import { db, withTransaction, type Queryable } from '../../database/db.js';
import { ForbiddenException, NotFoundException } from '../../common/exceptions/http.exception.js';
import type { RequestContext } from '../../common/utils/request-context.js';
import { MEMBER_CAN_ACCESS_SQL, type ProjectAccess } from '../projects/project-access.js';
import { recordEvents } from './work-item-events.js';
import { WorkItemsService, resolveItem } from './work-items.service.js';
import { publishItems } from '../realtime/realtime.hub.js';
import { itemLabel, notify } from '../notifications/notify.js';

export interface Comment {
  id: number;
  body: string;
  author: { id: number; name: string } | null;
  createdAt: Date;
  editedAt: Date | null;
  reactions: { emoji: string; count: number; reacted: boolean; users: string[] }[];
  canEdit: boolean;
  canDelete: boolean;
}

const MENTION = /@\[([^\]]{1,100})\]\(user:(\d+)\)/g;

export const extractMentionIds = (body: string) => [...new Set([...body.matchAll(MENTION)].map((m) => Number(m[2])))];

const excerpt = (body: string) => body.replace(MENTION, '@$1').replace(/\s+/g, ' ').slice(0, 140);

function assertCanComment(access: ProjectAccess) {
  if (access.project.status !== 'active') throw new ForbiddenException('This project is archived (read-only)');
}

export class CommentsService {
  private readonly items = new WorkItemsService();

  async list(ref: string, ctx: RequestContext): Promise<Comment[]> {
    const { itemId, access } = await resolveItem(ctx, ref);
    return this.load(itemId, access, ctx);
  }

  private async load(itemId: number, access: ProjectAccess, ctx: RequestContext, onlyId?: number): Promise<Comment[]> {
    const userId = ctx.user!.id;
    const { rows } = await db.query<Omit<Comment, 'canEdit' | 'canDelete'> & { authorId: number | null }>(
      `SELECT c.id, c.body, c.created_at AS "createdAt", c.edited_at AS "editedAt", c.author_id AS "authorId",
              CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name) END AS author,
              COALESCE((SELECT json_agg(r ORDER BY r.first) FROM (
                  SELECT cr.emoji, COUNT(*)::int AS count, bool_or(cr.user_id = $2) AS reacted,
                         array_agg(ru.name ORDER BY cr.created_at) AS users, MIN(cr.created_at) AS first
                    FROM comment_reactions cr JOIN users ru ON ru.id = cr.user_id
                   WHERE cr.comment_id = c.id GROUP BY cr.emoji) r), '[]') AS reactions
         FROM work_item_comments c LEFT JOIN users u ON u.id = c.author_id
        WHERE c.work_item_id = $1 AND ($3::int IS NULL OR c.id = $3)
        ORDER BY c.created_at, c.id`,
      [itemId, userId, onlyId ?? null],
    );
    const active = access.project.status === 'active';
    return rows.map(({ authorId, ...c }) => ({
      ...c,
      reactions: (c.reactions as (Comment['reactions'][number] & { first?: string })[]).map(({ first: _first, ...r }) => r),
      canEdit: active && authorId === userId,
      canDelete: active && (authorId === userId || access.role === 'admin'),
    }));
  }

  /** `notify: false` when the caller sends its own, more specific notification (e.g. a QA verdict). */
  async create(ref: string, body: string, ctx: RequestContext, opts: { notify?: boolean } = {}): Promise<Comment> {
    const { itemId, access } = await resolveItem(ctx, ref);
    assertCanComment(access);
    const userId = ctx.user!.id;

    const commentId = await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: number }>(
        'INSERT INTO work_item_comments (organization_id, work_item_id, author_id, body) VALUES ($1, $2, $3, $4) RETURNING id',
        [access.project.organizationId, itemId, userId, body],
      );
      const id = rows[0]!.id;
      const mentioned = await this.saveMentions(id, body, access, client);
      await this.items.addWatchers(itemId, access.project.organizationId, [userId, ...mentioned], client);
      await client.query('UPDATE work_items SET updated_at = NOW() WHERE id = $1', [itemId]);
      await recordEvents(client, { id: itemId, organizationId: access.project.organizationId }, userId, [
        { type: 'commented', newValue: { commentId: id, excerpt: excerpt(body) } },
      ]);
      if (opts.notify !== false) {
        const item = await itemLabel(client, itemId);
        const base = { organizationId: access.project.organizationId, actorId: userId, body: excerpt(body), url: item.url, workItemId: itemId };
        // @mentioned people get "mentioned"; the other watchers get "commented" (never both)
        await notify(client, { ...base, userIds: mentioned, type: 'mentioned', title: `${ctx.user!.name} mentioned you on ${item.key}` });
        const watchers = await client.query<{ userId: number }>('SELECT user_id AS "userId" FROM work_item_watchers WHERE work_item_id = $1', [itemId]);
        await notify(client, {
          ...base,
          userIds: watchers.rows.map((w) => w.userId).filter((id) => !mentioned.includes(id)),
          type: 'commented',
          title: `${ctx.user!.name} commented on ${item.key}: ${item.title}`,
        });
      }
      return id;
    });
    await publishItems(ctx, access.project, 'commented', [itemId]);
    return (await this.load(itemId, access, ctx, commentId))[0]!;
  }

  async edit(ref: string, commentId: number, body: string, ctx: RequestContext): Promise<Comment> {
    const { itemId, access } = await resolveItem(ctx, ref);
    assertCanComment(access);
    await withTransaction(async (client) => {
      const author = await this.authorOf(itemId, commentId, client);
      if (author !== ctx.user!.id) throw new ForbiddenException('You can only edit your own comments');
      await client.query('UPDATE work_item_comments SET body = $1, edited_at = NOW() WHERE id = $2', [body, commentId]);
      await client.query('DELETE FROM comment_mentions WHERE comment_id = $1', [commentId]);
      const mentioned = await this.saveMentions(commentId, body, access, client);
      await this.items.addWatchers(itemId, access.project.organizationId, mentioned, client);
      await recordEvents(client, { id: itemId, organizationId: access.project.organizationId }, ctx.user!.id, [
        { type: 'comment_edited', newValue: { commentId } },
      ]);
    });
    await publishItems(ctx, access.project, 'commented', [itemId]);
    return (await this.load(itemId, access, ctx, commentId))[0]!;
  }

  async remove(ref: string, commentId: number, ctx: RequestContext): Promise<void> {
    const { itemId, access } = await resolveItem(ctx, ref);
    assertCanComment(access);
    await withTransaction(async (client) => {
      const author = await this.authorOf(itemId, commentId, client);
      if (author !== ctx.user!.id && access.role !== 'admin') {
        throw new ForbiddenException('Only the author or a project admin can delete this comment');
      }
      await client.query('DELETE FROM work_item_comments WHERE id = $1', [commentId]);
      await recordEvents(client, { id: itemId, organizationId: access.project.organizationId }, ctx.user!.id, [
        { type: 'comment_deleted', oldValue: { commentId } },
      ]);
    });
    await publishItems(ctx, access.project, 'commented', [itemId]);
  }

  /** Toggles the current user's reaction. */
  async react(ref: string, commentId: number, emoji: string, ctx: RequestContext): Promise<Comment> {
    const { itemId, access } = await resolveItem(ctx, ref);
    assertCanComment(access);
    await this.authorOf(itemId, commentId, db);
    const removed = await db.query('DELETE FROM comment_reactions WHERE comment_id = $1 AND user_id = $2 AND emoji = $3', [
      commentId,
      ctx.user!.id,
      emoji,
    ]);
    if (!removed.rowCount) {
      await db.query('INSERT INTO comment_reactions (comment_id, user_id, emoji) VALUES ($1, $2, $3)', [commentId, ctx.user!.id, emoji]);
    }
    await publishItems(ctx, access.project, 'commented', [itemId]);
    return (await this.load(itemId, access, ctx, commentId))[0]!;
  }

  private async authorOf(itemId: number, commentId: number, executor: Queryable): Promise<number | null> {
    const { rows } = await executor.query<{ authorId: number | null }>(
      'SELECT author_id AS "authorId" FROM work_item_comments WHERE id = $1 AND work_item_id = $2',
      [commentId, itemId],
    );
    if (!rows[0]) throw new NotFoundException('Comment not found');
    return rows[0].authorId;
  }

  /** Stores mentions of people who can access the project; returns their ids. */
  private async saveMentions(commentId: number, body: string, access: ProjectAccess, executor: Queryable): Promise<number[]> {
    const ids = extractMentionIds(body);
    if (!ids.length) return [];
    const { rows } = await executor.query<{ id: number }>(
      `INSERT INTO comment_mentions (comment_id, user_id)
       SELECT $1, m.user_id FROM organization_members m
        WHERE m.organization_id = $2 AND m.user_id = ANY($3::int[]) AND m.status = 'active'
          AND ${MEMBER_CAN_ACCESS_SQL('$4', '$5')}
       ON CONFLICT DO NOTHING
       RETURNING user_id AS id`,
      [commentId, access.project.organizationId, ids, access.project.visibility, access.project.id],
    );
    return rows.map((r) => r.id);
  }
}
