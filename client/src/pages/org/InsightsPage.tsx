// /org/insights — the owner's / admin's view of the whole organization (permission insights.view):
// people & activity, project health (with reasons), work trend, workload per person, quality, leave.
import { DownloadOutlined, MailOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Col, Empty, Flex, Progress, Row, Segmented, Skeleton, Statistic, Table, Tag, Tooltip, Typography, theme } from 'antd'
import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts'
import { timeAgo } from '../../components/notificationMeta'
import { PageHeader } from '../../components/ui'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { insightsService } from '../../services/insights.service'
import { peopleService } from '../../services/people.service'
import { Select } from 'antd'
import type { Insights, InsightsProject, InsightsWorkload, ProjectHealth } from '../../types/insights'
import { ChartCard } from '../projects/reports/chartKit'
import { shortDate, useChartColors } from '../projects/reports/chartTheme'
import { useAuth } from '../../auth/useAuth'
import { PERMISSIONS } from '../../config/permissions'
import type { Team } from '../../types/people'

type Days = 7 | 30 | 90

const HEALTH: Record<ProjectHealth, { label: string; color: string }> = {
  at_risk: { label: 'At risk', color: 'error' },
  stale: { label: 'Stale', color: 'warning' },
  healthy: { label: 'Healthy', color: 'success' },
  idle: { label: 'Idle', color: 'default' },
}
const SEVERITY_LABEL: Record<string, string> = { critical: 'Critical', major: 'Major', minor: 'Minor', trivial: 'Trivial', none: 'No severity' }
const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })

