// Website pages are loaded on demand (visitors never download the editor, members never download the website).
import { lazy } from 'react'

export const WebsiteLayout = lazy(() => import('./public/WebsiteLayout'))
export const WebsitePage = lazy(() => import('./public/WebsitePage'))
export const WebsiteAdminPage = lazy(() => import('./admin/WebsiteAdminPage'))
