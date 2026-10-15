// /api/my-work — the current user's to-do list across the organization (every member)
import { Router } from 'express';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requireOrganization } from '../../common/middleware/tenant.middleware.js';
import { getContext } from '../../common/utils/request-context.js';
import { calendarQuery, CalendarService } from '../calendar/calendar.service.js';
import { MyWorkService } from './my-work.service.js';

const myWork = new MyWorkService();
const calendar = new CalendarService();
const router = Router();

router.get('/', authenticate, requireOrganization, async (req, res) => {
  res.json({ success: true, data: await myWork.get(getContext(req)) });
});

// my items by due date, across projects (month view)
router.get('/calendar', authenticate, requireOrganization, async (req, res) => {
  const q = calendarQuery.parse(req.query);
  res.json({ success: true, data: await calendar.mine(q.from, q.to, getContext(req)) });
});

export default router;
