// Drag & drop between columns (board) or sections (backlog) with @dnd-kit.
//
//   const dnd = useDragColumns(grouped, async ({ item, to, prevId, nextId }) => { await api… })
//   <DndContext sensors={dnd.sensors} {...dnd.handlers}> … dnd.columns … </DndContext>
//
// While dragging, the item moves between columns locally (it follows the pointer); on drop
// `onDrop` saves it. The optimistic layout stays until fresh data arrives; on error it reverts.
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useState } from 'react'
import { findColumn, moveToColumn, neighbours, reorderInColumn, type Columns } from './boardRules'

export interface DropResult<T> {
  item: T
  from: string
  to: string
  prevId: number | null
  nextId: number | null
}

interface DragState<T> {
  /** the grouped data this local layout was made from — new data from the server replaces it */
  source: Columns<T> | null
  columns: Columns<T>
  activeId: number | null
  from: string | null
}

export function useDragColumns<T extends { id: number }>(source: Columns<T> | null, onDrop: (result: DropResult<T>) => Promise<void>) {
  const [drag, setDrag] = useState<DragState<T> | null>(null)
  const columns = drag && drag.source === source ? drag.columns : (source ?? {})
  const activeId = drag && drag.source === source ? drag.activeId : null

  // 5px before a drag starts, so a click on a card still opens it
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragStart = ({ active }: DragStartEvent) => {
    const id = Number(active.id)
    setDrag({ source, columns, activeId: id, from: findColumn(columns, id) ?? null })
  }

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || !drag) return
    const id = Number(active.id)
    const from = findColumn(drag.columns, id)
    const to = findColumn(drag.columns, over.id)
    if (!from || !to || from === to) return
    setDrag({ ...drag, columns: moveToColumn(drag.columns, id, to, over.id) })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!drag || !over || !drag.from) return setDrag(null)
    const id = Number(active.id)
    const to = findColumn(drag.columns, over.id)
    if (!to) return setDrag(null)
    const next = reorderInColumn(drag.columns, to, id, over.id)
    const list = next[to]!
    const item = list.find((i) => i.id === id)!
    const { prevId, nextId } = neighbours(list, id)

    const original = drag.source?.[drag.from] ?? []
    const unchanged = drag.from === to && original.findIndex((i) => i.id === id) === list.findIndex((i) => i.id === id)
    if (unchanged) return setDrag(null)

    setDrag({ ...drag, columns: next, activeId: null })
    onDrop({ item, from: drag.from, to, prevId, nextId }).catch(() => setDrag(null)) // revert on failure
  }

  const activeItem = activeId !== null ? Object.values(columns).flat().find((i) => i.id === activeId) ?? null : null

  return {
    columns,
    activeItem,
    isDragging: activeId !== null,
    sensors,
    handlers: { onDragStart, onDragOver, onDragEnd, onDragCancel: () => setDrag(null) },
  }
}
