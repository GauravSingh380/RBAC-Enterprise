import type { Request, Response } from 'express';
import { z } from 'zod';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import { INLINE_TYPES, type AttachmentsService } from './attachments.service.js';
import type { CommentsService } from './comments.service.js';
import type { LinksService } from './links.service.js';
import { listWorkItemsQuerySchema, searchWorkItemsQuerySchema, similarItemsQuerySchema } from './work-items.dto.js';
import type { WorkItemsService } from './work-items.service.js';

/** Item reference in the URL: numeric id or key like TF-12. */
const itemRef = (req: Request) => z.string().regex(/^(\d+|[A-Za-z][A-Za-z0-9]{1,9}-\d+)$/, 'Invalid work item').parse(req.params.itemRef);
const projectRef = (req: Request) => z.string().regex(/^([A-Za-z][A-Za-z0-9]{1,9}|\d+)$/, 'Invalid project').parse(req.params.projectRef);
const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });

export class WorkItemsController {
  private readonly items: WorkItemsService;
  private readonly comments: CommentsService;
  private readonly attachments: AttachmentsService;
  private readonly links: LinksService;

  constructor(items: WorkItemsService, comments: CommentsService, attachments: AttachmentsService, links: LinksService) {
    this.items = items;
    this.comments = comments;
    this.attachments = attachments;
    this.links = links;
  }

  // items in a project
  list = async (req: Request, res: Response) =>
    ok(res, await this.items.list(projectRef(req), listWorkItemsQuerySchema.parse(req.query), getContext(req)));
  create = async (req: Request, res: Response) => ok(res, await this.items.create(projectRef(req), req.body, getContext(req)), 201);
  similar = async (req: Request, res: Response) =>
    ok(res, await this.items.similar(projectRef(req), similarItemsQuerySchema.parse(req.query), getContext(req)));
  bulkUpdate = async (req: Request, res: Response) => ok(res, await this.items.bulkUpdate(projectRef(req), req.body, getContext(req)));

  // single item
  search = async (req: Request, res: Response) => ok(res, await this.items.search(searchWorkItemsQuerySchema.parse(req.query), getContext(req)));
  findOne = async (req: Request, res: Response) => ok(res, await this.items.findOne(itemRef(req), getContext(req)));
  update = async (req: Request, res: Response) => ok(res, await this.items.update(itemRef(req), req.body, getContext(req)));
  move = async (req: Request, res: Response) => ok(res, await this.items.move(itemRef(req), req.body, getContext(req)));
  qaVerdict = async (req: Request, res: Response) => ok(res, await this.items.qaVerdict(itemRef(req), req.body, getContext(req)));
  closeDuplicate = async (req: Request, res: Response) =>
    ok(res, await this.items.closeAsDuplicate(itemRef(req), req.body.duplicateOf, getContext(req)));
  remove = async (req: Request, res: Response) => {
    await this.items.remove(itemRef(req), getContext(req));
    res.status(204).send();
  };
  events = async (req: Request, res: Response) => ok(res, await this.items.events(itemRef(req), getContext(req)));
  watch = async (req: Request, res: Response) => ok(res, await this.items.setWatching(itemRef(req), true, getContext(req)));
  unwatch = async (req: Request, res: Response) => ok(res, await this.items.setWatching(itemRef(req), false, getContext(req)));

  // comments
  listComments = async (req: Request, res: Response) => ok(res, await this.comments.list(itemRef(req), getContext(req)));
  createComment = async (req: Request, res: Response) => ok(res, await this.comments.create(itemRef(req), req.body.body, getContext(req)), 201);
  editComment = async (req: Request, res: Response) =>
    ok(res, await this.comments.edit(itemRef(req), parseId(req.params.commentId), req.body.body, getContext(req)));
  deleteComment = async (req: Request, res: Response) => {
    await this.comments.remove(itemRef(req), parseId(req.params.commentId), getContext(req));
    res.status(204).send();
  };
  react = async (req: Request, res: Response) =>
    ok(res, await this.comments.react(itemRef(req), parseId(req.params.commentId), req.body.emoji, getContext(req)));

  // links
  createLink = async (req: Request, res: Response) => {
    await this.links.create(itemRef(req), req.body.target, req.body.linkType, getContext(req));
    ok(res, await this.items.findOne(itemRef(req), getContext(req)), 201);
  };
  deleteLink = async (req: Request, res: Response) => {
    await this.links.remove(itemRef(req), parseId(req.params.linkId), getContext(req));
    res.status(204).send();
  };

  // attachments
  listAttachments = async (req: Request, res: Response) => ok(res, await this.attachments.list(itemRef(req), getContext(req)));
  upload = async (req: Request, res: Response) => ok(res, await this.attachments.upload(itemRef(req), req.file, getContext(req)), 201);
  download = async (req: Request, res: Response) => {
    const { meta, stream } = await this.attachments.download(itemRef(req), parseId(req.params.attachmentId), getContext(req));
    const inline = req.query.inline === '1' && INLINE_TYPES.has(meta.mimeType);
    res.setHeader('Content-Type', INLINE_TYPES.has(meta.mimeType) ? meta.mimeType : 'application/octet-stream');
    res.setHeader('Content-Length', String(meta.sizeBytes));
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`);
    res.setHeader('Cache-Control', 'private, max-age=300');
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  };
  deleteAttachment = async (req: Request, res: Response) => {
    await this.attachments.remove(itemRef(req), parseId(req.params.attachmentId), getContext(req));
    res.status(204).send();
  };
}
