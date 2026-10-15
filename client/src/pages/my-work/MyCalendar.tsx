// My Work → Calendar: my items across projects by due date (drag to change the date, if I can edit that project).
import { App, Card } from 'antd'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFetch } from '../../hooks/useFetch'
import { useNotificationsLive } from '../../hooks/useRealtime'
import { getErrorMessage } from '../../lib/api'
import { workItemsService } from '../../services/projects.service'
import { calendarService } from '../../services/workspace.service'
import type { WorkItemSummary } from '../../types/projects'
import { gridRange, monthGrid } from '../projects/calendar/calendarMeta'
import { MonthCalendar } from '../projects/calendar/MonthCalendar'

const todayIso = () => new Date().toISOString().slice(0, 10)
const projectKeyOf = (itemKey: string) => itemKey.slice(0, itemKey.lastIndexOf('-'))

export function MyCalendar() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [{ year, month, today }, setMonth] = useState(() => {
    const t = todayIso()
    return { year: Number(t.slice(0, 4)), month: Number(t.slice(5, 7)) - 1, today: t }
  })
  const { from, to } = gridRange(monthGrid(year, month))
  const data = useFetch(useCallback(() => calendarService.mine(from, to), [from, to]))
  useNotificationsLive(data.reload) // new assignments arrive as notifications

  const move = async (item: WorkItemSummary, date: string) => {
    try {
      await workItemsService.update(item.id, { dueDate: date })
      message.success(`${item.key} is now due ${new Date(`${date}T00:00:00`).toLocaleDateString()}`)
    } catch (err) {
      message.error(getErrorMessage(err))
    }
    data.reload()
  }

  return (
    <Card>
      <MonthCalendar
        year={year}
        month={month}
        today={today}
        onMonthChange={(y, m) => setMonth({ year: y, month: m, today: todayIso() })}
        items={data.data?.items ?? []}
        onOpen={(i) => navigate(`/projects/${projectKeyOf(i.key)}/items/${i.number}`)}
        onMove={move}
        showProject
      />
    </Card>
  )
}
