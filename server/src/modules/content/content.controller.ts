import type { Request, Response } from 'express';
import { z } from 'zod';
import { getContext, tenantOf } from '../../common/utils/request-context.js';
import type { ContentService } from './content.service.js';

export const contentKeySchema = z.string().regex(/^[a-z0-9_-]{1,50}$/, 'Invalid content key');

export class ContentController {
  private readonly contentService: ContentService;

  constructor(contentService: ContentService) {
    this.contentService = contentService;
  }

  /** Public content (home page) — no login needed. */
  findPublic = async (req: Request, res: Response) => {
    res.json({ success: true, data: await this.contentService.findOne(null, contentKeySchema.parse(req.params.key)) });
  };

  /** Platform admins edit public content. */
  savePublic = async (req: Request, res: Response) => {
    const key = contentKeySchema.parse(req.params.key);
    res.json({ success: true, data: await this.contentService.save(null, key, req.body.content, getContext(req)) });
  };

  /** Content of the active organization. */
  findForOrganization = async (req: Request, res: Response) => {
    const { organizationId } = tenantOf(getContext(req));
    res.json({ success: true, data: await this.contentService.findOne(organizationId, contentKeySchema.parse(req.params.key)) });
  };

  saveForOrganization = async (req: Request, res: Response) => {
    const ctx = getContext(req);
    const key = contentKeySchema.parse(req.params.key);
    res.json({ success: true, data: await this.contentService.save(tenantOf(ctx).organizationId, key, req.body.content, ctx) });
  };
}
