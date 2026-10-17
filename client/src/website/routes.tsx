// The website's routes — the app's router only adds these two entries (public pages + the platform editor).
import { Suspense } from 'react'
import type { RouteObject } from 'react-router-dom'
import { RouteErrorPage } from '../components/errors/RouteErrorPage'
import { FullPageSpinner } from '../components/ui'
import { WebsiteAdminPage, WebsiteLayout, WebsitePage } from './lazyPages'

/** Public marketing pages (no login). */
export const websiteRoutes: RouteObject = {
  // the layout itself is loaded on demand → it needs its own loading state
  element: (
    <Suspense fallback={<FullPageSpinner />}>
      <WebsiteLayout />
    </Suspense>
  ),
  errorElement: <RouteErrorPage />,
  children: [
    { path: '/', element: <WebsitePage slug="home" /> },
    { path: '/features', element: <WebsitePage slug="features" /> },
    { path: '/pricing', element: <WebsitePage slug="pricing" /> },
    { path: '/faq', element: <WebsitePage slug="faq" /> },
    { path: '/contact', element: <WebsitePage slug="contact" /> },
    { path: '/privacy', element: <WebsitePage slug="privacy" /> },
    { path: '/terms', element: <WebsitePage slug="terms" /> },
  ],
}

/** Platform → Website (inside the /platform routes, platform admins only). */
export const websiteAdminRoute: RouteObject = { path: 'website', element: <WebsiteAdminPage /> }
