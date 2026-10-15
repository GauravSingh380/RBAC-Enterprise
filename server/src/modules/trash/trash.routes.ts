// Trash
//   /api/projects/:projectRef/trash   GET list · POST /:kind/:id/restore · DELETE /:kind/:id   (kind = item | page)
//   /api/trash/projects               GET deleted projects · POST /:id/restore · DELETE /:id  (organization project admins)
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requireOrganization } from '../../common/middleware/tenant.middleware.js';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import { projectRefOf } from '../projects/project-ref.js';
import { TrashService } from './trash.service.js';

const trash = new TrashService();
const kind = z.enum(['item', 'page']);

export const projectTrashRouter = Router({ mergeParams: true });
projectTrashRouter.get('/', async (req, res) => {
  res.json({ success: true, data: await trash.projectTrash(projectRefOf(req), getContext(req)) });
});
projectTrashRouter.post('/:kind/:id/restore', async (req, res) => {
  res.json({ success: true, data: await trash.restore(projectRefOf(req), kind.parse(req.params.kind), parseId(req.params.id), getContext(req)) });
});
projectTrashRouter.delete('/:kind/:id', async (req, res) => {
  await trash.deleteForever(projectRefOf(req), kind.parse(req.params.kind), parseId(req.params.id), getContext(req));
  res.json({ success: true });
});

export const deletedProjectsRouter = Router();
deletedProjectsRouter.use(authenticate, requireOrganization);
deletedProjectsRouter.get('/projects', async (req, res) => {
  res.json({ success: true, data: await trash.deletedProjects(getContext(req)) });
});
deletedProjectsRouter.post('/projects/:id/restore', async (req, res) => {
  res.json({ success: true, data: await trash.restoreProject(parseId(req.params.id), getContext(req)) });
});
deletedProjectsRouter.delete('/projects/:id', async (req, res) => {
  await trash.deleteProjectForever(parseId(req.params.id), getContext(req));
  res.json({ success: true });
});
