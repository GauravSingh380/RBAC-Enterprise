// /api/people — directory & profiles · /api/teams — teams
// Reading: people.view (every role except Guest by default). Changing: users.update (Admin).
import { Router } from 'express';
import { PERMISSIONS } from '../../common/constants/rbac.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { requirePermission } from '../../common/middleware/permission.middleware.js';
import { requireOrganization } from '../../common/middleware/tenant.middleware.js';
import { validateBody } from '../../common/middleware/validate.middleware.js';
import { parseId } from '../../common/utils/parse-id.js';
import { getContext } from '../../common/utils/request-context.js';
import { PeopleService, teamMembersSchema, teamSchema, updatePersonSchema, updateTeamSchema } from './people.service.js';

const people = new PeopleService();
const manage = requirePermission(PERMISSIONS.USERS_UPDATE);
const view = requirePermission(PERMISSIONS.PEOPLE_VIEW);

export const peopleRouter = Router();
peopleRouter.use(authenticate, requireOrganization, view);
peopleRouter.get('/', async (req, res) => {
  res.json({ success: true, data: await people.directory(getContext(req)) });
});
peopleRouter.get('/:userId', async (req, res) => {
  res.json({ success: true, data: await people.person(parseId(req.params.userId), getContext(req)) });
});
peopleRouter.patch('/:userId', manage, validateBody(updatePersonSchema), async (req, res) => {
  res.json({ success: true, data: await people.update(parseId(req.params.userId), req.body, getContext(req)) });
});

export const teamsRouter = Router();
teamsRouter.use(authenticate, requireOrganization, view);
teamsRouter.get('/', async (req, res) => {
  res.json({ success: true, data: await people.teams(getContext(req)) });
});
teamsRouter.post('/', manage, validateBody(teamSchema), async (req, res) => {
  res.status(201).json({ success: true, data: await people.createTeam(req.body, getContext(req)) });
});
teamsRouter.patch('/:teamId', manage, validateBody(updateTeamSchema), async (req, res) => {
  res.json({ success: true, data: await people.updateTeam(parseId(req.params.teamId), req.body, getContext(req)) });
});
teamsRouter.put('/:teamId/members', manage, validateBody(teamMembersSchema), async (req, res) => {
  res.json({ success: true, data: await people.setTeamMembers(parseId(req.params.teamId), req.body.userIds, getContext(req)) });
});
teamsRouter.delete('/:teamId', manage, async (req, res) => {
  res.json({ success: true, data: await people.deleteTeam(parseId(req.params.teamId), getContext(req)) });
});
