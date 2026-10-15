// Projects + work items API (active organization; X-Organization-Id is added by the http client)
import { api } from '../lib/api'
import type { Paginated } from '../types'
import type { QualityReport } from '../types/leave'
import type {
  Attachment,
  Comment,
  FieldType,
  ItemType,
  LinkType,
  PersonOption,
  Priority,
  ProjectDetail,
  ProjectField,
  ProjectLabel,
  ProjectMember,
  ProjectRole,
  ProjectStatus,
  ProjectSummary,
  Resolution,
  BurndownReport,
  OverviewReport,
  SavedView,
  Severity,
  Sprint,
  StatusCategory,
  UserRef,
  VelocityReport,
  WorkItemDetail,
  WorkItemEvent,
  WorkItemSummary,
} from '../types/projects'

export interface ProjectInput {
  name: string
  key: string
  description?: string
  template?: string
  visibility?: 'private' | 'organization'
  icon?: string
  color?: string
  leadId?: number
}

export const projectsService = {
  list: (status: 'active' | 'archived' | 'all' = 'active', search?: string) =>
    api.get<ProjectSummary[]>('/projects', { status, search }),
  get: (ref: string | number) => api.get<ProjectDetail>(`/projects/${ref}`),
  create: (data: ProjectInput) => api.post<ProjectDetail>('/projects', data),
  update: (
    ref: string | number,
    data: {
      name?: string
      description?: string | null
      visibility?: 'private' | 'organization'
      icon?: string | null
      color?: string | null
      leadId?: number | null
      qaReadyStatusId?: number | null
      qaPassedStatusId?: number | null
      qaFailedStatusId?: number | null
    },
  ) =>
    api.patch<ProjectDetail>(`/projects/${ref}`, data),
  archive: (ref: string | number) => api.post<ProjectDetail>(`/projects/${ref}/archive`),
  restore: (ref: string | number) => api.post<ProjectDetail>(`/projects/${ref}/restore`),
  remove: (ref: string | number) => api.delete(`/projects/${ref}`),

  members: (ref: string | number) => api.get<ProjectMember[]>(`/projects/${ref}/members`),
  memberCandidates: (ref: string | number) => api.get<PersonOption[]>(`/projects/${ref}/member-candidates`),
  assignableUsers: (ref: string | number) => api.get<PersonOption[]>(`/projects/${ref}/assignable-users`),
  addMember: (ref: string | number, userId: number, role: ProjectRole) =>
    api.post<ProjectMember[]>(`/projects/${ref}/members`, { userId, role }),
  updateMember: (ref: string | number, userId: number, role: ProjectRole) =>
    api.patch<ProjectMember[]>(`/projects/${ref}/members/${userId}`, { role }),
  removeMember: (ref: string | number, userId: number) => api.delete(`/projects/${ref}/members/${userId}`),

  createStatus: (
    ref: string | number,
    data: { name: string; category: StatusCategory; color?: string; restrictedRoles?: string[]; wipLimit?: number | null },
  ) => api.post<ProjectStatus[]>(`/projects/${ref}/statuses`, data),
  updateStatus: (
    ref: string | number,
    id: number,
    data: Partial<{ name: string; category: StatusCategory; color: string; restrictedRoles: string[]; wipLimit: number | null }>,
  ) =>
    api.patch<ProjectStatus[]>(`/projects/${ref}/statuses/${id}`, data),
  reorderStatuses: (ref: string | number, statusIds: number[]) => api.put<ProjectStatus[]>(`/projects/${ref}/statuses/order`, { statusIds }),
  deleteStatus: (ref: string | number, id: number, moveTo?: number) =>
    api.delete<ProjectStatus[]>(`/projects/${ref}/statuses/${id}${moveTo ? `?moveTo=${moveTo}` : ''}`),

  createLabel: (ref: string | number, name: string, color = 'blue') => api.post<ProjectLabel>(`/projects/${ref}/labels`, { name, color }),
  updateLabel: (ref: string | number, id: number, data: { name?: string; color?: string }) =>
    api.patch<ProjectLabel>(`/projects/${ref}/labels/${id}`, data),
  deleteLabel: (ref: string | number, id: number) => api.delete(`/projects/${ref}/labels/${id}`),

  createField: (ref: string | number, data: { name: string; fieldType: FieldType; options?: string[]; required?: boolean }) =>
    api.post<ProjectField[]>(`/projects/${ref}/fields`, data),
  updateField: (ref: string | number, id: number, data: { name?: string; options?: string[]; required?: boolean }) =>
    api.patch<ProjectField[]>(`/projects/${ref}/fields/${id}`, data),
  deleteField: (ref: string | number, id: number) => api.delete<ProjectField[]>(`/projects/${ref}/fields/${id}`),
}

