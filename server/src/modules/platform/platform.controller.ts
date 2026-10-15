import type { Request, Response } from 'express';
import { paginationSchema } from '../../common/utils/pagination.js';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import type { PlatformService } from './platform.service.js';

export class PlatformController {
  private readonly platformService: PlatformService;

  constructor(platformService: PlatformService) {
    this.platformService = platformService;
  }

  stats = async (_req: Request, res: Response) => {
    res.json({ success: true, data: await this.platformService.stats() });
  };

  listOrganizations = async (req: Request, res: Response) => {
    res.json({ success: true, data: await this.platformService.listOrganizations(paginationSchema.parse(req.query)) });
  };

  updateOrganization = async (req: Request, res: Response) => {
    await this.platformService.updateOrganization(parseId(req.params.id), req.body, getContext(req));
    res.status(204).send();
  };

  listUsers = async (req: Request, res: Response) => {
    res.json({ success: true, data: await this.platformService.listUsers(paginationSchema.parse(req.query)) });
  };

  updateUser = async (req: Request, res: Response) => {
    await this.platformService.updateUser(parseId(req.params.id), req.body, getContext(req));
    res.status(204).send();
  };
}
