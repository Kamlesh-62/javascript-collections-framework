// The reading half of the sorted set contract: ascending order, the ends, nearest-match queries,
// range and reversed views. `describeSortedSet` runs it first; read-only sorted sets run it alone.

import { describe, expect, it } from 'vitest'
import {
  isCollection,
  isList,
  isQueue,
  isSequencedCollection,
  isSetCollection,
  isSortedSet,
  NoSuchElementError,
} from '../../src/index'
import type { ReadonlySortedSet } from '../../src/interfaces/sorted-set'

/** Builds a new sorted set in ascending numeric order holding `initial`. */
export type ReadonlySortedSetFactory = (initial?: Iterable<number>) => ReadonlySortedSet<number>

const VALUES = [50, 10, 40, 20, 30]
const SORTED = [10, 20, 30, 40, 50]

export function describeReadonlySortedSet(name: string, make: ReadonlySortedSetFactory): void {
  describe(`${name} — sorted set contract`, () => {
    it('iterates its members in ascending order and prints them so', () => {
      const set = make(VALUES)
      expect([...set]).toEqual(SORTED)
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

    it('returns the ends, and throws NoSuchElementError naming the method when empty', () => {
      const set = make(VALUES)
      expect(set.getFirst()).toBe(10)
      expect(set.getLast()).toBe(50)
      for (const method of ['getFirst', 'getLast'] as const) {
        expect(() => make()[method]()).toThrow(NoSuchElementError)
        expect(() => make()[method]()).toThrow(new RegExp(`^${name}\\.${method}: `))
      }
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

    it('gives range views with inclusive flags', () => {
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
      expect([view.getFirst(), view.getLast(), view.size]).toEqual([20, 40, 3])
      expect(view.revision).toBe(set.revision)
    })

    it('reverses into a descending view whose reverse has the original order', () => {
      const reversed = make(VALUES).reversed()
      expect(reversed.toArray()).toEqual(SORTED.slice().reverse())
      expect(reversed.reversed().toArray()).toEqual(SORTED)
      expect(reversed.getFirst()).toBe(50)
      expect(reversed.lower(30)).toBe(40)
      expect(reversed.ceiling(35)).toBe(30)
      expect(reversed.headSet(30).toArray()).toEqual([50, 40])
      const comparator = reversed.comparator()
      expect((comparator as (a: number, b: number) => number)(1, 2)).toBeGreaterThan(0)
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
