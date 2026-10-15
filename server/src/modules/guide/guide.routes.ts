// /api/guide — the Help Center, read inside an organization (permission guide.view)
//   GET  /                            sections + articles this reader may see
//   GET  /search?q=                   full-text search
//   GET  /articles/:slug              one article (+ previous / next)
//   GET  /getting-started             checklist for owners / admins ({ visible: false } for others)
//   POST /getting-started/dismiss     hide it for the organization  ·  /restore  show it again
//
// /api/platform/guide — writing it (platform admins, mounted in platform.routes.ts)
import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants/rbac.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requirePermission } from '../../common/middleware/permission.middleware.js';
import { requireOrganization } from '../../common/middleware/tenant.middleware.js';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import {
  GuideService, articleSchema, searchQuery, sectionSchema, updateArticleSchema, updateSectionSchema,
} from './guide.service.js';

const guide = new GuideService();

const router = Router();
router.use(authenticate, requireOrganization, requirePermission(PERMISSIONS.GUIDE_VIEW));

router.get('/', async (req, res) => {
  res.json({ success: true, data: await guide.contents(getContext(req)) });
});
router.get('/search', async (req, res) => {
  res.json({ success: true, data: await guide.search(searchQuery.parse(req.query).q, getContext(req)) });
});
router.get('/articles/:slug', async (req, res) => {
  res.json({ success: true, data: await guide.article(String(req.params.slug).toLowerCase(), getContext(req)) });
});
router.get('/getting-started', async (req, res) => {
  res.json({ success: true, data: await guide.gettingStarted(getContext(req)) });
});
// the checklist itself is only for owners / admins (users.update)
router.post('/getting-started/dismiss', requirePermission(PERMISSIONS.USERS_UPDATE), async (req, res) => {
  res.json({ success: true, data: await guide.setGettingStartedDismissed(true, getContext(req)) });
});
router.post('/getting-started/restore', requirePermission(PERMISSIONS.USERS_UPDATE), async (req, res) => {
  res.json({ success: true, data: await guide.setGettingStartedDismissed(false, getContext(req)) });
});

export default router;

/** Mounted under /api/platform (authenticate + requirePlatformAdmin already applied there). */
export const platformGuideRouter = Router();

platformGuideRouter.get('/', async (_req, res) => {
  res.json({ success: true, data: await guide.adminContents() });
});
platformGuideRouter.post('/sections', validateBody(sectionSchema), async (req, res) => {
  res.status(201).json({ success: true, data: await guide.createSection(req.body, getContext(req)) });
});
platformGuideRouter.patch('/sections/:id', validateBody(updateSectionSchema), async (req, res) => {
  await guide.updateSection(parseId(req.params.id), req.body, getContext(req));
  res.json({ success: true });
});
platformGuideRouter.delete('/sections/:id', async (req, res) => {
  await guide.deleteSection(parseId(req.params.id), getContext(req));
  res.json({ success: true });
});
platformGuideRouter.get('/articles/:id', async (req, res) => {
  res.json({ success: true, data: await guide.adminArticle(parseId(req.params.id)) });
});
platformGuideRouter.post('/articles', validateBody(articleSchema), async (req, res) => {
  res.status(201).json({ success: true, data: await guide.createArticle(req.body, getContext(req)) });
});
platformGuideRouter.patch('/articles/:id', validateBody(updateArticleSchema), async (req, res) => {
  res.json({ success: true, data: await guide.updateArticle(parseId(req.params.id), req.body, getContext(req)) });
});
platformGuideRouter.delete('/articles/:id', async (req, res) => {
  await guide.deleteArticle(parseId(req.params.id), getContext(req));
  res.json({ success: true });
});
