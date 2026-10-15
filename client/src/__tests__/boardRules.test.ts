import { describe, expect, it } from 'vitest'
import { columnDropId, findColumn, groupInto, isOverWip, moveToColumn, neighbours, reorderInColumn, sumPoints } from '../pages/projects/shared/boardRules'

const item = (id: number, estimate: number | null = null, type = 'task') => ({ id, estimate, type })
const cols = () => ({ todo: [item(1), item(2), item(3)], doing: [item(4)], done: [] as ReturnType<typeof item>[] })
const ids = (list: { id: number }[] | undefined) => list?.map((i) => i.id)

describe('board rules', () => {
  it('finds the column of an item or of a drop zone', () => {
    expect(findColumn(cols(), 4)).toBe('doing')
    expect(findColumn(cols(), columnDropId('done'))).toBe('done')
    expect(findColumn(cols(), 99)).toBeUndefined()
  })

  it('moves an item into another column before the hovered item, or to the end', () => {
    expect(ids(moveToColumn(cols(), 2, 'doing', 4).doing)).toEqual([2, 4])
    expect(ids(moveToColumn(cols(), 2, 'doing', columnDropId('doing')).doing)).toEqual([4, 2])
    const moved = moveToColumn(cols(), 1, 'done', columnDropId('done'))
    expect(ids(moved.todo)).toEqual([2, 3])
    expect(ids(moved.done)).toEqual([1])
  })

  it('re-orders inside a column', () => {
    expect(ids(reorderInColumn(cols(), 'todo', 3, 1).todo)).toEqual([3, 1, 2])
    expect(ids(reorderInColumn(cols(), 'todo', 1, 3).todo)).toEqual([2, 3, 1])
  })

  it('returns the neighbours the server needs', () => {
    const list = [item(1), item(2), item(3)]
    expect(neighbours(list, 1)).toEqual({ prevId: null, nextId: 2 })
    expect(neighbours(list, 2)).toEqual({ prevId: 1, nextId: 3 })
    expect(neighbours(list, 3)).toEqual({ prevId: 2, nextId: null })
    expect(neighbours([item(7)], 7)).toEqual({ prevId: null, nextId: null })
  })

  it('groups items keeping empty columns', () => {
    const grouped = groupInto(['a', 'b'], [{ k: 'a' }, { k: 'x' }, { k: 'a' }], (i) => i.k)
    expect(grouped).toEqual({ a: [{ k: 'a' }, { k: 'a' }], b: [] })
  })

  it('sums points without counting sub-tasks twice, and checks WIP limits', () => {
    expect(sumPoints([item(1, 3), item(2, 2.5), item(3, 8, 'subtask'), item(4)])).toBe(5.5)
    expect(isOverWip(4, 3)).toBe(true)
    expect(isOverWip(3, 3)).toBe(false)
    expect(isOverWip(30, null)).toBe(false)
  })
})
