// Route guards. The server enforces every rule too — these only control what the UI shows.
import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullPageSpinner } from '../components/ui'
import type { Permission } from '../config/permissions'
import ForbiddenPage from '../pages/errors/ForbiddenPage'
import PasswordChangeRequiredPage from '../pages/dashboard/PasswordChangeRequiredPage'
import { useAuth } from './useAuth'

/** Only logged-in users. Others are sent to /login and brought back afterwards. */
export function RequireAuth() {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullPageSpinner />
  // the organization's password rules: a new password is needed before anything else
  if (user?.passwordChangeRequired) return <PasswordChangeRequiredPage />
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

/** Only logged-out users (login / register). Logged-in users go to where they came from. */
export function GuestOnly() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullPageSpinner />
  if (status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'
    return <Navigate to={from} replace />
  }
  return <Outlet />
}

/**
 * Organization pages need an active organization. A user without one
 * (e.g. removed from all organizations) is sent to onboarding to create one.
 */
export function RequireOrganization() {
  const { organization, isPlatformAdmin } = useAuth()
  if (!organization) return <Navigate to={isPlatformAdmin ? '/platform' : '/onboarding'} replace />
  return <Outlet />
}

/** Renders children only if the user has the permission(s) in the active organization. */
export function RequirePermission({ permission, children }: { permission: Permission | Permission[]; children: ReactNode }) {
  const { can } = useAuth()
  return can(permission) ? children : <ForbiddenPage />
}

/**
 * Like RequirePermission, but people without it are sent elsewhere instead of seeing "forbidden".
 * Used for /dashboard: guests (and roles without dashboard.view) land on My Work.
 */
export function PermissionOrRedirect({ permission, to, children }: { permission: Permission; to: string; children: ReactNode }) {
  const { can } = useAuth()
  return can(permission) ? children : <Navigate to={to} replace />
}

/** Platform (product owner) pages. */
export function RequirePlatformAdmin() {
  const { isPlatformAdmin } = useAuth()
  return isPlatformAdmin ? <Outlet /> : <ForbiddenPage />
}
