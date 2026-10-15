import type { Request, Response } from 'express';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import type { MenusService } from './menus.service.js';

export class MenusController {
  private readonly menusService: MenusService;

  constructor(menusService: MenusService) {
    this.menusService = menusService;
  }

  findAll = async (_req: Request, res: Response) => {
    res.json({ success: true, data: await this.menusService.findAll() });
  };

  create = async (req: Request, res: Response) => {
    const menu = await this.menusService.create(req.body, getContext(req));
    res.status(201).json({ success: true, data: menu });
  };

  update = async (req: Request, res: Response) => {
    const menu = await this.menusService.update(parseId(req.params.id), req.body, getContext(req));
    res.json({ success: true, data: menu });
  };

  remove = async (req: Request, res: Response) => {
    await this.menusService.remove(parseId(req.params.id), getContext(req));
    res.status(204).send();
  };
}
