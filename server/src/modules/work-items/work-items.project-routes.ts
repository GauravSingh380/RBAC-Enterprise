// Mounted at /api/projects/:projectRef/items (auth + organization already checked by the parent router).
import { Router } from 'express';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { bulkUpdateSchema, createWorkItemSchema } from './work-items.dto.js';
import { workItemsController as c } from './work-items.instance.js';

const router = Router({ mergeParams: true }); // gives access to :projectRef

router.get('/', c.list);
router.get('/similar', c.similar); // ?title= → possible duplicates
router.post('/', validateBody(createWorkItemSchema), c.create);
router.post('/bulk', validateBody(bulkUpdateSchema), c.bulkUpdate);

export default router;
