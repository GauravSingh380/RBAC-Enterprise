// Small pure helpers for the production error pages.

export const timeAgo = (iso: string, now = Date.now()) => {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export const STATUS_COLOR: Record<string, string> = { unresolved: 'error', resolved: 'success', ignored: 'default' }
