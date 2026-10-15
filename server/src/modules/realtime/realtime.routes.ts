// /api/realtime — live updates for boards, lists and items (see realtime.hub.ts)
//   POST /ticket   normal Bearer auth + organization → short-lived ticket
//   GET  /stream?ticket=...   Server-Sent Events (EventSource cannot send headers, hence the ticket)
import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requireOrganization } from '../../common/middleware/tenant.middleware.js';
import { ForbiddenException, UnauthorizedException } from '../../common/exceptions/http.exception.js';
import { getLogContext } from '../../common/logger/context.js';
import { getContext } from '../../common/utils/request-context.js';
import { REALTIME_TICKET_TTL_SECONDS, signRealtimeTicket, verifyRealtimeTicket } from '../../common/utils/tokens.js';
import { rbacService } from '../rbac/rbac.service.js';
import { realtime } from './realtime.hub.js';

const router = Router();

router.post('/ticket', authenticate, requireOrganization, (req: Request, res: Response) => {
  res.json({
    success: true,
    data: { ticket: signRealtimeTicket(req.user!.id, req.tenant!.organizationId), expiresIn: REALTIME_TICKET_TTL_SECONDS },
  });
});

router.get('/stream', async (req: Request, res: Response) => {
  const { userId, organizationId } = verifyRealtimeTicket(String(req.query.ticket ?? ''));
  const user = await rbacService.getAuthUser(userId);
  if (!user) throw new UnauthorizedException('Account is inactive or no longer exists');
  const tenant = await rbacService.getMembership(userId, organizationId);
  if (!tenant) throw new ForbiddenException('You are not an active member of this organization');

  req.user = user;
  req.tenant = tenant;
  const logCtx = getLogContext();
  if (logCtx) Object.assign(logCtx, { userId, organizationId });

  const unsubscribe = await realtime.subscribe(res, getContext(req));
  req.on('close', unsubscribe);
});

export default router;
