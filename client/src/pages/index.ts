// Pages are lazy-loaded so each screen downloads only when first visited.
import { lazy } from 'react'

// Public
export const LoginPage = lazy(() => import('./public/LoginPage'))
export const RegisterPage = lazy(() => import('./public/RegisterPage'))
export const InvitePage = lazy(() => import('./public/InvitePage'))
export const OnboardingPage = lazy(() => import('./onboarding/OnboardingPage'))

// Account
export const DashboardPage = lazy(() => import('./dashboard/DashboardPage'))
export const ProfilePage = lazy(() => import('./dashboard/ProfilePage'))

// Organization (active tenant)
export const MembersPage = lazy(() => import('./org/members/MembersPage'))
export const RolesPage = lazy(() => import('./org/roles/RolesPage'))
export const AnnouncementPage = lazy(() => import('./org/content/AnnouncementPage'))
export const OrgAuditLogsPage = lazy(() => import('./org/audit/OrgAuditLogsPage'))
export const OrganizationSettingsPage = lazy(() => import('./org/settings/OrganizationSettingsPage'))

// Platform (product owner)
export const PlatformOverviewPage = lazy(() => import('./platform/PlatformOverviewPage'))
export const PlatformOrganizationsPage = lazy(() => import('./platform/PlatformOrganizationsPage'))
export const PlatformUsersPage = lazy(() => import('./platform/PlatformUsersPage'))
export const MenusPage = lazy(() => import('./platform/MenusPage'))
export const PlatformAuditLogsPage = lazy(() => import('./platform/PlatformAuditLogsPage'))

// Development only
export const CrashTestPage = lazy(() => import('./dev/CrashTestPage'))

// Account recovery
export const ForgotPasswordPage = lazy(() => import('./public/ForgotPasswordPage'))
export const ResetPasswordPage = lazy(() => import('./public/ResetPasswordPage'))

// Platform operations
export const MailboxPage = lazy(() => import('./platform/MailboxPage'))
export const JobsPage = lazy(() => import('./platform/JobsPage'))

// Projects & work items
export const ProjectsPage = lazy(() => import('./projects/ProjectsPage'))
export const ProjectShell = lazy(() => import('./projects/ProjectShell'))
export const ItemsListPage = lazy(() => import('./projects/items/ItemsListPage'))
export const BoardPage = lazy(() => import('./projects/board/BoardPage'))
export const BacklogPage = lazy(() => import('./projects/backlog/BacklogPage'))
export const ReportsPage = lazy(() => import('./projects/reports/ReportsPage'))
export const TestsPage = lazy(() => import('./projects/tests/TestsPage'))
export const TestRunPage = lazy(() => import('./projects/tests/TestRunPage'))

// Organization insights (owners / admins)
export const InsightsPage = lazy(() => import('./org/InsightsPage'))

// People & teams, My Work
export const PeoplePage = lazy(() => import('./people/PeoplePage'))
export const MyWorkPage = lazy(() => import('./my-work/MyWorkPage'))

// Help Center (read in organizations, written in the platform console)
export const HelpCenterPage = lazy(() => import('./guide/HelpCenterPage'))
export const GuideAdminPage = lazy(() => import('./platform/GuideAdminPage'))
export const PlansPage = lazy(() => import('./platform/PlansPage'))

// Notifications
export const NotificationsPage = lazy(() => import('./notifications/NotificationsPage'))

// Leave & holidays
export const MyLeavePage = lazy(() => import('./leave/MyLeavePage'))
export const LeaveApprovalsPage = lazy(() => import('./leave/ApprovalsPage'))
export const TeamCalendarPage = lazy(() => import('./leave/TeamCalendarPage'))
export const LeaveSettingsPage = lazy(() => import('./leave/LeaveSettingsPage'))

// Production errors (organization inbox + platform console)
export const ErrorsPage = lazy(() => import('./errors/ErrorsPage'))
export const ErrorDetailPage = lazy(() => import('./errors/ErrorDetailPage'))
export const WorkItemPage = lazy(() => import('./projects/item/WorkItemPage'))
export const ProjectSettingsPage = lazy(() => import('./projects/settings/ProjectSettingsPage'))
export const DocsPage = lazy(() => import('./projects/docs/DocsPage'))
export const ProjectCalendarPage = lazy(() => import('./projects/calendar/CalendarPage'))
export const TrashPage = lazy(() => import('./projects/trash/TrashPage'))
