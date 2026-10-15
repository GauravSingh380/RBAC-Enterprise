// Templates (+ repeating), project docs, trash and calendar — see server modules templates/, pages/, trash/, calendar/
import type { Priority, UserRef, WorkItemSummary } from './projects'

export type Repeat = 'never' | 'weekdays' | 'weekly' | 'monthly'

export interface ItemTemplate {
  id: number
  name: string
  type: 'epic' | 'story' | 'task' | 'bug'
  title: string
  description: string | null
  priority: Priority
  labelIds: number[]
  checklist: string[]
  repeat: Repeat
  repeatWeekday: number | null
  repeatMonthDay: number | null
  assignee: UserRef | null
  dueInDays: number | null
  /** next day an item is created (null = not repeating, or paused) */
  nextRunOn: string | null
  lastRunAt: string | null
  createdBy: UserRef | null
}

export type ItemTemplateInput = Omit<ItemTemplate, 'id' | 'assignee' | 'nextRunOn' | 'lastRunAt' | 'createdBy'> & { assigneeId: number | null }

export interface PageSummary {
  id: number
  parentId: number | null
  title: string
  position: number
  updatedAt: string
  updatedBy: UserRef | null
}

export interface Page extends PageSummary {
  body: string
  createdAt: string
  createdBy: UserRef | null
  canEdit: boolean
}

export interface PageVersion {
  id: number
  title: string
  createdAt: string
  editedBy: UserRef | null
  length: number
}

export interface PageSearchHit {
  id: number
  title: string
  /** matches wrapped in [[ ]] */
  snippet: string
}

export interface TrashEntry {
  kind: 'item' | 'page'
  id: number
  key: string | null
  title: string
  type: string | null
  withChildren: number
  deletedAt: string
  deletedBy: UserRef | null
  purgeAt: string
  canRestore: boolean
}

export interface DeletedProject {
  id: number
  key: string
  name: string
  color: string | null
  deletedAt: string
  purgeAt: string
  deletedBy: UserRef | null
  itemCount: number
}

export interface CalendarSprint {
  id: number
  name: string
  status: 'planned' | 'active' | 'completed'
  startDate: string
  endDate: string
}

export interface CalendarData {
  items: WorkItemSummary[]
  sprints: CalendarSprint[]
}
