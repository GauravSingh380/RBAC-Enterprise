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

describe('contact form helpers', () => {
  it('pre-selects the topic from ?type= only when the form offers it', async () => {
    const { initialTopic } = await import('../website/websiteMeta')
    expect(initialTopic('demo', ['question', 'demo'])).toBe('demo')
    expect(initialTopic('sales', ['question', 'demo'])).toBe('question')
    expect(initialTopic(null, ['support'])).toBe('support')
  })
})

describe('website 4c helpers', () => {
  it('picks the drawn screen from a row topic', async () => {
    const { guessMock } = await import('../website/websiteMeta')
    expect(guessMock("Planning Sprints that fit your team's real week")).toBe('board')
    expect(guessMock('Quality Fixed means verified')).toBe('qa')
    expect(guessMock('Insights See the whole organization at a glance')).toBe('insights')
    expect(guessMock('People Teams, managers, leave and holidays')).toBe('leave')
    expect(guessMock('Knowledge Docs and calendar next to the work')).toBe('docs')
    expect(guessMock('Administration Roles, guests and security')).toBe('roles')
    expect(guessMock('Work items Every detail of the work, in one item')).toBe('item')
    expect(guessMock('Something completely different')).toBeUndefined()
  })

  it('groups consecutive FAQ sections into one help centre', async () => {
    const { groupFaqRuns } = await import('../website/websiteMeta')
    const s = (type: string, id: number) => ({ type, id })
    const out = groupFaqRuns([s('rich_text', 1), s('faq', 2), s('faq', 3), s('cta', 4), s('faq', 5)])
    expect(out).toEqual([s('rich_text', 1), [s('faq', 2), s('faq', 3)], s('cta', 4), s('faq', 5)])
  })
})
