// Register every module's routes here.
//
//   Public / account level : /auth, /invitations/token/*, /content/public/*, /client-errors
//   Organization level     : everything else — requires X-Organization-Id + membership
//   Platform level         : /platform/* — platform admins only, across all organizations
import { Router } from 'express';
import auditLogsRoutes from './modules/audit-logs/audit-logs.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import clientErrorsRoutes from './modules/client-errors/client-errors.routes.js';
import contentRoutes from './modules/content/content.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import errorsRoutes from './modules/errors/errors.routes.js';
import insightsRoutes from './modules/insights/insights.routes.js';
import invitationsRoutes from './modules/invitations/invitations.routes.js';
import leaveRoutes from './modules/leave/leave.routes.js';
import guideRoutes from './modules/guide/guide.routes.js';
import { deletedProjectsRouter } from './modules/trash/trash.routes.js';
import { publicWebsiteRouter } from './modules/website/website.routes.js';
import myWorkRoutes from './modules/my-work/my-work.routes.js';
import notificationsRoutes from './modules/notifications/notifications.routes.js';
import membersRoutes from './modules/members/members.routes.js';
import { peopleRouter, teamsRouter } from './modules/people/people.routes.js';
import organizationsRoutes from './modules/organizations/organizations.routes.js';
import permissionsRoutes from './modules/permissions/permissions.routes.js';
import platformRoutes from './modules/platform/platform.routes.js';
import projectsRoutes from './modules/projects/projects.routes.js';
import realtimeRoutes from './modules/realtime/realtime.routes.js';
import rolesRoutes from './modules/roles/roles.routes.js';
import workItemsRoutes from './modules/work-items/work-items.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/organizations', organizationsRoutes);
router.use('/members', membersRoutes);
router.use('/invitations', invitationsRoutes);
router.use('/roles', rolesRoutes);
router.use('/permissions', permissionsRoutes);
router.use('/content', contentRoutes);
router.use('/audit-logs', auditLogsRoutes);
router.use('/projects', projectsRoutes);
router.use('/work-items', workItemsRoutes);
router.use('/realtime', realtimeRoutes);
router.use('/errors', errorsRoutes);
router.use('/leave', leaveRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/insights', insightsRoutes);
router.use('/my-work', myWorkRoutes);
router.use('/guide', guideRoutes);
router.use('/trash', deletedProjectsRouter);
// public marketing website (no login)
router.use('/website', publicWebsiteRouter);
router.use('/people', peopleRouter);
router.use('/teams', teamsRouter);
router.use('/platform', platformRoutes);
router.use('/client-errors', clientErrorsRoutes);

export default router;
