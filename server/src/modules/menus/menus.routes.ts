// Menu management. Mounted inside the platform router (/api/platform/menus),
// which already requires a platform admin.
// The logged-in user's own sidebar comes from GET /api/auth/me.
import { Router } from 'express';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { MenusController } from './menus.controller.js';
import { createMenuSchema, updateMenuSchema } from './menus.dto.js';
import { MenusService } from './menus.service.js';

const menusController = new MenusController(new MenusService());

const router = Router();

router.get('/', menusController.findAll);
router.post('/', validateBody(createMenuSchema), menusController.create);
router.patch('/:id', validateBody(updateMenuSchema), menusController.update);
router.delete('/:id', menusController.remove);

export default router;
