// Picks the component for each section type (the same renderer is used by visitors and by the editor's preview).
import type { ReactNode } from 'react'
import type { FaqContent, Section } from '../types'
import { groupFaqRuns } from '../websiteMeta'
import { ContactFormSection } from './ContactForm'
import { FaqCenter, FaqSection } from './FaqCenter'
import { ShowcaseSection, StepsSection } from './Tour'
import { PreviewContext } from './previewContext'
import {
  CtaSection, FeatureRowsSection, FeaturesGridSection, HeroSection, LogosSection, PricingSection, RichTextSection, StatsSection,
  TestimonialsSection,
} from './Sections'

/* eslint-disable @typescript-eslint/no-explicit-any -- content shape is chosen by `type` (validated on the server) */
const RENDERERS: Record<Section['type'], (props: { content: any }) => ReactNode> = {
  hero: HeroSection,
  logos: LogosSection,
  features_grid: FeaturesGridSection,
  feature_rows: FeatureRowsSection,
  stats: StatsSection,
  testimonials: TestimonialsSection,
  cta: CtaSection,
  rich_text: RichTextSection,
  pricing: PricingSection,
  faq: FaqSection,
  contact_form: ContactFormSection,
  steps: StepsSection,
  showcase: ShowcaseSection,
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** `preview`: inside the editor — forms don't send anything */
export function SectionList({ sections, preview = false }: { sections: Section[]; preview?: boolean }) {
  return (
    <PreviewContext.Provider value={preview}>
      {/* several FAQ sections in a row become one searchable help centre */}
      {groupFaqRuns(sections).map((s) => {
        if (Array.isArray(s)) return <FaqCenter key={s[0]!.id} groups={s as unknown as Section<FaqContent>[]} />
        const Render = RENDERERS[s.type]
        return Render ? <Render key={s.id} content={s.content} /> : null
      })}
    </PreviewContext.Provider>
  )
}
