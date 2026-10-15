// Cleaning form values before they are saved (pure, unit tested).

type Json = unknown

/**
 * A button with an empty label or link means "no button" (null); undefined becomes null;
 * strings are trimmed (an empty optional text becomes null). Lists keep their order.
 */
export function cleanContent(value: Json, key = ''): Json {
  if (Array.isArray(value)) return value.map((v) => cleanContent(v)).filter((v) => v !== null && v !== undefined)
  if (value === undefined) return null
  if (typeof value === 'string') {
    const t = value.trim()
    return t === '' && key !== 'body' ? null : t
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, Json>
    if (/cta$/i.test(key)) {
      const label = typeof obj.label === 'string' ? obj.label.trim() : ''
      const href = typeof obj.href === 'string' ? obj.href.trim() : ''
      return label && href ? { label, href } : null
    }
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, cleanContent(v, k)]))
  }
  return value
}
