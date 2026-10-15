// A month of work: items on their due date, sprints as bands, who is away and public holidays.
// Items can be dragged to another day (→ new due date) when `onMove` is given.
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { Button, Flex, Popover, Tooltip, Typography, theme } from 'antd'
import { useMemo } from 'react'
import type { Availability } from '../../../types/notifications'
import type { WorkItemSummary } from '../../../types/projects'
import type { CalendarSprint } from '../../../types/workspace'
import { ItemTypeIcon } from '../shared/ItemBits'
import { dayInfo, itemsByDay, monthGrid, sprintsOn, type GridDay } from './calendarMeta'

const MAX_IN_CELL = 3
const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface Props {
  year: number
  month: number // 0–11
  onMonthChange: (year: number, month: number) => void
  items: WorkItemSummary[]
  sprints?: CalendarSprint[]
  availability?: Availability[]
  today: string
  onOpen: (item: WorkItemSummary) => void
  /** drop on another day; omit to make the calendar read-only */
  onMove?: (item: WorkItemSummary, date: string) => void
  /** e.g. show the project key on items (My Work: several projects) */
  showProject?: boolean
}

export function MonthCalendar({ year, month, onMonthChange, items, sprints = [], availability = [], today, onOpen, onMove, showProject }: Props) {
  const { token } = theme.useToken()
  const weeks = useMemo(() => monthGrid(year, month), [year, month])
  const byDay = useMemo(() => itemsByDay(items), [items])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const sprintColors = [token.colorPrimaryBg, token.colorSuccessBg, token.colorWarningBg, token.colorInfoBg]
  const label = new Date(Date.UTC(year, month, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, month + delta, 1))
    onMonthChange(d.getUTCFullYear(), d.getUTCMonth())
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || !onMove) return
    const item = items.find((i) => i.id === active.id)
    if (item && item.dueDate !== over.id) onMove(item, String(over.id))
  }

  return (
    <div>
      <Flex align="center" gap={8} wrap style={{ marginBottom: 12 }}>
        <Button icon={<LeftOutlined />} onClick={() => shift(-1)} aria-label="Previous month" />
        <Button icon={<RightOutlined />} onClick={() => shift(1)} aria-label="Next month" />
        <Typography.Title level={4} style={{ margin: 0, minWidth: 180 }}>
          {label}
        </Typography.Title>
        <Button
          onClick={() => {
            const t = new Date(`${today}T00:00:00Z`)
            onMonthChange(t.getUTCFullYear(), t.getUTCMonth())
          }}
        >
          Today
        </Button>
        {onMove && (
          <Typography.Text type="secondary" style={{ marginInlineStart: 'auto', fontSize: '0.85em' }}>
            Drag an item to another day to change its due date
          </Typography.Text>
        )}
      </Flex>
      <div style={{ overflowX: 'auto' }}>
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div role="grid" aria-label={label} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(110px, 1fr))', minWidth: 770, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 8, overflow: 'hidden' }}>
            {WEEKDAY_NAMES.map((d) => (
              <div key={d} role="columnheader" style={{ padding: '6px 8px', fontWeight: 600, fontSize: '0.85em', background: token.colorFillQuaternary, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                {d}
              </div>
            ))}
            {weeks.flat().map((day, idx) => (
              <DayCell
                key={day.date}
                day={day}
                firstOfWeek={idx % 7 === 0}
                today={day.date === today}
                items={byDay.get(day.date) ?? []}
                sprints={sprintsOn(sprints, day.date)}
                sprintColor={(id) => sprintColors[sprints.findIndex((s) => s.id === id) % sprintColors.length]!}
                info={dayInfo(availability, day.date)}
                draggable={!!onMove}
                onOpen={onOpen}
                showProject={showProject}
              />
            ))}
          </div>
        </DndContext>
      </div>
    </div>
  )
}

