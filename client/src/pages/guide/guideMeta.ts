// Small helpers of the Help Center (kept out of the .tsx files for react-refresh)

/** "the [[holiday]] calendar" → [{ text: 'the ', hit: false }, { text: 'holiday', hit: true }, { text: ' calendar', hit: false }] */
export function splitSnippet(snippet: string): { text: string; hit: boolean }[] {
  return snippet
    .split(/(\[\[[^\]]*\]\])/)
    .filter(Boolean)
    .map((part) => (part.startsWith('[[') && part.endsWith(']]') ? { text: part.slice(2, -2), hit: true } : { text: part, hit: false }))
}

/** Only a page of this app ("/leave", not "//evil.com" or "https://…") gets an "Open this page" button. */
export const isAppPath = (path: string | null | undefined): path is string => !!path && /^\/(?!\/)/.test(path)
