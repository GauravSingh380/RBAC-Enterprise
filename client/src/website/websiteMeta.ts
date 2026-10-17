// Website helpers (pure, unit tested): section catalogue, link rules, small text helpers.
import type { InquiryStatus, InquiryType, MockName, PlanInfo, SectionType } from './types'

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
  { type: 'showcase', label: 'Product tour', description: 'Tabs with product screens and what each one does' },
  { type: 'steps', label: 'How it works', description: 'Numbered steps from sign-up to success' },
]

export const MOCK_OPTIONS: { value: MockName; label: string }[] = [
  { value: 'board', label: 'Board' },
  { value: 'qa', label: 'Bugs & QA' },
  { value: 'docs', label: 'Docs' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'leave', label: 'People & leave' },
  { value: 'insights', label: 'Insights' },
  { value: 'item', label: 'Work item detail' },
  { value: 'roles', label: 'Roles & permissions' },
]

/** The drawn screen that fits a row's topic (when the platform owner didn't choose one). */
export function guessMock(text: string): MockName | undefined {
  const t = text.toLowerCase()
  if (/quality|bug|qa\b|test|verif/.test(t)) return 'qa'
  if (/insight|report|dashboard|organization at a glance|analytics/.test(t)) return 'insights'
  if (/work item|every detail|checklist|comment/.test(t)) return 'item'
  if (/role|permission|security|admin|guest/.test(t)) return 'roles'
  if (/plan|sprint|board|backlog|kanban|scrum/.test(t)) return 'board'
  if (/doc|knowledge|spec|wiki|note/.test(t)) return 'docs'
  if (/calendar|schedule|due date/.test(t)) return 'calendar'
  if (/people|leave|holiday|team|manager|capacity/.test(t)) return 'leave'
  return undefined
}

/** icon + one line for each contact topic card */
export const TOPIC_DETAILS: Record<InquiryType, { icon: string; hint: string }> = {
  question: { icon: 'question', hint: 'Ask us anything' },
  demo: { icon: 'rocket', hint: 'See it with your use case' },
  sales: { icon: 'chart', hint: 'Plans, pricing, invoices' },
  support: { icon: 'safety', hint: 'Help with your account' },
}

/** Consecutive FAQ sections become one searchable help centre (each section = a category). */
export function groupFaqRuns<T extends { type: string }>(sections: T[]): (T | T[])[] {
  const out: (T | T[])[] = []
  for (const s of sections) {
    const last = out[out.length - 1]
    if (s.type === 'faq' && Array.isArray(last)) last.push(s)
    else if (s.type === 'faq') out.push([s])
    else out.push(s)
  }
  // a lone FAQ section stays a normal section
  return out.map((x) => (Array.isArray(x) && x.length === 1 ? x[0]! : x))
}

/** Case-insensitive match of a search text against a question and its answer. */
export const faqMatches = (q: string, item: { question: string; answer: string }) =>
  !q.trim() || `${item.question} ${item.answer}`.toLowerCase().includes(q.trim().toLowerCase())

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
    case 'showcase':
      return `${String(content.title ?? 'Product tour')} · ${count('tabs')} tab(s)`
    case 'steps':
      return `${String(content.title ?? 'How it works')} · ${count('items')} step(s)`
    default:
      return `${String(content.title ?? '')} · ${count('items')} item(s)`.replace(/^ · /, '')
  }
}