export default function InsightsPage() {
  const { message } = App.useApp()
  const [days, setDays] = useState<Days>(30)
  const data = useFetch(useCallback(() => insightsService.get(days), [days]))
  const d = data.data

  const download = async (section: 'projects' | 'workload') => {
    try {
      await insightsService.exportCsv(section, days)
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }
  const sendMe = async () => {
    try {
      const { sent } = await insightsService.sendMeWeeklyReport()
      message.success(sent ? 'The weekly report is on its way to your inbox' : 'Could not send — check your account email')
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  return (
    <>
      <PageHeader help="organization-insights"
        title="Organization insights"
        description="Every project and person at a glance — where work is stuck, who is overloaded, how quality is trending."
        actions={
          <Flex gap={8} wrap>
            <Segmented<Days>
              value={days}
              onChange={setDays}
              options={[
                { value: 7, label: '7 days' },
                { value: 30, label: '30 days' },
                { value: 90, label: '90 days' },
              ]}
            />
            <Tooltip title="Refresh">
              <Button icon={<ReloadOutlined />} onClick={data.reload} aria-label="Refresh" />
            </Tooltip>
            <Tooltip title="The same summary is emailed every Monday at 08:00 (Notifications → Settings to stop it)">
              <Button icon={<MailOutlined />} onClick={sendMe}>
                Email me the weekly report
              </Button>
            </Tooltip>
          </Flex>
        }
      />
      {data.error && <Alert type="error" showIcon title={data.error} style={{ marginBottom: 16 }} />}
      {!d ? (
        <Skeleton active paragraph={{ rows: 14 }} />
      ) : (
        <Flex vertical gap={16}>
          <Kpis d={d} />
          <Row gutter={[16, 16]}>
            <Col xs={24} xl={14}>
              <Trend d={d} />
            </Col>
            <Col xs={24} xl={10}>
              <Attention d={d} />
            </Col>
          </Row>
          <ProjectsTable d={d} onExport={() => download('projects')} />
          <WorkloadTable d={d} onExport={() => download('workload')} />
          <Row gutter={[16, 16]}>
            <Col xs={24} xl={14}>
              <Quality d={d} />
            </Col>
            <Col xs={24} xl={10}>
              <Leave d={d} />
            </Col>
          </Row>
        </Flex>
      )}
    </>
  )
}

function Kpis({ d }: { d: Insights }) {
  const { token } = theme.useToken()
  const tile = (title: string, value: number | string, hint: React.ReactNode, danger = false) => (
    <Col xs={12} md={8} xl={6}>
      <Card size="small" style={{ height: '100%' }}>
        <Statistic title={title} value={value} styles={danger ? { content: { color: token.colorError } } : undefined} />
        <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>
          {hint}
        </Typography.Text>
      </Card>
    </Col>
  )
  const criticalBugs = d.quality.openBugsBySeverity.find((b) => b.severity === 'critical')?.count ?? 0
  const openBugs = d.quality.openBugsBySeverity.reduce((s, b) => s + b.count, 0)
  return (
    <Row gutter={[16, 16]}>
      {tile('Members', d.people.active, `${d.people.joinedInPeriod} joined · ${d.people.invited} invited${d.people.deactivated ? ` · ${d.people.deactivated} deactivated` : ''}`)}
      {tile('Active people (7 days)', `${d.people.active7} / ${d.people.active}`, `${d.people.activeInPeriod} active in the last ${d.days} days`)}
      {tile('Projects', d.totals.activeProjects, `${d.totals.atRiskProjects} at risk · ${d.totals.staleProjects} stale · ${d.totals.archivedProjects} archived`, d.totals.atRiskProjects > 0)}
      {tile('Open work', d.totals.open, <>{d.totals.overdue ? <Typography.Text type="danger">{d.totals.overdue} overdue</Typography.Text> : 'nothing overdue'}</>)}
      {tile(`Done (${d.days} days)`, d.totals.doneInPeriod, `${d.totals.createdInPeriod} created in the same period`)}
      {tile('Open bugs', openBugs, `${criticalBugs} critical · ${d.quality.bugs.reopened} reopened by QA (${d.days}d)`, criticalBugs > 0)}
      {tile('Production errors', d.quality.errors.unresolved, `${d.quality.errors.newInPeriod} new · ${d.quality.errors.regressedInPeriod} regressions (${d.days}d)`)}
      {tile('Out today', d.leave.outToday.length, <Link to="/leave/approvals">{d.leave.pendingApprovals} leave request(s) waiting</Link>)}
    </Row>
  )
}

function Trend({ d }: { d: Insights }) {
  const c = useChartColors()
  const rows = d.trend.map((w) => ({ ...w, x: shortDate(w.week) }))
  return (
    <ChartCard
      title="Work created vs completed per week (all projects)"
      rows={rows}
      rowKey="week"
      columns={[
        { title: 'Week of', dataIndex: 'x' },
        { title: 'Created', dataIndex: 'created', align: 'right' },
        { title: 'Completed', dataIndex: 'done', align: 'right' },
      ]}
      chart={
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={rows} barGap={2} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="x" tick={c.tick} tickLine={false} axisLine={{ stroke: c.grid }} minTickGap={12} />
            <YAxis tick={c.tick} tickLine={false} axisLine={false} allowDecimals={false} />
            <ChartTooltip {...c.tooltip} cursor={{ fill: c.grid, opacity: 0.4 }} />
            <Legend wrapperStyle={{ color: c.axis }} />
            <Bar name="Created" dataKey="created" fill={c.series1} maxBarSize={20} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar name="Completed" dataKey="done" fill={c.series2} maxBarSize={20} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      }
    />
  )
}

function Attention({ d }: { d: Insights }) {
  const needing = d.projects.filter((p) => p.health === 'at_risk' || p.health === 'stale')
  const overloaded = d.workload.filter((w) => w.overdue > 0).slice(0, 5)
  return (
    <Card title={<span><WarningOutlined /> Needs attention</span>} size="small" style={{ height: '100%' }}>
      {!needing.length && !overloaded.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing stands out — nice." />}
      {needing.slice(0, 6).map((p) => (
        <Flex key={p.id} gap={8} align="baseline" style={{ marginBottom: 8 }}>
          <Tag color={HEALTH[p.health].color} style={{ marginInlineEnd: 0 }}>
            {HEALTH[p.health].label}
          </Tag>
          <Link to={`/projects/${p.key}`}>{p.name}</Link>
          <Typography.Text type="secondary">{p.reasons.join(', ')}</Typography.Text>
        </Flex>
      ))}
      {overloaded.length > 0 && (
        <>
          <Typography.Text strong style={{ display: 'block', marginTop: 8 }}>
            People with overdue work
          </Typography.Text>
          {overloaded.map((w) => (
            <Flex key={w.user.id} justify="space-between" style={{ marginTop: 4 }}>
              <Typography.Text>{w.user.name}</Typography.Text>
              <Typography.Text type="danger">
                {w.overdue} overdue of {w.open}
              </Typography.Text>
            </Flex>
          ))}
        </>
      )}
    </Card>
  )
}

function ProjectsTable({ d, onExport }: { d: Insights; onExport: () => void }) {
  const navigate = useNavigate()
  return (
    <Card
      title="Projects"
      size="small"
      extra={
        <Button size="small" icon={<DownloadOutlined />} onClick={onExport}>
          Export CSV
        </Button>
      }
    >
      <Table<InsightsProject>
        size="small"
        rowKey="id"
        dataSource={d.projects}
        pagination={d.projects.length > 15 ? { pageSize: 15, showSizeChanger: false } : false}
        scroll={{ x: 900 }}
        onRow={(p) => ({ onClick: () => navigate(`/projects/${p.key}`), style: { cursor: 'pointer' } })}
        columns={[
          {
            title: 'Project',
            key: 'name',
            render: (_, p) => (
              <Flex vertical>
                <span>
                  <Tag style={{ marginInlineEnd: 6 }}>{p.key}</Tag>
                  {p.name}
                  {p.visibility === 'private' && <Typography.Text type="secondary"> · private</Typography.Text>}
                </span>
                {p.lead && (
                  <Typography.Text type="secondary" style={{ fontSize: '0.82em' }}>
                    Lead: {p.lead.name} · {p.members} member{p.members === 1 ? '' : 's'}
                  </Typography.Text>
                )}
              </Flex>
            ),
          },
          {
            title: 'Health',
            key: 'health',
            width: 220,
            filters: Object.entries(HEALTH).map(([value, h]) => ({ text: h.label, value })),
            onFilter: (v, p) => p.health === v,
            render: (_, p) => (
              <Tooltip title={p.reasons.join(', ') || undefined}>
                <Tag color={HEALTH[p.health].color}>{HEALTH[p.health].label}</Tag>
                <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>
                  {p.reasons[0]}
                </Typography.Text>
              </Tooltip>
            ),
          },
          { title: 'Open', dataIndex: 'open', width: 70, align: 'right', sorter: (a, b) => a.open - b.open },
          {
            title: 'Overdue',
            dataIndex: 'overdue',
            width: 85,
            align: 'right',
            sorter: (a, b) => a.overdue - b.overdue,
            render: (v: number) => (v ? <Typography.Text type="danger">{v}</Typography.Text> : 0),
          },
          { title: 'Bugs', dataIndex: 'openBugs', width: 70, align: 'right', sorter: (a, b) => a.openBugs - b.openBugs },
          { title: `Done (${d.days}d)`, dataIndex: 'doneInPeriod', width: 95, align: 'right', sorter: (a, b) => a.doneInPeriod - b.doneInPeriod },
          {
            title: 'Last activity',
            dataIndex: 'lastActivityAt',
            width: 110,
            sorter: (a, b) => new Date(a.lastActivityAt ?? 0).getTime() - new Date(b.lastActivityAt ?? 0).getTime(),
            render: (v: string | null) => (v ? timeAgo(v) : '—'),
          },
        ]}
      />
    </Card>
  )
}

function WorkloadTable({ d, onExport }: { d: Insights; onExport: () => void }) {
  const c = useChartColors()
  // the team filter needs people.view (guests and restricted roles simply don't get it)
  const canSeeTeams = useAuth().can(PERMISSIONS.PEOPLE_VIEW)
  const teams = useFetch(useCallback(() => (canSeeTeams ? peopleService.teams() : Promise.resolve([] as Team[])), [canSeeTeams]))
  const [teamId, setTeamId] = useState<number>()
  const team = teams.data?.find((t) => t.id === teamId)
  const rows = team ? d.workload.filter((w) => team.members.some((m) => m.id === w.user.id)) : d.workload
  const max = Math.max(1, ...rows.map((w) => w.open))
  return (
    <Card
      title="Workload per person (all projects)"
      size="small"
      extra={
        <Flex gap={8}>
          {(teams.data?.length ?? 0) > 0 && (
            <Select size="small" allowClear placeholder="All teams" style={{ width: 160 }} value={teamId} onChange={setTeamId} options={teams.data!.map((t) => ({ value: t.id, label: t.name }))} />
          )}
          <Button size="small" icon={<DownloadOutlined />} onClick={onExport}>
            Export CSV
          </Button>
        </Flex>
      }
    >
      <Table<InsightsWorkload>
        size="small"
        rowKey={(w) => w.user.id}
        dataSource={rows}
        pagination={rows.length > 15 ? { pageSize: 15, showSizeChanger: false } : false}
        scroll={{ x: 900 }}
        columns={[
          { title: 'Person', key: 'person', render: (_, w) => <Typography.Text strong>{w.user.name}</Typography.Text> },
          {
            title: 'Open items',
            key: 'open',
            width: 220,
            sorter: (a, b) => a.open - b.open,
            render: (_, w) => (
              <Flex align="center" gap={8}>
                <Progress percent={(w.open / max) * 100} showInfo={false} size="small" strokeColor={c.series1} style={{ flex: 1, margin: 0 }} />
                <Typography.Text style={{ width: 28, textAlign: 'right' }}>{w.open}</Typography.Text>
              </Flex>
            ),
          },
          { title: 'In progress', dataIndex: 'inProgress', width: 95, align: 'right', sorter: (a, b) => a.inProgress - b.inProgress },
          {
            title: 'Overdue',
            dataIndex: 'overdue',
            width: 85,
            align: 'right',
            sorter: (a, b) => a.overdue - b.overdue,
            render: (v: number) => (v ? <Typography.Text type="danger">{v}</Typography.Text> : 0),
          },
          { title: 'Points', dataIndex: 'points', width: 75, align: 'right', sorter: (a, b) => a.points - b.points },
          { title: 'Projects', dataIndex: 'projects', width: 80, align: 'right' },
          { title: `Done (${d.days}d)`, dataIndex: 'doneInPeriod', width: 95, align: 'right', sorter: (a, b) => a.doneInPeriod - b.doneInPeriod },
          { title: 'Last active', dataIndex: 'lastActiveAt', width: 100, render: (v: string | null) => (v ? timeAgo(v) : 'never') },
          {
            title: 'Away (14 days)',
            key: 'away',
            width: 130,
            render: (_, w) => (w.away ? <Tag>🌴 {w.away.startDate === w.away.endDate ? short(w.away.startDate) : `${short(w.away.startDate)} – ${short(w.away.endDate)}`}</Tag> : '—'),
          },
        ]}
      />
    </Card>
  )
}

function Quality({ d }: { d: Insights }) {
  const c = useChartColors()
  const rows = d.quality.openBugsBySeverity.map((b) => ({ ...b, label: SEVERITY_LABEL[b.severity] }))
  const t = d.quality.tests
  return (
    <ChartCard
      title="Quality"
      rows={rows}
      rowKey="severity"
      columns={[
        { title: 'Severity', dataIndex: 'label' },
        { title: 'Open bugs', dataIndex: 'count', align: 'right' },
      ]}
      chart={
        <Row gutter={16}>
          <Col xs={24} md={14}>
            <Typography.Text type="secondary">Open bugs by severity</Typography.Text>
            <ResponsiveContainer width="100%" height={200}>
              {/* severity is ordered → one blue ramp, darker = more severe */}
              <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 0, left: 8 }}>
                <CartesianGrid stroke={c.grid} horizontal={false} />
                <XAxis type="number" tick={c.tick} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="label" tick={c.tick} tickLine={false} axisLine={false} width={90} />
                <ChartTooltip {...c.tooltip} cursor={{ fill: c.grid, opacity: 0.4 }} />
                <Bar dataKey="count" name="Open bugs" maxBarSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: 'right', fill: c.axis, fontSize: 12 }}
                  shape={(props: unknown) => {
                    const p = props as { x: number; y: number; width: number; height: number; payload: { severity: keyof typeof c.severity } }
                    return <rect x={p.x} y={p.y} width={Math.max(0, p.width)} height={p.height} rx={4} fill={c.severity[p.payload.severity]} />
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </Col>
          <Col xs={24} md={10}>
            <Flex vertical gap={10}>
              <Statistic title={`Bugs opened / closed (${d.days}d)`} value={`${d.quality.bugs.opened} / ${d.quality.bugs.closed}`} />
              <Statistic title="Test pass rate" value={t.passRate ?? '—'} suffix={t.passRate !== null ? `% of ${t.executed}` : undefined} />
              <Typography.Text type="secondary">
                {t.runsInProgress} test run(s) in progress · {t.failed} failed results in {d.days} days
              </Typography.Text>
            </Flex>
          </Col>
        </Row>
      }
    />
  )
}

function Leave({ d }: { d: Insights }) {
  const today = new Date().toISOString().slice(0, 10)
  return (
    <Card title="People & leave" size="small" style={{ height: '100%' }} extra={<Link to="/leave/calendar">Team calendar</Link>}>
      <Typography.Text strong>Away this week</Typography.Text>
      <Flex vertical gap={4} style={{ margin: '6px 0 12px' }}>
        {!d.leave.outThisWeek.length && <Typography.Text type="secondary">Everyone is in this week.</Typography.Text>}
        {d.leave.outThisWeek.map((o, i) => (
          <Flex key={`${o.userId}-${i}`} align="center" gap={8}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: o.color }} />
            <Typography.Text strong={o.startDate <= today && today <= o.endDate}>{o.name}</Typography.Text>
            <Typography.Text type="secondary">
              {o.typeName} · {o.startDate === o.endDate ? short(o.startDate) : `${short(o.startDate)} – ${short(o.endDate)}`}
            </Typography.Text>
          </Flex>
        ))}
      </Flex>
      {d.leave.daysTakenThisYear && (
        <>
          <Typography.Text strong>Leave taken this year (days)</Typography.Text>
          {d.leave.daysTakenThisYear.map((t) => (
            <Flex key={t.name} justify="space-between" style={{ marginTop: 4 }}>
              <Typography.Text>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: t.color, marginRight: 8 }} />
                {t.name}
              </Typography.Text>
              <Typography.Text>{t.days}</Typography.Text>
            </Flex>
          ))}
        </>
      )}
    </Card>
  )
}
