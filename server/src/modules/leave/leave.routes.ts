// /api/leave — leave requests, balances, team calendar, and (leave.manage) types / calendars / allowances.
import { Router, type Response } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '../../common/constants/rbac.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requirePermission } from '../../common/middleware/permission.middleware.js';
import { requireOrganization } from '../../common/middleware/tenant.middleware.js';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import {
  balancesQuerySchema,
  bulkHolidaysSchema,
  calendarQuerySchema,
  calendarSchema,
  createLeaveSchema,
  decisionSchema,
  holidaySchema,
  leaveTypeSchema,
  listLeaveQuerySchema,
  memberCalendarSchema,
  previewLeaveSchema,
  rejectSchema,
  setBalanceSchema,
  updateCalendarSchema,
  updateLeaveTypeSchema,
} from './leave.dto.js';
import { LeaveSettingsService } from './leave-settings.service.js';
import { LeaveService } from './leave.service.js';

const leave = new LeaveService();
const settings = new LeaveSettingsService();
const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });
const thisYear = () => new Date().getFullYear();
const yearQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() });

const router = Router();
router.use(authenticate, requireOrganization);

const request = requirePermission(PERMISSIONS.LEAVE_REQUEST);
const manage = requirePermission(PERMISSIONS.LEAVE_MANAGE);

// ---------------------------------------------------------------- requests (everyone with leave.request)
// approve / reject: leave approvers (leave.approve) OR the person's manager — checked in the service
router.get('/types', request, async (req, res) => ok(res, await settings.listTypes(getContext(req))));
router.get('/balances', request, async (req, res) => {
  const q = balancesQuerySchema.parse(req.query);
  ok(res, await leave.balances(q.year ?? thisYear(), q.userId, getContext(req)));
});
router.post('/requests/preview', request, validateBody(previewLeaveSchema), async (req, res) => ok(res, await leave.preview(req.body, getContext(req))));
router.get('/requests', request, async (req, res) => ok(res, await leave.list(listLeaveQuerySchema.parse(req.query), getContext(req))));
router.post('/requests', request, validateBody(createLeaveSchema), async (req, res) => ok(res, await leave.create(req.body, getContext(req)), 201));
router.get('/requests/:id', request, async (req, res) => ok(res, await leave.findOne(parseId(req.params.id), getContext(req))));
router.post('/requests/:id/cancel', request, validateBody(decisionSchema), async (req, res) =>
  ok(res, await leave.cancel(parseId(req.params.id), req.body.note, getContext(req))),
);
router.post('/requests/:id/approve', request, validateBody(decisionSchema), async (req, res) =>
  ok(res, await leave.decide(parseId(req.params.id), 'approved', req.body.note, getContext(req))),
);
router.post('/requests/:id/reject', request, validateBody(rejectSchema), async (req, res) =>
  ok(res, await leave.decide(parseId(req.params.id), 'rejected', req.body.note, getContext(req))),
);
router.get('/calendar', request, async (req, res) => {
  const q = calendarQuerySchema.parse(req.query);
  ok(res, await leave.calendar(q.from, q.to, getContext(req)));
});

// ---------------------------------------------------------------- settings (leave.manage)
router.get('/settings/types', manage, async (req, res) => ok(res, await settings.listTypes(getContext(req), true)));
router.post('/settings/types', manage, validateBody(leaveTypeSchema), async (req, res) => ok(res, await settings.createType(req.body, getContext(req)), 201));
router.patch('/settings/types/:id', manage, validateBody(updateLeaveTypeSchema), async (req, res) =>
  ok(res, await settings.updateType(parseId(req.params.id), req.body, getContext(req))),
);
router.delete('/settings/types/:id', manage, async (req, res) => ok(res, await settings.deleteType(parseId(req.params.id), getContext(req))));

router.get('/settings/calendars', manage, async (req, res) => ok(res, await settings.listCalendars(getContext(req))));
router.post('/settings/calendars', manage, validateBody(calendarSchema), async (req, res) => ok(res, await settings.createCalendar(req.body, getContext(req)), 201));
router.patch('/settings/calendars/:id', manage, validateBody(updateCalendarSchema), async (req, res) =>
  ok(res, await settings.updateCalendar(parseId(req.params.id), req.body, getContext(req))),
);
router.delete('/settings/calendars/:id', manage, async (req, res) => ok(res, await settings.deleteCalendar(parseId(req.params.id), getContext(req))));
router.get('/settings/calendars/:id/holidays', manage, async (req, res) =>
  ok(res, await settings.listHolidays(parseId(req.params.id), yearQuery.parse(req.query).year ?? thisYear(), getContext(req))),
);
router.post('/settings/calendars/:id/holidays', manage, validateBody(holidaySchema), async (req, res) =>
  ok(res, await settings.addHolidays(parseId(req.params.id), [req.body], getContext(req)), 201),
);
router.post('/settings/calendars/:id/holidays/bulk', manage, validateBody(bulkHolidaysSchema), async (req, res) =>
  ok(res, await settings.addHolidays(parseId(req.params.id), settings.parseHolidayList(req.body.text), getContext(req)), 201),
);
router.delete('/settings/calendars/:id/holidays/:holidayId', manage, async (req, res) => {
  await settings.deleteHoliday(parseId(req.params.id), parseId(req.params.holidayId), getContext(req));
  res.status(204).send();
});

router.get('/settings/members', manage, async (req, res) => ok(res, await settings.listMembers(getContext(req))));
router.put('/settings/members/:userId/calendar', manage, validateBody(memberCalendarSchema), async (req, res) =>
  ok(res, await settings.setMemberCalendar(parseId(req.params.userId), req.body.calendarId, getContext(req))),
);
router.get('/settings/balances', manage, async (req, res) => ok(res, await settings.teamBalances(yearQuery.parse(req.query).year ?? thisYear(), getContext(req))));
router.put('/settings/balances', manage, validateBody(setBalanceSchema), async (req, res) => ok(res, await settings.setBalance(req.body, getContext(req))));

export default router;
