// /leave/calendar — who is out this month: one row per person, one column per day.
// Weekends follow each person's holiday calendar; holidays are marked; pending leave is shown lighter (dashed).
// Leave types are hidden ("Out of office") unless you are the person or an approver.
import { LeftOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons'
import { Button, Card, Empty, Flex, Input, Skeleton, Tag, Tooltip, Typography, theme } from 'antd'
import { useCallback, useMemo, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { PERMISSIONS } from '../../config/permissions'
import { PageHeader } from '../../components/ui'
import { useFetch } from '../../hooks/useFetch'
import { leaveService } from '../../services/leave.service'
import type { TeamCalendar } from '../../types/leave'
import { covers, monthDates, PORTION_LABEL, weekdayOf, WEEKDAYS } from './leaveMeta'
import { RequestLeaveModal } from './RequestLeaveModal'

const CELL = 30

export default function TeamCalendarPage() {
  const { token } = theme.useToken()
  const { user, can } = useAuth()
  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [search, setSearch] = useState('')
  const [requesting, setRequesting] = useState(false)
  const dates = useMemo(() => monthDates(cursor.year, cursor.month), [cursor])
  const data = useFetch(useCallback(() => leaveService.calendar(dates[0]!, dates[dates.length - 1]!), [dates]))
  const balances = useFetch(useCallback(() => leaveService.balances(cursor.year), [cursor.year]))
  const today = now.toISOString().slice(0, 10)

  const move = (delta: number) =>
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })

  const c = data.data
  const calendarOf = (calendarId: number | null) => c?.calendars.find((k) => k.id === calendarId) ?? c?.calendars.find((k) => k.isDefault)
  const members = (c?.members ?? []).filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase()))
  // me first
  members.sort((a, b) => (a.id === user?.id ? -1 : b.id === user?.id ? 1 : 0))
  const typesShown = c ? [...new Map(c.leaves.map((l) => [l.type.name, l.type])).values()] : []

  const cell = (member: TeamCalendar['members'][number], date: string) => {
    const cal = calendarOf(member.calendarId)
    const weekend = cal?.weekendDays.includes(weekdayOf(date))
    const holiday = c!.holidays.find((h) => h.calendarId === cal?.id && h.date === date && !h.isOptional)
    const leave = c!.leaves.find((l) => l.userId === member.id && covers(l.startDate, l.endDate, date))
    const pending = leave?.status === 'pending'
    const half = leave && leave.portion !== 'full'
    const background = weekend || holiday ? token.colorFillSecondary : undefined

    const content = leave && !weekend && !holiday && (
      <div
        style={{
          position: 'absolute',
          inset: 3,
          ...(half ? (leave.portion === 'am' ? { right: CELL / 2 } : { left: CELL / 2 }) : {}),
          borderRadius: 4,
          background: pending ? `${leave.type.color}40` : leave.type.color,
          border: pending ? `1px dashed ${leave.type.color}` : undefined,
        }}
      />
    )
    const tip = [
      holiday && `🎉 ${holiday.name}`,
      weekend && !holiday && 'Weekend',
      leave && `${member.name}: ${leave.type.name}${half ? ` (${PORTION_LABEL[leave.portion].toLowerCase()})` : ''}${pending ? ' — pending' : ''}`,
    ]
      .filter(Boolean)
      .join(' · ')
    return (
      <Tooltip key={date} title={tip || undefined} mouseEnterDelay={0.2}>
        <td
          style={{
            position: 'relative',
            width: CELL,
            minWidth: CELL,
            height: 34,
            background,
            borderLeft: `1px solid ${token.colorBorderSecondary}`,
            boxShadow: date === today ? `inset 0 0 0 1px ${token.colorPrimary}` : undefined,
          }}
        >
          {content}
        </td>
      </Tooltip>
    )
  }

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const myCalendar = calendarOf(c?.members.find((m) => m.id === user?.id)?.calendarId ?? null)
  const holidaysThisMonth = c?.holidays.filter((h) => h.calendarId === myCalendar?.id) ?? []

  return (
    <>
      <PageHeader help="leave"
        title="Team calendar"
        description="Who is away when — plan work and avoid everyone being out at once."
        actions={
          can(PERMISSIONS.LEAVE_REQUEST) && (
            <Button type="primary" icon={<PlusOutlined />} disabled={!balances.data?.length} onClick={() => setRequesting(true)}>
              Request leave
            </Button>
          )
        }
      />
      <Card>
        <Flex gap={8} align="center" wrap style={{ marginBottom: 16 }}>
          <Button icon={<LeftOutlined />} onClick={() => move(-1)} aria-label="Previous month" />
          <Button onClick={() => setCursor({ year: now.getFullYear(), month: now.getMonth() })}>Today</Button>
          <Button icon={<RightOutlined />} onClick={() => move(1)} aria-label="Next month" />
          <Typography.Title level={4} style={{ margin: '0 8px' }}>
            {monthLabel}
          </Typography.Title>
          <div style={{ flex: 1 }} />
          <Input.Search placeholder="Find a person" allowClear onChange={(e) => setSearch(e.target.value)} style={{ width: 200 }} />
        </Flex>

        {!c ? (
          <Skeleton active paragraph={{ rows: 8 }} />
        ) : !members.length ? (
          <Empty />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, zIndex: 2, background: token.colorBgContainer, minWidth: 180, textAlign: 'left', padding: '4px 8px' }} />
                  {dates.map((d) => (
                    <th key={d} style={{ width: CELL, fontWeight: d === today ? 700 : 400, color: d === today ? token.colorPrimary : token.colorTextSecondary, fontSize: 11, padding: '2px 0' }}>
                      <div>{WEEKDAYS[weekdayOf(d)]!.slice(0, 2)}</div>
                      <div style={{ fontSize: 13 }}>{Number(d.slice(8))}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} style={{ borderTop: `1px solid ${token.colorBorderSecondary}` }}>
                    <td style={{ position: 'sticky', left: 0, zIndex: 1, background: token.colorBgContainer, padding: '4px 8px', whiteSpace: 'nowrap' }}>
                      <Typography.Text strong={m.id === user?.id} ellipsis style={{ maxWidth: 170 }}>
                        {m.name}
                        {m.id === user?.id && ' (you)'}
                      </Typography.Text>
                    </td>
                    {dates.map((d) => cell(m, d))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* legend: every colour is also named */}
        <Flex gap={16} wrap style={{ marginTop: 16 }}>
          {typesShown.map((t) => (
            <Flex key={t.name} align="center" gap={6}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: t.color }} />
              <Typography.Text type="secondary">{t.name}</Typography.Text>
            </Flex>
          ))}
          <Flex align="center" gap={6}>
            <span style={{ width: 12, height: 12, borderRadius: 3, border: `1px dashed ${token.colorTextTertiary}`, background: token.colorFillTertiary }} />
            <Typography.Text type="secondary">Pending approval</Typography.Text>
          </Flex>
          <Flex align="center" gap={6}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: token.colorFillSecondary }} />
            <Typography.Text type="secondary">Weekend / holiday</Typography.Text>
          </Flex>
          <Typography.Text type="secondary">Half box = half day</Typography.Text>
        </Flex>

        {holidaysThisMonth.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <Typography.Text strong>Holidays this month ({myCalendar?.name}): </Typography.Text>
            {holidaysThisMonth.map((h) => (
              <Tag key={h.date} color={h.isOptional ? 'default' : 'blue'}>
                {new Date(`${h.date}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })} · {h.name}
                {h.isOptional && ' (optional)'}
              </Tag>
            ))}
          </div>
        )}
      </Card>
      {requesting && balances.data && (
        <RequestLeaveModal
          balances={balances.data}
          onClose={() => setRequesting(false)}
          onCreated={() => {
            data.reload()
            balances.reload()
          }}
        />
      )}
    </>
  )
}
