// Public website — the shapes the API sends (server/src/modules/website). Kept apart from the app's types.

export type SectionType = 'hero' | 'logos' | 'features_grid' | 'feature_rows' | 'stats' | 'testimonials' | 'cta' | 'rich_text' | 'pricing' | 'faq'

export interface Cta {
  label: string
  href: string
}

export interface HeroSlide {
  eyebrow?: string | null
  title: string
  subtitle?: string | null
  mediaId?: number | null
  primaryCta?: Cta | null
  secondaryCta?: Cta | null
}
export interface HeroContent {
  autoplaySeconds: number
  slides: HeroSlide[]
}
export interface LogosContent {
  title?: string | null
  items: { name: string; mediaId?: number | null; href?: string | null }[]
}
export interface FeaturesGridContent {
  title?: string | null
  subtitle?: string | null
  columns: 2 | 3 | 4
  items: { icon?: string | null; title: string; text?: string | null; href?: string | null }[]
}
export interface FeatureRowsContent {
  items: { eyebrow?: string | null; title: string; text?: string | null; bullets: string[]; mediaId?: number | null; cta?: Cta | null }[]
}
export interface StatsContent {
  items: { value: string; label: string }[]
}
export interface TestimonialsContent {
  title?: string | null
  items: { quote: string; name: string; role?: string | null; company?: string | null; mediaId?: number | null }[]
}
export interface CtaContent {
  title: string
  text?: string | null
  primaryCta?: Cta | null
  secondaryCta?: Cta | null
}
export interface RichTextContent {
  title?: string | null
  body: string
  align: 'left' | 'center'
}
export interface PlanInfo {
  key: string
  name: string
  description: string | null
  limits: { members: number | null; guests: number | null; projects: number | null }
}
export interface PricingCard {
  planKey: string
  priceLabel: string
  period?: string | null
  description?: string | null
  highlight: boolean
  badge?: string | null
  features: string[]
  cta?: Cta | null
  /** added by the server: the live plan (name, limits) */
  plan?: PlanInfo
}
export interface PricingContent {
  title?: string | null
  subtitle?: string | null
  showLimits: boolean
  plans: PricingCard[]
  footnote?: string | null
}
export interface FaqContent {
  title?: string | null
  items: { question: string; answer: string }[]
}

export interface Section<T = Record<string, unknown>> {
  id: number
  type: SectionType
  isVisible: boolean
  content: T
}

export interface SiteSettings {
  brandName: string
  logoMediaId?: number | null
  announcement: { enabled: boolean; text?: string | null; href?: string | null }
  header: { loginLabel: string; ctaLabel: string; ctaHref: string }
  footer: { text?: string | null; columns: { title: string; links: Cta[] }[]; copyright?: string | null }
}

export interface SiteData {
  settings: SiteSettings | null
  nav: { path: string; label: string }[]
}

export interface PublicPage {
  slug: string
  path: string
  title: string
  seoTitle: string | null
  seoDescription: string | null
  sections: Section[]
}

// ---- editing (platform)
export interface PageSummary {
  slug: string
  path: string
  title: string
  navLabel: string | null
  showInNav: boolean
  navOrder: number
  publishedAt: string | null
  publishedBy: string | null
  hasChanges: boolean
  sections: number
}

export interface DraftPage extends Omit<PageSummary, 'sections' | 'publishedBy'> {
  seoTitle: string | null
  seoDescription: string | null
  sections: Section[]
  /** visible sections, pricing filled with live plans — what the page will look like */
  previewSections: Section[]
  plans: PlanInfo[]
}

export interface SettingsDraft {
  draft: SiteSettings
  published: SiteSettings | null
  publishedAt: string | null
  hasChanges: boolean
}

export interface MediaItem {
  id: number
  fileName: string
  mimeType: string
  sizeBytes: number
  altText: string | null
  createdAt: string
  uploadedBy: string | null
}
