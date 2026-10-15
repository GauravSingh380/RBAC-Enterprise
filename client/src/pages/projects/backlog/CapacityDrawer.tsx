// Sprint capacity: who can work how much (holidays, leave, allocation) vs the work already planned.
// Load meters use status colours — always paired with a text label, never colour alone.
import { InfoCircleOutlined } from '@ant-design/icons'
import { Alert, App, Card, Col, Drawer, Empty, Flex, InputNumber, Progress, Row, Skeleton, Statistic, Table, Tag, Tooltip, Typography, theme } from 'antd'
import { useCallback, useState } from 'react'
import { Select } from 'antd'
import { peopleService } from '../../../services/people.service'
import { useFetch } from '../../../hooks/useFetch'
import { useLiveReload } from '../../../hooks/useRealtime'
import { getErrorMessage } from '../../../lib/api'
import { capacityService } from '../../../services/notifications.service'
import type { ProjectDetail, Sprint } from '../../../types/projects'
import type { LoadStatus, SprintCapacity } from '../../../types/notifications'
import { useAuth } from '../../../auth/useAuth'
import { PERMISSIONS } from '../../../config/permissions'
import type { Team } from '../../../types/people'

type Person = NonNullable<SprintCapacity['people']>[number]

const LOAD_LABEL: Record<LoadStatus, string> = { unknown: 'no history yet', idle: 'nothing planned', ok: 'ok', high: 'nearly full', over: 'overloaded' }
const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })

function useLoadColors() {
  const { token } = theme.useToken()
  return { unknown: token.colorTextQuaternary, idle: token.colorTextQuaternary, ok: token.colorSuccess, high: token.colorWarning, over: token.colorError } as Record<LoadStatus, string>
}

