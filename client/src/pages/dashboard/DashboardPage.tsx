// /dashboard — everything a person needs when they arrive: my work, project health, bug trend,
// who's out, upcoming holidays, my leave, and things waiting for me. One request (GET /api/dashboard).
import { AlertOutlined, CalendarOutlined, CheckSquareOutlined, ClockCircleOutlined, NotificationOutlined, SafetyCertificateOutlined, WarningOutlined } from '@ant-design/icons'
import { Alert, Badge, Card, Col, Empty, Flex, List, Progress, Row, Skeleton, Statistic, Table, Tag, Typography, theme } from 'antd'
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '../../auth/useAuth'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/ui'
import { PERMISSIONS } from '../../config/permissions'
import { useFetch } from '../../hooks/useFetch'
import { guideService } from '../../services/guide.service'
import { contentService } from '../../services/organization.service'
import { dashboardService } from '../../services/leave.service'
import type { DashboardContent, MenuNode } from '../../types'
import type { GettingStarted } from '../../types/guide'
import type { Dashboard } from '../../types/leave'
import { GettingStartedCard } from '../guide/GettingStartedCard'
import { describeLeaveDates } from '../leave/leaveMeta'
import { shortDate, useChartColors } from '../projects/reports/chartTheme'
import { isOverdue } from '../projects/shared/itemMeta'
import { ItemTypeIcon, PriorityIcon, StatusTag } from '../projects/shared/ItemBits'

function flattenMenus(menus: MenuNode[]): MenuNode[] {
  return menus.flatMap((m) => [...(m.path ? [m] : []), ...flattenMenus(m.children)])
}

function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

const projectKeyOf = (itemKey: string) => itemKey.slice(0, itemKey.lastIndexOf('-'))

export default function DashboardPage() {
  const { user, organization, can } = useAuth()
  const { token } = theme.useToken()
  const content = useFetch(useCallback(() => contentService.get<DashboardContent>('dashboard'), []))
  // owners / admins: the "Getting started" checklist (the server answers { visible: false } for everyone else)
  const canReadGuide = can(PERMISSIONS.GUIDE_VIEW)
  const checklist = useFetch(
    useCallback(() => (canReadGuide ? guideService.gettingStarted() : Promise.resolve<GettingStarted>({ visible: false })), [canReadGuide]),
  )
  const [checklistChanged, setChecklistChanged] = useState<GettingStarted | null>(null)
  const gettingStarted = checklistChanged ?? checklist.data
  const dash = useFetch(useCallback(() => dashboardService.get(), []))
  const shortcuts = flattenMenus(user?.menus ?? []).filter((m) => m.path !== '/dashboard')
  const d = dash.data

  return (
    <>
      <PageHeader help="dashboards-and-reports" title={`${greeting()}, ${user?.name.split(' ')[0]} 👋`} description={`Here is what's going on in ${organization?.name}.`} />

      {content.data?.content.announcement && (
        <Alert type="info" showIcon icon={<NotificationOutlined />} title={content.data.content.announcement} style={{ marginBottom: 24 }} />
      )}
      {gettingStarted && <GettingStartedCard data={gettingStarted} onChange={setChecklistChanged} style={{ marginBottom: 24 }} />}
      {dash.error && <Alert type="error" showIcon title={dash.error} style={{ marginBottom: 24 }} />}

      {!d ? (
        <Skeleton active paragraph={{ rows: 12 }} />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            <Tile icon={<CheckSquareOutlined />} title="Assigned to me" value={d.myWork.open} hint={`${d.myWork.inProgress} in progress`} />
            <Tile icon={<WarningOutlined />} title="Overdue" value={d.myWork.overdue} danger={d.myWork.overdue > 0} hint="past their due date" />
            <Tile icon={<ClockCircleOutlined />} title="Due this week" value={d.myWork.dueThisWeek} hint="next 7 days" />
            {d.leave?.approvalsPending !== null && d.leave?.approvalsPending !== undefined ? (
              <Tile icon={<SafetyCertificateOutlined />} title="Leave to approve" value={d.leave.approvalsPending} hint={<Link to="/leave/approvals">Open approvals</Link>} />
            ) : d.unresolvedErrors !== null ? (
              <Tile icon={<AlertOutlined />} title="Unresolved errors" value={d.unresolvedErrors} hint={<Link to="/errors">Production errors</Link>} />
            ) : (
              <Tile icon={<CalendarOutlined />} title="My pending leave" value={d.leave?.myPending ?? 0} hint={<Link to="/leave">My leave</Link>} />
            )}
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} xl={14}>
              <MyWork d={d} />
            </Col>
            <Col xs={24} xl={10}>
              <BugTrend d={d} />
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} xl={14}>
              <ProjectHealth d={d} />
            </Col>
            <Col xs={24} xl={10}>
              {d.leave && <TeamAway d={d} />}
            </Col>
          </Row>
        </>
      )}

      {shortcuts.length > 0 && (
        <Card title="Quick access" style={{ marginTop: 16 }}>
          <Row gutter={[16, 16]}>
            {shortcuts.map((m) => (
              <Col xs={12} sm={8} lg={6} xl={4} key={m.id}>
                <Link to={m.path!}>
                  <Card hoverable size="small" style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.6em', color: token.colorPrimary }}>
                      <Icon name={m.icon} />
                    </div>
                    <Typography.Text>{m.label}</Typography.Text>
                  </Card>
                </Link>
              </Col>
            ))}
          </Row>
        </Card>
      )}
    </>
  )
}

