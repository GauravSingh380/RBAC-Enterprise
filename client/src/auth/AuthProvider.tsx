import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Permission } from '../config/permissions'
import { onSessionChange, PASSWORD_CHANGE_EVENT, refreshSession, setAccessToken, setActiveOrganizationId } from '../lib/api'
import { authService, type RegisterInput } from '../services/auth.service'
import type { AuthSession, Profile } from '../types'
import { AuthContext, type AuthContextValue, type AuthStatus } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  // Every profile from the server says which organization is active → send it with each request
  const applyProfile = useCallback((profile: Profile | null) => {
    setActiveOrganizationId(profile?.organization?.id ?? null)
    setUser(profile)
  }, [])

  const applySession = useCallback(
    (session: AuthSession | null) => {
      setAccessToken(session?.accessToken ?? null)
      applyProfile(session?.user ?? null)
      setStatus(session ? 'authenticated' : 'unauthenticated')
    },
    [applyProfile],
  )

  // Restore the session on page load using the httpOnly refresh cookie
  useEffect(() => {
    let active = true
    refreshSession().then((session) => active && applySession(session))
    const unsubscribe = onSessionChange(applySession)
    return () => {
      active = false
      unsubscribe()
    }
  }, [applySession])

  const login = useCallback(
    async (email: string, password: string) => applySession(await authService.login({ email, password })),
    [applySession],
  )

  const register = useCallback(async (input: RegisterInput) => applySession(await authService.register(input)), [applySession])

  const logout = useCallback(async () => {
    await authService.logout().catch(() => undefined)
    applySession(null)
  }, [applySession])

  const logoutAll = useCallback(async () => {
    await authService.logoutAll()
    applySession(null)
  }, [applySession])

  const reloadProfile = useCallback(async () => applyProfile(await authService.me()), [applyProfile])

  // The server answered "choose a new password first" → reload the profile; RequireAuth then shows that screen
  useEffect(() => {
    const onRequired = () => void reloadProfile().catch(() => undefined)
    window.addEventListener(PASSWORD_CHANGE_EVENT, onRequired)
    return () => window.removeEventListener(PASSWORD_CHANGE_EVENT, onRequired)
  }, [reloadProfile])

  const switchOrganization = useCallback(
    async (organizationId: number) => applyProfile(await authService.switchOrganization(organizationId)),
    [applyProfile],
  )

  const createOrganization = useCallback(
    async (name: string) => applyProfile(await authService.createOrganization(name)),
    [applyProfile],
  )

  const acceptInvitation = useCallback(
    async (token: string) => applyProfile(await authService.acceptInvitation(token)),
    [applyProfile],
  )

  const can = useCallback(
    (permission: Permission | Permission[]) => {
      if (!user?.organization) return false
      if (user.isOwner) return true
      const required = Array.isArray(permission) ? permission : [permission]
      return required.every((p) => user.permissions.includes(p))
    },
    [user],
  )

  const hasRole = useCallback((role: string) => !!user?.roles.includes(role), [user])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      organization: user?.organization ?? null,
      isPlatformAdmin: !!user?.isPlatformAdmin,
      login,
      register,
      logout,
      logoutAll,
      reloadProfile,
      switchOrganization,
      createOrganization,
      acceptInvitation,
      can,
      hasRole,
    }),
    [user, status, login, register, logout, logoutAll, reloadProfile, switchOrganization, createOrganization, acceptInvitation, can, hasRole],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
