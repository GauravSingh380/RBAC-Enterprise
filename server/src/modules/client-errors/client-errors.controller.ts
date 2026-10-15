import type { Request, Response } from 'express';
import { logger } from '../../common/logger/logger.js';
import { getRequestedOrganizationId } from '../../common/utils/request-context.js';
import { captureClientError } from '../errors/error-tracker.js';
import { rbacService } from '../rbac/rbac.service.js';
import { verifyAccessToken } from '../../common/utils/tokens.js';
import type { ClientErrorDto } from './client-errors.dto.js';

export class ClientErrorsController {
  /** Frontend crash reports -> logs/error-*.log (type "client"). */
  report = async (req: Request, res: Response) => {
    const dto = req.body as ClientErrorDto;

    // Auth is optional here (a crash can happen on the login page) — just try to identify the user
    let userId: number | undefined;
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        userId = verifyAccessToken(header.slice(7));
      } catch {
        // expired/invalid token: still log the error anonymously
      }
    }

    logger.error(`Client error [${dto.source}]: ${dto.message}`, {
      type: 'client',
      errorId: dto.errorId,
      source: dto.source,
      errorName: dto.name,
      url: dto.url,
      userId,
      ip: req.ip,
      userAgent: dto.userAgent,
      stack: dto.stack,
      componentStack: dto.componentStack,
    });

    res.status(204).send();

    // Production error inbox: attribute to the organization only if the user really is a member of it
    const requestedOrg = getRequestedOrganizationId(req);
    const organizationId = userId && requestedOrg && (await rbacService.getMembership(userId, requestedOrg)) ? requestedOrg : null;
    await captureClientError(dto, { userId: userId ?? null, organizationId });
  };
}
