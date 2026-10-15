// Burndown (one sprint) and velocity (last completed sprints).
import { Alert, Card, Col, Empty, Flex, Row, Segmented, Select, Skeleton, Statistic, Table, Tag, Typography } from 'antd'
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useFetch } from '../../../hooks/useFetch'
import { useLiveReload } from '../../../hooks/useRealtime'
import { reportsService } from '../../../services/projects.service'
import type { ProjectDetail, Sprint, SprintReportItem } from '../../../types/projects'
import { ItemTypeIcon } from '../shared/ItemBits'
import { ChartCard } from './chartKit'
import { shortDate, useChartColors } from './chartTheme'

type Unit = 'points' | 'count'

export function BurndownReport({ project, sprints }: { project: ProjectDetail; sprints: Sprint[] }) {
  const c = useChartColors()
  const started = sprints.filter((s) => s.status !== 'planned')
  const [sprintId, setSprintId] = useState<number | undefined>(started[0]?.id)
  const report = useFetch(useCallback(() => (sprintId ? reportsService.burndown(project.key, sprintId) : Promise.resolve(null)), [project.key, sprintId]))
  useLiveReload(project.id, report.reload, ['items', 'sprints'])
  const [unitChoice, setUnit] = useState<Unit | null>(null)

  if (!started.length) {
    return <Empty description="No sprint has been started yet. Start one in the Backlog to see its burndown." />
  }
  const r = report.data
  // default to points when the team estimates, otherwise count items
  const unit: Unit = unitChoice ?? (r?.summary && r.summary.committedPoints > 0 ? 'points' : 'count')
  const label = unit === 'points' ? 'points' : 'items'
  const series = (r?.series ?? []).map((p) => ({
    ...p,
    x: p.kind === 'start' ? 'Start' : shortDate(p.date),
    remaining: unit === 'points' ? p.remainingPoints : p.remainingCount,
    scope: unit === 'points' ? p.scopePoints : p.scopeCount,
    ideal: unit === 'points' ? p.idealPoints : p.idealCount,
  }))
  const s = r?.summary

  const itemColumns = [
    { title: 'Key', dataIndex: 'key', width: 110, render: (k: string, i: SprintReportItem) => <Flex gap={6} align="center"><ItemTypeIcon type={i.type} size={12} />{k}</Flex> },
    { title: 'Title', dataIndex: 'title', render: (t: string, i: SprintReportItem) => <>{t} {i.addedAfterStart && <Tag style={{ marginLeft: 6 }}>added later</Tag>}</> },
    { title: 'Status', dataIndex: 'status', width: 140 },
    { title: 'Points', dataIndex: 'points', width: 80, align: 'right' as const },
  ]

  return (
    <Flex vertical gap={16}>
      <Flex gap={8} wrap align="center">
        <Select
          style={{ minWidth: 220 }}
          value={sprintId}
          onChange={setSprintId}
          options={started.map((sp) => ({ value: sp.id, label: `${sp.name}${sp.status === 'active' ? ' (active)' : ''}` }))}
        />
        <Segmented value={unit} onChange={(v) => setUnit(v as Unit)} options={[{ value: 'points', label: 'Story points' }, { value: 'count', label: 'Item count' }]} />
      </Flex>
      {report.error && <Alert type="error" showIcon title={report.error} />}
      {!r || !s ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            {[
              { title: `Committed (${label})`, value: unit === 'points' ? s.committedPoints : s.committedCount },
              { title: `Completed (${label})`, value: unit === 'points' ? s.completedPoints : s.completedCount },
              { title: `Remaining (${label})`, value: unit === 'points' ? s.remainingPoints : s.remainingCount },
              { title: 'Scope added / removed', value: `+${s.addedCount} / −${s.removedCount}` },
              { title: r.sprint.status === 'active' ? 'Days left' : 'Status', value: r.sprint.status === 'active' ? s.daysLeft : 'Completed' },
            ].map((t) => (
              <Col key={t.title} xs={12} md={8} lg={24 / 5}>
                <Card size="small">
                  <Statistic title={t.title} value={t.value} />
                </Card>
              </Col>
            ))}
          </Row>

          <ChartCard
            title={`Burndown — ${label} remaining`}
            rows={series}
            rowKey="x"
            columns={[
              { title: 'Day', dataIndex: 'x' },
              { title: 'Remaining', dataIndex: 'remaining', align: 'right', render: (v: number | null) => v ?? '—' },
              { title: 'Scope', dataIndex: 'scope', align: 'right', render: (v: number | null) => v ?? '—' },
              { title: 'Ideal', dataIndex: 'ideal', align: 'right' },
            ]}
            chart={
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={series} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={c.grid} vertical={false} />
                  <XAxis dataKey="x" tick={c.tick} tickLine={false} axisLine={{ stroke: c.grid }} minTickGap={16} />
                  <YAxis tick={c.tick} tickLine={false} axisLine={false} allowDecimals={unit === 'points'} width={40} />
                  <Tooltip {...c.tooltip} />
                  <Legend iconType="plainline" wrapperStyle={{ color: c.axis }} />
                  <Line name="Remaining" dataKey="remaining" stroke={c.series1} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }} connectNulls={false} isAnimationActive={false} />
                  <Line name="Scope" dataKey="scope" type="stepAfter" stroke={c.series2} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
                  <Line name="Ideal" dataKey="ideal" stroke={c.reference} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            }
          />

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={12}>
              <Card title={`Completed (${r.completedItems.length})`} size="small">
                <Table size="small" rowKey="id" dataSource={r.completedItems} columns={itemColumns} pagination={false} locale={{ emptyText: 'Nothing completed yet' }} />
              </Card>
            </Col>
            <Col xs={24} xl={12}>
              <Card title={`${r.sprint.status === 'completed' ? 'Not completed' : 'Still open'} (${r.notCompletedItems.length})`} size="small">
                <Table size="small" rowKey="id" dataSource={r.notCompletedItems} columns={itemColumns} pagination={false} locale={{ emptyText: 'Everything is done 🎉' }} />
              </Card>
            </Col>
          </Row>
          {r.scopeChanges.length > 0 && (
            <Card title="Scope changes after the start" size="small">
              <Table
                size="small"
                rowKey={(x) => `${x.key}-${x.at}`}
                dataSource={r.scopeChanges}
                pagination={false}
                columns={[
                  { title: 'When', dataIndex: 'at', width: 190, render: (v: string) => new Date(v).toLocaleString() },
                  { title: 'Change', dataIndex: 'change', width: 100, render: (v: string) => <Tag color={v === 'added' ? 'blue' : 'default'}>{v}</Tag> },
                  { title: 'Item', dataIndex: 'key', width: 110, render: (k: string) => <Link to={`/projects/${project.key}/items/${k.split('-').pop()}`}>{k}</Link> },
                  { title: 'Title', dataIndex: 'title' },
                ]}
              />
            </Card>
          )}
        </>
      )}
    </Flex>
  )
}

