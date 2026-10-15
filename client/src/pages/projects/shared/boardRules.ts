// Pure helpers for boards and the backlog (no UI imports → cheap to unit test).
//
// Both screens are "columns of items": board columns = statuses, backlog sections = sprints.
// While dragging we move the item between columns locally (optimistic), and on drop we tell
// the server the new column plus the neighbours it landed between (prevId above, nextId below).

export type Columns<T> = Record<string, T[]>

/** dnd-kit ids: items use their numeric id, empty-column drop zones use "c:<columnKey>". */
export const columnDropId = (key: string) => `c:${key}`

export function findColumn<T extends { id: number }>(columns: Columns<T>, id: string | number): string | undefined {
  if (typeof id === 'string' && id.startsWith('c:')) return id.slice(2)
  return Object.keys(columns).find((k) => columns[k]!.some((i) => i.id === id))
}

/** Moves item `id` into column `to`, before the item `overId` (or to the end when over the column itself). */
export function moveToColumn<T extends { id: number }>(columns: Columns<T>, id: number, to: string, overId: string | number): Columns<T> {
  const from = findColumn(columns, id)
  if (!from || !columns[to]) return columns
  const item = columns[from]!.find((i) => i.id === id)!
  const target = columns[to]!.filter((i) => i.id !== id)
  const overIndex = target.findIndex((i) => i.id === overId)
  const index = overIndex >= 0 ? overIndex : target.length
  return {
    ...columns,
    [from]: columns[from]!.filter((i) => i.id !== id),
    [to]: [...target.slice(0, index), item, ...target.slice(index)],
  }
}

/** Re-orders inside one column: item `id` takes the place of `overId`. */
export function reorderInColumn<T extends { id: number }>(columns: Columns<T>, key: string, id: number, overId: string | number): Columns<T> {
  const list = columns[key]
  if (!list) return columns
  const from = list.findIndex((i) => i.id === id)
  const to = list.findIndex((i) => i.id === overId)
  if (from < 0 || to < 0 || from === to) return columns
  const next = [...list]
  next.splice(to, 0, next.splice(from, 1)[0]!)
  return { ...columns, [key]: next }
}

/** The items directly above and below `id` in its column — what the move API needs. */
export function neighbours<T extends { id: number }>(list: T[], id: number): { prevId: number | null; nextId: number | null } {
  const index = list.findIndex((i) => i.id === id)
  return { prevId: index > 0 ? list[index - 1]!.id : null, nextId: index >= 0 && index < list.length - 1 ? list[index + 1]!.id : null }
}

/** Groups items into columns, keeping every column (even empty ones) and the given item order. */
export function groupInto<T>(keys: string[], items: T[], keyOf: (item: T) => string): Columns<T> {
  const columns: Columns<T> = Object.fromEntries(keys.map((k) => [k, [] as T[]]))
  for (const item of items) columns[keyOf(item)]?.push(item)
  return columns
}

export const sumPoints = (items: { estimate: number | null; type?: string }[]) =>
  Math.round(items.reduce((s, i) => s + (i.type === 'subtask' ? 0 : (i.estimate ?? 0)), 0) * 10) / 10

/** Board column header: "4 / 3" turns red when the WIP limit is exceeded. */
export const isOverWip = (count: number, limit: number | null) => limit !== null && count > limit
