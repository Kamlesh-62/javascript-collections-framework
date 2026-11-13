import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { ArrayList } from '../src/collections/array-list'
import { isCollection, isList, isSequencedCollection } from '../src/functions/guards'
import {
  ConcurrentModificationError,
  equals,
  equalsSymbol,
  hashCode,
  IllegalArgumentError,
  IndexOutOfBoundsError,
} from '../src/index'
import type { List } from '../src/interfaces/list'
import { describeCollection } from './contracts/collection'
import { describeList } from './contracts/list'
import { describeSequencedCollection } from './contracts/sequenced'
import { combine } from './fixtures/structural-list'
import { ALL_LISTS } from './support/list-factories'
import { runListReferenceModel } from './support/reference-model'

function caught(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i)
}

/** Every call a stale view must refuse. */
const STALE_CALLS: ReadonlyArray<[string, (view: List<number>) => unknown]> = [
  ['size', (v) => v.size],
  ['isEmpty', (v) => v.isEmpty()],
  ['get', (v) => v.get(0)],
  ['getFirst', (v) => v.getFirst()],
  ['getLast', (v) => v.getLast()],
  ['has', (v) => v.has(1)],
  ['indexOf', (v) => v.indexOf(1)],
  ['lastIndexOf', (v) => v.lastIndexOf(1)],
  ['toArray', (v) => v.toArray()],
  ['toJSON', (v) => v.toJSON()],
  ['toString', (v) => v.toString()],
  ['forEach', (v) => v.forEach(() => {})],
  ['iterator', (v) => v[Symbol.iterator]()],
  ['cursor', (v) => v.cursor()],
  ['listCursor', (v) => v.listCursor()],
  ['subList', (v) => v.subList(0, 0)],
  ['reversed', (v) => v.reversed()],
  ['equals', (v) => v.equals(v)],
  ['hash', (v) => hashCode(v)],
  ['add', (v) => v.add(9)],
  ['addFirst', (v) => v.addFirst(9)],
  ['addLast', (v) => v.addLast(9)],
  ['insert', (v) => v.insert(0, 9)],
  ['insertAll', (v) => v.insertAll(0, [9])],
  ['addAll', (v) => v.addAll([9])],
  ['set', (v) => v.set(0, 9)],
  ['removeAt', (v) => v.removeAt(0)],
  ['removeFirst', (v) => v.removeFirst()],
  ['removeLast', (v) => v.removeLast()],
  ['delete', (v) => v.delete(1)],
  ['removeAll', (v) => v.removeAll([1])],
  ['retainAll', (v) => v.retainAll([1])],
  ['removeIf', (v) => v.removeIf(() => true)],
  ['clear', (v) => v.clear()],
  ['replaceAll', (v) => v.replaceAll((n) => n)],
  ['sort', (v) => v.sort()],
]

