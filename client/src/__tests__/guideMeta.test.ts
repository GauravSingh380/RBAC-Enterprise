import { describe, expect, it } from 'vitest'
import { isAppPath, splitSnippet } from '../pages/guide/guideMeta'

describe('help center helpers', () => {
  it('splits a search snippet into plain and highlighted parts', () => {
    expect(splitSnippet('the [[holiday]] calendar and [[holidays]]')).toEqual([
      { text: 'the ', hit: false },
      { text: 'holiday', hit: true },
      { text: ' calendar and ', hit: false },
      { text: 'holidays', hit: true },
    ])
    expect(splitSnippet('no match')).toEqual([{ text: 'no match', hit: false }])
  })

  it('only accepts pages of this app for "Open this page"', () => {
    expect(isAppPath('/leave')).toBe(true)
    expect(isAppPath('/notifications?tab=settings')).toBe(true)
    expect(isAppPath('//evil.example')).toBe(false)
    expect(isAppPath('https://example.com')).toBe(false)
    expect(isAppPath(null)).toBe(false)
  })
})