function DayCell({
  day, firstOfWeek, today, items, sprints, sprintColor, info, draggable, onOpen, showProject,
}: {
  day: GridDay
  firstOfWeek: boolean
  today: boolean
  items: WorkItemSummary[]
  sprints: CalendarSprint[]
  sprintColor: (id: number) => string
  info: ReturnType<typeof dayInfo>
  draggable: boolean
  onOpen: (item: WorkItemSummary) => void
  showProject?: boolean
}) {
  const { token } = theme.useToken()
  const { setNodeRef, isOver } = useDroppable({ id: day.date, disabled: !draggable })
  const shown = items.slice(0, MAX_IN_CELL)
  const more = items.length - shown.length
  const holiday = info.holidays[0]

  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      aria-label={`${day.date}${items.length ? `, ${items.length} item(s)` : ''}`}
      style={{
        minHeight: 112,
        padding: 4,
        borderTop: `1px solid ${token.colorBorderSecondary}`,
        borderInlineStart: firstOfWeek ? undefined : `1px solid ${token.colorBorderSecondary}`,
        background: isOver ? token.colorPrimaryBgHover : !day.inMonth ? token.colorFillQuaternary : holiday || day.weekend ? token.colorFillTertiary : token.colorBgContainer,
        opacity: day.inMonth ? 1 : 0.65,
      }}
    >
      <Flex justify="space-between" align="center" gap={4}>
        <span
          style={{
            fontSize: '0.85em',
            fontWeight: today ? 700 : 500,
            color: today ? token.colorWhite : undefined,
            background: today ? token.colorPrimary : undefined,
            borderRadius: 10,
            padding: today ? '0 6px' : 0,
          }}
        >
          {day.day}
        </span>
        {info.away.length > 0 && (
          <Tooltip title={info.away.map((a) => `${a.user.name}${a.pending ? ' (pending)' : ''}`).join(', ')}>
            <Typography.Text type="secondary" style={{ fontSize: '0.75em' }}>
              🌴 {info.away.length}
            </Typography.Text>
          </Tooltip>
        )}
      </Flex>
      {holiday && (
        <Typography.Text type="secondary" ellipsis style={{ display: 'block', fontSize: '0.75em' }} title={info.holidays.join(', ')}>
          🎉 {holiday}
        </Typography.Text>
      )}
      {sprints.map((s) => (
        <Tooltip key={s.id} title={`${s.name}: ${s.startDate} → ${s.endDate}`}>
          <div style={{ background: sprintColor(s.id), borderRadius: 3, fontSize: '0.72em', padding: '0 4px', margin: '2px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {s.startDate === day.date || firstOfWeek ? s.name : ' '}
          </div>
        </Tooltip>
      ))}
      <Flex vertical gap={2} style={{ marginTop: 2 }}>
        {shown.map((i) => (
          <ItemChip key={i.id} item={i} draggable={draggable} onOpen={onOpen} showProject={showProject} />
        ))}
        {more > 0 && (
          <Popover
            title={day.date}
            content={
              <Flex vertical gap={2} style={{ maxWidth: 280 }}>
                {items.map((i) => (
                  <ItemChip key={i.id} item={i} draggable={false} onOpen={onOpen} showProject={showProject} />
                ))}
              </Flex>
            }
          >
            <Typography.Link style={{ fontSize: '0.78em' }}>+{more} more</Typography.Link>
          </Popover>
        )}
      </Flex>
    </div>
  )
}

function ItemChip({ item, draggable, onOpen, showProject }: { item: WorkItemSummary; draggable: boolean; onOpen: (i: WorkItemSummary) => void; showProject?: boolean }) {
  const { token } = theme.useToken()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, disabled: !draggable })
  const done = item.status.category === 'done'
  return (
    <Tooltip title={`${item.key} · ${item.title} · ${item.status.name}${item.assignee ? ` · ${item.assignee.name}` : ''}`} mouseEnterDelay={0.4}>
      <button
        ref={setNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        onClick={() => onOpen(item)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          width: '100%',
          textAlign: 'start',
          font: 'inherit',
          fontSize: '0.78em',
          color: 'inherit',
          padding: '1px 4px',
          border: `1px solid ${token.colorBorderSecondary}`,
          borderInlineStart: `3px solid ${item.status.color || token.colorPrimary}`,
          borderRadius: 4,
          background: token.colorBgElevated,
          cursor: draggable ? 'grab' : 'pointer',
          opacity: done ? 0.55 : isDragging ? 0.7 : 1,
          textDecoration: done ? 'line-through' : undefined,
          transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
          zIndex: isDragging ? 10 : undefined,
          position: 'relative',
        }}
      >
        <ItemTypeIcon type={item.type} size={10} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {showProject && <span style={{ opacity: 0.7 }}>{item.key} </span>}
          {item.title}
        </span>
      </button>
    </Tooltip>
  )
}
