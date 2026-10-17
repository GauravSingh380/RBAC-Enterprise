// The section types of a website page: what each one contains (Zod schema), and what a new one starts with.
// The client has the matching renderers (client/src/website/sections) and editors (client/src/website/admin/forms).
import { z } from 'zod';

/** Links: a page of this site/app ("/pricing"), a web address, an e-mail, or an anchor. Nothing else (no javascript:). */
const href = z
  .string()
  .trim()
  .max(500)
  .regex(/^(\/[^\s]*|https?:\/\/[^\s]+|mailto:[^\s@]+@[^\s@]+|#[\w-]*)$/, 'Use a path like /pricing, a full https:// address or mailto:');
const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).nullable().optional();
const mediaId = z.number().int().positive().nullable().optional();
const cta = z.object({ label: text(40).min(1), href }).nullable().optional();

export const SECTION_TYPES = [
  'hero', 'logos', 'features_grid', 'feature_rows', 'stats', 'testimonials', 'cta', 'rich_text', 'pricing', 'faq', 'contact_form', 'steps', 'showcase',
] as const;

/** Drawn product screens a showcase tab (or an image-less row) can show instead of an uploaded screenshot. */
export const MOCKS = ['board', 'qa', 'insights', 'calendar', 'docs', 'leave', 'item', 'roles'] as const;

/** What a visitor can write to us about (the contact form). */
export const INQUIRY_TYPES = ['question', 'demo', 'sales', 'support'] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const SECTION_SCHEMAS: Record<SectionType, z.ZodType> = {
  hero: z.object({
    autoplaySeconds: z.number().int().min(0).max(30).default(7), // 0 = no automatic sliding
    slides: z
      .array(
        z.object({
          eyebrow: optionalText(80),
          title: text(140).min(1),
          subtitle: optionalText(400),
          mediaId,
          primaryCta: cta,
          secondaryCta: cta,
        }),
      )
      .min(1, 'Add at least one slide')
      .max(8),
  }),
  logos: z.object({
    title: optionalText(120),
    items: z.array(z.object({ name: text(80).min(1), mediaId, href: href.nullable().optional() })).max(24),
  }),
  features_grid: z.object({
    title: optionalText(140),
    subtitle: optionalText(300),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
    items: z.array(z.object({ icon: optionalText(30), title: text(80).min(1), text: optionalText(300), href: href.nullable().optional() })).max(24),
  }),
  feature_rows: z.object({
    items: z
      .array(
        z.object({
          eyebrow: optionalText(60),
          title: text(140).min(1),
          text: optionalText(1000),
          bullets: z.array(text(120).min(1)).max(8).default([]),
          mediaId,
          cta,
          /** drawn screen when there is no image (empty = chosen from the topic) */
          mock: z.enum(MOCKS).nullable().optional(),
        }),
      )
      .max(12),
  }),
  stats: z.object({ items: z.array(z.object({ value: text(20).min(1), label: text(80).min(1) })).min(1).max(6) }),
  testimonials: z.object({
    title: optionalText(140),
    items: z
      .array(z.object({ quote: text(600).min(1), name: text(80).min(1), role: optionalText(80), company: optionalText(80), mediaId }))
      .max(12),
  }),
  cta: z.object({ title: text(140).min(1), text: optionalText(400), primaryCta: cta, secondaryCta: cta }),
  rich_text: z.object({
    title: optionalText(140),
    body: text(20_000), // markdown (rendered without raw HTML)
    align: z.enum(['left', 'center']).default('left'),
  }),
  pricing: z.object({
    title: optionalText(140),
    subtitle: optionalText(300),
    /** show the plan's limits (members, guests, projects) from Platform → Plans */
    showLimits: z.boolean().default(true),
    plans: z
      .array(
        z.object({
          planKey: text(30).min(1), // a key of the plans table — limits and name come from there
          priceLabel: text(30).min(1),
          period: optionalText(40),
          description: optionalText(200),
          highlight: z.boolean().default(false),
          badge: optionalText(30),
          features: z.array(text(120).min(1)).max(15).default([]),
          cta,
        }),
      )
      .max(6),
    footnote: optionalText(300),
  }),
  faq: z.object({
    title: optionalText(140),
    items: z.array(z.object({ question: text(200).min(1), answer: text(2000).min(1) })).max(30),
  }),
  steps: z.object({
    title: optionalText(140),
    subtitle: optionalText(300),
    items: z.array(z.object({ icon: optionalText(30), title: text(80).min(1), text: optionalText(300) })).min(1).max(6),
    cta,
  }),
  showcase: z.object({
    eyebrow: optionalText(60),
    title: optionalText(140),
    subtitle: optionalText(300),
    tabs: z
      .array(
        z.object({
          label: text(30).min(1),
          icon: optionalText(30),
          title: text(140).min(1),
          text: optionalText(600),
          bullets: z.array(text(120).min(1)).max(6).default([]),
          /** an uploaded screenshot wins over the drawn screen */
          mediaId,
          mock: z.enum(MOCKS).default('board'),
        }),
      )
      .min(1)
      .max(8),
  }),
  contact_form: z.object({
    title: optionalText(140),
    subtitle: optionalText(400),
    /** which topics the visitor can pick (the first one is selected by default) */
    topics: z.array(z.enum(INQUIRY_TYPES)).min(1).max(4),
    showCompany: z.boolean().default(true),
    showTeamSize: z.boolean().default(true),
    showPhone: z.boolean().default(false),
    successTitle: text(140).min(1),
    successText: optionalText(400),
    /** e.g. "Replies within 1 working day" — shown as a badge */
    responseTime: optionalText(60),
    /** "What happens next" — up to 4 short steps */
    nextSteps: z.array(text(120).min(1)).max(4).default([]),
    /** e.g. e-mail, phone, office hours — shown next to the form */
    contactPoints: z
      .array(z.object({ icon: optionalText(30), label: text(40).min(1), value: text(200).min(1), href: href.nullable().optional() }))
      .max(6)
      .default([]),
  }),
};

/** What a newly added section starts with (the editor then fills it in). */
export const SECTION_DEFAULTS: Record<SectionType, unknown> = {
  hero: {
    autoplaySeconds: 7,
    slides: [{ eyebrow: null, title: 'A new headline', subtitle: 'One sentence about why it matters.', mediaId: null,
      primaryCta: { label: 'Start free', href: '/register' }, secondaryCta: null }],
  },
  logos: { title: 'Trusted by', items: [] },
  features_grid: { title: 'Why teams choose us', subtitle: null, columns: 3, items: [{ icon: 'check', title: 'A benefit', text: 'Explain it in one sentence.' }] },
  feature_rows: { items: [{ eyebrow: null, title: 'A feature', text: 'Describe what it does and why it helps.', bullets: [], mediaId: null }] },
  stats: { items: [{ value: '99%', label: 'Something worth counting' }] },
  testimonials: { title: 'What customers say', items: [] },
  cta: { title: 'Ready to start?', text: null, primaryCta: { label: 'Start free', href: '/register' }, secondaryCta: null },
  rich_text: { title: null, body: 'Write anything here — **markdown** works.', align: 'left' },
  pricing: { title: 'Pricing', subtitle: null, showLimits: true, plans: [], footnote: null },
  faq: { title: 'Frequently asked questions', items: [{ question: 'A question?', answer: 'The answer.' }] },
  steps: {
    title: 'How it works', subtitle: null, cta: null,
    items: [{ icon: 'rocket', title: 'Step one', text: 'What happens first.' }, { icon: 'team', title: 'Step two', text: 'What happens next.' }],
  },
  showcase: {
    eyebrow: null, title: 'Take a look inside', subtitle: null,
    tabs: [{ label: 'Boards', icon: 'board', title: 'A screen of your product', text: 'Explain what people see here.', bullets: [], mediaId: null, mock: 'board' }],
  },
  contact_form: {
    title: 'Contact us', responseTime: null, nextSteps: [], subtitle: null, topics: ['question', 'demo', 'sales', 'support'], showCompany: true, showTeamSize: true, showPhone: false,
    successTitle: 'Thanks — we will get back to you soon', successText: null, contactPoints: [],
  },
};

/** Validates (and cleans) the content of one section. */
export function parseSectionContent(type: SectionType, content: unknown): Record<string, unknown> {
  return SECTION_SCHEMAS[type].parse(content) as Record<string, unknown>;
}

/** Every mediaId used anywhere inside a value (to check they exist, and before deleting an image). */
export function collectMediaIds(value: unknown, into = new Set<number>()): Set<number> {
  if (Array.isArray(value)) value.forEach((v) => collectMediaIds(v, into));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if ((k === 'mediaId' || k === 'logoMediaId') && typeof v === 'number') into.add(v);
      else collectMediaIds(v, into);
    }
  }
  return into;
}

// ---------------------------------------------------------------- header & footer
const link = z.object({ label: text(40).min(1), href });
export const settingsSchema = z.object({
  brandName: text(40).min(1),
  logoMediaId: mediaId,
  announcement: z.object({ enabled: z.boolean(), text: optionalText(160), href: href.nullable().optional() }),
  header: z.object({ loginLabel: text(30).min(1), ctaLabel: text(30).min(1), ctaHref: href }),
  footer: z.object({
    text: optionalText(300),
    /** buttons next to the brand in the footer */
    primaryCta: z.object({ label: text(40).min(1), href }).nullable().optional(),
    secondaryCta: z.object({ label: text(40).min(1), href }).nullable().optional(),
    columns: z.array(z.object({ title: text(40).min(1), links: z.array(link).max(10) })).max(5),
    copyright: optionalText(160), // {year} = the current year
  }),
  /** social profiles shown as icons in the footer */
  social: z
    .array(z.object({ network: z.enum(['linkedin', 'x', 'github', 'youtube', 'facebook', 'instagram']), href }))
    .max(6)
    .default([]),
});
export type WebsiteSettings = z.infer<typeof settingsSchema>;
