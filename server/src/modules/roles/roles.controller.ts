import type { Request, Response } from 'express';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import type { RolesService } from './roles.service.js';

export class RolesController {
  private readonly rolesService: RolesService;

  constructor(rolesService: RolesService) {
    this.rolesService = rolesService;
  }

  findAll = async (req: Request, res: Response) => {
    res.json({ success: true, data: await this.rolesService.findAll(getContext(req)) });
  };

  findOne = async (req: Request, res: Response) => {
    res.json({ success: true, data: await this.rolesService.findOne(parseId(req.params.id), getContext(req)) });
  };

  create = async (req: Request, res: Response) => {
    const role = await this.rolesService.create(req.body, getContext(req));
    res.status(201).json({ success: true, data: role });
  };

  update = async (req: Request, res: Response) => {
    const role = await this.rolesService.update(parseId(req.params.id), req.body, getContext(req));
    res.json({ success: true, data: role });
  };

  setPermissions = async (req: Request, res: Response) => {
    const role = await this.rolesService.setPermissions(parseId(req.params.id), req.body.permissionIds, getContext(req));
    res.json({ success: true, data: role });
  };

  remove = async (req: Request, res: Response) => {
    await this.rolesService.remove(parseId(req.params.id), getContext(req));
    res.status(204).send();
  };
}
