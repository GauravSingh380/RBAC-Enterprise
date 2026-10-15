// Sends frontend crashes to the server so they appear in the Winston logs
// (logs/error-*.log, type "client"). Each report gets an errorId that is also
// shown to the user, so a screenshot from a user maps to an exact log entry.
import { APP_ENV } from '../config/env'
import { getAccessToken, getActiveOrganizationId } from './http/session'
import { uuid } from './uuid'

export type ErrorSource = 'boundary' | 'router' | 'window' | 'promise'

interface ReportInput {
  error: unknown
  source: ErrorSource
  componentStack?: string | null
}

const MAX_REPORTS_PER_PAGE = 20
const DEDUPE_WINDOW_MS = 5_000

let sentCount = 0
const recent = new Map<string, { id: string; at: number }>()

export function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error
  if (typeof error === 'string') return new Error(error)
  try {
    return new Error(JSON.stringify(error))
  } catch {
    return new Error(String(error))
  }
}

/** Reports an error and returns its id. Never throws. */
export function reportError({ error, source, componentStack }: ReportInput): string {
  const err = normalizeError(error)
  const fingerprint = `${err.name}:${err.message}:${window.location.pathname}`

  // Same error again shortly after (StrictMode double render, render loops) → reuse the id
  const previous = recent.get(fingerprint)
  if (previous && Date.now() - previous.at < DEDUPE_WINDOW_MS) return previous.id

  const errorId = uuid()
  recent.set(fingerprint, { id: errorId, at: Date.now() })

  if (APP_ENV.isDev) {
    console.groupCollapsed(`%c[error ${errorId.slice(0, 8)}] ${err.message}`, 'color:#dc3e42')
    console.error(err)
    if (componentStack) console.info('Component stack:', componentStack)
    console.groupEnd()
  }

  if (sentCount >= MAX_REPORTS_PER_PAGE) return errorId
  sentCount++

  const token = getAccessToken()
  const organizationId = getActiveOrganizationId()
  // Plain fetch with keepalive: works even while the page is unloading, and avoids
  // the axios interceptors (an error in them must not trigger another report)
  fetch(`${APP_ENV.apiBaseUrl}/client-errors`, {
    method: 'POST',
    keepalive: true,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // lets the server put the crash in this organization's Production Errors inbox (membership is verified)
      ...(organizationId ? { 'X-Organization-Id': String(organizationId) } : {}),
    },
    body: JSON.stringify({
      errorId,
      source,
      name: err.name,
      message: err.message.slice(0, 1000),
      stack: err.stack?.slice(0, 8000),
      componentStack: componentStack?.slice(0, 8000),
      url: window.location.href,
      userAgent: navigator.userAgent,
      release: APP_ENV.appVersion,
    }),
  }).catch(() => undefined)

  return errorId
}

/** Catches errors that React error boundaries cannot (event handlers, async code). */
export function installGlobalErrorHandlers() {
  window.addEventListener('error', (event) => {
    // Ignore failed <img>/<script> loads which have no error object
    if (event.error) reportError({ error: event.error, source: 'window' })
  })
  window.addEventListener('unhandledrejection', (event) => {
    // Cancelled API requests are expected, not bugs
    if ((event.reason as { code?: string } | null)?.code === 'CANCELED') return
    reportError({ error: event.reason, source: 'promise' })
  })
}
