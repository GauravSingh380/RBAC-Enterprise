import type { Request, Response } from 'express';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import { emailListQuerySchema, jobListQuerySchema, type PlatformOpsService } from './platform-ops.service.js';

export class PlatformOpsController {
  private readonly ops: PlatformOpsService;

  constructor(ops: PlatformOpsService) {
    this.ops = ops;
  }

  listEmails = async (req: Request, res: Response) => {
    res.json({ success: true, data: await this.ops.listEmails(emailListQuerySchema.parse(req.query)) });
  };

  getEmail = async (req: Request, res: Response) => {
    res.json({ success: true, data: await this.ops.getEmail(parseId(req.params.id)) });
  };

  resendEmail = async (req: Request, res: Response) => {
    await this.ops.resendEmail(parseId(req.params.id), getContext(req));
    res.status(204).send();
  };

  jobStats = async (_req: Request, res: Response) => {
    res.json({ success: true, data: await this.ops.jobStats() });
  };

  listJobs = async (req: Request, res: Response) => {
    res.json({ success: true, data: await this.ops.listJobs(jobListQuerySchema.parse(req.query)) });
  };

  retryJob = async (req: Request, res: Response) => {
    await this.ops.retryJob(parseId(req.params.id), getContext(req));
    res.status(204).send();
  };
}
