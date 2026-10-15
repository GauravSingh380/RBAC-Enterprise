// notify() — the one function every module calls to tell people something happened.
//
//   await notify(client, { organizationId, userIds: [assigneeId], actorId, type: 'assigned', title, body, url, workItemId })
//
// Call it INSIDE the transaction of the change (pass the transaction client):
//   * the notification rows commit or roll back together with the change
//   * the instant-email job is in the same transaction (transactional outbox)
//   * the realtime ping uses pg_notify on the same client — PostgreSQL delivers NOTIFY only on COMMIT,
//     so a bell never lights up for a change that was rolled back
//
// Rules: the actor is never notified about their own action; only active members are notified;
// each person's preference for the category decides in-app / email (off · instant · daily digest);
// a burst on the same item (e.g. 5 comments in 10 minutes) collapses into ONE unread notification.
import { env } from '../../config/env.js';
import type { Queryable } from '../../database/db.js';
import { enqueue } from '../../jobs/queue.js';
import { CATEGORY_META, TYPE_CATEGORY, type EmailMode, type NotificationType } from './notification-types.js';

const COLLAPSE_MINUTES = 30;
export const NOTIFICATION_EMAIL_QUEUE = 'notifications.email';

export interface NotifyInput {
  organizationId: number;
  userIds: (number | null | undefined)[];
  actorId: number | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  /** app path, e.g. /projects/TF/items/12 */
  url: string;
  workItemId?: number | null;
}

/** Returns the ids of the people who got (or had collapsed into) a notification. */
export async function notify(executor: Queryable, n: NotifyInput): Promise<number[]> {
  const ids = [...new Set(n.userIds.filter((id): id is number => !!id && id !== n.actorId))];
  if (!ids.length) return [];
  const category = TYPE_CATEGORY[n.type];
  const defaults = CATEGORY_META[category].defaults;

  const { rows: recipients } = await executor.query<{ userId: number; inApp: boolean | null; email: EmailMode | null }>(
    `SELECT m.user_id AS "userId", p.in_app AS "inApp", p.email
       FROM organization_members m
       JOIN users u ON u.id = m.user_id AND u.is_active
       LEFT JOIN notification_preferences p ON p.user_id = m.user_id AND p.organization_id = m.organization_id AND p.category = $3
      WHERE m.organization_id = $1 AND m.user_id = ANY($2::int[]) AND m.status = 'active'`,
    [n.organizationId, ids, category],
  );

  const notified: number[] = [];
  for (const r of recipients) {
    const inApp = r.inApp ?? defaults.inApp;
    const email = r.email ?? defaults.email;
    if (!inApp && email === 'off') continue;

    if (n.workItemId) {
      const collapsed = await executor.query(
        `UPDATE notifications SET count = count + 1, title = $5, body = $6, actor_id = $7, updated_at = NOW()
          WHERE user_id = $1 AND organization_id = $2 AND type = $3 AND work_item_id = $4
            AND read_at IS NULL AND updated_at > NOW() - make_interval(mins => ${COLLAPSE_MINUTES})`,
        [r.userId, n.organizationId, n.type, n.workItemId, n.title.slice(0, 300), n.body ?? null, n.actorId],
      );
      if (collapsed.rowCount) {
        notified.push(r.userId);
        continue; // an email for this burst is already scheduled
      }
    }

    const { rows } = await executor.query<{ id: number }>(
      `INSERT INTO notifications (organization_id, user_id, category, type, actor_id, title, body, url, work_item_id, in_app, email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id::int`,
      [n.organizationId, r.userId, category, n.type, n.actorId, n.title.slice(0, 300), n.body ?? null, n.url, n.workItemId ?? null, inApp, email],
    );
    if (email === 'instant') {
      // a short delay: if the person reads it in the app first, the email is skipped
      await enqueue(NOTIFICATION_EMAIL_QUEUE, { notificationId: rows[0]!.id }, {
        executor,
        organizationId: n.organizationId,
        runAt: new Date(Date.now() + env.notifications.emailDelaySeconds * 1000),
      });
    }
    notified.push(r.userId);
  }

  if (notified.length) {
    // delivered by PostgreSQL on COMMIT (or never, on rollback) → realtime.hub sends it to these users only
    await executor.query('SELECT pg_notify($1, $2)', [
      'tf_events',
      JSON.stringify({ type: 'notifications', action: 'created', organizationId: n.organizationId, projectId: 0, userIds: notified, actorId: n.actorId, clientId: null, at: new Date().toISOString() }),
    ]);
  }
  return notified;
}

/** Active members who have a permission in the organization (owners always). */
export async function membersWithPermission(executor: Queryable, organizationId: number, permission: string): Promise<number[]> {
  const { rows } = await executor.query<{ userId: number }>(
    `SELECT DISTINCT m.user_id AS "userId"
       FROM organization_members m
       JOIN member_roles mr ON mr.organization_id = m.organization_id AND mr.user_id = m.user_id
       JOIN roles r ON r.id = mr.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE m.organization_id = $1 AND m.status = 'active' AND (r.name = 'owner' OR p.name = $2)`,
    [organizationId, permission],
  );
  return rows.map((r) => r.userId);
}

/** "TF-12", its number, project key and title — for notification texts and links. */
export async function itemLabel(executor: Queryable, itemId: number) {
  const { rows } = await executor.query<{ key: string; number: number; projectKey: string; title: string }>(
    `SELECT p.key || '-' || w.number AS key, w.number, p.key AS "projectKey", w.title
       FROM work_items w JOIN projects p ON p.id = w.project_id WHERE w.id = $1`,
    [itemId],
  );
  const r = rows[0]!;
  return { ...r, url: `/projects/${r.projectKey}/items/${r.number}` };
}
