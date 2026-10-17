// Layout of the public website: announcement bar, header with navigation, the page, footer.
// Everything in it comes from Platform → Website → Header & footer (published).
import { MenuOutlined } from '@ant-design/icons'
import { Button, Drawer, Flex, Layout, Typography, theme } from 'antd'
import { Suspense, useCallback, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { ErrorBoundary } from '../../components/errors/ErrorBoundary'
import { FullPageSpinner } from '../../components/ui'
import { useFetch } from '../../hooks/useFetch'
import { ThemeControls } from '../../theme/ThemeControls'
import { mediaUrl, websiteApi } from '../api'
import type { SiteData, SiteSettings } from '../types'
import { fillYear, isInternalHref } from '../websiteMeta'
import '../website.css'

const FALLBACK: SiteSettings = {
  brandName: 'Team-Flex',
  announcement: { enabled: false, text: '' },
  header: { loginLabel: 'Log in', ctaLabel: 'Start free', ctaHref: '/register' },
  footer: { text: null, columns: [], copyright: '© {year} Team-Flex' },
}

export default function WebsiteLayout() {
  const site = useFetch(useCallback(() => websiteApi.site(), []))
  const { pathname } = useLocation()
  return (
    <SiteChrome site={site.data ?? { settings: null, nav: [] }}>
      <ErrorBoundary resetKeys={[pathname]}>
        <Suspense fallback={<FullPageSpinner />}>
          <Outlet />
        </Suspense>
      </ErrorBoundary>
    </SiteChrome>
  )
}

/** Header + footer around any content (also used by the editor's full preview). */
export function SiteChrome({ site, children, preview }: { site: SiteData; children: React.ReactNode; preview?: boolean }) {
  const { token } = theme.useToken()
  const { user } = useAuth()
  const [menu, setMenu] = useState(false)
  const s = site.settings ?? FALLBACK
  const link = (href: string, label: string, onClick?: () => void) =>
    isInternalHref(href) ? (
      <Link to={href} onClick={onClick} style={{ color: token.colorTextSecondary }}>{label}</Link>
    ) : (
      <a href={href} onClick={onClick} style={{ color: token.colorTextSecondary }}>{label}</a>
    )

  const navLinks = site.nav.map((n) => (
    <NavLink key={n.path} to={n.path} onClick={() => setMenu(false)}>
      {({ isActive }) => (
        <Button type="text" style={{ color: isActive ? token.colorPrimary : token.colorText, fontWeight: isActive ? 600 : 500 }}>
          {n.label}
        </Button>
      )}
    </NavLink>
  ))
  const actions = user ? (
    <Link to="/dashboard">
      <Button type="primary">Go to dashboard</Button>
    </Link>
  ) : (
    <>
      <Link to="/login">
        <Button type="text">{s.header.loginLabel}</Button>
      </Link>
      {isInternalHref(s.header.ctaHref) ? (
        <Link to={s.header.ctaHref}><Button type="primary">{s.header.ctaLabel}</Button></Link>
      ) : (
        <a href={s.header.ctaHref}><Button type="primary">{s.header.ctaLabel}</Button></a>
      )}
    </>
  )

  return (
    <Layout style={{ minHeight: preview ? undefined : '100vh', background: token.colorBgLayout }}>
      {s.announcement.enabled && s.announcement.text && (
        <div style={{ background: token.colorPrimary, color: '#fff', textAlign: 'center', padding: '8px 16px', fontSize: '0.92em' }}>
          {s.announcement.href ? (
            isInternalHref(s.announcement.href) ? (
              <Link to={s.announcement.href} style={{ color: '#fff' }}>{s.announcement.text} →</Link>
            ) : (
              <a href={s.announcement.href} style={{ color: '#fff' }}>{s.announcement.text} →</a>
            )
          ) : (
            s.announcement.text
          )}
        </div>
      )}
      <header
        style={{
          position: preview ? 'relative' : 'sticky',
          top: 0,
          zIndex: 10,
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <div className="wf-header-inner">
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }} aria-label={`${s.brandName} home`}>
            {s.logoMediaId ? (
              <img src={mediaUrl(s.logoMediaId)} alt={s.brandName} style={{ height: 32, width: 'auto' }} />
            ) : (
              <span className="brand-logo">{s.brandName.slice(0, 2).toUpperCase()}</span>
            )}
            <Typography.Text strong style={{ fontSize: '1.1em' }}>{s.brandName}</Typography.Text>
          </Link>
          <nav className="wf-nav wf-hide-mobile" aria-label="Main">{navLinks}</nav>
          <div style={{ flex: 1 }} />
          <Flex gap={8} align="center" className="wf-hide-mobile">
            <ThemeControls />
            {actions}
          </Flex>
          <Button className="wf-show-mobile" icon={<MenuOutlined />} aria-label="Menu" onClick={() => setMenu(true)} />
        </div>
      </header>
      <Drawer open={menu} onClose={() => setMenu(false)} title={s.brandName} placement="right" size={280}>
        <Flex vertical gap={4}>
          {navLinks}
          <div style={{ height: 12 }} />
          <Flex vertical gap={8}>{actions}</Flex>
          <div style={{ marginTop: 12 }}><ThemeControls /></div>
        </Flex>
      </Drawer>

      <main style={{ flex: 1 }}>{children}</main>

      <footer style={{ background: token.colorBgContainer, borderTop: `1px solid ${token.colorBorderSecondary}`, padding: '48px 16px 24px' }}>
        <div className="wf-container">
          <div className="wf-footer-grid">
            <div>
              <Typography.Text strong style={{ fontSize: '1.1em' }}>{s.brandName}</Typography.Text>
              {s.footer.text && <Typography.Paragraph type="secondary" style={{ marginTop: 8, maxWidth: 360 }}>{s.footer.text}</Typography.Paragraph>}
            </div>
            {s.footer.columns.map((c) => (
              <div key={c.title}>
                <Typography.Text strong>{c.title}</Typography.Text>
                <Flex vertical gap={6} style={{ marginTop: 10 }}>
                  {c.links.map((l) => <span key={l.label}>{link(l.href, l.label)}</span>)}
                </Flex>
              </div>
            ))}
          </div>
          <Flex justify="space-between" gap={12} wrap style={{ marginTop: 32 }}>
            {s.footer.copyright ? (
              <Typography.Text type="secondary" style={{ fontSize: '0.9em' }}>{fillYear(s.footer.copyright)}</Typography.Text>
            ) : (
              <span />
            )}
            {/* published pages with "in the footer" (Privacy, Terms, …) */}
            {!!site.footerLinks?.length && (
              <Flex gap={16} wrap style={{ fontSize: '0.9em' }}>
                {site.footerLinks.map((l) => <span key={l.path}>{link(l.path, l.label)}</span>)}
              </Flex>
            )}
          </Flex>
        </div>
      </footer>
    </Layout>
  )
}
