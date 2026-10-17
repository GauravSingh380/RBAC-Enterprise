// Public website API: what visitors read, and what the platform owner edits (Platform → Website).
import { APP_ENV } from '../config/env'
import { api } from '../lib/api'
import type {
  DraftPage, InquiryDetail, InquiryInput, InquiryList, InquiryStatus, InquiryType, MediaItem, PageSummary, PublicPage, SectionType, SettingsDraft,
  SiteData, SiteSettings,
} from './types'

/** Public address of an uploaded image */
export const mediaUrl = (id: number) => `${APP_ENV.apiBaseUrl}/website/media/${id}`

export const websiteApi = {
  site: () => api.get<SiteData>('/website/site'),
  page: (slug: string) => api.get<PublicPage>(`/website/pages/${slug}`),
  /** the contact form */
  sendInquiry: (data: InquiryInput) => api.post<void>('/website/inquiries', data),
}

const P = '/platform/website'
export const websiteAdminApi = {
  pages: () => api.get<PageSummary[]>(`${P}/pages`),
  page: (slug: string) => api.get<DraftPage>(`${P}/pages/${slug}`),
  updateMeta: (slug: string, data: Partial<Pick<DraftPage, 'title' | 'navLabel' | 'showInNav' | 'showInFooter' | 'navOrder' | 'seoTitle' | 'seoDescription'>>) =>
    api.patch<DraftPage>(`${P}/pages/${slug}`, data),
  addSection: (slug: string, type: SectionType, afterId?: number | null) => api.post<DraftPage>(`${P}/pages/${slug}/sections`, { type, afterId }),
  reorder: (slug: string, ids: number[]) => api.put<DraftPage>(`${P}/pages/${slug}/sections/order`, { ids }),
  publish: (slug: string) => api.post<DraftPage>(`${P}/pages/${slug}/publish`),
  discard: (slug: string) => api.post<DraftPage>(`${P}/pages/${slug}/discard`),
  updateSection: (id: number, data: { content?: unknown; isVisible?: boolean }) => api.patch<DraftPage>(`${P}/sections/${id}`, data),
  duplicateSection: (id: number) => api.post<DraftPage>(`${P}/sections/${id}/duplicate`),
  deleteSection: (id: number) => api.delete<DraftPage>(`${P}/sections/${id}`),

  settings: () => api.get<SettingsDraft>(`${P}/settings`),
  saveSettings: (data: SiteSettings) => api.put<SettingsDraft>(`${P}/settings`, data),
  publishSettings: () => api.post<SettingsDraft>(`${P}/settings/publish`),

  inquiries: (q: { status?: InquiryStatus | 'open' | 'all'; type?: InquiryType; search?: string; page?: number; limit?: number }) =>
    api.get<InquiryList>(`${P}/inquiries`, q),
  inquiry: (id: number) => api.get<InquiryDetail>(`${P}/inquiries/${id}`),
  updateInquiry: (id: number, data: { status?: InquiryStatus; notes?: string | null }) => api.patch<InquiryDetail>(`${P}/inquiries/${id}`, data),
  replyInquiry: (id: number, body: string, close = false) => api.post<InquiryDetail>(`${P}/inquiries/${id}/reply`, { body, close }),
  deleteInquiry: (id: number) => api.delete<void>(`${P}/inquiries/${id}`),

  media: () => api.get<MediaItem[]>(`${P}/media`),
  upload: (file: File, onProgress?: (p: number) => void) => api.upload<MediaItem>(`${P}/media`, file, onProgress),
  updateMedia: (id: number, altText: string | null) => api.patch<MediaItem>(`${P}/media/${id}`, { altText }),
  deleteMedia: (id: number) => api.delete<void>(`${P}/media/${id}`),
}
