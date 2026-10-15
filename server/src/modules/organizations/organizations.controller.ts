import type { Request, Response } from 'express';
import { getContext, tenantOf } from '../../common/utils/request-context.js';
import { rbacService } from '../rbac/rbac.service.js';
import type { OrganizationsService } from './organizations.service.js';

export class OrganizationsController {
  private readonly organizationsService: OrganizationsService;

  constructor(organizationsService: OrganizationsService) {
    this.organizationsService = organizationsService;
  }

  /** Creates an organization and returns the profile with it as the active organization. */
  create = async (req: Request, res: Response) => {
    const organizationId = await this.organizationsService.create(req.body.name, getContext(req));
    const tenant = await rbacService.getMembership(req.user!.id, organizationId);
    res.status(201).json({ success: true, data: await rbacService.getProfile(req.user!, tenant) });
  };

  getCurrent = async (req: Request, res: Response) => {
    res.json({ success: true, data: await this.organizationsService.getCurrent(tenantOf(getContext(req))) });
  };

  update = async (req: Request, res: Response) => {
    res.json({ success: true, data: await this.organizationsService.update(req.body.name, getContext(req)) });
  };

  leave = async (req: Request, res: Response) => {
    await this.organizationsService.leave(getContext(req));
    res.status(204).send();
  };
}
