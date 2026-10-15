import { LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button, Drawer, Dropdown, Flex, Grid, Layout, Menu, Tag, Typography, theme, type MenuProps } from 'antd'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { CommandPalette } from '../components/CommandPalette'
import { NotificationBell } from '../components/NotificationBell'
import { ErrorBoundary } from '../components/errors/ErrorBoundary'
import { Icon } from '../components/Icon'
import { OrganizationSwitcher } from '../components/OrganizationSwitcher'
import { Brand, FullPageSpinner } from '../components/ui'
import { ThemeControls } from '../theme/ThemeControls'
import { isPaletteShortcut } from '../lib/shortcuts'
import { STORAGE_KEYS, readStorage, writeStorage } from '../theme/storage'
import type { MenuNode } from '../types'

type MenuItem = Required<MenuProps>['items'][number]

// Sidebar is fully driven by the menus returned from the API (already filtered by permission)
function toMenuItem(node: MenuNode): MenuItem {
  const children = node.children.length ? node.children.map(toMenuItem) : undefined
  if (!node.path) {
    return { key: `group:${node.key}`, label: node.label, icon: <Icon name={node.icon} />, children }
  }
  return { key: node.path, label: <Link to={node.path}>{node.label}</Link>, icon: <Icon name={node.icon} />, children }
}

function collectPaths(nodes: MenuNode[]): string[] {
  return nodes.flatMap((n) => [...(n.path ? [n.path] : []), ...collectPaths(n.children)])
}

function collectGroupKeys(nodes: MenuNode[]): string[] {
  return nodes.flatMap((n) => [...(!n.path ? [`group:${n.key}`] : []), ...collectGroupKeys(n.children)])
}

export default function DashboardLayout() {
  const { user, organization, isPlatformAdmin, logout } = useAuth()
  const { token } = theme.useToken()
  const screens = Grid.useBreakpoint()
  const isMobile = !screens.lg
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const [collapsed, setCollapsed] = useState(() => readStorage(STORAGE_KEYS.siderCollapsed) === 'true')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Ctrl+K / ⌘K anywhere in the app
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPaletteShortcut(e)) return
      e.preventDefault()
      setPaletteOpen((o) => !o)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const menus = useMemo(() => user?.menus ?? [], [user])
  const items = useMemo(() => menus.map(toMenuItem), [menus])
  const groupKeys = useMemo(() => collectGroupKeys(menus), [menus])
  // Highlight the longest menu path that matches the current URL
  const selectedKey = useMemo(
    () => collectPaths(menus).filter((p) => pathname === p || pathname.startsWith(`${p}/`)).sort((a, b) => b.length - a.length)[0],
    [menus, pathname],
  )

  const toggleCollapsed = () => {
    if (isMobile) return setDrawerOpen(true)
    setCollapsed((c) => {
      writeStorage(STORAGE_KEYS.siderCollapsed, String(!c))
      return !c
    })
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const userMenu: MenuProps['items'] = [
    {
      key: 'info',
      disabled: true,
      label: (
        <div style={{ cursor: 'default' }}>
          <Typography.Text strong>{user?.name}</Typography.Text>
          <br />
          <Typography.Text type="secondary">{user?.email}</Typography.Text>
        </div>
      ),
    },
    { type: 'divider' },
    { key: 'profile', icon: <UserOutlined />, label: <Link to="/profile">My account</Link> },
    { key: 'logout', icon: <LogoutOutlined />, danger: true, label: 'Log out', onClick: handleLogout },
  ]

  const sideMenu = (
    <Menu
      key={organization?.id ?? 'none'} // re-open groups after switching organization
      className="app-sider-menu"
      mode="inline"
      items={items}
      selectedKeys={selectedKey ? [selectedKey] : []}
      defaultOpenKeys={groupKeys}
      onClick={() => setDrawerOpen(false)}
    />
  )

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {isMobile ? (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          size={260}
          title={<Brand />}
          styles={{ body: { padding: 0 } }}
        >
          {sideMenu}
        </Drawer>
      ) : (
        <Layout.Sider
          className="app-sider"
          width={248}
          collapsed={collapsed}
          collapsedWidth={72}
          theme="light"
          style={{
            height: '100vh',
            position: 'sticky',
            top: 0,
            borderInlineEnd: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <div className="app-sider-brand">
            <Brand collapsed={collapsed} />
          </div>
          {sideMenu}
        </Layout.Sider>
      )}

      <Layout>
        <Layout.Header
          className="app-header"
          style={{ background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorderSecondary}` }}
        >
          <Button
            type="text"
            icon={collapsed || isMobile ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={toggleCollapsed}
            aria-label="Toggle menu"
          />
          <OrganizationSwitcher compact={isMobile} />
          <div style={{ flex: 1 }} />
          {organization && (
            <Button
              icon={<SearchOutlined />}
              onClick={() => setPaletteOpen(true)}
              aria-label="Search (Ctrl+K)"
              style={{ color: token.colorTextSecondary }}
            >
              {!isMobile && (
                <>
                  Search…
                  <Tag style={{ marginInlineStart: 12, marginInlineEnd: 0, fontSize: '0.75em' }}>
                    {/Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'} K
                  </Tag>
                </>
              )}
            </Button>
          )}
          {organization && <NotificationBell />}
          <ThemeControls />
          <Dropdown menu={{ items: userMenu }} trigger={['click']} placement="bottomRight">
            <Button type="text" style={{ height: 'auto', paddingBlock: 4 }}>
              <Flex align="center" gap={8}>
                <Avatar style={{ background: token.colorPrimary }}>{user?.name.charAt(0).toUpperCase()}</Avatar>
                {!isMobile && (
                  <Flex vertical align="flex-start" style={{ lineHeight: 1.25 }}>
                    <Typography.Text strong>{user?.name}</Typography.Text>
                    <span>
                      {isPlatformAdmin && (
                        <Tag color="purple" variant="filled" style={{ marginInlineEnd: 4, fontSize: '0.75em' }}>
                          platform
                        </Tag>
                      )}
                      {user?.roles.slice(0, 2).map((r) => (
                        <Tag key={r} variant="filled" style={{ marginInlineEnd: 4, fontSize: '0.75em' }}>
                          {r}
                        </Tag>
                      ))}
                    </span>
                  </Flex>
                )}
              </Flex>
            </Button>
          </Dropdown>
        </Layout.Header>

        <Layout.Content style={{ padding: 'clamp(16px, 3vw, 28px)', width: '100%', maxWidth: 1320 }}>
          {/* key: every page remounts (and refetches) when the active organization changes */}
          <ErrorBoundary key={organization?.id ?? 'none'} resetKeys={[pathname]}>
            <Suspense fallback={<FullPageSpinner />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </Layout.Content>
      </Layout>
      {organization && <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />}
    </Layout>
  )
}
