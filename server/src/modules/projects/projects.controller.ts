import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import type { ProjectConfigService } from './project-config.service.js';
import { listProjectsQuerySchema } from './projects.dto.js';
import type { ProjectsService } from './projects.service.js';

const projectRef = (req: Request) => z.string().regex(/^([A-Za-z][A-Za-z0-9]{1,9}|\d+)$/, 'Invalid project').parse(req.params.projectRef);
const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });

export class ProjectsController {
  private readonly projects: ProjectsService;
  private readonly config: ProjectConfigService;

  constructor(projects: ProjectsService, config: ProjectConfigService) {
    this.projects = projects;
    this.config = config;
  }

  // projects
  findAll = async (req: Request, res: Response) => ok(res, await this.projects.findAll(listProjectsQuerySchema.parse(req.query), getContext(req)));
  findOne = async (req: Request, res: Response) => ok(res, await this.projects.findOne(projectRef(req), getContext(req)));
  create = async (req: Request, res: Response) => ok(res, await this.projects.create(req.body, getContext(req)), 201);
  update = async (req: Request, res: Response) => ok(res, await this.projects.update(projectRef(req), req.body, getContext(req)));
  archive = async (req: Request, res: Response) => ok(res, await this.projects.setArchived(projectRef(req), true, getContext(req)));
  restore = async (req: Request, res: Response) => ok(res, await this.projects.setArchived(projectRef(req), false, getContext(req)));
  remove = async (req: Request, res: Response) => {
    await this.projects.remove(projectRef(req), getContext(req));
    res.status(204).send();
  };

  // members
  listMembers = async (req: Request, res: Response) => ok(res, await this.projects.listMembers(projectRef(req), getContext(req)));
  memberCandidates = async (req: Request, res: Response) => ok(res, await this.projects.memberCandidates(projectRef(req), getContext(req)));
  assignableUsers = async (req: Request, res: Response) => ok(res, await this.projects.assignableUsers(projectRef(req), getContext(req)));
  addMember = async (req: Request, res: Response) =>
    ok(res, await this.projects.addMember(projectRef(req), req.body.userId, req.body.role, getContext(req)), 201);
  updateMember = async (req: Request, res: Response) =>
    ok(res, await this.projects.updateMember(projectRef(req), parseId(req.params.userId), req.body.role, getContext(req)));
  removeMember = async (req: Request, res: Response) => {
    await this.projects.removeMember(projectRef(req), parseId(req.params.userId), getContext(req));
    res.status(204).send();
  };

  // statuses
  listStatuses = async (req: Request, res: Response) => ok(res, await this.config.listStatuses(projectRef(req), getContext(req)));
  createStatus = async (req: Request, res: Response) => ok(res, await this.config.createStatus(projectRef(req), req.body, getContext(req)), 201);
  updateStatus = async (req: Request, res: Response) =>
    ok(res, await this.config.updateStatus(projectRef(req), parseId(req.params.statusId), req.body, getContext(req)));
  reorderStatuses = async (req: Request, res: Response) =>
    ok(res, await this.config.reorderStatuses(projectRef(req), req.body.statusIds, getContext(req)));
  deleteStatus = async (req: Request, res: Response) => {
    const moveTo = req.query.moveTo ? parseId(req.query.moveTo) : null;
    ok(res, await this.config.deleteStatus(projectRef(req), parseId(req.params.statusId), moveTo, getContext(req)));
  };

  // labels
  listLabels = async (req: Request, res: Response) => ok(res, await this.config.listLabels(projectRef(req), getContext(req)));
  createLabel = async (req: Request, res: Response) =>
    ok(res, await this.config.createLabel(projectRef(req), req.body.name, req.body.color, getContext(req)), 201);
  updateLabel = async (req: Request, res: Response) =>
    ok(res, await this.config.updateLabel(projectRef(req), parseId(req.params.labelId), req.body, getContext(req)));
  deleteLabel = async (req: Request, res: Response) => {
    await this.config.deleteLabel(projectRef(req), parseId(req.params.labelId), getContext(req));
    res.status(204).send();
  };

  // custom fields
  listFields = async (req: Request, res: Response) => ok(res, await this.config.listFields(projectRef(req), getContext(req)));
  createField = async (req: Request, res: Response) => ok(res, await this.config.createField(projectRef(req), req.body, getContext(req)), 201);
  updateField = async (req: Request, res: Response) =>
    ok(res, await this.config.updateField(projectRef(req), parseId(req.params.fieldId), req.body, getContext(req)));
  deleteField = async (req: Request, res: Response) =>
    ok(res, await this.config.deleteField(projectRef(req), parseId(req.params.fieldId), getContext(req)));
}
