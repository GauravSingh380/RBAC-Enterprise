// Website helpers (pure, unit tested): section catalogue, link rules, small text helpers.
import type { InquiryStatus, InquiryType, PlanInfo, SectionType } from './types'

export const SECTION_CATALOG: { type: SectionType; label: string; description: string }[] = [
  { type: 'hero', label: 'Hero slider', description: 'Big headline with buttons and an image — one or more slides' },
  { type: 'features_grid', label: 'Feature grid', description: 'Icons with a short title and text, in 2–4 columns' },
  { type: 'feature_rows', label: 'Image + text rows', description: 'Alternating image and text, with bullet points' },
  { type: 'stats', label: 'Numbers', description: 'A few big numbers worth knowing' },
  { type: 'logos', label: 'Logo strip', description: 'Customer or partner logos' },
  { type: 'testimonials', label: 'Testimonials', description: 'Quotes from customers' },
  { type: 'pricing', label: 'Pricing table', description: 'Plans with prices — limits come from Platform → Plans' },
  { type: 'faq', label: 'FAQ', description: 'Questions and answers that open on click' },
  { type: 'rich_text', label: 'Text', description: 'Free text in markdown' },
  { type: 'cta', label: 'Call to action', description: 'A coloured band with a message and buttons' },
  { type: 'contact_form', label: 'Contact form', description: 'Visitors write to you — messages arrive in the Inquiries inbox' },
]

export const INQUIRY_TYPES: { value: InquiryType; label: string }[] = [
  { value: 'question', label: 'General question' },
  { value: 'demo', label: 'Book a demo' },
  { value: 'sales', label: 'Sales / pricing' },
  { value: 'support', label: 'Support' },
]
export const inquiryTypeLabel = (t: InquiryType) => INQUIRY_TYPES.find((x) => x.value === t)?.label ?? t
export const TEAM_SIZES = ['1-10', '11-50', '51-200', '201-1000', '1000+']
export const INQUIRY_STATUS: Record<InquiryStatus, { label: string; color: string }> = {
  new: { label: 'New', color: 'blue' },
  replied: { label: 'Replied', color: 'green' },
  closed: { label: 'Closed', color: 'default' },
  spam: { label: 'Spam', color: 'red' },
}

/** ?type=demo on the contact page pre-selects that topic (only one the form offers). */
export function initialTopic(param: string | null, topics: InquiryType[]): InquiryType {
  return topics.find((t) => t === param) ?? topics[0] ?? 'question'
}

export const sectionLabel = (type: SectionType) => SECTION_CATALOG.find((s) => s.type === type)?.label ?? type

/** Same rule as the server: a path of the site/app, a web address, an e-mail or an anchor. */
export const SAFE_HREF = /^(\/[^\s]*|https?:\/\/[^\s]+|mailto:[^\s@]+@[^\s@]+|#[\w-]*)$/
export const isInternalHref = (href: string) => /^\/(?!\/)/.test(href)

/** "© {year} Team-Flex" → "© 2026 Team-Flex" */
export const fillYear = (text: string, year = new Date().getFullYear()) => text.replaceAll('{year}', String(year))

/** "Up to 10 members" · "Unlimited members" · "No guests" */
export function limitLines(plan: PlanInfo): string[] {
  const line = (n: number | null, one: string, many: string) =>
    n === null ? `Unlimited ${many}` : n === 0 ? `No ${many}` : `Up to ${n} ${n === 1 ? one : many}`
  return [
    line(plan.limits.members, 'member', 'members'),
    line(plan.limits.guests, 'guest', 'guests'),
    line(plan.limits.projects, 'active project', 'active projects'),
  ]
}

/** One-line summary of a section's content for the editor list. */
export function sectionSummary(type: SectionType, content: Record<string, unknown>): string {
  const count = (k: string) => (Array.isArray(content[k]) ? (content[k] as unknown[]).length : 0)
  switch (type) {
    case 'hero': {
      const slides = (content.slides as { title: string }[]) ?? []
      return `${slides[0]?.title ?? ''}${slides.length > 1 ? ` (+${slides.length - 1} more slide${slides.length > 2 ? 's' : ''})` : ''}`
    }
    case 'cta':
      return String(content.title ?? '')
    case 'rich_text':
      return String(content.title ?? content.body ?? '').slice(0, 80)
    case 'stats':
      return `${count('items')} number(s)`
    case 'pricing':
      return `${String(content.title ?? 'Pricing')} · ${count('plans')} plan(s)`
    case 'feature_rows':
      return `${count('items')} row(s)`
    case 'contact_form':
      return `${String(content.title ?? 'Contact form')} · ${count('topics')} topic(s)`
    default:
      return `${String(content.title ?? '')} · ${count('items')} item(s)`.replace(/^ · /, '')
  }
}
