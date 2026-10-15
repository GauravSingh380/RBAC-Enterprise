// Mounted at /api/projects/:projectRef/reports — read-only, anyone who can see the project.
import { Router } from 'express';
import { z } from 'zod';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import { projectRefOf } from '../projects/project-ref.js';
import { ReportsService } from './reports.service.js';

const reports = new ReportsService();
const router = Router({ mergeParams: true });

const velocityQuery = z.object({ limit: z.coerce.number().int().min(1).max(20).default(7) });
const overviewQuery = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) });
const qualityQuery = z.object({ weeks: z.coerce.number().int().min(4).max(52).default(12) });

router.get('/burndown/:sprintId', async (req, res) => {
  res.json({ success: true, data: await reports.burndown(projectRefOf(req), parseId(req.params.sprintId), getContext(req)) });
});
router.get('/velocity', async (req, res) => {
  res.json({ success: true, data: await reports.velocity(projectRefOf(req), velocityQuery.parse(req.query).limit, getContext(req)) });
});
router.get('/quality', async (req, res) => {
  res.json({ success: true, data: await reports.quality(projectRefOf(req), qualityQuery.parse(req.query).weeks, getContext(req)) });
});
router.get('/overview', async (req, res) => {
  res.json({ success: true, data: await reports.overview(projectRefOf(req), overviewQuery.parse(req.query).days, getContext(req)) });
});

export default router;
