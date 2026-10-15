// The bell: list, unread count, mark read / unread, and per-category preferences.
import { z } from 'zod';
import { db } from '../../database/db.js';
import { NotFoundException } from '../../common/exceptions/http.exception.js';
import { PERMISSIONS } from '../../common/constants/rbac.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';
import { CATEGORIES, CATEGORY_META, type Category, type EmailMode } from './notification-types.js';

export const listNotificationsQuerySchema = z.object({
  unread: z.enum(['true', 'false']).optional(),
  category: z.enum(CATEGORIES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const preferencesSchema = z.object({
  preferences: z
    .array(z.object({ category: z.enum(CATEGORIES), inApp: z.boolean(), email: z.enum(['off', 'instant', 'daily']) }))
    .min(1)
    .max(CATEGORIES.length),
});

export const markReadSchema = z.object({ ids: z.array(z.number().int().positive()).max(500).optional(), all: z.boolean().optional() });

export interface Notification {
  id: number;
  category: Category;
  type: string;
  title: string;
  body: string | null;
  url: string;
  count: number;
  actor: { id: number; name: string } | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class NotificationsService {
  async list(query: z.infer<typeof listNotificationsQuerySchema>, ctx: RequestContext) {
    const orgId = tenantOf(ctx).organizationId;
    const where = ['n.user_id = $1', 'n.organization_id = $2', 'n.in_app'];
    const params: unknown[] = [ctx.user!.id, orgId];
    if (query.unread === 'true') where.push('n.read_at IS NULL');
    if (query.category) {
      params.push(query.category);
      where.push(`n.category = $${params.length}`);
    }
    const whereSql = where.join(' AND ');
    const [items, total, unread] = await Promise.all([
      db.query<Notification>(
        `SELECT n.id::int, n.category, n.type, n.title, n.body, n.url, n.count, n.read_at AS "readAt",
                n.created_at AS "createdAt", n.updated_at AS "updatedAt",
                CASE WHEN a.id IS NULL THEN NULL ELSE json_build_object('id', a.id, 'name', a.name) END AS actor
           FROM notifications n LEFT JOIN users a ON a.id = n.actor_id
          WHERE ${whereSql}
          ORDER BY n.updated_at DESC, n.id DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, query.limit, (query.page - 1) * query.limit],
      ),
      db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM notifications n WHERE ${whereSql}`, params),
      this.unreadCount(ctx),
    ]);
    return { items: items.rows, total: total.rows[0]!.n, page: query.page, limit: query.limit, unread };
  }

  async unreadCount(ctx: RequestContext): Promise<number> {
    const { rows } = await db.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND organization_id = $2 AND in_app AND read_at IS NULL',
      [ctx.user!.id, tenantOf(ctx).organizationId],
    );
    return rows[0]!.n;
  }

  async markRead(input: { ids?: number[]; all?: boolean }, ctx: RequestContext) {
    const params: unknown[] = [ctx.user!.id, tenantOf(ctx).organizationId];
    let filter = '';
    if (!input.all) {
      params.push(input.ids ?? []);
      filter = 'AND id = ANY($3::bigint[])';
    }
    await db.query(`UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND organization_id = $2 AND read_at IS NULL ${filter}`, params);
    return { unread: await this.unreadCount(ctx) };
  }

  async markUnread(id: number, ctx: RequestContext) {
    const { rowCount } = await db.query('UPDATE notifications SET read_at = NULL WHERE id = $1 AND user_id = $2 AND organization_id = $3', [
      id,
      ctx.user!.id,
      tenantOf(ctx).organizationId,
    ]);
    if (!rowCount) throw new NotFoundException('Notification not found');
    return { unread: await this.unreadCount(ctx) };
  }

  /** Every category with the person's choice (or the default). */
  async preferences(ctx: RequestContext) {
    const { rows } = await db.query<{ category: Category; inApp: boolean; email: EmailMode }>(
      `SELECT category, in_app AS "inApp", email FROM notification_preferences WHERE user_id = $1 AND organization_id = $2`,
      [ctx.user!.id, tenantOf(ctx).organizationId],
    );
    const t = tenantOf(ctx);
    // the weekly report only concerns people who can see organization insights
    const visible = CATEGORIES.filter((c) => c !== 'reports' || t.isOwner || t.permissions.includes(PERMISSIONS.INSIGHTS_VIEW));
    return visible.map((category) => {
      const saved = rows.find((r) => r.category === category);
      const meta = CATEGORY_META[category];
      return {
        category,
        label: meta.label,
        description: meta.description,
        inApp: saved?.inApp ?? meta.defaults.inApp,
        email: saved?.email ?? meta.defaults.email,
        isDefault: !saved,
      };
    });
  }

  async setPreferences(prefs: z.infer<typeof preferencesSchema>['preferences'], ctx: RequestContext) {
    await db.query(
      `INSERT INTO notification_preferences (organization_id, user_id, category, in_app, email)
       SELECT $1, $2, p->>'category', (p->>'inApp')::boolean, p->>'email' FROM jsonb_array_elements($3::jsonb) p
       ON CONFLICT (user_id, organization_id, category) DO UPDATE SET in_app = EXCLUDED.in_app, email = EXCLUDED.email, updated_at = NOW()`,
      [tenantOf(ctx).organizationId, ctx.user!.id, JSON.stringify(prefs)],
    );
    return this.preferences(ctx);
  }
}