export function CapacityDrawer({ project, sprint, onClose }: { project: ProjectDetail; sprint: Sprint; onClose: () => void }) {
  const { message } = App.useApp()
  const colors = useLoadColors()
  const cap = useFetch(useCallback(() => capacityService.sprint(project.key, sprint.id), [project.key, sprint.id]))
  useLiveReload(project.id, cap.reload, ['items', 'sprints'])
  const c = cap.data
  // the team filter needs people.view (guests and restricted roles simply don't get it)
  const canSeeTeams = useAuth().can(PERMISSIONS.PEOPLE_VIEW)
  const teams = useFetch(useCallback(() => (canSeeTeams ? peopleService.teams() : Promise.resolve([] as Team[])), [canSeeTeams]))
  const [teamId, setTeamId] = useState<number>()
  const team = teams.data?.find((t) => t.id === teamId)
  const shownPeople = team ? c?.people?.filter((p) => team.members.some((m) => m.id === p.user.id)) : c?.people

  const setAllocation = async (p: Person, allocation: number | null) => {
    if (allocation === null || allocation === p.capacity.allocation) return
    try {
      await capacityService.setAllocation(project.key, sprint.id, p.user.id, allocation, p.note)
      cap.reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const totals = c?.totals
  const overall: LoadStatus = !totals || totals.load === null ? 'unknown' : totals.load > 110 ? 'over' : totals.load > 90 ? 'high' : totals.load === 0 ? 'idle' : 'ok'

  return (
    <Drawer open size="large" onClose={onClose} title={`Capacity — ${sprint.name}`}>
      {!c ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : c.needsDates ? (
        <Empty description="Set the sprint's start and end dates to plan its capacity (Edit sprint)." />
      ) : (
        <>
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            {short(c.range!.start)} – {short(c.range!.end)}. Each person's own holiday calendar and approved leave are taken out; pending leave is shown but
            not subtracted yet. Set an allocation below 100 % for people who share their time.
          </Typography.Paragraph>
          <Row gutter={[12, 12]}>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic title="People" value={totals!.people} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic title="Available days" value={totals!.availableDays} suffix={<Typography.Text type="secondary" style={{ fontSize: 13 }}>of {totals!.workingDays}</Typography.Text>} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Statistic title="Planned points" value={totals!.committedPoints} />
              </Card>
            </Col>
            <Col xs={12} md={6}>
              <Card size="small">
                <Tooltip title={c.history?.pointsPerDay ? `${c.history.pointsPerDay} points per available person-day, learned from ${c.history.sprints.map((s) => s.name).join(', ')}` : 'Complete a sprint with estimates to get a forecast'}>
                  <Statistic title={<span>Forecast <InfoCircleOutlined /></span>} value={totals!.forecastPoints ?? '—'} suffix={totals!.forecastPoints !== null ? 'pts' : undefined} />
                </Tooltip>
              </Card>
            </Col>
          </Row>
          {totals!.load !== null && (
            <Alert
              style={{ marginTop: 12 }}
              type={overall === 'over' ? 'error' : overall === 'high' ? 'warning' : 'success'}
              showIcon
              title={`${totals!.committedPoints} points planned for a forecast of ${totals!.forecastPoints} → ${totals!.load}% — ${LOAD_LABEL[overall]}`}
              description={overall === 'over' ? 'Move items back to the backlog, or check allocations and leave.' : undefined}
            />
          )}
          {c.unassigned && c.unassigned.count > 0 && (
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              Not assigned yet: {c.unassigned.count} item(s), {c.unassigned.points} points.
            </Typography.Paragraph>
          )}

          {(teams.data?.length ?? 0) > 0 && (
            <Flex align="center" gap={8} style={{ marginTop: 16 }}>
              <Select allowClear placeholder="All teams" style={{ width: 200 }} value={teamId} onChange={setTeamId} options={teams.data!.map((t) => ({ value: t.id, label: t.name }))} />
              {team && shownPeople && (
                <Typography.Text type="secondary">
                  {team.name}: {Math.round(shownPeople.reduce((s, p) => s + p.capacity.availableDays, 0) * 10) / 10} available days ·{' '}
                  {shownPeople.reduce((s, p) => s + p.assignedPoints, 0)} points planned
                </Typography.Text>
              )}
            </Flex>
          )}
          <Table<Person>
            style={{ marginTop: 16 }}
            size="small"
            rowKey={(p) => p.user.id}
            dataSource={shownPeople}
            pagination={false}
            scroll={{ x: 760 }}
            columns={[
              {
                title: 'Person',
                key: 'person',
                render: (_, p) => (
                  <div>
                    <Typography.Text strong style={{ opacity: p.capacity.allocation ? 1 : 0.5 }}>
                      {p.user.name}
                    </Typography.Text>
                    {p.note && (
                      <Typography.Text type="secondary" style={{ display: 'block', fontSize: '0.82em' }}>
                        {p.note}
                      </Typography.Text>
                    )}
                  </div>
                ),
              },
              {
                title: 'Working days',
                key: 'working',
                width: 110,
                align: 'right',
                render: (_, p) => (
                  <Tooltip title={p.capacity.holidays ? `${p.capacity.holidays} holiday(s) excluded` : undefined}>
                    {p.capacity.workingDays}
                  </Tooltip>
                ),
              },
              {
                title: 'Leave',
                key: 'leave',
                width: 120,
                render: (_, p) =>
                  p.away.length ? (
                    <Tooltip title={p.away.map((a) => `${short(a.startDate)}${a.endDate !== a.startDate ? ` – ${short(a.endDate)}` : ''}${a.status === 'pending' ? ' (pending)' : ''}`).join(', ')}>
                      <span>
                        {p.capacity.leaveDays ? `${p.capacity.leaveDays} d` : ''}
                        {p.capacity.pendingLeaveDays ? <Tag style={{ marginLeft: 4 }}>{p.capacity.pendingLeaveDays} pending</Tag> : null}
                      </span>
                    </Tooltip>
                  ) : (
                    <Typography.Text type="secondary">—</Typography.Text>
                  ),
              },
              {
                title: 'Allocation',
                key: 'allocation',
                width: 110,
                render: (_, p) => (
                  <InputNumber
                    size="small"
                    min={0}
                    max={100}
                    step={10}
                    defaultValue={p.capacity.allocation}
                    disabled={!project.canEdit || c.sprint.status === 'completed'}
                    formatter={(v) => `${v}%`}
                    parser={(v) => Number((v ?? '').replace('%', ''))}
                    onBlur={(e) => setAllocation(p, Number(e.target.value.replace('%', '')))}
                    style={{ width: 80 }}
                    aria-label={`${p.user.name} allocation`}
                  />
                ),
              },
              { title: 'Available', key: 'available', width: 90, align: 'right', render: (_, p) => <Typography.Text strong>{p.capacity.availableDays} d</Typography.Text> },
              {
                title: 'Load (planned / expected points)',
                key: 'load',
                width: 240,
                render: (_, p) => (
                  <div>
                    <Flex justify="space-between">
                      <Typography.Text>
                        {p.assignedPoints} / {p.expectedPoints ?? '?'} pts
                      </Typography.Text>
                      <Typography.Text style={{ color: p.status === 'idle' || p.status === 'unknown' ? undefined : colors[p.status] }} type={p.status === 'idle' || p.status === 'unknown' ? 'secondary' : undefined}>
                        {LOAD_LABEL[p.status]}
                      </Typography.Text>
                    </Flex>
                    {p.load !== null && <Progress percent={Math.min(100, p.load)} showInfo={false} size="small" strokeColor={colors[p.status]} style={{ margin: 0 }} />}
                  </div>
                ),
              },
            ]}
          />
        </>
      )}
    </Drawer>
  )
}

/** Compact one-liner for the sprint header in the backlog. */
export function CapacitySummary({ project, sprint, onOpen }: { project: ProjectDetail; sprint: Sprint; onOpen: () => void }) {
  const colors = useLoadColors()
  const cap = useFetch(useCallback(() => capacityService.sprint(project.key, sprint.id), [project.key, sprint.id]))
  useLiveReload(project.id, cap.reload, ['items', 'sprints'])
  const t = cap.data?.totals
  if (!cap.data || cap.data.needsDates || !t) {
    return (
      <Tag style={{ cursor: 'pointer' }} onClick={onOpen}>
        Capacity
      </Tag>
    )
  }
  const status: LoadStatus = t.load === null ? 'unknown' : t.load > 110 ? 'over' : t.load > 90 ? 'high' : 'ok'
  return (
    <Tooltip title={`${t.availableDays} available person-days${t.leaveDays ? ` (${t.leaveDays} days of leave)` : ''}${t.forecastPoints !== null ? ` · forecast ${t.forecastPoints} pts` : ''} — click for details`}>
      <Tag style={{ cursor: 'pointer', marginInlineEnd: 0 }} onClick={onOpen}>
        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: colors[status], marginRight: 6 }} />
        {t.availableDays} days{t.load !== null ? ` · ${t.load}% load` : ''}
      </Tag>
    </Tooltip>
  )
}
