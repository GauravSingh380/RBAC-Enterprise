// Mounted at /api/projects/:projectRef/views
import { Router } from 'express';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import { projectRefOf } from '../projects/project-ref.js';
import { SavedViewsService, createViewSchema, updateViewSchema } from './saved-views.service.js';

const views = new SavedViewsService();
const router = Router({ mergeParams: true });

router.get('/', async (req, res) => {
  res.json({ success: true, data: await views.list(projectRefOf(req), getContext(req)) });
});
router.post('/', validateBody(createViewSchema), async (req, res) => {
  res.status(201).json({ success: true, data: await views.create(projectRefOf(req), req.body, getContext(req)) });
});
router.patch('/:viewId', validateBody(updateViewSchema), async (req, res) => {
  res.json({ success: true, data: await views.update(projectRefOf(req), parseId(req.params.viewId), req.body, getContext(req)) });
});
router.delete('/:viewId', async (req, res) => {
  await views.remove(projectRefOf(req), parseId(req.params.viewId), getContext(req));
  res.status(204).send();
});

export default router;
