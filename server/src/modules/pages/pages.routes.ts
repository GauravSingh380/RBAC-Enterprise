// /api/projects/:projectRef/pages — project docs (mounted in projects.routes.ts)
import { Router } from 'express';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import { projectRefOf } from '../projects/project-ref.js';
import { createPageSchema, PagesService, searchPagesQuery, updatePageSchema } from './pages.service.js';

const pages = new PagesService();
const router = Router({ mergeParams: true });

router.get('/', async (req, res) => {
  res.json({ success: true, data: await pages.list(projectRefOf(req), getContext(req)) });
});
router.get('/search', async (req, res) => {
  res.json({ success: true, data: await pages.search(projectRefOf(req), searchPagesQuery.parse(req.query).q, getContext(req)) });
});
router.post('/', validateBody(createPageSchema), async (req, res) => {
  res.status(201).json({ success: true, data: await pages.create(projectRefOf(req), req.body, getContext(req)) });
});
router.get('/:pageId', async (req, res) => {
  res.json({ success: true, data: await pages.get(projectRefOf(req), parseId(req.params.pageId), getContext(req)) });
});
router.patch('/:pageId', validateBody(updatePageSchema), async (req, res) => {
  res.json({ success: true, data: await pages.update(projectRefOf(req), parseId(req.params.pageId), req.body, getContext(req)) });
});
router.delete('/:pageId', async (req, res) => {
  res.json({ success: true, data: await pages.remove(projectRefOf(req), parseId(req.params.pageId), getContext(req)) });
});
router.get('/:pageId/versions', async (req, res) => {
  res.json({ success: true, data: await pages.versions(projectRefOf(req), parseId(req.params.pageId), getContext(req)) });
});
router.get('/:pageId/versions/:versionId', async (req, res) => {
  res.json({
    success: true,
    data: await pages.version(projectRefOf(req), parseId(req.params.pageId), parseId(req.params.versionId), getContext(req)),
  });
});
router.post('/:pageId/versions/:versionId/restore', async (req, res) => {
  res.json({
    success: true,
    data: await pages.restoreVersion(projectRefOf(req), parseId(req.params.pageId), parseId(req.params.versionId), getContext(req)),
  });
});

export default router;
