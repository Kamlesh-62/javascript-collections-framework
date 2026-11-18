// The reading half of the sorted map contract: key order, the comparator, the ends and nearest
// entries, range and reversed views, and the key set as a sorted set. `describeSortedMap` runs it
// first; read-only sorted maps run it alone.

import { describe, expect, it } from 'vitest'
import {
  isCollection,
  isMapCollection,
  isSortedMap,
  isSortedSet,
  type MapEntry,
} from '../../src/index'
import type { ReadonlySortedMap } from '../../src/interfaces/sorted-map'

/** Builds a new sorted map in ascending numeric key order holding `initial`. */
export type ReadonlySortedMapFactory = (
  initial?: Iterable<readonly [number, string]>,
) => ReadonlySortedMap<number, string>

const KEYS = [50, 10, 40, 20, 30]
const SORTED = [10, 20, 30, 40, 50]

function pairs(keys: number[]): Array<[number, string]> {
  return keys.map((k): [number, string] => [k, `v${k}`])
}

function keyOf(entry: MapEntry<number, string> | undefined): number | undefined {
  return entry === undefined ? undefined : entry.key
}

export function describeReadonlySortedMap(name: string, make: ReadonlySortedMapFactory): void {
  const filled = () => make(pairs(KEYS))

  describe(`${name} — sorted map contract`, () => {
    it('iterates its mappings in ascending key order and prints them so', () => {
      const map = filled()
      expect([...map.keys()]).toEqual(SORTED)
      expect([...map]).toEqual(pairs(SORTED))
      expect([...map.values()]).toEqual(SORTED.map((k) => `v${k}`))
      expect(String(make(pairs([2, 1])))).toBe(`${name}(2) {1 => 'v1', 2 => 'v2'}`)
    })

    it('reports a comparator consistent with its order', () => {
      const comparator = make().comparator()
      if (comparator !== undefined) {
        expect(comparator(1, 2)).toBeLessThan(0)
        expect(comparator(2, 1)).toBeGreaterThan(0)
        expect(comparator(2, 2)).toBe(0)
      }
    })

    it('returns the first, last and nearest entries like a sorted array, or undefined', () => {
      const map = filled()
      expect(keyOf(map.firstEntry())).toBe(10)
      expect(keyOf(map.lastEntry())).toBe(50)
      expect(map.firstEntry()?.value).toBe('v10')
      for (let probe = 0; probe <= 60; probe += 5) {
        expect(keyOf(map.lowerEntry(probe)), `lower ${probe}`).toBe(
          SORTED.filter((k) => k < probe).pop(),
        )
        expect(keyOf(map.floorEntry(probe)), `floor ${probe}`).toBe(
          SORTED.filter((k) => k <= probe).pop(),
        )
        expect(keyOf(map.ceilingEntry(probe)), `ceiling ${probe}`).toBe(
          SORTED.find((k) => k >= probe),
        )
        expect(keyOf(map.higherEntry(probe)), `higher ${probe}`).toBe(SORTED.find((k) => k > probe))
      }
      const empty = make()
      expect(empty.firstEntry()).toBeUndefined()
      expect(empty.lastEntry()).toBeUndefined()
      expect(empty.floorEntry(1)).toBeUndefined()
    })

    it('gives range views with inclusive flags that share revision', () => {
      const map = filled()
      const flags: Array<[boolean, boolean, number[]]> = [
        [true, false, [20, 30]],
        [true, true, [20, 30, 40]],
        [false, false, [30]],
        [false, true, [30, 40]],
      ]
      for (const [fromInclusive, toInclusive, expected] of flags) {
        expect([...map.subMap(20, 40, { fromInclusive, toInclusive }).keys()]).toEqual(expected)
      }
      expect([...map.headMap(30).keys()]).toEqual([10, 20])
      expect([...map.headMap(30, { inclusive: true }).keys()]).toEqual([10, 20, 30])
      expect([...map.tailMap(30).keys()]).toEqual([30, 40, 50])
      expect([...map.tailMap(30, { inclusive: false }).keys()]).toEqual([40, 50])
      const view = map.subMap(15, 45)
      expect(view.revision).toBe(map.revision)
      expect(view.get(50)).toBeUndefined()
      expect(view.has(10)).toBe(false)
      expect(isSortedMap(view)).toBe(true)
    })

    it('reverses into a descending view whose reverse has the original order', () => {
      const reversed = filled().reversed()
      expect([...reversed.keys()]).toEqual(SORTED.slice().reverse())
      expect([...reversed.reversed().keys()]).toEqual(SORTED)
      expect(keyOf(reversed.firstEntry())).toBe(50)
      expect(keyOf(reversed.lowerEntry(30))).toBe(40)
      expect(keyOf(reversed.ceilingEntry(35))).toBe(30)
      expect([...reversed.headMap(30).keys()]).toEqual([50, 40])
      const comparator = reversed.comparator()
      expect((comparator as (a: number, b: number) => number)(1, 2)).toBeGreaterThan(0)
    })

    it('gives a key set that is a sorted set of the keys in its order', () => {
      const map = filled()
      const keys = map.keySet()
      expect(isSortedSet(keys)).toBe(true)
      expect(keys.toArray()).toEqual(SORTED)
      expect(keys.floor(35)).toBe(30)
      expect(keys.reversed().getFirst()).toBe(50)
      expect(map.reversed().keySet().toArray()).toEqual(SORTED.slice().reverse())
    })

    it('is recognised as a sorted map and a map, and not as a collection or sorted set', () => {
      const map = make(pairs([1]))
      expect(isSortedMap(map)).toBe(true)
      expect(isMapCollection(map)).toBe(true)
      expect(isCollection(map)).toBe(false)
      expect(isSortedSet(map)).toBe(false)
      expect(isSortedMap(map.reversed())).toBe(true)
      expect(isSortedMap(map.headMap(1))).toBe(true)
      expect(isSortedMap(map.keySet())).toBe(false)
    })
  })
}
