// "Bugs" and "Cycle time" report tabs (GET /projects/:key/reports/quality).
import { Alert, Card, Col, Flex, Row, Segmented, Skeleton, Statistic, Table, Tag, Typography } from 'antd'
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useFetch } from '../../../hooks/useFetch'
import { useLiveReload } from '../../../hooks/useRealtime'
import { reportsService } from '../../../services/projects.service'
import type { QualityReport } from '../../../types/leave'
import type { ProjectDetail } from '../../../types/projects'
import { SEVERITIES } from '../shared/itemMeta'
import { PriorityIcon, StatusTag, UserAvatar } from '../shared/ItemBits'
import { ChartCard } from './chartKit'
import { shortDate, useChartColors } from './chartTheme'

const RANGES = [
  { value: 8, label: '8 weeks' },
  { value: 12, label: '12 weeks' },
  { value: 26, label: '6 months' },
]
const weekLabel = (week: string) => `wk ${shortDate(week)}`

function useQuality(project: ProjectDetail, weeks: number) {
  const report = useFetch(useCallback(() => reportsService.quality(project.key, weeks), [project.key, weeks]))
  useLiveReload(project.id, report.reload)
  return report
}

export function BugsReport({ project }: { project: ProjectDetail }) {
  const c = useChartColors()
  const [weeks, setWeeks] = useState(12)
  const report = useQuality(project, weeks)
  const q = report.data
  if (report.error) return <Alert type="error" showIcon title={report.error} />
  if (!q) return <Skeleton active paragraph={{ rows: 10 }} />

  const perWeek = q.bugsPerWeek.map((w) => ({ ...w, x: weekLabel(w.week) }))
  const opened = q.bugsPerWeek.reduce((s, w) => s + w.opened, 0)
  const closed = q.bugsPerWeek.reduce((s, w) => s + w.closed, 0)
  const severityKeys = [...SEVERITIES.map((s) => s.value), 'none'] as const
  const severityLabel = (k: string) => SEVERITIES.find((s) => s.value === k)?.label ?? 'No severity'

  return (
    <Flex vertical gap={16}>
      <Segmented value={weeks} onChange={(v) => setWeeks(Number(v))} options={RANGES} style={{ alignSelf: 'flex-start' }} />
      <Row gutter={[16, 16]}>
        {[
          { title: 'Open bugs now', value: q.openBugs },
          { title: `Opened (${weeks} weeks)`, value: opened },
          { title: `Closed (${weeks} weeks)`, value: closed },
          { title: 'Net change', value: `${opened - closed > 0 ? '+' : ''}${opened - closed}` },
        ].map((t) => (
          <Col key={t.title} xs={12} md={6}>
            <Card size="small">
              <Statistic title={t.title} value={t.value} />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <ChartCard
            title="Bugs opened vs closed per week"
            rows={perWeek}
            rowKey="week"
            columns={[
              { title: 'Week of', dataIndex: 'x' },
              { title: 'Opened', dataIndex: 'opened', align: 'right' },
              { title: 'Closed', dataIndex: 'closed', align: 'right' },
            ]}
            chart={
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={perWeek} barGap={2} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke={c.grid} vertical={false} />
                  <XAxis dataKey="x" tick={c.tick} tickLine={false} axisLine={{ stroke: c.grid }} minTickGap={12} />
                  <YAxis tick={c.tick} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip {...c.tooltip} cursor={{ fill: c.grid, opacity: 0.4 }} />
                  <Legend wrapperStyle={{ color: c.axis }} />
                  <Bar name="Opened" dataKey="opened" fill={c.series1} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Bar name="Closed" dataKey="closed" fill={c.series2} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            }
          />
        </Col>
        <Col xs={24} xl={10}>
          {/* single series: the title names it, no legend */}
          <ChartCard
            title="Open bugs at the end of each week"
            rows={perWeek}
            rowKey="week"
            columns={[
              { title: 'Week of', dataIndex: 'x' },
              { title: 'Open', dataIndex: 'openAtEnd', align: 'right' },
            ]}
            chart={
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={perWeek} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke={c.grid} vertical={false} />
                  <XAxis dataKey="x" tick={c.tick} tickLine={false} axisLine={{ stroke: c.grid }} minTickGap={12} />
                  <YAxis tick={c.tick} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip {...c.tooltip} />
                  <Line name="Open bugs" dataKey="openAtEnd" stroke={c.series1} strokeWidth={2} dot={false} activeDot={{ r: 5, stroke: c.surface, strokeWidth: 2 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            }
          />
        </Col>
      </Row>

      <ChartCard
        title="Ageing of open bugs (by severity)"
        rows={q.ageing}
        rowKey="bucket"
        columns={[
          { title: 'Age', dataIndex: 'bucket' },
          ...severityKeys.map((k) => ({ title: severityLabel(k), dataIndex: k, align: 'right' as const })),
        ]}
        chart={
          <ResponsiveContainer width="100%" height={260}>
            {/* stacked: a 2px surface stroke separates the segments; darker = more severe */}
            <BarChart data={q.ageing} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }}>
              <CartesianGrid stroke={c.grid} horizontal={false} />
              <XAxis type="number" tick={c.tick} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="bucket" tick={c.tick} tickLine={false} axisLine={false} width={90} />
              <Tooltip {...c.tooltip} cursor={{ fill: c.grid, opacity: 0.4 }} />
              <Legend wrapperStyle={{ color: c.axis }} />
              {[...severityKeys].reverse().map((k) => (
                <Bar key={k} name={severityLabel(k)} dataKey={k} stackId="age" fill={c.severity[k]} stroke={c.surface} strokeWidth={2} maxBarSize={24} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        }
      />

      <Card title="Oldest open bugs" size="small">
        <Table<QualityReport['oldestBugs'][number]>
          size="small"
          rowKey="id"
          dataSource={q.oldestBugs}
          pagination={false}
          locale={{ emptyText: 'No open bugs 🎉' }}
          columns={[
            { title: 'Key', dataIndex: 'key', width: 100, render: (k: string, b) => <Link to={`/projects/${project.key}/items/${b.number}`}>{k}</Link> },
            { title: 'Title', dataIndex: 'title', ellipsis: true },
            { title: 'Age', dataIndex: 'ageDays', width: 80, align: 'right', render: (d: number) => <Typography.Text strong>{d} d</Typography.Text> },
            { title: 'Severity', dataIndex: 'severity', width: 100, render: (s: string | null) => (s ? <Tag>{severityLabel(s)}</Tag> : '—') },
            { title: 'Priority', dataIndex: 'priority', width: 110, responsive: ['md'], render: (p) => <PriorityIcon priority={p} showLabel /> },
            { title: 'Status', key: 'status', width: 140, render: (_, b) => <StatusTag status={b.status} /> },
            { title: 'Assignee', key: 'assignee', width: 160, responsive: ['lg'], render: (_, b) => <UserAvatar user={b.assignee} showName /> },
          ]}
        />
      </Card>
    </Flex>
  )
}

export function CycleTimeReport({ project }: { project: ProjectDetail }) {
  const c = useChartColors()
  const [weeks, setWeeks] = useState(12)
  const report = useQuality(project, weeks)
  const overview = useFetch(useCallback(() => reportsService.overview(project.key, weeks * 7), [project.key, weeks]))
  const q = report.data
  if (report.error) return <Alert type="error" showIcon title={report.error} />
  if (!q) return <Skeleton active paragraph={{ rows: 10 }} />

  const perWeek = q.flowPerWeek.map((w) => ({ ...w, x: weekLabel(w.week) }))
  const t = overview.data?.times
  const fmt = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v)

  return (
    <Flex vertical gap={16}>
      <Segmented value={weeks} onChange={(v) => setWeeks(Number(v))} options={RANGES} style={{ alignSelf: 'flex-start' }} />
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        <b>Lead time</b> = created → done (what the requester waits). <b>Cycle time</b> = work started (first move out of a "to do" status) → done (how long
        the team works on it). Medians, so one very old item doesn't distort the picture.
      </Typography.Paragraph>
      <Row gutter={[16, 16]}>
        {[
          { title: 'Finished items', value: fmt(t?.count) },
          { title: 'Median lead time', value: fmt(t?.medianLeadDays), suffix: 'days' },
          { title: 'Median cycle time', value: fmt(t?.medianCycleDays), suffix: 'days' },
          { title: 'Average cycle time', value: fmt(t?.avgCycleDays), suffix: 'days' },
        ].map((s) => (
          <Col key={s.title} xs={12} md={6}>
            <Card size="small">
              <Statistic title={s.title} value={s.value} suffix={s.value === '—' ? undefined : s.suffix} />
            </Card>
          </Col>
        ))}
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <ChartCard
            title="Median lead and cycle time per week (days)"
            rows={perWeek}
            rowKey="week"
            columns={[
              { title: 'Week of', dataIndex: 'x' },
              { title: 'Finished', dataIndex: 'count', align: 'right' },
              { title: 'Lead (median)', dataIndex: 'medianLeadDays', align: 'right', render: (v: number | null) => v ?? '—' },
              { title: 'Cycle (median)', dataIndex: 'medianCycleDays', align: 'right', render: (v: number | null) => v ?? '—' },
            ]}
            chart={
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={perWeek} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke={c.grid} vertical={false} />
                  <XAxis dataKey="x" tick={c.tick} tickLine={false} axisLine={{ stroke: c.grid }} minTickGap={12} />
                  <YAxis tick={c.tick} tickLine={false} axisLine={false} />
                  <Tooltip {...c.tooltip} />
                  <Legend iconType="plainline" wrapperStyle={{ color: c.axis }} />
                  {/* weeks without finished items are gaps, not zeros */}
                  <Line name="Lead time" dataKey="medianLeadDays" stroke={c.series1} strokeWidth={2} dot={{ r: 4, stroke: c.surface, strokeWidth: 2, fill: c.series1 }} connectNulls={false} isAnimationActive={false} />
                  <Line name="Cycle time" dataKey="medianCycleDays" stroke={c.series2} strokeWidth={2} dot={{ r: 4, stroke: c.surface, strokeWidth: 2, fill: c.series2 }} connectNulls={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            }
          />
        </Col>
        <Col xs={24} xl={10}>
          <ChartCard
            title="How long items take (cycle time)"
            rows={q.cycleDistribution}
            rowKey="bucket"
            columns={[
              { title: 'Cycle time', dataIndex: 'bucket' },
              { title: 'Items', dataIndex: 'count', align: 'right' },
            ]}
            chart={
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={q.cycleDistribution} margin={{ top: 16, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke={c.grid} vertical={false} />
                  <XAxis dataKey="bucket" tick={c.tick} tickLine={false} axisLine={{ stroke: c.grid }} interval={0} />
                  <YAxis tick={c.tick} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip {...c.tooltip} cursor={{ fill: c.grid, opacity: 0.4 }} />
                  <Bar name="Items" dataKey="count" fill={c.series1} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} label={{ position: 'top', fill: c.axis, fontSize: 12 }} />
                </BarChart>
              </ResponsiveContainer>
            }
          />
        </Col>
      </Row>
    </Flex>
  )
}
