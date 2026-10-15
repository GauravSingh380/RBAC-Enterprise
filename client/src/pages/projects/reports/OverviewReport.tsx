// Project health at a glance: totals, created vs resolved, where work sits, who holds it, how long it takes.
import { Alert, Card, Col, Flex, Progress, Row, Segmented, Skeleton, Statistic, Table, Tooltip as AntTooltip, Typography } from 'antd'
import { useCallback, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useFetch } from '../../../hooks/useFetch'
import { useLiveReload } from '../../../hooks/useRealtime'
import { reportsService } from '../../../services/projects.service'
import type { OverviewReport as Overview, ProjectDetail } from '../../../types/projects'
import { priorityMeta, typeMeta } from '../shared/itemMeta'
import { UserAvatar } from '../shared/ItemBits'
import { ChartCard } from './chartKit'
import { shortDate, useChartColors } from './chartTheme'

const days = (v: number | null) => (v === null ? '—' : v)

export function OverviewReport({ project }: { project: ProjectDetail }) {
  const c = useChartColors()
  const [range, setRange] = useState(30)
  const report = useFetch(useCallback(() => reportsService.overview(project.key, range), [project.key, range]))
  useLiveReload(project.id, report.reload)
  const r = report.data

  if (report.error) return <Alert type="error" showIcon title={report.error} />
  if (!r) return <Skeleton active paragraph={{ rows: 10 }} />

  const flow = r.createdVsResolved.map((d) => ({ ...d, x: shortDate(d.date) }))
  const maxStatus = Math.max(1, ...r.byStatus.map((s) => s.count))

  return (
    <Flex vertical gap={16}>
      <Flex align="center" gap={8}>
        <Segmented value={range} onChange={(v) => setRange(Number(v))} options={[{ value: 14, label: '14 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }]} />
      </Flex>

      <Row gutter={[16, 16]}>
        {[
          { title: 'Open items', value: r.totals.open },
          { title: 'Done', value: r.totals.done },
          { title: 'Overdue', value: r.totals.overdue },
          { title: 'Unassigned (open)', value: r.totals.unassigned },
        ].map((t) => (
          <Col key={t.title} xs={12} md={6}>
            <Card size="small">
              <Statistic title={t.title} value={t.value} />
            </Card>
          </Col>
        ))}
      </Row>

      <ChartCard
        title="Created vs resolved per day"
        rows={flow}
        rowKey="date"
        columns={[
          { title: 'Day', dataIndex: 'x' },
          { title: 'Created', dataIndex: 'created', align: 'right' },
          { title: 'Resolved', dataIndex: 'resolved', align: 'right' },
        ]}
        chart={
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={flow} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis dataKey="x" tick={c.tick} tickLine={false} axisLine={{ stroke: c.grid }} minTickGap={24} />
              <YAxis tick={c.tick} tickLine={false} axisLine={false} allowDecimals={false} width={36} />
              <Tooltip {...c.tooltip} />
              <Legend iconType="plainline" wrapperStyle={{ color: c.axis }} />
              <Line name="Created" dataKey="created" stroke={c.series1} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
              <Line name="Resolved" dataKey="resolved" stroke={c.series2} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        }
      />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <ChartCard
            title="Items by status"
            rows={r.byStatus}
            rowKey="id"
            columns={[
              { title: 'Status', dataIndex: 'name' },
              { title: 'Items', dataIndex: 'count', align: 'right' },
            ]}
            chart={
              // one measure → one hue; the status is named on the axis, its own colour dot sits in the table view
              <ResponsiveContainer width="100%" height={Math.max(160, r.byStatus.length * 40)}>
                <BarChart data={r.byStatus} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke={c.grid} horizontal={false} />
                  <XAxis type="number" tick={c.tick} tickLine={false} axisLine={false} allowDecimals={false} domain={[0, maxStatus]} />
                  <YAxis type="category" dataKey="name" tick={c.tick} tickLine={false} axisLine={false} width={110} />
                  <Tooltip {...c.tooltip} cursor={{ fill: c.grid, opacity: 0.4 }} />
                  <Bar name="Items" dataKey="count" fill={c.series1} maxBarSize={24} radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: 'right', fill: c.axis, fontSize: 12 }} />
                </BarChart>
              </ResponsiveContainer>
            }
          />
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Time to finish (last range)">
            <Typography.Paragraph type="secondary" style={{ marginTop: -4 }}>
              {r.times.count} item{r.times.count === 1 ? '' : 's'} finished in the last {r.days} days.
            </Typography.Paragraph>
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <AntTooltip title="Created → done">
                  <Statistic title="Lead time, median" value={days(r.times.medianLeadDays)} suffix="days" />
                </AntTooltip>
              </Col>
              <Col span={12}>
                <Statistic title="Lead time, average" value={days(r.times.avgLeadDays)} suffix="days" />
              </Col>
              <Col span={12}>
                <AntTooltip title="First moved out of 'to do' → done">
                  <Statistic title="Cycle time, median" value={days(r.times.medianCycleDays)} suffix="days" />
                </AntTooltip>
              </Col>
              <Col span={12}>
                <Statistic title="Cycle time, average" value={days(r.times.avgCycleDays)} suffix="days" />
              </Col>
            </Row>
            <Flex gap={24} wrap style={{ marginTop: 20 }}>
              <OpenMix title="Open by type" rows={r.byType.map((t) => ({ key: t.type, label: typeMeta(t.type).label, count: t.count }))} />
              <OpenMix title="Open by priority" rows={r.byPriority.map((p) => ({ key: p.priority, label: priorityMeta(p.priority).label, count: p.count }))} />
            </Flex>
          </Card>
        </Col>
      </Row>

      <Card title="Workload (open items per person)">
        <Table<Overview['workload'][number]>
          size="small"
          rowKey={(w) => w.assignee?.id ?? 0}
          dataSource={r.workload}
          pagination={false}
          locale={{ emptyText: 'No open items' }}
          columns={[
            { title: 'Person', key: 'person', render: (_, w) => <UserAvatar user={w.assignee} showName /> },
            {
              title: 'Open items',
              dataIndex: 'open',
              width: '40%',
              render: (v: number) => <Progress percent={(v / Math.max(1, r.workload[0]?.open ?? 1)) * 100} format={() => v} strokeColor={c.series1} size="small" />,
            },
            { title: 'In progress', dataIndex: 'inProgress', align: 'right', width: 110 },
            { title: 'Points', dataIndex: 'points', align: 'right', width: 90 },
          ]}
        />
      </Card>
    </Flex>
  )
}

function OpenMix({ title, rows }: { title: string; rows: { key: string; label: string; count: number }[] }) {
  return (
    <div style={{ minWidth: 160 }}>
      <Typography.Text strong>{title}</Typography.Text>
      {rows.length ? (
        rows.map((r) => (
          <Flex key={r.key} justify="space-between" style={{ marginTop: 4 }}>
            <Typography.Text type="secondary">{r.label}</Typography.Text>
            <Typography.Text>{r.count}</Typography.Text>
          </Flex>
        ))
      ) : (
        <Typography.Paragraph type="secondary">—</Typography.Paragraph>
      )}
    </div>
  )
}
