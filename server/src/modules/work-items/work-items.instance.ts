// Wires the work-items module together (shared by both routers).
import { AttachmentsService } from './attachments.service.js';
import { CommentsService } from './comments.service.js';
import { LinksService } from './links.service.js';
import { WorkItemsController } from './work-items.controller.js';
import { WorkItemsService } from './work-items.service.js';

export const workItemsController = new WorkItemsController(
  new WorkItemsService(),
  new CommentsService(),
  new AttachmentsService(),
  new LinksService(),
);