export function VelocityReport({ project }: { project: ProjectDetail }) {
  const c = useChartColors()
  const report = useFetch(useCallback(() => reportsService.velocity(project.key, 7), [project.key]))
  useLiveReload(project.id, report.reload, ['sprints'])
  const [unit, setUnit] = useState<Unit>('points')
  const r = report.data
  if (report.error) return <Alert type="error" showIcon title={report.error} />
  if (!r) return <Skeleton active paragraph={{ rows: 8 }} />
  if (!r.sprints.length) return <Empty description="Velocity appears after the first completed sprint." />

  const data = r.sprints.map((s) => ({
    name: s.name,
    committed: unit === 'points' ? s.committedPoints : s.committedCount,
    completed: unit === 'points' ? s.completedPoints : s.completedCount,
  }))
  const label = unit === 'points' ? 'points' : 'items'

  return (
    <Flex vertical gap={16}>
      <Flex gap={8} align="center" wrap>
        <Segmented value={unit} onChange={(v) => setUnit(v as Unit)} options={[{ value: 'points', label: 'Story points' }, { value: 'count', label: 'Item count' }]} />
        <Typography.Text type="secondary">Last {r.sprints.length} completed sprint{r.sprints.length === 1 ? '' : 's'}</Typography.Text>
      </Flex>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={8}>
          <Card size="small">
            <Statistic title={`Average velocity (${label})`} value={unit === 'points' ? r.averageCompletedPoints : r.averageCompletedCount} />
          </Card>
        </Col>
        <Col xs={12} md={8}>
          <Card size="small">
            <Statistic title="Say / do ratio (points)" value={r.sayDoRatio ?? '—'} suffix={r.sayDoRatio !== null ? '%' : undefined} />
          </Card>
        </Col>
      </Row>
      <ChartCard
        title={`Committed vs completed (${label})`}
        rows={data}
        rowKey="name"
        columns={[
          { title: 'Sprint', dataIndex: 'name' },
          { title: 'Committed', dataIndex: 'committed', align: 'right' },
          { title: 'Completed', dataIndex: 'completed', align: 'right' },
        ]}
        chart={
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={data} barGap={2} barCategoryGap="30%" margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis dataKey="name" tick={c.tick} tickLine={false} axisLine={{ stroke: c.grid }} />
              <YAxis tick={c.tick} tickLine={false} axisLine={false} width={40} allowDecimals={unit === 'points'} />
              <Tooltip {...c.tooltip} cursor={{ fill: c.grid, opacity: 0.4 }} />
              <Legend wrapperStyle={{ color: c.axis }} />
              <Bar name="Committed" dataKey="committed" fill={c.series1} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar name="Completed" dataKey="completed" fill={c.series2} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        }
      />
    </Flex>
  )
}
