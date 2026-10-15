import { describe, expect, it } from 'vitest'
import { cleanContent } from '../website/admin/formMeta'
import { fillYear, isInternalHref, limitLines, SAFE_HREF, sectionSummary } from '../website/websiteMeta'

describe('website helpers', () => {
  it('accepts only safe links', () => {
    for (const ok of ['/pricing', 'https://example.com/x', 'mailto:hi@example.com', '#faq']) expect(SAFE_HREF.test(ok)).toBe(true)
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x', 'pricing']) expect(SAFE_HREF.test(bad)).toBe(false)
    expect(isInternalHref('/features')).toBe(true)
    expect(isInternalHref('//evil.example')).toBe(false)
  })

  it('describes plan limits and fills the year', () => {
    expect(limitLines({ key: 'free', name: 'Free', description: null, limits: { members: 10, guests: 0, projects: null } })).toEqual([
      'Up to 10 members', 'No guests', 'Unlimited active projects',
    ])
    expect(fillYear('© {year} Team-Flex', 2027)).toBe('© 2027 Team-Flex')
  })

  it('summarises sections for the editor list', () => {
    expect(sectionSummary('hero', { slides: [{ title: 'Ship faster' }, { title: 'b' }, { title: 'c' }] })).toBe('Ship faster (+2 more slides)')
    expect(sectionSummary('pricing', { title: 'Pricing', plans: [{}, {}] })).toBe('Pricing · 2 plan(s)')
    expect(sectionSummary('faq', { title: 'FAQ', items: [{}] })).toBe('FAQ · 1 item(s)')
  })

  it('cleans form values: empty buttons become null, texts are trimmed, empty list entries dropped', () => {
    expect(
      cleanContent({
        title: '  Hello ',
        subtitle: '',
        primaryCta: { label: 'Go', href: '/register' },
        secondaryCta: { label: '', href: '/x' },
        mediaId: undefined,
        bullets: ['a', ' ', 'b'],
        body: '',
      }),
    ).toEqual({ title: 'Hello', subtitle: null, primaryCta: { label: 'Go', href: '/register' }, secondaryCta: null, mediaId: null, bullets: ['a', 'b'], body: '' })
  })
})
