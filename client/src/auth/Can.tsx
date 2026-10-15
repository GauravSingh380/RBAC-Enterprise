import type { ReactNode } from 'react'
import type { Permission } from '../config/permissions'
import { useAuth } from './useAuth'

/**
 * Shows children only when the user has the permission(s).
 *   <Can permission={PERMISSIONS.USERS_DELETE}><button>Delete</button></Can>
 */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: Permission | Permission[]
  children: ReactNode
  fallback?: ReactNode
}) {
  const { can } = useAuth()
  return can(permission) ? children : fallback
}
