// /projects/:projectKey/* — loads the project once and shares it with the child pages.
import { AppstoreOutlined, BarChartOutlined, CalendarOutlined, ExperimentOutlined, FileTextOutlined, LockOutlined, RestOutlined, ScheduleOutlined, SettingOutlined, UnorderedListOutlined } from '@ant-design/icons'
import { Alert, Avatar, Badge, Breadcrumb, Button, Flex, Result, Skeleton, Tabs, Tag, Tooltip, Typography, theme } from 'antd'
import { useCallback } from 'react'
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { HelpLink } from '../../components/HelpLink'
import { useFetch } from '../../hooks/useFetch'
import { useLiveReload, useRealtimeStatus } from '../../hooks/useRealtime'
import { projectsService } from '../../services/projects.service'
import type { ProjectOutletContext } from './shared/projectContext'

// the "?" next to the project name opens the guide article of the current tab
const TAB_HELP: Record<string, string> = {
  board: 'board-and-list',
  list: 'board-and-list',
  backlog: 'backlog-and-sprints',
  tests: 'test-cases',
  reports: 'dashboards-and-reports',
  docs: 'project-docs',
  calendar: 'calendar',
  trash: 'trash',
  settings: 'projects',
}

export default function ProjectShell() {
  const { projectKey = '' } = useParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const project = useFetch(useCallback(() => projectsService.get(projectKey), [projectKey]))
  const live = useRealtimeStatus()
  // keep column counts etc. fresh when others change items
  useLiveReload(project.data?.id, project.reload)

  if (project.error && !project.data) {
    return <Result status="404" title="Project not found" subTitle="It doesn't exist or you don't have access." extra={<Link to="/projects">Back to projects</Link>} />
  }
  if (!project.data) return <Skeleton active avatar paragraph={{ rows: 6 }} />

  const p = project.data
  const base = `/projects/${p.key}`
  const section = pathname.slice(base.length + 1).split('/')[0] ?? ''
  const tab = ['list', 'backlog', 'reports', 'tests', 'docs', 'calendar', 'trash', 'settings'].includes(section) ? section : 'board'
  // full-width pages without the project header: an item, a test run being executed
  const inItem = /\/items\/\d+/.test(pathname) || /\/tests\/runs\/\d+/.test(pathname)
  const context: ProjectOutletContext = { project: p, reloadProject: project.reload }

  return (
    <>
      <Breadcrumb style={{ marginBottom: 12 }} items={[{ title: <Link to="/projects">Projects</Link> }, { title: p.name }]} />
      {!inItem && (
        <>
          <Flex align="center" gap={14} style={{ marginBottom: 8 }}>
            <Avatar shape="square" size={44} style={{ background: p.color ?? token.colorPrimary, fontWeight: 700 }}>
              {p.key.slice(0, 2)}
            </Avatar>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Flex align="center" gap={8} wrap>
                <Typography.Title level={3} style={{ margin: 0 }}>
                  {p.name}
                </Typography.Title>
                <HelpLink article={TAB_HELP[tab] ?? 'board-and-list'} />
                <Tag>{p.key}</Tag>
                {p.visibility === 'private' && <Tag icon={<LockOutlined />}>private</Tag>}
                <Tag color={p.myRole === 'admin' ? 'gold' : p.myRole === 'member' ? 'blue' : 'default'}>{p.myRole}</Tag>
                <Tooltip
                  title={
                    live === 'live'
                      ? 'Live: changes by others appear automatically'
                      : live === 'connecting'
                        ? 'Connecting to live updates…'
                        : 'Live updates are off — use refresh'
                  }
                >
                  <Badge
                    status={live === 'live' ? 'success' : live === 'connecting' ? 'processing' : 'default'}
                    text={<Typography.Text type="secondary">{live === 'live' ? 'Live' : live === 'connecting' ? 'Connecting' : 'Offline'}</Typography.Text>}
                  />
                </Tooltip>
              </Flex>
              {p.description && (
                <Typography.Text type="secondary" ellipsis style={{ display: 'block', maxWidth: 800 }}>
                  {p.description}
                </Typography.Text>
              )}
            </div>
          </Flex>
          {p.status === 'archived' && <Alert type="warning" showIcon title="This project is archived and read-only." style={{ margin: '12px 0' }} />}
          {p.myRole === 'viewer' && p.status === 'active' && (
            <Alert type="info" showIcon title="You can view and comment. Ask a project admin to add you as a member to edit work." style={{ margin: '12px 0' }} />
          )}
          <Tabs
            activeKey={tab}
            onChange={(k) => navigate(k === 'board' ? base : `${base}/${k}`)}
            // deleted items and docs (30 days) — for people who can edit
            tabBarExtraContent={
              (p.canEdit || p.canManage) && (
                <Button type={tab === 'trash' ? 'link' : 'text'} size="small" icon={<RestOutlined />} onClick={() => navigate(`${base}/trash`)}>
                  Trash
                </Button>
              )
            }
            items={[
              { key: 'board', label: <span><AppstoreOutlined /> Board</span> },
              { key: 'backlog', label: <span><ScheduleOutlined /> Backlog</span> },
              { key: 'list', label: <span><UnorderedListOutlined /> List</span> },
              { key: 'tests', label: <span><ExperimentOutlined /> Tests</span> },
              { key: 'docs', label: <span><FileTextOutlined /> Docs</span> },
              { key: 'calendar', label: <span><CalendarOutlined /> Calendar</span> },
              { key: 'reports', label: <span><BarChartOutlined /> Reports</span> },
              ...(p.canManage ? [{ key: 'settings', label: <span><SettingOutlined /> Settings</span> }] : []),
            ]}
          />
        </>
      )}
      <Outlet context={context} />
    </>
  )
}
