import { useState } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { normalizeError, reportError } from '../../lib/errorReporter'
import NotFoundPage from '../../pages/errors/NotFoundPage'
import { ErrorFallback } from './ErrorFallback'

/**
 * errorElement for the router: catches anything the page-level boundaries don't
 * (errors in layouts, guards, or failed lazy-loaded page chunks).
 */
export function RouteErrorPage() {
  const routeError = useRouteError()
  const isNotFound = isRouteErrorResponse(routeError) && routeError.status === 404

  const [error] = useState(() =>
    isRouteErrorResponse(routeError)
      ? new Error(`${routeError.status} ${routeError.statusText}`)
      : normalizeError(routeError),
  )
  // Report once per error (reportError de-duplicates StrictMode double renders)
  const [errorId] = useState(() => (isNotFound ? null : reportError({ error, source: 'router' })))

  if (isNotFound) return <NotFoundPage />
  return <ErrorFallback error={error} errorId={errorId} variant="app" />
}
