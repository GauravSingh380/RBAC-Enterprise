// /api/projects — projects of the active organization.
// Access inside a project is decided by project-access.ts (project roles), not by route permissions,
// except creating a project which needs the organization permission projects.create.
import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants/rbac.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requirePermission } from '../../common/middleware/permission.middleware.js';
import { requireOrganization } from '../../common/middleware/tenant.middleware.js';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { casesRouter, runsRouter, suitesRouter } from '../qa/qa.routes.js';
import { availabilityQuerySchema, CapacityService } from '../capacity/capacity.service.js';
import { projectRefOf } from './project-ref.js';
import { getContext } from '../../common/utils/request-context.js';
import reportsRoutes from '../reports/reports.routes.js';
import savedViewsRoutes from '../saved-views/saved-views.routes.js';
import sprintsRoutes from '../sprints/sprints.routes.js';
import workItemsRoutes from '../work-items/work-items.project-routes.js';
import { calendarQuery, CalendarService } from '../calendar/calendar.service.js';
import pagesRoutes from '../pages/pages.routes.js';
import templatesRoutes from '../templates/templates.routes.js';
import { projectTrashRouter } from '../trash/trash.routes.js';
import { ProjectConfigService } from './project-config.service.js';
import { ProjectsController } from './projects.controller.js';
import {
  addProjectMemberSchema,
  createFieldSchema,
  createLabelSchema,
  createProjectSchema,
  createStatusSchema,
  reorderStatusesSchema,
  updateFieldSchema,
  updateLabelSchema,
  updateProjectMemberSchema,
  updateProjectSchema,
  updateStatusSchema,
} from './projects.dto.js';
import { ProjectsService } from './projects.service.js';

const c = new ProjectsController(new ProjectsService(), new ProjectConfigService());
const capacity = new CapacityService();

const calendar = new CalendarService();
const router = Router();

router.use(authenticate, requireOrganization);

router.get('/', c.findAll);
router.post('/', requirePermission(PERMISSIONS.PROJECTS_CREATE), validateBody(createProjectSchema), c.create);
router.get('/:projectRef', c.findOne);
router.patch('/:projectRef', validateBody(updateProjectSchema), c.update);
router.post('/:projectRef/archive', c.archive);
router.post('/:projectRef/restore', c.restore);
router.delete('/:projectRef', c.remove);

router.get('/:projectRef/members', c.listMembers);
router.get('/:projectRef/assignable-users', c.assignableUsers);
router.get('/:projectRef/member-candidates', c.memberCandidates);
router.post('/:projectRef/members', validateBody(addProjectMemberSchema), c.addMember);
router.patch('/:projectRef/members/:userId', validateBody(updateProjectMemberSchema), c.updateMember);
router.delete('/:projectRef/members/:userId', c.removeMember);

router.get('/:projectRef/statuses', c.listStatuses);
router.post('/:projectRef/statuses', validateBody(createStatusSchema), c.createStatus);
router.put('/:projectRef/statuses/order', validateBody(reorderStatusesSchema), c.reorderStatuses);
router.patch('/:projectRef/statuses/:statusId', validateBody(updateStatusSchema), c.updateStatus);
router.delete('/:projectRef/statuses/:statusId', c.deleteStatus);

router.get('/:projectRef/labels', c.listLabels);
router.post('/:projectRef/labels', validateBody(createLabelSchema), c.createLabel);
router.patch('/:projectRef/labels/:labelId', validateBody(updateLabelSchema), c.updateLabel);
router.delete('/:projectRef/labels/:labelId', c.deleteLabel);

router.get('/:projectRef/fields', c.listFields);
router.post('/:projectRef/fields', validateBody(createFieldSchema), c.createField);
router.patch('/:projectRef/fields/:fieldId', validateBody(updateFieldSchema), c.updateField);
router.delete('/:projectRef/fields/:fieldId', c.deleteField);

// Work items, sprints, saved views and reports of the project: /api/projects/:projectRef/...
router.use('/:projectRef/items', workItemsRoutes);
router.use('/:projectRef/sprints', sprintsRoutes);
router.use('/:projectRef/views', savedViewsRoutes);
router.use('/:projectRef/reports', reportsRoutes);
// QA: test suites, test cases, test runs
router.use('/:projectRef/test-suites', suitesRouter);
router.use('/:projectRef/test-cases', casesRouter);
router.use('/:projectRef/test-runs', runsRouter);
// docs, item templates (+ repeating), trash, calendar
router.use('/:projectRef/pages', pagesRoutes);
router.use('/:projectRef/templates', templatesRoutes);
router.use('/:projectRef/trash', projectTrashRouter);
router.get('/:projectRef/calendar', async (req, res) => {
  const q = calendarQuery.parse(req.query);
  res.json({ success: true, data: await calendar.project(projectRefOf(req), q.from, q.to, getContext(req)) });
});

// who is away when (assignee picker, due-date warnings) — leave types are never revealed
router.get('/:projectRef/availability', async (req, res) => {
  const q = availabilityQuerySchema.parse(req.query);
  res.json({ success: true, data: await capacity.availability(projectRefOf(req), q.from, q.to, getContext(req)) });
});

export default router;