export interface WorkItemInput {
  type?: ItemType
  title?: string
  description?: string | null
  statusId?: number
  priority?: Priority
  severity?: Severity | null
  assigneeId?: number | null
  parentId?: number | null
  dueDate?: string | null
  estimate?: number | null
  labelIds?: number[]
  customFields?: Record<string, unknown>
  environment?: string | null
  stepsToReproduce?: string | null
  expectedResult?: string | null
  actualResult?: string | null
  rank?: number
  sprintId?: number | null
  browser?: string | null
  os?: string | null
  foundInVersion?: string | null
  fixedInVersion?: string | null
  resolution?: Resolution | null
  /** create only: checklist steps (e.g. from a template) */
  checklist?: string[]
}

export interface BulkChanges {
  statusId?: number
  priority?: Priority
  assigneeId?: number | null
  sprintId?: number | null
  addLabelIds?: number[]
  removeLabelIds?: number[]
}

export interface WorkItemFilters {
  page?: number
  limit?: number
  search?: string
  statusIds?: string
  categories?: string
  types?: string
  priorities?: string
  labelIds?: string
  assignees?: string
  parent?: string
  /** sprint id, 'active', 'backlog' or 'planning' */
  sprint?: string
  sort?: string
  order?: 'asc' | 'desc'
}

export const workItemsService = {
  list: (projectRef: string | number, filters: WorkItemFilters) =>
    api.get<Paginated<WorkItemSummary>>(`/projects/${projectRef}/items`, { ...filters }),
  create: (projectRef: string | number, data: WorkItemInput & { type: ItemType; title: string }) =>
    api.post<WorkItemDetail>(`/projects/${projectRef}/items`, data),
  search: (search: string, excludeId?: number) => api.get<WorkItemSummary[]>('/work-items', { search, excludeId, limit: 10 }),
  get: (ref: string | number) => api.get<WorkItemDetail>(`/work-items/${ref}`),
  update: (ref: string | number, data: WorkItemInput) => api.patch<WorkItemDetail>(`/work-items/${ref}`, data),
  /** drag & drop: new status / sprint and the neighbours it was dropped between */
  move: (ref: string | number, data: { statusId?: number; sprintId?: number | null; prevId?: number | null; nextId?: number | null }) =>
    api.post<WorkItemSummary>(`/work-items/${ref}/move`, data),
  /** possible duplicates of a title being typed */
  similar: (projectRef: string | number, title: string, excludeId?: number) =>
    api.get<(WorkItemSummary & { score: number })[]>(`/projects/${projectRef}/items/similar`, { title, excludeId }),
  qaVerdict: (ref: string | number, data: { verdict: 'pass' | 'fail'; comment?: string; fixedInVersion?: string }) =>
    api.post<WorkItemDetail>(`/work-items/${ref}/qa`, data),
  closeDuplicate: (ref: string | number, duplicateOf: string) => api.post<WorkItemDetail>(`/work-items/${ref}/close-duplicate`, { duplicateOf }),
  bulkUpdate: (projectRef: string | number, itemIds: number[], changes: BulkChanges) =>
    api.post<{ updated: number }>(`/projects/${projectRef}/items/bulk`, { itemIds, changes }),
  remove: (ref: string | number) => api.delete(`/work-items/${ref}`),
  events: (ref: string | number) => api.get<WorkItemEvent[]>(`/work-items/${ref}/events`),
  watch: (ref: string | number) => api.post<{ isWatching: boolean; watchers: UserRef[] }>(`/work-items/${ref}/watch`),
  unwatch: (ref: string | number) => api.delete<{ isWatching: boolean; watchers: UserRef[] }>(`/work-items/${ref}/watch`),

  comments: (ref: string | number) => api.get<Comment[]>(`/work-items/${ref}/comments`),
  addComment: (ref: string | number, body: string) => api.post<Comment>(`/work-items/${ref}/comments`, { body }),
  editComment: (ref: string | number, id: number, body: string) => api.patch<Comment>(`/work-items/${ref}/comments/${id}`, { body }),
  deleteComment: (ref: string | number, id: number) => api.delete(`/work-items/${ref}/comments/${id}`),
  react: (ref: string | number, id: number, emoji: string) => api.post<Comment>(`/work-items/${ref}/comments/${id}/reactions`, { emoji }),

  addLink: (ref: string | number, target: string, linkType: LinkType) =>
    api.post<WorkItemDetail>(`/work-items/${ref}/links`, { target, linkType }),
  removeLink: (ref: string | number, linkId: number) => api.delete(`/work-items/${ref}/links/${linkId}`),

  attachments: (ref: string | number) => api.get<Attachment[]>(`/work-items/${ref}/attachments`),
  upload: (ref: string | number, file: File, onProgress?: (p: number) => void) =>
    api.upload<Attachment[]>(`/work-items/${ref}/attachments`, file, onProgress),
  download: (ref: string | number, id: number, inline = false) =>
    api.blob(`/work-items/${ref}/attachments/${id}`, inline ? { inline: 1 } : undefined),
  deleteAttachment: (ref: string | number, id: number) => api.delete(`/work-items/${ref}/attachments/${id}`),
}

