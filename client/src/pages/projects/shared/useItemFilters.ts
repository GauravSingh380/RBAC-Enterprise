// Filters of the list / board live in the URL (?types=bug&assignees=me …):
// bookmarkable, shareable, survive a refresh — and a saved view is just a stored URL query.
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

export const FILTER_KEYS = ['types', 'statusIds', 'assignees', 'priorities', 'labelIds', 'sprint'] as const

/** Query keys that are NOT part of a saved view (paging is per visit). */
const TRANSIENT_KEYS = ['page']

export function useItemFilters() {
  const [params, setParams] = useSearchParams()

  const update = (changes: Record<string, string | number | undefined | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v === undefined || v === null || v === '') next.delete(k)
      else next.set(k, String(v))
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }

  const listParam = (k: string) => params.get(k)?.split(',').filter(Boolean) ?? []
  const activeCount = FILTER_KEYS.filter((k) => params.get(k)).length + (params.get('q') ? 1 : 0)

  /** current filters as a plain object (what a saved view stores) */
  const snapshot = useMemo(
    () => Object.fromEntries([...params.entries()].filter(([k, v]) => v && !TRANSIENT_KEYS.includes(k))),
    [params],
  )

  const replaceAll = (filters: Record<string, string>) => setParams(new URLSearchParams(filters), { replace: true })
  const clear = () => update({ q: undefined, ...Object.fromEntries(FILTER_KEYS.map((k) => [k, undefined])) })

  return { params, update, listParam, activeCount, snapshot, replaceAll, clear }
}

export type ItemFilters = ReturnType<typeof useItemFilters>

export const sameFilters = (a: Record<string, string>, b: Record<string, string>) => {
  const ka = Object.keys(a).sort()
  const kb = Object.keys(b).sort()
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k])
}
