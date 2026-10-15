// Help Center (product guide) — see server/src/modules/guide
export type GuideAudience = 'everyone' | 'admins'

export interface GuideArticleSummary {
  id: number
  slug: string
  title: string
  summary: string | null
  audience: GuideAudience
  appPath: string | null
}

export interface GuideSection {
  id: number
  slug: string
  title: string
  icon: string | null
  articles: GuideArticleSummary[]
}

export interface GuideArticle extends GuideArticleSummary {
  body: string
  updatedAt: string
  section: { slug: string; title: string }
  previous: { slug: string; title: string } | null
  next: { slug: string; title: string } | null
}

export interface GuideSearchHit extends GuideArticleSummary {
  /** plain text; matches are wrapped in [[ ]] */
  snippet: string
  section: string
}

export interface GettingStartedStep {
  key: string
  title: string
  description: string
  done: boolean
  path: string
  article: string
}

export type GettingStarted =
  | { visible: false }
  | { visible: true; dismissed: boolean; completed: number; total: number; steps: GettingStartedStep[] }

// ---- authoring (platform)
export interface GuideAdminArticle extends GuideArticleSummary {
  position: number
  status: 'draft' | 'published'
  visibility: 'all' | 'selected'
  organizationIds: number[]
  updatedAt: string
}
export interface GuideAdminSection {
  id: number
  slug: string
  title: string
  icon: string | null
  position: number
  articles: GuideAdminArticle[]
}
export interface GuideArticleDetail extends GuideAdminArticle {
  sectionId: number
  body: string
  updatedBy: string | null
}
export type GuideArticleInput = Partial<Omit<GuideArticleDetail, 'id' | 'updatedAt' | 'updatedBy'>>
