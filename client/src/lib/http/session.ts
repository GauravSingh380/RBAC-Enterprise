// Access token + active organization + refresh logic.
//  * the access token lives in memory only (never localStorage)
//  * the refresh token is an httpOnly cookie the browser sends automatically
//  * the active organization is sent as X-Organization-Id on every request, so each
//    browser tab can work in its own organization
//  * concurrent refreshes are de-duplicated (the server rotates refresh tokens,
//    so two parallel refreshes would otherwise log the user out)
import axios from 'axios'
import { APP_ENV } from '../../config/env'
import type { AuthSession } from '../../types'

export const ORGANIZATION_HEADER = 'X-Organization-Id'

let accessToken: string | null = null
let activeOrganizationId: number | null = null
let refreshPromise: Promise<AuthSession | null> | null = null
let sessionListener: ((session: AuthSession | null) => void) | null = null
/** why the last session ended (organization session rules), shown once on the sign-in page */
let sessionEndMessage: string | null = null

export function takeSessionEndMessage(): string | null {
  const m = sessionEndMessage
  sessionEndMessage = null
  return m
}

export const getAccessToken = () => accessToken
export const getActiveOrganizationId = () => activeOrganizationId

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function setActiveOrganizationId(id: number | null) {
  activeOrganizationId = id
}

/** AuthProvider subscribes here to learn about background refreshes / expiry. */
export function onSessionChange(listener: (session: AuthSession | null) => void) {
  sessionListener = listener
  return () => {
    if (sessionListener === listener) sessionListener = null
  }
}

export function notifySessionChange(session: AuthSession | null) {
  sessionListener?.(session)
}

export function refreshSession(): Promise<AuthSession | null> {
  // Uses plain axios (not the app instance) so interceptors can't loop.
  // Sends the active organization so the refreshed profile stays in the same organization.
  refreshPromise ??= axios
    .post<{ data: AuthSession }>(`${APP_ENV.apiBaseUrl}/auth/refresh`, null, {
      withCredentials: true,
      timeout: APP_ENV.apiTimeoutMs,
      headers: activeOrganizationId ? { [ORGANIZATION_HEADER]: String(activeOrganizationId) } : undefined,
    })
    .then((res) => {
      accessToken = res.data.data.accessToken
      activeOrganizationId = res.data.data.user.organization?.id ?? null
      return res.data.data
    })
    .catch((err) => {
      accessToken = null
      const body = axios.isAxiosError(err) ? (err.response?.data as { code?: string; message?: string } | undefined) : undefined
      if (body?.code === 'SESSION_IDLE' || body?.code === 'SESSION_MAX') sessionEndMessage = body.message ?? null
      return null
    })
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}