export interface SprintInput {
  name?: string
  goal?: string | null
  startDate?: string | null
  endDate?: string | null
}

export const sprintsService = {
  list: (projectRef: string | number, status: 'open' | 'completed' | 'all' = 'all') =>
    api.get<Sprint[]>(`/projects/${projectRef}/sprints`, { status }),
  create: (projectRef: string | number, data: SprintInput) => api.post<Sprint>(`/projects/${projectRef}/sprints`, data),
  update: (projectRef: string | number, id: number, data: SprintInput) => api.patch<Sprint>(`/projects/${projectRef}/sprints/${id}`, data),
  remove: (projectRef: string | number, id: number) => api.delete(`/projects/${projectRef}/sprints/${id}`),
  start: (projectRef: string | number, id: number, data: { name?: string; goal?: string | null; startDate?: string; endDate?: string }) =>
    api.post<Sprint>(`/projects/${projectRef}/sprints/${id}/start`, data),
  complete: (projectRef: string | number, id: number, moveOpenItemsTo: 'backlog' | number) =>
    api.post<Sprint & { movedCount: number }>(`/projects/${projectRef}/sprints/${id}/complete`, { moveOpenItemsTo }),
}

export const savedViewsService = {
  list: (projectRef: string | number) => api.get<SavedView[]>(`/projects/${projectRef}/views`),
  create: (projectRef: string | number, data: { name: string; viewType: 'list' | 'board'; filters: Record<string, string>; isShared: boolean }) =>
    api.post<SavedView>(`/projects/${projectRef}/views`, data),
  update: (projectRef: string | number, id: number, data: { name?: string; filters?: Record<string, string>; isShared?: boolean }) =>
    api.patch<SavedView>(`/projects/${projectRef}/views/${id}`, data),
  remove: (projectRef: string | number, id: number) => api.delete(`/projects/${projectRef}/views/${id}`),
}

export const reportsService = {
  burndown: (projectRef: string | number, sprintId: number) => api.get<BurndownReport>(`/projects/${projectRef}/reports/burndown/${sprintId}`),
  velocity: (projectRef: string | number, limit = 7) => api.get<VelocityReport>(`/projects/${projectRef}/reports/velocity`, { limit }),
  quality: (projectRef: string | number, weeks = 12) => api.get<QualityReport>(`/projects/${projectRef}/reports/quality`, { weeks }),
  overview: (projectRef: string | number, days = 30) => api.get<OverviewReport>(`/projects/${projectRef}/reports/overview`, { days }),
}
