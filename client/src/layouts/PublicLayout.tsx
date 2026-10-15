import { Suspense } from 'react'
import { Button, Flex, Layout, Typography, theme } from 'antd'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { ErrorBoundary } from '../components/errors/ErrorBoundary'
import { Brand, FullPageSpinner } from '../components/ui'
import { ThemeControls } from '../theme/ThemeControls'

export default function PublicLayout() {
  const { user } = useAuth()
  const { token } = theme.useToken()
  const { pathname } = useLocation()

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header
        className="app-header"
        style={{
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          paddingInline: 'clamp(16px, 4vw, 48px)',
        }}
      >
        <Brand />
        <div style={{ flex: 1 }} />
        <Flex gap={8} align="center">
          <ThemeControls />
          {user ? (
            <Link to="/dashboard">
              <Button type="primary">Go to dashboard</Button>
            </Link>
          ) : (
            <>
              <Link to="/login" className="hide-on-mobile">
                <Button type="text">Log in</Button>
              </Link>
              <Link to="/register">
                <Button type="primary">Sign up</Button>
              </Link>
            </>
          )}
        </Flex>
      </Layout.Header>

      <Layout.Content style={{ width: '100%', maxWidth: 1140, margin: '0 auto', padding: '24px 16px' }}>
        <ErrorBoundary resetKeys={[pathname]}>
          <Suspense fallback={<FullPageSpinner />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </Layout.Content>

      <Layout.Footer style={{ textAlign: 'center' }}>
        <Typography.Text type="secondary">© {new Date().getFullYear()} Team-Flex · Built for teams that ship</Typography.Text>
      </Layout.Footer>
    </Layout>
  )
}
