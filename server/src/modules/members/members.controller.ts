import type { Request, Response } from 'express';
import { paginationSchema } from '../../common/utils/pagination.js';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import type { MembersService } from './members.service.js';

export class MembersController {
  private readonly membersService: MembersService;

  constructor(membersService: MembersService) {
    this.membersService = membersService;
  }

  findAll = async (req: Request, res: Response) => {
    res.json({ success: true, data: await this.membersService.findAll(paginationSchema.parse(req.query), getContext(req)) });
  };

  findOne = async (req: Request, res: Response) => {
    res.json({ success: true, data: await this.membersService.findOne(parseId(req.params.id), getContext(req)) });
  };

  setStatus = async (req: Request, res: Response) => {
    const member = await this.membersService.setStatus(parseId(req.params.id), req.body.isActive, getContext(req));
    res.json({ success: true, data: member });
  };

  setRoles = async (req: Request, res: Response) => {
    const member = await this.membersService.setRoles(parseId(req.params.id), req.body.roleIds, getContext(req));
    res.json({ success: true, data: member });
  };

  makeMember = async (req: Request, res: Response) => {
    const member = await this.membersService.makeMember(parseId(req.params.id), req.body.roleIds, getContext(req));
    res.json({ success: true, data: member });
  };

  remove = async (req: Request, res: Response) => {
    await this.membersService.remove(parseId(req.params.id), getContext(req));
    res.status(204).send();
  };
}
