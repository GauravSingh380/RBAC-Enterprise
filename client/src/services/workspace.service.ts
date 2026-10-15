// Checklists, templates (+ repeating), project docs, trash and calendar
import { api } from '../lib/api'
import type { ChecklistItem } from '../types/projects'
import type {
  CalendarData, DeletedProject, ItemTemplate, ItemTemplateInput, Page, PageSearchHit, PageSummary, PageVersion, TrashEntry,
} from '../types/workspace'

type Ref = string | number

export const checklistService = {
  add: (item: Ref, text: string) => api.post<ChecklistItem[]>(`/work-items/${item}/checklist`, { text }),
  update: (item: Ref, id: number, data: { text?: string; done?: boolean }) => api.patch<ChecklistItem[]>(`/work-items/${item}/checklist/${id}`, data),
  remove: (item: Ref, id: number) => api.delete<ChecklistItem[]>(`/work-items/${item}/checklist/${id}`),
  reorder: (item: Ref, ids: number[]) => api.put<ChecklistItem[]>(`/work-items/${item}/checklist/order`, { ids }),
}

export const templatesService = {
  list: (project: Ref) => api.get<ItemTemplate[]>(`/projects/${project}/templates`),
  create: (project: Ref, data: ItemTemplateInput) => api.post<ItemTemplate>(`/projects/${project}/templates`, data),
  update: (project: Ref, id: number, data: Partial<ItemTemplateInput>) => api.patch<ItemTemplate>(`/projects/${project}/templates/${id}`, data),
  remove: (project: Ref, id: number) => api.delete<void>(`/projects/${project}/templates/${id}`),
}

export const pagesService = {
  list: (project: Ref) => api.get<PageSummary[]>(`/projects/${project}/pages`),
  search: (project: Ref, q: string) => api.get<PageSearchHit[]>(`/projects/${project}/pages/search`, { q }),
  get: (project: Ref, id: number) => api.get<Page>(`/projects/${project}/pages/${id}`),
  create: (project: Ref, data: { title: string; body?: string; parentId?: number | null }) => api.post<Page>(`/projects/${project}/pages`, data),
  update: (project: Ref, id: number, data: { title?: string; body?: string; parentId?: number | null; position?: number; baseUpdatedAt?: string }) =>
    api.patch<Page>(`/projects/${project}/pages/${id}`, data),
  remove: (project: Ref, id: number) => api.delete<{ trashed: number }>(`/projects/${project}/pages/${id}`),
  versions: (project: Ref, id: number) => api.get<PageVersion[]>(`/projects/${project}/pages/${id}/versions`),
  version: (project: Ref, id: number, versionId: number) => api.get<PageVersion & { body: string }>(`/projects/${project}/pages/${id}/versions/${versionId}`),
  restoreVersion: (project: Ref, id: number, versionId: number) => api.post<Page>(`/projects/${project}/pages/${id}/versions/${versionId}/restore`),
}

export const trashService = {
  list: (project: Ref) => api.get<TrashEntry[]>(`/projects/${project}/trash`),
  restore: (project: Ref, kind: 'item' | 'page', id: number) => api.post<{ restored: number }>(`/projects/${project}/trash/${kind}/${id}/restore`),
  deleteForever: (project: Ref, kind: 'item' | 'page', id: number) => api.delete<void>(`/projects/${project}/trash/${kind}/${id}`),
  deletedProjects: () => api.get<DeletedProject[]>('/trash/projects'),
  restoreProject: (id: number) => api.post<{ key: string }>(`/trash/projects/${id}/restore`),
  deleteProjectForever: (id: number) => api.delete<void>(`/trash/projects/${id}`),
}

export const calendarService = {
  project: (project: Ref, from: string, to: string) => api.get<CalendarData>(`/projects/${project}/calendar`, { from, to }),
  mine: (from: string, to: string) => api.get<CalendarData>('/my-work/calendar', { from, to }),
}
