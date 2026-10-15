import type { Request, Response } from 'express';
import { paginationSchema } from '../../common/utils/pagination.js';
import { getContext, tenantOf } from '../../common/utils/request-context.js';
import type { AuditLogsService } from './audit-logs.service.js';

export class AuditLogsController {
  private readonly auditLogsService: AuditLogsService;

  constructor(auditLogsService: AuditLogsService) {
    this.auditLogsService = auditLogsService;
  }

  /** Audit log of the active organization. */
  findForOrganization = async (req: Request, res: Response) => {
    const { organizationId } = tenantOf(getContext(req));
    res.json({ success: true, data: await this.auditLogsService.findAll(paginationSchema.parse(req.query), organizationId) });
  };

  /** Everything, across all organizations (platform admins). */
  findAllPlatform = async (req: Request, res: Response) => {
    res.json({ success: true, data: await this.auditLogsService.findAll(paginationSchema.parse(req.query), null) });
  };
}
