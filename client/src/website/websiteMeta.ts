// Website helpers (pure, unit tested): section catalogue, link rules, small text helpers.
import type { PlanInfo, SectionType } from './types'

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
]

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
    default:
      return `${String(content.title ?? '')} · ${count('items')} item(s)`.replace(/^ · /, '')
  }
}
