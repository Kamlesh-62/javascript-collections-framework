// The contract every sorted set keeps on top of the set and sequenced contracts: ascending order,
// the ends, nearest-match queries, removal from either end, live range views with inclusive
// flags, and reversed views. Each implementation's test file runs it through `describeSortedSet`.

import { describe, expect, it } from 'vitest'
import { isSortedSet } from '../../src/functions/guards'
import {
  ConcurrentModificationError,
  IllegalArgumentError,
  isCollection,
  isList,
  isQueue,
  isSequencedCollection,
  isSetCollection,
  NoSuchElementError,
  UnsupportedOperationError,
} from '../../src/index'
import type { SortedSet } from '../../src/interfaces/sorted-set'

/**
 * Builds a new sorted set in ascending numeric order holding `initial`. It must accept every
 * number from -1000 to 1000.
 */
export type SortedSetFactory = (initial?: Iterable<number>) => SortedSet<number>

function caught(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

const VALUES = [50, 10, 40, 20, 30]
const SORTED = [10, 20, 30, 40, 50]

export interface SortedSetContractOptions {
  /**
   * Puts a member into the set some other way than `add`, for a view that cannot add (a sorted
   * map's key set, filled through its map). `range` names the range view of the set the element
   * goes through, as `[from, to]` with the default flags; the factory's set when omitted. With it,
   * `add`, `addAll`, `addFirst` and `addLast` must throw `UnsupportedOperationError`.
   */
  insert?: (
    set: SortedSet<number>,
    element: number,
    range?: readonly [from: number, to: number],
  ) => void
}

export function describeSortedSet(
  name: string,
  make: SortedSetFactory,
  options: SortedSetContractOptions = {},
): void {
  const insert = options.insert
  /** Puts `element` into `set`, or into its range view `[from, to)` given as `range`. */
  const put = (
    set: SortedSet<number>,
    element: number,
    range?: readonly [from: number, to: number],
  ): void => {
    if (insert) insert(set, element, range)
    else if (range) set.subSet(range[0], range[1]).add(element)
    else set.add(element)
  }
  describe(`${name} — sorted set contract`, () => {
    it('iterates its members in ascending order whatever the insertion order', () => {
      expect([...make(VALUES)]).toEqual(SORTED)
      const set = make()
      for (const v of VALUES) put(set, v)
      expect(set.toArray()).toEqual(SORTED)
      expect([...set.keys()]).toEqual(SORTED)
      expect(String(set)).toBe(`${name}(5) {10, 20, 30, 40, 50}`)
    })

    it('reports a comparator consistent with its order', () => {
      const comparator = make().comparator()
      if (comparator !== undefined) {
        expect(comparator(1, 2)).toBeLessThan(0)
        expect(comparator(2, 1)).toBeGreaterThan(0)
        expect(comparator(2, 2)).toBe(0)
      }
    })

    it('returns the ends and throws NoSuchElementError naming the method when empty', () => {
      const set = make(VALUES)
      expect(set.getFirst()).toBe(10)
      expect(set.getLast()).toBe(50)
      const empty = make()
      for (const method of ['getFirst', 'getLast', 'removeFirst', 'removeLast'] as const) {
        const error = caught(() => empty[method]()) as Error
        expect(error, method).toBeInstanceOf(NoSuchElementError)
        expect(error.message.startsWith(`${name}.${method}: `), error.message).toBe(true)
      }
      expect(empty.pollFirst()).toBeUndefined()
      expect(empty.pollLast()).toBeUndefined()
    })

    it('answers lower, floor, ceiling and higher like a sorted array', () => {
      const set = make(VALUES)
      for (let probe = 0; probe <= 60; probe += 5) {
        expect(set.lower(probe), `lower(${probe})`).toBe(SORTED.filter((v) => v < probe).pop())
        expect(set.floor(probe), `floor(${probe})`).toBe(SORTED.filter((v) => v <= probe).pop())
        expect(set.ceiling(probe), `ceiling(${probe})`).toBe(SORTED.find((v) => v >= probe))
        expect(set.higher(probe), `higher(${probe})`).toBe(SORTED.find((v) => v > probe))
      }
    })

    it('polls and removes from both ends', () => {
      const set = make(VALUES)
      expect(set.pollFirst()).toBe(10)
      expect(set.pollLast()).toBe(50)
      expect(set.removeFirst()).toBe(20)
      expect(set.removeLast()).toBe(40)
      expect(set.toArray()).toEqual([30])
    })

    it('refuses addFirst and addLast with UnsupportedOperationError, changing nothing', () => {
      const set = make([2])
      const revision = set.revision
      expect(() => set.addFirst(1)).toThrow(UnsupportedOperationError)
      expect(() => set.addLast(3)).toThrow(UnsupportedOperationError)
      expect(set.toArray()).toEqual([2])
      expect(set.revision).toBe(revision)
    })

    it.skipIf(!!insert)('keeps the member already present when an equal one is added', () => {
      const set = make([1, 2])
      const revision = set.revision
      expect(set.add(2)).toBe(set)
      expect(set.revision).toBe(revision)
      expect(set.size).toBe(2)
    })

    it.skipIf(!insert)(
      'refuses add (even of a member), addAll, addFirst and addLast with UnsupportedOperationError, changing nothing',
      () => {
        const set = make([1, 2])
        const revision = set.revision
        expect(() => set.add(2)).toThrow(UnsupportedOperationError)
        expect(() => set.add(3)).toThrow(UnsupportedOperationError)
        expect(() => set.addAll([3])).toThrow(UnsupportedOperationError)
        expect(() => set.addFirst(0)).toThrow(UnsupportedOperationError)
        expect(() => set.addLast(9)).toThrow(UnsupportedOperationError)
        expect(set.toArray()).toEqual([1, 2])
        expect(set.revision).toBe(revision)
      },
    )

    it('gives live range views with inclusive flags', () => {
      const set = make(VALUES)
      expect(set.subSet(20, 40).toArray()).toEqual([20, 30])
      expect(set.subSet(20, 40, { fromInclusive: false, toInclusive: true }).toArray()).toEqual([
        30, 40,
      ])
      expect(set.headSet(30).toArray()).toEqual([10, 20])
      expect(set.headSet(30, { inclusive: true }).toArray()).toEqual([10, 20, 30])
      expect(set.tailSet(30).toArray()).toEqual([30, 40, 50])
      expect(set.tailSet(30, { inclusive: false }).toArray()).toEqual([40, 50])
      const view = set.subSet(15, 45)
      put(set, 25)
      expect(view.toArray()).toEqual([20, 25, 30, 40])
      view.delete(30)
      expect(set.has(30)).toBe(false)
      put(set, 35, [15, 45])
      expect(set.has(35)).toBe(true)
      expect(view.size).toBe(4)
      expect(view.getFirst()).toBe(20)
      expect(view.getLast()).toBe(40)
      expect(view.revision).toBe(set.revision)
      expect(isSortedSet(view)).toBe(true)
    })

    it('refuses out-of-range additions, inverted ranges and invalid options', () => {
      const set = make(VALUES)
      const view = set.subSet(20, 40)
      expect(() => put(set, 45, [20, 40])).toThrow(IllegalArgumentError)
      expect(view.has(50)).toBe(false)
      expect(view.delete(50)).toBe(false)
      expect(set.size).toBe(5)
      expect(() => set.subSet(40, 20)).toThrow(IllegalArgumentError)
      expect(() => view.tailSet(10)).toThrow(IllegalArgumentError)
      expect(() => set.subSet(1, 2, 5 as never)).toThrow(TypeError)
      expect(() => set.headSet(1, { inclusive: 'yes' } as never)).toThrow(TypeError)
    })

    it('reverses into a live descending view whose reverse has the original order', () => {
      const set = make(VALUES)
      const reversed = set.reversed()
      expect(reversed.toArray()).toEqual(SORTED.slice().reverse())
      expect(reversed.reversed().toArray()).toEqual(SORTED)
      expect(reversed.getFirst()).toBe(50)
      expect(reversed.lower(30)).toBe(40)
      expect(reversed.ceiling(35)).toBe(30)
      expect(reversed.headSet(30).toArray()).toEqual([50, 40])
      expect(reversed.pollFirst()).toBe(50)
      expect(set.getLast()).toBe(40)
      const comparator = reversed.comparator()
      expect(typeof comparator).toBe('function')
      expect((comparator as (a: number, b: number) => number)(1, 2)).toBeGreaterThan(0)
      const cursor = reversed.cursor()
      expect(cursor.next()).toBe(40)
      cursor.remove()
      expect(set.toArray()).toEqual([10, 20, 30])
    })

    it('fails fast when changed during iteration', () => {
      const set = make(VALUES)
      expect(() => {
        for (const v of set) if (v === 20) put(set, 25)
      }).toThrow(ConcurrentModificationError)
    })

    it('is recognised as a sorted, sequenced set and not as a list or queue', () => {
      const set = make([1])
      expect(isSortedSet(set)).toBe(true)
      expect(isSetCollection(set)).toBe(true)
      expect(isSequencedCollection(set)).toBe(true)
      expect(isCollection(set)).toBe(true)
      expect(isList(set)).toBe(false)
      expect(isQueue(set)).toBe(false)
      expect(isSortedSet(set.reversed())).toBe(true)
      expect(isSortedSet(set.headSet(1))).toBe(true)
    })
  })
}
