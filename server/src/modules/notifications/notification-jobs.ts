// Background jobs of the notification system (registered when jobs/index.ts imports this file).
//
//   notifications.email   one notification by email — skipped if it was already read in the app
//   notifications.digest  once a day (job_schedules): everything unread with email = 'daily', one email per person
import { env } from '../../config/env.js';
import { db } from '../../database/db.js';
import { logger } from '../../common/logger/logger.js';
import { defineJob } from '../../jobs/worker.js';
import { queueEmail } from '../email/email.service.js';
import { NOTIFICATION_EMAIL_QUEUE } from './notify.js';

const DIGEST_MAX_ITEMS = 25;

defineJob<{ notificationId: number }>(NOTIFICATION_EMAIL_QUEUE, async ({ notificationId }) => {
  await sendNotificationEmail(notificationId);
});

defineJob('notifications.digest', async () => {
  const sent = await sendDailyDigests();
  logger.info(`Notification digests sent: ${sent}`);
});

export async function sendNotificationEmail(notificationId: number): Promise<'sent' | 'skipped'> {
  const { rows } = await db.query<{ id: number; organizationId: number; title: string; body: string | null; url: string; readAt: Date | null; emailedAt: Date | null; email: string; name: string; organizationName: string }>(
    `SELECT n.id::int, n.organization_id AS "organizationId", n.title, n.body, n.url, n.read_at AS "readAt", n.emailed_at AS "emailedAt",
            u.email, u.name, o.name AS "organizationName"
       FROM notifications n JOIN users u ON u.id = n.user_id JOIN organizations o ON o.id = n.organization_id
      WHERE n.id = $1`,
    [notificationId],
  );
  const n = rows[0];
  if (!n || n.readAt || n.emailedAt) return 'skipped'; // seen in the app already → no email
  await queueEmail({
    to: n.email,
    template: 'notification',
    organizationId: n.organizationId,
    data: { name: n.name, organizationName: n.organizationName, title: n.title, body: n.body, url: `${env.appUrl}${n.url}`, settingsUrl: `${env.appUrl}/notifications?tab=settings` },
  });
  await db.query('UPDATE notifications SET emailed_at = NOW() WHERE id = $1', [n.id]);
  return 'sent';
}

/** One email per person and organization with their unread "daily" notifications of the last 2 days. */
export async function sendDailyDigests(): Promise<number> {
  const { rows: groups } = await db.query<{ userId: number; organizationId: number; email: string; name: string; organizationName: string }>(
    `SELECT DISTINCT n.user_id AS "userId", n.organization_id AS "organizationId", u.email, u.name, o.name AS "organizationName"
       FROM notifications n JOIN users u ON u.id = n.user_id AND u.is_active JOIN organizations o ON o.id = n.organization_id
      WHERE n.email = 'daily' AND n.emailed_at IS NULL AND n.read_at IS NULL AND n.created_at > NOW() - INTERVAL '2 days'`,
  );
  let sent = 0;
  for (const g of groups) {
    const { rows: items } = await db.query<{ id: number; title: string; body: string | null; url: string; count: number; updatedAt: Date }>(
      `UPDATE notifications SET emailed_at = NOW()
        WHERE id IN (SELECT id FROM notifications
                      WHERE user_id = $1 AND organization_id = $2 AND email = 'daily' AND emailed_at IS NULL AND read_at IS NULL
                        AND created_at > NOW() - INTERVAL '2 days')
        RETURNING id::int, title, body, url, count, updated_at AS "updatedAt"`,
      [g.userId, g.organizationId],
    );
    if (!items.length) continue;
    items.sort((a, b) => +b.updatedAt - +a.updatedAt);
    await queueEmail({
      to: g.email,
      template: 'notificationDigest',
      organizationId: g.organizationId,
      data: {
        name: g.name,
        organizationName: g.organizationName,
        total: items.length,
        items: items.slice(0, DIGEST_MAX_ITEMS).map((i) => ({ title: i.count > 1 ? `${i.title} (+${i.count - 1} more)` : i.title, body: i.body, url: `${env.appUrl}${i.url}` })),
        url: `${env.appUrl}/notifications`,
        settingsUrl: `${env.appUrl}/notifications?tab=settings`,
      },
    });
    sent++;
  }
  return sent;
}
