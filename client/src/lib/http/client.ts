// The one axios instance used by the whole app.
//
// Request interceptor : adds the Bearer token, the active organization (X-Organization-Id),
//                       an X-Request-Id and the tab's X-Client-Id
//                       (the server logs it, so a UI error can be traced to its log lines)
// Response interceptor: on 401 silently refreshes the session and retries once,
//                       then converts every failure into an ApiError
import axios, { type InternalAxiosRequestConfig } from 'axios'
import { APP_ENV } from '../../config/env'
import { CLIENT_ID } from '../clientId'
import { uuid } from '../uuid'
import { toApiError } from './errors'
import { ORGANIZATION_HEADER, getAccessToken, getActiveOrganizationId, notifySessionChange, refreshSession } from './session'

/** window event: the server requires a new password before anything else */
export const PASSWORD_CHANGE_EVENT = 'tf:password-change-required'

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Don't try to refresh the session on 401 (e.g. wrong password on login). */
    skipAuthRefresh?: boolean
    /** Internal: marks a request that was already retried after a refresh. */
    _retried?: boolean
  }
}

// Endpoints where a 401 means "wrong credentials", not "expired token"
const NO_REFRESH_URLS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout', '/auth/forgot-password', '/auth/reset-password']

export const http = axios.create({
  baseURL: APP_ENV.apiBaseUrl,
  timeout: APP_ENV.apiTimeoutMs,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
})

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  // Tenant: which organization this request is for (the server verifies membership)
  const organizationId = getActiveOrganizationId()
  if (organizationId && !config.headers.has(ORGANIZATION_HEADER)) {
    config.headers.set(ORGANIZATION_HEADER, String(organizationId))
  }
  if (!config.headers.has('X-Request-Id')) config.headers.set('X-Request-Id', uuid())
  // Which browser tab made the change — realtime events for our own changes are ignored by this tab
  config.headers.set('X-Client-Id', CLIENT_ID)
  return config
})

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as InternalAxiosRequestConfig | undefined
    const canRefresh =
      error.response?.status === 401 &&
      original &&
      !original._retried &&
      !original.skipAuthRefresh &&
      !NO_REFRESH_URLS.includes(original.url ?? '')

    if (canRefresh) {
      original._retried = true
      const session = await refreshSession()
      notifySessionChange(session) // updates AuthProvider (or logs the user out)
      if (session) {
        original.headers.delete('X-Request-Id') // new id for the retried request
        return http(original)
      }
    }

    const apiError = toApiError(error)
    // an admin asked everyone for a new password (or the rules changed): the app shows the change-password screen
    if (apiError.reason === 'PASSWORD_CHANGE_REQUIRED') window.dispatchEvent(new Event(PASSWORD_CHANGE_EVENT))
    if (APP_ENV.isDev && apiError.code !== 'CANCELED') {
      console.warn(`[api] ${original?.method?.toUpperCase()} ${original?.url} → ${apiError.status || apiError.code}: ${apiError.message}`, {
        requestId: apiError.requestId,
      })
    }
    return Promise.reject(apiError)
  },
)
