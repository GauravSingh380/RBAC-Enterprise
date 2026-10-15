import type { Request, Response } from 'express';
import type { PermissionsService } from './permissions.service.js';

export class PermissionsController {
  private readonly permissionsService: PermissionsService;

  constructor(permissionsService: PermissionsService) {
    this.permissionsService = permissionsService;
  }

  findAll = async (_req: Request, res: Response) => {
    res.json({ success: true, data: await this.permissionsService.findAll() });
  };
}
