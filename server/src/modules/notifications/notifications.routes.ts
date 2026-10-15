// /api/notifications — the current user's notifications in the active organization.
import { Router } from 'express';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requireOrganization } from '../../common/middleware/tenant.middleware.js';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import { listNotificationsQuerySchema, markReadSchema, NotificationsService, preferencesSchema } from './notifications.service.js';

const notifications = new NotificationsService();
const router = Router();
router.use(authenticate, requireOrganization);

router.get('/', async (req, res) => {
  res.json({ success: true, data: await notifications.list(listNotificationsQuerySchema.parse(req.query), getContext(req)) });
});
router.get('/unread-count', async (req, res) => {
  res.json({ success: true, data: { unread: await notifications.unreadCount(getContext(req)) } });
});
router.post('/read', validateBody(markReadSchema), async (req, res) => {
  res.json({ success: true, data: await notifications.markRead(req.body, getContext(req)) });
});
router.post('/:id/unread', async (req, res) => {
  res.json({ success: true, data: await notifications.markUnread(parseId(req.params.id), getContext(req)) });
});
router.get('/preferences', async (req, res) => {
  res.json({ success: true, data: await notifications.preferences(getContext(req)) });
});
router.put('/preferences', validateBody(preferencesSchema), async (req, res) => {
  res.json({ success: true, data: await notifications.setPreferences(req.body.preferences, getContext(req)) });
});

export default router;
