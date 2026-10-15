// All application routes.
//
//   Website       /, /features, /pricing   (client/src/website — edited in Platform → Website)
//   Public        /login, /register, /forgot-password, /reset-password, /invite/:token
//   Organization  /dashboard, /projects/*, /org/*  → need an active organization (+ permission / project role)
//   Platform      /platform/*          → platform admins only (product owner console)
//
// To add a page: create it under pages/, add a lazy export in pages/index.ts, add a route here,
// then add a menu item (Platform → Menus, or an INSERT in server/src/database/schema.sql).
import { createBrowserRouter } from 'react-router-dom'
import { GuestOnly, PermissionOrRedirect, RequireAuth, RequireOrganization, RequirePermission, RequirePlatformAdmin } from './auth/guards'
import { RouteErrorPage } from './components/errors/RouteErrorPage'
import { APP_ENV } from './config/env'
import { PERMISSIONS } from './config/permissions'
import DashboardLayout from './layouts/DashboardLayout'
import { websiteAdminRoute, websiteRoutes } from './website/routes'
import PublicLayout from './layouts/PublicLayout'
import NotFoundPage from './pages/errors/NotFoundPage'
import {
  AnnouncementPage,
  BacklogPage,
  BoardPage,
  CrashTestPage,
  ErrorDetailPage,
  ErrorsPage,
  ForgotPasswordPage,
  ItemsListPage,
  JobsPage,
  MailboxPage,
  ProjectSettingsPage,
  DocsPage,
  ProjectCalendarPage,
  TrashPage,
  ProjectShell,
  ProjectsPage,
  ReportsPage,
  ResetPasswordPage,
  TestRunPage,
  TestsPage,
  WorkItemPage,
  DashboardPage,
  InsightsPage,
  InvitePage,
  LeaveApprovalsPage,
  LeaveSettingsPage,
  MyLeavePage,
  MyWorkPage,
  HelpCenterPage,
  GuideAdminPage,
  PlansPage,
  PeoplePage,
  NotificationsPage,
  TeamCalendarPage,
  LoginPage,
  MembersPage,
  MenusPage,
  OnboardingPage,
  OrgAuditLogsPage,
  OrganizationSettingsPage,
  PlatformAuditLogsPage,
  PlatformOrganizationsPage,
  PlatformOverviewPage,
  PlatformUsersPage,
  ProfilePage,
  RegisterPage,
  RolesPage,
} from './pages'

