// /api/projects/:projectRef/templates — item templates (+ repeating). Mounted in projects.routes.ts.
import { Router } from 'express';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import { projectRefOf } from '../projects/project-ref.js';
import { templateSchema, TemplatesService, updateTemplateSchema } from './templates.service.js';

const templates = new TemplatesService();
const router = Router({ mergeParams: true });

router.get('/', async (req, res) => {
  res.json({ success: true, data: await templates.list(projectRefOf(req), getContext(req)) });
});
router.post('/', validateBody(templateSchema), async (req, res) => {
  res.status(201).json({ success: true, data: await templates.create(projectRefOf(req), req.body, getContext(req)) });
});
router.patch('/:templateId', validateBody(updateTemplateSchema), async (req, res) => {
  res.json({ success: true, data: await templates.update(projectRefOf(req), parseId(req.params.templateId), req.body, getContext(req)) });
});
router.delete('/:templateId', async (req, res) => {
  await templates.remove(projectRefOf(req), parseId(req.params.templateId), getContext(req));
  res.json({ success: true });
});

export default router;