function Tile({ icon, title, value, hint, danger }: { icon: React.ReactNode; title: string; value: number; hint: React.ReactNode; danger?: boolean }) {
  const { token } = theme.useToken()
  return (
    <Col xs={12} lg={6}>
      <Card size="small" style={{ height: '100%' }}>
        <Statistic title={title} value={value} prefix={icon} styles={danger ? { content: { color: token.colorError } } : undefined} />
        <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>
          {hint}
        </Typography.Text>
      </Card>
    </Col>
  )
}

function MyWork({ d }: { d: Dashboard }) {
  return (
    <Card title="My work" size="small" style={{ height: '100%' }} extra={<Typography.Text type="secondary">due soonest first</Typography.Text>}>
      {d.myWork.items.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing assigned to you 🎉" />
      ) : (
        <List
          size="small"
          dataSource={d.myWork.items}
          renderItem={(i) => (
            <List.Item style={{ paddingInline: 0 }}>
              <Flex align="center" gap={8} style={{ width: '100%', minWidth: 0 }}>
                <ItemTypeIcon type={i.type} size={12} />
                <Link to={`/projects/${projectKeyOf(i.key)}/items/${i.number}`} style={{ whiteSpace: 'nowrap' }}>
                  {i.key}
                </Link>
                <Typography.Text ellipsis style={{ flex: 1, minWidth: 0 }}>
                  {i.title}
                </Typography.Text>
                <PriorityIcon priority={i.priority} />
                {i.dueDate && (
                  <Tag color={isOverdue(i.dueDate, i.status.category) ? 'red' : undefined} style={{ marginInlineEnd: 0 }}>
                    {new Date(`${i.dueDate}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </Tag>
                )}
                <StatusTag status={i.status} />
              </Flex>
            </List.Item>
          )}
        />
      )}
    </Card>
  )
}

function BugTrend({ d }: { d: Dashboard }) {
  const c = useChartColors()
  const data = d.bugTrend.map((w) => ({ ...w, x: shortDate(w.week) }))
  return (
    <Card title="Bugs opened vs closed per week" size="small" style={{ height: '100%' }} extra={<Typography.Text type="secondary">your projects</Typography.Text>}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} barGap={2} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="x" tick={c.tick} tickLine={false} axisLine={{ stroke: c.grid }} />
          <YAxis tick={c.tick} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip {...c.tooltip} cursor={{ fill: c.grid, opacity: 0.4 }} />
          <Legend wrapperStyle={{ color: c.axis }} />
          <Bar name="Opened" dataKey="opened" fill={c.series1} maxBarSize={20} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar name="Closed" dataKey="closed" fill={c.series2} maxBarSize={20} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  )
}

function ProjectHealth({ d }: { d: Dashboard }) {
  return (
    <Card title="Projects" size="small" style={{ height: '100%' }} extra={<Link to="/projects">All projects</Link>}>
      <Table
        size="small"
        rowKey="id"
        dataSource={d.projects}
        pagination={false}
        locale={{ emptyText: 'No projects yet' }}
        columns={[
          {
            title: 'Project',
            key: 'name',
            render: (_, p) => (
              <Link to={`/projects/${p.key}`}>
                <Tag style={{ marginInlineEnd: 6 }}>{p.key}</Tag>
                {p.name}
              </Link>
            ),
          },
          { title: 'Open', dataIndex: 'open', width: 70, align: 'right' },
          { title: 'Bugs', dataIndex: 'openBugs', width: 70, align: 'right' },
          {
            title: 'Overdue',
            dataIndex: 'overdue',
            width: 80,
            align: 'right',
            render: (v: number) => (v ? <Typography.Text type="danger">{v}</Typography.Text> : 0),
          },
          { title: 'Done (7d)', dataIndex: 'doneLast7', width: 90, align: 'right' },
        ]}
      />
    </Card>
  )
}

function TeamAway({ d }: { d: Dashboard }) {
  const { token } = theme.useToken()
  const leave = d.leave!
  const today = new Date().toISOString().slice(0, 10)
  const outToday = leave.out.filter((o) => o.startDate <= today && today <= o.endDate)
  return (
    <Card title="Team & leave" size="small" style={{ height: '100%' }} extra={<Link to="/leave/calendar">Team calendar</Link>}>
      <Typography.Text strong>
        Out today <Badge count={outToday.length} showZero color={token.colorTextQuaternary} />
      </Typography.Text>
      <Flex vertical gap={4} style={{ margin: '6px 0 12px' }}>
        {leave.out.length === 0 && <Typography.Text type="secondary">Everyone is in this week.</Typography.Text>}
        {leave.out.map((o, i) => (
          <Flex key={`${o.userId}-${i}`} align="center" gap={8}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: o.color, flexShrink: 0 }} />
            <Typography.Text strong={o.startDate <= today && today <= o.endDate}>{o.name}</Typography.Text>
            <Typography.Text type="secondary" ellipsis>
              {o.typeName} · {describeLeaveDates(o.startDate, o.endDate, o.portion as 'full')}
            </Typography.Text>
          </Flex>
        ))}
      </Flex>

      {leave.balances.length > 0 && (
        <>
          <Typography.Text strong>
            My leave <Link to="/leave" style={{ fontWeight: 400, marginLeft: 6 }}>Request</Link>
          </Typography.Text>
          {leave.balances.map((b) => {
            const total = (b.entitled ?? 0) + b.carriedOver
            return (
              <Flex key={b.type.id} align="center" gap={8} style={{ marginTop: 4 }}>
                <Typography.Text style={{ width: 110 }} ellipsis>
                  {b.type.name}
                </Typography.Text>
                <Progress
                  style={{ flex: 1, margin: 0 }}
                  size="small"
                  showInfo={false}
                  percent={total ? ((b.used + b.pending) / total) * 100 : 0}
                  success={{ percent: total ? (b.used / total) * 100 : 0, strokeColor: b.type.color }}
                  strokeColor={`${b.type.color}66`}
                />
                <Typography.Text type="secondary" style={{ width: 70, textAlign: 'right' }}>
                  {b.available} left
                </Typography.Text>
              </Flex>
            )
          })}
        </>
      )}

      {leave.upcomingHolidays.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <Typography.Text strong>Upcoming holidays</Typography.Text>
          <Flex gap={4} wrap style={{ marginTop: 6 }}>
            {leave.upcomingHolidays.map((h) => (
              <Tag key={h.date} color={h.isOptional ? undefined : 'blue'}>
                {new Date(`${h.date}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })} · {h.name}
                {h.isOptional && ' (optional)'}
              </Tag>
            ))}
          </Flex>
        </div>
      )}
    </Card>
  )
}