export const router = createBrowserRouter([
  // ---------------------------------------------------------------- public website (Home, Features, Pricing — client/src/website)
  websiteRoutes,

  // ---------------------------------------------------------------- public
  {
    element: <PublicLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/invite/:token', element: <InvitePage /> },
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      // reachable logged in or out (the link comes from an email)
      { path: '/reset-password', element: <ResetPasswordPage /> },
      // Logged in but no organization yet
      { element: <RequireAuth />, children: [{ path: '/onboarding', element: <OnboardingPage /> }] },
    ],
  },

  // ---------------------------------------------------------------- app
  {
    element: <RequireAuth />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { path: '/profile', element: <ProfilePage /> },
          // Development-only: see the error boundary in action
          ...(APP_ENV.isDev ? [{ path: '/dev/crash', element: <CrashTestPage /> }] : []),

          // Organization pages (the active tenant)
          {
            element: <RequireOrganization />,
            children: [
              {
                path: '/dashboard',
                // everyone lands here after sign-in; guests (no dashboard.view) go to My Work
                element: (
                  <PermissionOrRedirect permission={PERMISSIONS.DASHBOARD_VIEW} to="/my-work">
                    <DashboardPage />
                  </PermissionOrRedirect>
                ),
              },
              {
                path: '/org/members',
                element: (
                  <RequirePermission permission={PERMISSIONS.USERS_READ}>
                    <MembersPage />
                  </RequirePermission>
                ),
              },
              {
                path: '/org/roles',
                element: (
                  <RequirePermission permission={PERMISSIONS.ROLES_READ}>
                    <RolesPage />
                  </RequirePermission>
                ),
              },
              {
                path: '/org/content',
                element: (
                  <RequirePermission permission={PERMISSIONS.CONTENT_MANAGE}>
                    <AnnouncementPage />
                  </RequirePermission>
                ),
              },
              {
                path: '/org/audit-logs',
                element: (
                  <RequirePermission permission={PERMISSIONS.AUDIT_READ}>
                    <OrgAuditLogsPage />
                  </RequirePermission>
                ),
              },
              // Projects: access inside a project is decided by project roles (checked by the API)
              { path: '/projects', element: <ProjectsPage /> },
              {
                path: '/projects/:projectKey',
                element: <ProjectShell />,
                children: [
                  { index: true, element: <BoardPage /> },
                  { path: 'list', element: <ItemsListPage /> },
                  { path: 'backlog', element: <BacklogPage /> },
                  { path: 'reports', element: <ReportsPage /> },
                  { path: 'tests', element: <TestsPage /> },
                  { path: 'tests/runs/:runId', element: <TestRunPage /> },
                  { path: 'items/:number', element: <WorkItemPage /> },
                  { path: 'settings', element: <ProjectSettingsPage /> },
                  { path: 'docs', element: <DocsPage /> },
                  { path: 'docs/:pageId', element: <DocsPage /> },
                  { path: 'calendar', element: <ProjectCalendarPage /> },
                  { path: 'trash', element: <TrashPage /> },
                ],
              },
              {
                path: '/org/insights',
                element: (
                  <RequirePermission permission={PERMISSIONS.INSIGHTS_VIEW}>
                    <InsightsPage />
                  </RequirePermission>
                ),
              },
              // Every member: their own to-do list, and who is who
              { path: '/my-work', element: <MyWorkPage /> },
              {
                path: '/people',
                element: (
                  <RequirePermission permission={PERMISSIONS.PEOPLE_VIEW}>
                    <PeoplePage />
                  </RequirePermission>
                ),
              },
              // Help Center: the product guide (written by the platform owner; owners can hide it from a role)
              {
                path: '/guide/:slug?',
                element: (
                  <RequirePermission permission={PERMISSIONS.GUIDE_VIEW}>
                    <HelpCenterPage />
                  </RequirePermission>
                ),
              },
              // Notifications of the current user (bell → "View all")
              { path: '/notifications', element: <NotificationsPage /> },
              // Leave & holidays
              {
                path: '/leave',
                element: (
                  <RequirePermission permission={PERMISSIONS.LEAVE_REQUEST}>
                    <MyLeavePage />
                  </RequirePermission>
                ),
              },
              {
                path: '/leave/calendar',
                element: (
                  <RequirePermission permission={PERMISSIONS.LEAVE_REQUEST}>
                    <TeamCalendarPage />
                  </RequirePermission>
                ),
              },
              {
                path: '/leave/approvals',
                element: (
                  <RequirePermission permission={PERMISSIONS.LEAVE_REQUEST}>
                    <LeaveApprovalsPage />
                  </RequirePermission>
                ),
              },
              {
                path: '/org/leave',
                element: (
                  <RequirePermission permission={PERMISSIONS.LEAVE_MANAGE}>
                    <LeaveSettingsPage />
                  </RequirePermission>
                ),
              },
              // Production errors of the organization (server 500s + browser crashes)
              {
                path: '/errors',
                element: (
                  <RequirePermission permission={PERMISSIONS.ERRORS_READ}>
                    <ErrorsPage />
                  </RequirePermission>
                ),
              },
              {
                path: '/errors/:id',
                element: (
                  <RequirePermission permission={PERMISSIONS.ERRORS_READ}>
                    <ErrorDetailPage />
                  </RequirePermission>
                ),
              },
              // Every member may view settings (and leave); editing needs organization.manage
              { path: '/org/settings', element: <OrganizationSettingsPage /> },
            ],
          },

          // Platform pages (product owner)
          {
            path: '/platform',
            element: <RequirePlatformAdmin />,
            children: [
              { index: true, element: <PlatformOverviewPage /> },
              { path: 'organizations', element: <PlatformOrganizationsPage /> },
              { path: 'users', element: <PlatformUsersPage /> },
              { path: 'menus', element: <MenusPage /> },
              websiteAdminRoute,
              { path: 'guide', element: <GuideAdminPage /> },
              { path: 'plans', element: <PlansPage /> },
              { path: 'audit-logs', element: <PlatformAuditLogsPage /> },
              { path: 'mailbox', element: <MailboxPage /> },
              { path: 'jobs', element: <JobsPage /> },
              { path: 'errors', element: <ErrorsPage platform /> },
              { path: 'errors/:id', element: <ErrorDetailPage platform /> },
            ],
          },
        ],
      },
    ],
  },

  { path: '*', element: <NotFoundPage /> },
])
