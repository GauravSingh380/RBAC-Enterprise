// Picks the component for each section type (the same renderer is used by visitors and by the editor's preview).
import type { ReactNode } from 'react'
import type { Section } from '../types'
import { ContactFormSection } from './ContactForm'
import { PreviewContext } from './previewContext'
import {
  CtaSection, FaqSection, FeatureRowsSection, FeaturesGridSection, HeroSection, LogosSection, PricingSection, RichTextSection, StatsSection,
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
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** `preview`: inside the editor — forms don't send anything */
export function SectionList({ sections, preview = false }: { sections: Section[]; preview?: boolean }) {
  return (
    <PreviewContext.Provider value={preview}>
      {sections.map((s) => {
        const Render = RENDERERS[s.type]
        return Render ? <Render key={s.id} content={s.content} /> : null
      })}
    </PreviewContext.Provider>
  )
}