describe('sub-list views', () => {
  it('shows the elements of [from, to) [006 S5-AC1]', () => {
    const list = new ArrayList(range(6))
    expect(list.subList(1, 4).toArray()).toEqual([1, 2, 3])
    expect(list.subList(0, 6).toArray()).toEqual(range(6))
    expect(list.subList(3, 3).toArray()).toEqual([])
    expect(list.subList(6, 6).size).toBe(0)
    expect(list.subList(2, 5).get(0)).toBe(2)
  })

  it('rejects bad bounds with IndexOutOfBoundsError, from > to with IllegalArgumentError [006 S5-AC2]', () => {
    const list = new ArrayList(range(3))
    expect(() => list.subList(-1, 2)).toThrow(IndexOutOfBoundsError)
    expect(() => list.subList(0, 4)).toThrow(IndexOutOfBoundsError)
    expect(() => list.subList(2, 1)).toThrow(IllegalArgumentError)
    expect((caught(() => list.subList(2, 1)) as Error).message).toBe(
      'ArrayList.subList: from 2 is greater than to 1 for size 3',
    )
    const view = list.subList(1, 3)
    expect(() => view.subList(0, 3)).toThrow(IndexOutOfBoundsError)
    expect((caught(() => view.get(2)) as Error).message).toBe(
      'SubList.get: index 2 is out of bounds for size 2',
    )
  })

  it('applies every change to the parent at the mapped positions, with view-relative indexes [006 S5-AC3]', () => {
    const list = new ArrayList(range(8))
    const view = list.subList(2, 6) // [2, 3, 4, 5]
    view.set(0, 20)
    view.add(60)
    view.insert(1, 21)
    view.addFirst(19)
    expect(list.toArray()).toEqual([0, 1, 19, 20, 21, 3, 4, 5, 60, 6, 7])
    expect(view.removeAt(1)).toBe(20)
    expect(view.removeLast()).toBe(60)
    expect(view.delete(4)).toBe(true)
    expect(view.toArray()).toEqual([19, 21, 3, 5])
    expect(view.removeIf((_n, i, self) => i === 0 && self === view)).toBe(true)
    view.replaceAll((n, i, self) => (self === view ? n * 10 + i : n))
    expect(view.toArray()).toEqual([210, 31, 52])
    view.sort(() => -1)
    view.insertAll(1, [7, 8])
    expect(list.toArray()).toEqual([0, 1, ...view.toArray(), 6, 7])
    const indexes: number[] = []
    view.forEach((_, i, self) => {
      if (self === view) indexes.push(i)
    })
    expect(indexes).toEqual([0, 1, 2, 3, 4])
    view.clear()
    expect(list.toArray()).toEqual([0, 1, 6, 7])
    expect(view.size).toBe(0)
  })

  it('shows replacements made on the parent [006 S5-AC4]', () => {
    const list = new ArrayList(range(5))
    const view = list.subList(1, 4)
    list.set(2, 99)
    list.replaceAll((n) => n + 1)
    expect(view.toArray()).toEqual([2, 100, 4])
  })

  it('goes stale when the parent changes structurally other than through it [006 S5-AC5]', () => {
    for (const [name, call] of STALE_CALLS) {
      const list = new ArrayList(range(5))
      const view = list.subList(1, 4)
      list.add(5)
      const error = caught(() => call(view))
      expect(error, name).toBeInstanceOf(ConcurrentModificationError)
    }
    const list = new ArrayList(range(5))
    const view = list.subList(1, 4)
    const holder = new ArrayList<unknown>([view])
    list.removeFirst()
    expect(view.revision).toBe(list.revision)
    expect(Object.prototype.toString.call(view)).toBe('[object SubList]')
    expect(isCollection(view)).toBe(true)
    expect(isList(view)).toBe(true)
    expect(isSequencedCollection(view)).toBe(true)
    expect(inspect(view)).toBe('SubList <stale>')
    expect(() => new ArrayList([1, 2, 3]).equals(view)).toThrow(ConcurrentModificationError)
    expect(() => String(holder)).toThrow(ConcurrentModificationError)
    expect(() => view[equalsSymbol](view)).toThrow(ConcurrentModificationError)
    expect(() => equals(view, new ArrayList([1]))).toThrow(ConcurrentModificationError)
  })

  it('a cursor over a stale sub-list still answers hasNext without throwing [006 S4-AC10]', () => {
    const list = new ArrayList(range(4))
    const cursor = list.subList(1, 3).listCursor()
    list.add(4)
    expect(cursor.hasNext()).toBe(false)
    expect(cursor.hasPrevious()).toBe(false)
    expect(() => cursor.next()).toThrow(ConcurrentModificationError)
  })

  it('a stale view reports staleness before checking arguments or reading them [006 S5-AC5]', () => {
    let read = false
    const tracking = {
      [Symbol.iterator]() {
        read = true
        return [1][Symbol.iterator]()
      },
    }
    const calls: Array<(v: List<number>) => unknown> = [
      (v) => v.forEach(1 as never),
      (v) => v.removeIf(1 as never),
      (v) => v.replaceAll(1 as never),
      (v) => v.sort(1 as never),
      (v) => v.addAll(tracking),
      (v) => v.removeAll(tracking),
      (v) => v.retainAll(tracking),
      (v) => v.insertAll(0, tracking),
    ]
    for (const call of calls) {
      const list = new ArrayList(range(4))
      const view = list.subList(0, 2)
      list.add(9)
      expect(() => call(view)).toThrow(ConcurrentModificationError)
    }
    expect(read).toBe(false)
  })

  it('every view in a chain goes stale after an outside change [006 S5-AC5] [006 S6-AC4]', () => {
    const list = new ArrayList(range(10))
    const outer = list.subList(1, 9)
    const outerReversed = outer.reversed()
    const middle = outerReversed.subList(1, 7)
    const middleReversed = middle.reversed()
    const inner = middleReversed.subList(0, 3)
    const chain = [outer, outerReversed, middle, middleReversed, inner]
    expect(inner.toArray()).toEqual([2, 3, 4])
    list.removeFirst()
    for (const view of chain) {
      expect(() => view.size).toThrow(ConcurrentModificationError)
      expect(() => view.get(0)).toThrow(ConcurrentModificationError)
      expect(view.revision).toBe(list.revision)
      expect(isList(view)).toBe(true)
      expect(inspect(view)).toMatch(/^(SubList|ReversedList) <stale>$/)
    }
  })

  it('nests to any depth without growing the call stack [006 S5-AC6]', () => {
    const n = 50_000
    const list = new ArrayList(range(n))
    let rest: List<number> = list
    let sum = 0
    while (!rest.isEmpty()) {
      sum += rest.getFirst()
      rest = rest.subList(1, rest.size)
    }
    expect(sum).toBe((n * (n - 1)) / 2)
    let deep: List<number> = list
    for (let i = 0; i < n; i++) deep = i % 2 === 0 ? deep.subList(0, deep.size) : deep.reversed()
    expect(deep.get(0)).toBe(0)
    deep.add(-1)
    expect(list.size).toBe(n + 1)
    expect(deep.size).toBe(n + 1)
  })

  it('a sub-list of a sub-list reaches the original list [006 S5-AC6]', () => {
    const list = new ArrayList(range(10))
    const outer = list.subList(2, 8)
    const inner = outer.subList(1, 4) // [3, 4, 5]
    inner.removeAt(1)
    inner.add(50)
    expect(list.toArray()).toEqual([0, 1, 2, 3, 5, 50, 6, 7, 8, 9])
    expect(inner.toArray()).toEqual([3, 5, 50])
  })

  it('keeps the chain valid and makes siblings and other iterators stale [006 S5-AC8]', () => {
    const list = new ArrayList(range(10))
    const outer = list.subList(1, 9)
    const middle = outer.subList(1, 7)
    const inner = middle.subList(1, 5)
    const sibling = list.subList(0, 2)
    const innerSibling = middle.subList(0, 1)
    const rootIterator = list[Symbol.iterator]()
    const outerIterator = outer[Symbol.iterator]()
    const innerIterator = inner[Symbol.iterator]()
    const cursor = inner.listCursor()
    cursor.next()
    cursor.remove()
    expect(cursor.next()).toBe(4)
    inner.add(100)
    expect(outer.size).toBe(8)
    expect(middle.size).toBe(6)
    expect(inner.size).toBe(4)
    expect(list.toArray()).toEqual([0, 1, 2, 4, 5, 6, 100, 7, 8, 9])
    for (const stale of [sibling, innerSibling]) {
      expect(() => stale.size).toThrow(ConcurrentModificationError)
    }
    for (const iterator of [rootIterator, outerIterator, innerIterator]) {
      expect(() => iterator.next()).toThrow(ConcurrentModificationError)
    }
    expect(() => cursor.next()).toThrow(ConcurrentModificationError)
  })

  it('reports the root revision and the SubList tag [006 S5-AC9]', () => {
    const list = new ArrayList(range(5))
    const view = list.subList(1, 3)
    expect(view.revision).toBe(list.revision)
    list.set(0, 9)
    expect(view.revision).toBe(list.revision)
    view.add(7)
    expect(view.revision).toBe(list.revision)
    expect(String(view)).toBe('SubList(3) [1, 2, 7]')
    expect(inspect(view)).toBe('SubList(3) [ 1, 2, 7 ]')
    expect(Object.prototype.toString.call(view)).toBe('[object SubList]')
    expect((caught(() => view.removeAt(9)) as Error).message).toBe(
      'SubList.removeAt: index 9 is out of bounds for size 3',
    )
  })
})

// Contract suites for sub-lists, nested and over reversed views.
for (const [name, make] of ALL_LISTS.filter(([kind]) => kind === 'SubList')) {
  const peers = ALL_LISTS.map(([, peer]) => peer).filter((peer) => peer !== make)
  describeCollection(name, make as never, {
    iteration: 'fail-fast',
    brackets: 'list',
    replace: (c, index, value) => (c as List<unknown>).set(index, value),
    peers: peers as never,
    structural: { expectedHash: combine },
  })
  describeSequencedCollection(name, make)
  describeList(name, make, peers)
}

describe('sub-list views — reference model', () => {
  it('matches a native array under seeded random operations [006 S5-AC7] [006 S8-AC5]', () => {
    for (const seed of [4, 5]) {
      runListReferenceModel({
        seed,
        steps: 400,
        make: () => new ArrayList<number>([-1, -2]).subList(1, 1) as List<number>,
      })
    }
  })
})
