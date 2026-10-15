import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import { rbacService } from '../rbac/rbac.service.js';
import type { InvitationsService } from './invitations.service.js';

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{20,128}$/, 'Invalid invitation link');

export class InvitationsController {
  private readonly invitationsService: InvitationsService;

  constructor(invitationsService: InvitationsService) {
    this.invitationsService = invitationsService;
  }

  findPending = async (req: Request, res: Response) => {
    res.json({ success: true, data: await this.invitationsService.findPending(getContext(req)) });
  };

  create = async (req: Request, res: Response) => {
    res.status(201).json({ success: true, data: await this.invitationsService.create(req.body, getContext(req)) });
  };

  revoke = async (req: Request, res: Response) => {
    await this.invitationsService.revoke(parseId(req.params.id), getContext(req));
    res.status(204).send();
  };

  preview = async (req: Request, res: Response) => {
    res.json({ success: true, data: await this.invitationsService.preview(tokenSchema.parse(req.params.token)) });
  };

  /** Accepts and returns the profile with the joined organization active. */
  accept = async (req: Request, res: Response) => {
    const organizationId = await this.invitationsService.accept(tokenSchema.parse(req.params.token), getContext(req));
    const tenant = await rbacService.getMembership(req.user!.id, organizationId);
    res.json({ success: true, data: await rbacService.getProfile(req.user!, tenant) });
  };
}
