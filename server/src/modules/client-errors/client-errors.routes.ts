// Receives error reports from the React app (error boundaries + global handlers).
import { Router } from 'express';
import { createRateLimiter } from '../../common/middleware/rate-limit.middleware.js';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { ClientErrorsController } from './client-errors.controller.js';
import { clientErrorSchema } from './client-errors.dto.js';

const clientErrorsController = new ClientErrorsController();

// Public endpoint, so keep it from being used to flood the logs
const clientErrorRateLimiter = createRateLimiter(1, 30, 'Too many error reports');

const router = Router();

router.post('/', clientErrorRateLimiter, validateBody(clientErrorSchema), clientErrorsController.report);

export default router;
