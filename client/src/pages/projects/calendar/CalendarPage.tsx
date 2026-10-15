// /projects/:key/calendar — the project's month: due dates, sprints, who is away, holidays. Live.
import { Alert, App, Card } from 'antd'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFetch } from '../../../hooks/useFetch'
import { useLiveReload } from '../../../hooks/useRealtime'
import { getErrorMessage } from '../../../lib/api'
import { capacityService } from '../../../services/notifications.service'
import { workItemsService } from '../../../services/projects.service'
import { calendarService } from '../../../services/workspace.service'
import type { WorkItemSummary } from '../../../types/projects'
import { useProject } from '../shared/projectContext'
import { gridRange, monthGrid } from './calendarMeta'
import { MonthCalendar } from './MonthCalendar'

const todayIso = () => new Date().toISOString().slice(0, 10)

export default function CalendarPage() {
  const { project } = useProject()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [{ year, month, today }, setMonth] = useState(() => {
    const t = todayIso()
    return { year: Number(t.slice(0, 4)), month: Number(t.slice(5, 7)) - 1, today: t }
  })
  const { from, to } = gridRange(monthGrid(year, month))

  const data = useFetch(useCallback(() => calendarService.project(project.key, from, to), [project.key, from, to]))
  const availability = useFetch(useCallback(() => capacityService.availability(project.key, from, to), [project.key, from, to]))
  useLiveReload(project.id, data.reload, ['items', 'sprints'])

  // optimistic move: the chip jumps at once, the server confirms (or we reload)
  const [moved, setMoved] = useState<Record<number, string>>({})
  const items: WorkItemSummary[] = (data.data?.items ?? []).map((i) => (moved[i.id] ? { ...i, dueDate: moved[i.id]! } : i))

  const move = async (item: WorkItemSummary, date: string) => {
    setMoved((m) => ({ ...m, [item.id]: date }))
    try {
      await workItemsService.update(item.id, { dueDate: date })
      message.success(`${item.key} is now due ${new Date(`${date}T00:00:00`).toLocaleDateString()}`)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setMoved((m) => {
        const next = { ...m }
        delete next[item.id]
        return next
      })
      data.reload()
    }
  }

  return (
    <Card>
      {data.error && <Alert type="error" showIcon title={data.error} style={{ marginBottom: 12 }} />}
      <MonthCalendar
        year={year}
        month={month}
        today={today}
        onMonthChange={(y, m) => setMonth({ year: y, month: m, today: todayIso() })}
        items={items}
        sprints={data.data?.sprints}
        availability={availability.data ?? []}
        onOpen={(i) => navigate(`/projects/${project.key}/items/${i.number}`)}
        onMove={project.canEdit ? move : undefined}
      />
    </Card>
  )
}
