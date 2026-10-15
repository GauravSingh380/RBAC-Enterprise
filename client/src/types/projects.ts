// Projects & work items (see server/src/modules/projects and work-items)

export type ProjectRole = 'admin' | 'member' | 'viewer'
export type StatusCategory = 'todo' | 'in_progress' | 'done'
export type ItemType = 'epic' | 'story' | 'task' | 'bug' | 'subtask'
export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none'
export type Severity = 'critical' | 'major' | 'minor' | 'trivial'
export type FieldType = 'text' | 'number' | 'date' | 'select' | 'multi_select' | 'checkbox'
export type Resolution = 'fixed' | 'duplicate' | 'wont_fix' | 'cannot_reproduce' | 'by_design'

export interface UserRef {
  id: number
  name: string
}

export interface ProjectStatus {
  id: number
  name: string
  category: StatusCategory
  color: string
  position: number
  restrictedRoles: string[]
  /** board column soft limit */
  wipLimit: number | null
  itemCount: number
}

export interface ProjectLabel {
  id: number
  name: string
  color: string
}

export interface ProjectField {
  id: number
  name: string
  fieldType: FieldType
  options: string[]
  required: boolean
  position: number
}

export interface ProjectSummary {
  id: number
  key: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  leadId: number | null
  lead: UserRef | null
  visibility: 'private' | 'organization'
  status: 'active' | 'archived'
  template: string
  /** QA verification flow (bugs): waiting for QA → passed / failed; null = not configured */
  qaReadyStatusId: number | null
  qaPassedStatusId: number | null
  qaFailedStatusId: number | null
  myRole: ProjectRole
  itemCount: number
  openItemCount: number
  memberCount: number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface ProjectDetail extends ProjectSummary {
  canEdit: boolean
  canManage: boolean
  defaultItemType: ItemType
  statuses: ProjectStatus[]
  labels: ProjectLabel[]
  fields: ProjectField[]
}

export interface ProjectMember {
  id: number
  name: string
  email: string
  role: ProjectRole
  addedAt: string
  /** outside collaborator (never a project admin) */
  isGuest: boolean
}

export interface PersonOption {
  id: number
  name: string
  email: string
  /** member candidates: outside collaborator */
  isGuest?: boolean
}

export interface StatusRef {
  id: number
  name: string
  category: StatusCategory
  color: string
}

export interface WorkItemSummary {
  id: number
  key: string
  number: number
  projectId: number
  type: ItemType
  title: string
  priority: Priority
  severity: Severity | null
  resolution: Resolution | null
  status: StatusRef
  assignee: UserRef | null
  labels: ProjectLabel[]
  dueDate: string | null
  estimate: number | null
  parentId: number | null
  sprint: SprintRef | null
  rank: number
  childCount: number
  commentCount: number
  /** checklist progress (total 0 = none) */
  checklist: { done: number; total: number }
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface LinkedItem {
  linkId: number
  linkType: 'blocks' | 'duplicates' | 'relates_to'
  label: string
  direction: 'outward' | 'inward'
  item: Pick<WorkItemSummary, 'id' | 'key' | 'title' | 'type' | 'status' | 'priority'>
}

export interface WorkItemDetail extends WorkItemSummary {
  description: string | null
  environment: string | null
  stepsToReproduce: string | null
  expectedResult: string | null
  actualResult: string | null
  browser: string | null
  os: string | null
  foundInVersion: string | null
  fixedInVersion: string | null
  reopenCount: number
  customFields: Record<string, unknown>
  reporter: UserRef | null
  project: { id: number; key: string; name: string }
  parent: Pick<WorkItemSummary, 'id' | 'key' | 'title' | 'type' | 'status'> | null
  children: WorkItemSummary[]
  links: LinkedItem[]
  watchers: UserRef[]
  isWatching: boolean
  attachmentCount: number
  productionErrors: { id: number; title: string; source: 'server' | 'client'; status: 'unresolved' | 'resolved' | 'ignored'; occurrences: number; lastSeenAt: string }[]
  testCases: { id: number; number: number; title: string; status: string; lastResult: string | null }[]
  foundByTest: { runId: number; runName: string; resultId: number; caseNumber: number; caseTitle: string } | null
  permissions: { canEdit: boolean; canDelete: boolean; canComment: boolean }
  checklistItems: ChecklistItem[]
}

export interface WorkItemEvent {
  id: number
  eventType: string
  field: string | null
  oldValue: unknown
  newValue: unknown
  actor: UserRef | null
  createdAt: string
}

export interface CommentReaction {
  emoji: string
  count: number
  reacted: boolean
  users: string[]
}

export interface Comment {
  id: number
  body: string
  author: UserRef | null
  createdAt: string
  editedAt: string | null
  reactions: CommentReaction[]
  canEdit: boolean
  canDelete: boolean
}

export interface Attachment {
  id: number
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadedBy: UserRef | null
  createdAt: string
  canDelete: boolean
}

export type LinkType = 'blocks' | 'blocked_by' | 'duplicates' | 'duplicated_by' | 'relates_to'

// ---------------------------------------------------------------- sprints, views, reports (phase 2d / 2e)

export type SprintStatus = 'planned' | 'active' | 'completed'

export interface SprintRef {
  id: number
  name: string
  status: SprintStatus
}

export interface Sprint extends SprintRef {
  projectId: number
  goal: string | null
  startDate: string | null
  endDate: string | null
  startedAt: string | null
  completedAt: string | null
  committedPoints: number | null
  committedCount: number | null
  completedPoints: number | null
  completedCount: number | null
  createdAt: string
  stats: { itemCount: number; points: number; doneCount: number; donePoints: number }
}

export interface SavedView {
  id: number
  name: string
  viewType: 'list' | 'board'
  filters: Record<string, string>
  isShared: boolean
  owner: UserRef
  canEdit: boolean
  createdAt: string
  updatedAt: string
}

export interface BurndownPoint {
  date: string
  kind: 'start' | 'day'
  remainingPoints: number | null
  remainingCount: number | null
  scopePoints: number | null
  scopeCount: number | null
  idealPoints: number
  idealCount: number
}

export interface SprintReportItem {
  id: number
  key: string
  title: string
  type: ItemType
  status: string
  points: number
  addedAfterStart: boolean
}

export interface BurndownReport {
  sprint: Omit<Sprint, 'projectId' | 'createdAt' | 'stats'>
  series: BurndownPoint[]
  summary: {
    committedPoints: number
    committedCount: number
    completedPoints: number
    completedCount: number
    remainingPoints: number
    remainingCount: number
    addedCount: number
    removedCount: number
    daysLeft: number
  } | null
  completedItems: SprintReportItem[]
  notCompletedItems: SprintReportItem[]
  scopeChanges: { at: string; change: 'added' | 'removed'; key: string; title: string }[]
}

export interface VelocityReport {
  sprints: {
    id: number
    name: string
    startDate: string | null
    endDate: string | null
    committedPoints: number
    completedPoints: number
    committedCount: number
    completedCount: number
  }[]
  averageCompletedPoints: number
  averageCompletedCount: number
  sayDoRatio: number | null
}

export interface OverviewReport {
  days: number
  totals: { total: number; open: number; done: number; overdue: number; unassigned: number }
  createdVsResolved: { date: string; created: number; resolved: number }[]
  byStatus: { id: number; name: string; color: string; category: StatusCategory; count: number }[]
  byType: { type: ItemType; count: number }[]
  byPriority: { priority: Priority; count: number }[]
  workload: { assignee: UserRef | null; open: number; inProgress: number; points: number }[]
  times: { count: number; avgLeadDays: number | null; medianLeadDays: number | null; avgCycleDays: number | null; medianCycleDays: number | null }
}

export interface ChecklistItem {
  id: number
  text: string
  done: boolean
  position: number
  doneBy: UserRef | null
  doneAt: string | null
}
