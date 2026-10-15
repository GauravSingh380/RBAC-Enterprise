// Help Center: reading (organization, guide.view) and writing (platform admins)
import { api } from '../lib/api'
import type {
  GettingStarted, GuideAdminSection, GuideArticle, GuideArticleDetail, GuideArticleInput, GuideSearchHit, GuideSection,
} from '../types/guide'

export const guideService = {
  contents: () => api.get<GuideSection[]>('/guide'),
  article: (slug: string) => api.get<GuideArticle>(`/guide/articles/${slug}`),
  search: (q: string) => api.get<GuideSearchHit[]>('/guide/search', { q }),
  gettingStarted: () => api.get<GettingStarted>('/guide/getting-started'),
  dismissGettingStarted: () => api.post<GettingStarted>('/guide/getting-started/dismiss'),
  restoreGettingStarted: () => api.post<GettingStarted>('/guide/getting-started/restore'),
}

export const guideAdminService = {
  contents: () => api.get<GuideAdminSection[]>('/platform/guide'),
  article: (id: number) => api.get<GuideArticleDetail>(`/platform/guide/articles/${id}`),
  createArticle: (data: GuideArticleInput) => api.post<GuideArticleDetail>('/platform/guide/articles', data),
  updateArticle: (id: number, data: GuideArticleInput) => api.patch<GuideArticleDetail>(`/platform/guide/articles/${id}`, data),
  deleteArticle: (id: number) => api.delete<void>(`/platform/guide/articles/${id}`),
  createSection: (data: { slug: string; title: string; icon?: string | null; position?: number }) => api.post<{ id: number }>('/platform/guide/sections', data),
  updateSection: (id: number, data: { slug?: string; title?: string; icon?: string | null; position?: number }) => api.patch<void>(`/platform/guide/sections/${id}`, data),
  deleteSection: (id: number) => api.delete<void>(`/platform/guide/sections/${id}`),
}
