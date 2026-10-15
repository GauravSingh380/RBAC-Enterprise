// Weekly organization report (job "insights.weekly-report", every Monday via job_schedules).
// Recipients: everyone with insights.view (owners included) who didn't switch the "reports" email off.
import { env } from '../../config/env.js';
import { db } from '../../database/db.js';
import { logger } from '../../common/logger/logger.js';
import { defineJob } from '../../jobs/worker.js';
import { queueEmail } from '../email/email.service.js';
import { membersWithPermission } from '../notifications/notify.js';
import { InsightsService } from './insights.service.js';

const insights = new InsightsService();

defineJob('insights.weekly-report', async () => {
  const sent = await sendWeeklyReports();
  logger.info(`Weekly organization reports sent: ${sent}`);
});

/** The numbers that go into the email for one organization (last 7 days). */
export async function weeklyReportData(organizationId: number) {
  const { rows } = await db.query<{ name: string }>('SELECT name FROM organizations WHERE id = $1', [organizationId]);
  const o = await insights.compute(organizationId, 7, true);
  const lastWeek = o.trend.at(-2); // the last COMPLETE week (Monday → Sunday)
  return {
    organizationName: rows[0]?.name ?? '',
    created: lastWeek?.created ?? 0,
    done: lastWeek?.done ?? 0,
    open: o.totals.open,
    overdue: o.totals.overdue,
    openBugs: o.quality.openBugsBySeverity.reduce((s, b) => s + b.count, 0),
    criticalBugs: o.quality.openBugsBySeverity.find((b) => b.severity === 'critical')?.count ?? 0,
    newErrors: o.quality.errors.newInPeriod,
    activeUsers: o.people.active7,
    members: o.people.active,
    projectsNeedingAttention: o.projects
      .filter((p) => p.health === 'at_risk' || p.health === 'stale')
      .slice(0, 5)
      .map((p) => ({ name: `${p.name} (${p.key})`, why: p.reasons.join(', ') })),
    busiest: o.workload
      .filter((w) => w.overdue > 0 || w.open > 0)
      .sort((a, b) => b.overdue - a.overdue || b.open - a.open)
      .slice(0, 5)
      .map((w) => ({ name: w.user.name, open: w.open, overdue: w.overdue })),
    away: o.leave.outThisWeek.slice(0, 8).map((a) => ({ name: a.name, startDate: a.startDate, endDate: a.endDate })),
    pendingApprovals: o.leave.pendingApprovals,
  };
}

/** Sends the report of one organization to its recipients (or only to `onlyUserId`). Returns the number sent. */
export async function sendWeeklyReport(organizationId: number, onlyUserId?: number): Promise<number> {
  const recipientIds = onlyUserId ? [onlyUserId] : await membersWithPermission(db, organizationId, 'insights.view');
  if (!recipientIds.length) return 0;
  const { rows: people } = await db.query<{ id: number; name: string; email: string }>(
    `SELECT u.id, u.name, u.email
       FROM users u
       JOIN organization_members m ON m.user_id = u.id AND m.organization_id = $1 AND m.status = 'active'
       LEFT JOIN notification_preferences np ON np.user_id = u.id AND np.organization_id = $1 AND np.category = 'reports'
      WHERE u.id = ANY($2::int[]) AND u.is_active
        AND ($3::boolean OR COALESCE(np.email, 'instant') <> 'off') -- "send me" previews ignore the opt-out`,
    [organizationId, recipientIds, !!onlyUserId],
  );
  if (!people.length) return 0;
  const data = await weeklyReportData(organizationId);
  for (const p of people) {
    await queueEmail({
      to: p.email,
      template: 'insightsWeekly',
      organizationId,
      data: { ...data, name: p.name, url: `${env.appUrl}/org/insights`, settingsUrl: `${env.appUrl}/notifications?tab=settings` },
    });
  }
  return people.length;
}

export async function sendWeeklyReports(): Promise<number> {
  const { rows } = await db.query<{ id: number }>(`SELECT id FROM organizations WHERE status = 'active' ORDER BY id`);
  let sent = 0;
  for (const o of rows) sent += await sendWeeklyReport(o.id);
  return sent;
}
