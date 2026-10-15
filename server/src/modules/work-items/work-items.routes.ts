// /api/work-items/:itemRef/... — a single work item by id or key (TF-12).
// Project-scoped list/create live under /api/projects/:projectRef/items (work-items.project-routes.ts).
import { Router, type Request } from 'express';
import multer from 'multer';
import { env } from '../../config/env.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requireOrganization } from '../../common/middleware/tenant.middleware.js';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { workItemsController as c } from './work-items.instance.js';
import { getContext } from '../../common/utils/request-context.js';
import { parseId } from '../../common/utils/parse-id.js';
import { checklistAddSchema, checklistOrderSchema, ChecklistService, checklistUpdateSchema } from './checklist.js';
import {
  closeDuplicateSchema,
  commentSchema,
  createLinkSchema,
  moveWorkItemSchema,
  qaVerdictSchema,
  reactionSchema,
  updateWorkItemSchema,
} from './work-items.dto.js';

// Files are kept in memory only until they are written to storage
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.storage.maxFileMb * 1024 * 1024, files: 1 } });

const router = Router();
const checklist = new ChecklistService();
const ref = (req: Request) => String(req.params.itemRef);

router.use(authenticate, requireOrganization);

router.get('/', c.search); // ?search=TF-12 or text — across accessible projects
router.get('/:itemRef', c.findOne);
router.patch('/:itemRef', validateBody(updateWorkItemSchema), c.update);
router.delete('/:itemRef', c.remove);
router.post('/:itemRef/move', validateBody(moveWorkItemSchema), c.move); // board / backlog drag & drop
router.post('/:itemRef/qa', validateBody(qaVerdictSchema), c.qaVerdict); // QA pass / fail
router.post('/:itemRef/close-duplicate', validateBody(closeDuplicateSchema), c.closeDuplicate);
router.get('/:itemRef/events', c.events);
router.post('/:itemRef/watch', c.watch);
router.delete('/:itemRef/watch', c.unwatch);

router.get('/:itemRef/comments', c.listComments);
router.post('/:itemRef/comments', validateBody(commentSchema), c.createComment);
router.patch('/:itemRef/comments/:commentId', validateBody(commentSchema), c.editComment);
router.delete('/:itemRef/comments/:commentId', c.deleteComment);
router.post('/:itemRef/comments/:commentId/reactions', validateBody(reactionSchema), c.react);

router.post('/:itemRef/links', validateBody(createLinkSchema), c.createLink);
router.delete('/:itemRef/links/:linkId', c.deleteLink);

// checklist (each change answers with the whole checklist)
router.post('/:itemRef/checklist', validateBody(checklistAddSchema), async (req, res) => {
  res.status(201).json({ success: true, data: await checklist.add(ref(req), req.body.text, getContext(req)) });
});
router.put('/:itemRef/checklist/order', validateBody(checklistOrderSchema), async (req, res) => {
  res.json({ success: true, data: await checklist.reorder(ref(req), req.body.ids, getContext(req)) });
});
router.patch('/:itemRef/checklist/:checklistId', validateBody(checklistUpdateSchema), async (req, res) => {
  res.json({ success: true, data: await checklist.update(ref(req), parseId(req.params.checklistId), req.body, getContext(req)) });
});
router.delete('/:itemRef/checklist/:checklistId', async (req, res) => {
  res.json({ success: true, data: await checklist.remove(ref(req), parseId(req.params.checklistId), getContext(req)) });
});

router.get('/:itemRef/attachments', c.listAttachments);
router.post('/:itemRef/attachments', upload.single('file'), c.upload);
router.get('/:itemRef/attachments/:attachmentId', c.download);
router.delete('/:itemRef/attachments/:attachmentId', c.deleteAttachment);

export default router;
