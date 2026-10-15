// /api/insights — organization insights (permission insights.view)
//   GET  /?days=30                     the whole picture
//   GET  /export/projects|workload     CSV download (Excel opens it)
//   POST /weekly-report/send-me        email this week's report to yourself now (preview)
import { Router } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../common/constants/rbac.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requirePermission } from '../../common/middleware/permission.middleware.js';
import { requireOrganization } from '../../common/middleware/tenant.middleware.js';
import { getContext } from '../../common/utils/request-context.js';
import { sendWeeklyReport } from './insights-report.js';
import { InsightsService, toCsv } from './insights.service.js';

const insights = new InsightsService();
const daysQuery = z.object({ days: z.coerce.number().int().refine((d) => [7, 30, 90].includes(d), 'Use 7, 30 or 90').default(30) });
const sectionParam = z.enum(['projects', 'workload']);

const router = Router();
router.use(authenticate, requireOrganization, requirePermission(PERMISSIONS.INSIGHTS_VIEW));

router.get('/', async (req, res) => {
  res.json({ success: true, data: await insights.overview(daysQuery.parse(req.query).days, getContext(req)) });
});

router.get('/export/:section', async (req, res) => {
  const section = sectionParam.parse(req.params.section);
  const { days } = daysQuery.parse(req.query);
  const o = await insights.overview(days, getContext(req));
  const date = new Date().toISOString().slice(0, 10);
  const csv =
    section === 'projects'
      ? toCsv(
          ['Key', 'Project', 'Health', 'Why', 'Open', 'Overdue', 'Open bugs', 'Critical bugs', `Created (${days}d)`, `Done (${days}d)`, 'Members', 'Lead', 'Last activity'],
          o.projects.map((p) => [p.key, p.name, p.health, p.reasons.join('; '), p.open, p.overdue, p.openBugs, p.criticalBugs, p.createdInPeriod, p.doneInPeriod, p.members, p.lead?.name, p.lastActivityAt ? new Date(p.lastActivityAt).toISOString() : '']),
        )
      : toCsv(
          ['Person', 'Open', 'In progress', 'Overdue', 'Points (open)', 'Projects', `Done (${days}d)`, 'Last active', 'Away (next 14 days)'],
          o.workload.map((w) => [w.user.name, w.open, w.inProgress, w.overdue, w.points, w.projects, w.doneInPeriod, w.lastActiveAt ? new Date(w.lastActiveAt).toISOString() : '', w.away ? `${w.away.startDate} – ${w.away.endDate}` : '']),
        );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="insights-${section}-${date}.csv"`);
  res.send('﻿' + csv); // BOM: Excel reads UTF-8 names correctly
});

router.post('/weekly-report/send-me', async (req, res) => {
  const ctx = getContext(req);
  const sent = await sendWeeklyReport(ctx.tenant!.organizationId, ctx.user!.id);
  res.json({ success: true, data: { sent } });
});

export default router;
