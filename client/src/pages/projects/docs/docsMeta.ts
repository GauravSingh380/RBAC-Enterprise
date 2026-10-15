// Docs helpers (pure, unit tested)
import type { PageSummary } from '../../../types/workspace'

export interface PageNode {
  key: number
  title: string
  children: PageNode[]
}

/** Flat pages → tree (by position, then title). Pages whose parent is missing become top-level. */
export function pageTree(pages: PageSummary[]): PageNode[] {
  const ids = new Set(pages.map((p) => p.id))
  const sorted = [...pages].sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
  const build = (parentId: number | null): PageNode[] =>
    sorted
      .filter((p) => (parentId === null ? p.parentId === null || !ids.has(p.parentId) : p.parentId === parentId))
      .map((p) => ({ key: p.id, title: p.title, children: build(p.id) }))
  return build(null)
}
