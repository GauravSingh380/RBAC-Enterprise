import { createContext } from 'react'
import type { Permission } from '../config/permissions'
import type { RegisterInput } from '../services/auth.service'
import type { ActiveOrganization, Profile } from '../types'

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthContextValue {
  user: Profile | null
  status: AuthStatus
  /** The organization the user is working in (null = none yet → onboarding). */
  organization: ActiveOrganization | null
  isPlatformAdmin: boolean

  login: (email: string, password: string) => Promise<void>
  register: (input: RegisterInput) => Promise<void>
  logout: () => Promise<void>
  logoutAll: () => Promise<void>
  /** Re-fetch roles / permissions / menus (e.g. after an admin changed them). */
  reloadProfile: () => Promise<void>

  switchOrganization: (organizationId: number) => Promise<void>
  createOrganization: (name: string) => Promise<void>
  acceptInvitation: (token: string) => Promise<void>

  /** True if the user has ALL the given permissions in the active organization (owners: always). */
  can: (permission: Permission | Permission[]) => boolean
  /** Role in the active organization. */
  hasRole: (role: string) => boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)
