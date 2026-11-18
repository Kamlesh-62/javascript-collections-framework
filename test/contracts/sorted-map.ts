// The contract every sorted map keeps on top of the map contract: key order, the comparator, the
// ends and nearest entries, polls returning live entries, live range views with inclusive flags,
// reversed views and the key set as a sorted set. Each implementation's test file runs it through
// `describeSortedMap`.

import { describe, expect, it } from 'vitest'
import { isSortedMap } from '../../src/functions/guards'
import {
  ConcurrentModificationError,
  IllegalArgumentError,
  IllegalStateError,
  isSortedSet,
  type MapEntry,
  UnsupportedOperationError,
} from '../../src/index'
import type { SortedMap } from '../../src/interfaces/sorted-map'
import { describeReadonlySortedMap } from './readonly-sorted-map'

/**
 * Builds a new sorted map in ascending numeric key order holding `initial`. It must accept every
 * number from -1000 to 1000 as a key.
 */
export type SortedMapFactory = (
  initial?: Iterable<readonly [number, string]>,
) => SortedMap<number, string>

const KEYS = [50, 10, 40, 20, 30]
const SORTED = [10, 20, 30, 40, 50]

function pairs(keys: number[]): Array<[number, string]> {
  return keys.map((k): [number, string] => [k, `v${k}`])
}

function keyOf(entry: MapEntry<number, string> | undefined): number | undefined {
  return entry === undefined ? undefined : entry.key
}

export function describeSortedMap(name: string, make: SortedMapFactory): void {
  const filled = () => make(pairs(KEYS))

  describeReadonlySortedMap(name, make)

  describe(`${name} — sorted map contract`, () => {
    it('iterates its mappings in ascending key order whatever the insertion order', () => {
      expect([...filled().keys()]).toEqual(SORTED)
      const map = make()
      for (const k of KEYS) map.set(k, `v${k}`)
      expect([...map]).toEqual(pairs(SORTED))
      expect([...map.values()]).toEqual(SORTED.map((k) => `v${k}`))
      expect(String(make(pairs([2, 1])))).toBe(`${name}(2) {1 => 'v1', 2 => 'v2'}`)
    })

    it('polls the ends as live entries that read their value and refuse writes until the key is back', () => {
      const map = filled()
      const first = map.pollFirstEntry() as MapEntry<number, string>
      const last = map.pollLastEntry() as MapEntry<number, string>
      expect([first.key, first.value, last.key, last.value]).toEqual([10, 'v10', 50, 'v50'])
      expect([...map.keys()]).toEqual([20, 30, 40])
      expect(() => first.setValue('x')).toThrow(IllegalStateError)
      map.set(10, 'back')
      expect(first.value).toBe('back')
      expect(first.setValue('again')).toBe('back')
      expect(map.get(10)).toBe('again')
      expect(make().pollFirstEntry()).toBeUndefined()
      expect(make().pollLastEntry()).toBeUndefined()
    })

    it('gives navigation entries that write through to the map', () => {
      const map = filled()
      const entry = map.ceilingEntry(25) as MapEntry<number, string>
      expect(entry.setValue('thirty')).toBe('v30')
      expect(map.get(30)).toBe('thirty')
      map.set(30, 'set')
      expect(entry.value).toBe('set')
    })

    it('gives live range views with inclusive flags that share revision and refuse keys outside', () => {
      const map = filled()
      expect([...map.subMap(20, 40).keys()]).toEqual([20, 30])
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
      map.set(25, 'v25')
      expect([...view.keys()]).toEqual([20, 25, 30, 40])
      view.delete(30)
      expect(map.has(30)).toBe(false)
      view.set(35, 'v35')
      expect(map.get(35)).toBe('v35')
      expect(view.revision).toBe(map.revision)
      expect(() => view.set(45, 'x')).toThrow(IllegalArgumentError)
      expect(view.get(50)).toBeUndefined()
      expect(view.has(10)).toBe(false)
      expect(view.delete(50)).toBe(false)
      expect(map.has(50)).toBe(true)
      expect(() => map.subMap(40, 20)).toThrow(IllegalArgumentError)
      expect(() => view.tailMap(10)).toThrow(IllegalArgumentError)
      expect(() => map.subMap(1, 2, 5 as never)).toThrow(TypeError)
      expect(() => map.headMap(1, { inclusive: 'yes' } as never)).toThrow(TypeError)
      expect(isSortedMap(view)).toBe(true)
    })

    it('reverses into a live descending view whose reverse has the original order', () => {
      const map = filled()
      const reversed = map.reversed()
      expect([...reversed.keys()]).toEqual(SORTED.slice().reverse())
      expect([...reversed.reversed().keys()]).toEqual(SORTED)
      expect(keyOf(reversed.firstEntry())).toBe(50)
      expect(keyOf(reversed.lowerEntry(30))).toBe(40)
      expect(keyOf(reversed.ceilingEntry(35))).toBe(30)
      expect([...reversed.headMap(30).keys()]).toEqual([50, 40])
      expect(keyOf(reversed.pollFirstEntry())).toBe(50)
      expect(keyOf(map.lastEntry())).toBe(40)
      const comparator = reversed.comparator()
      expect(typeof comparator).toBe('function')
      expect((comparator as (a: number, b: number) => number)(1, 2)).toBeGreaterThan(0)
      const cursor = reversed.entrySet().cursor()
      expect(cursor.next().key).toBe(40)
      cursor.remove()
      expect([...map.keys()]).toEqual([10, 20, 30])
    })

    it('gives a key set that is a sorted set of the keys in its order, removing through and refusing add', () => {
      const map = filled()
      const keys = map.keySet()
      expect(isSortedSet(keys)).toBe(true)
      expect(keys.toArray()).toEqual(SORTED)
      expect(keys.floor(35)).toBe(30)
      expect(keys.reversed().getFirst()).toBe(50)
      expect(map.reversed().keySet().toArray()).toEqual(SORTED.slice().reverse())
      expect(keys.delete(20)).toBe(true)
      expect(map.has(20)).toBe(false)
      expect(keys.pollLast()).toBe(50)
      expect(map.has(50)).toBe(false)
      expect(() => keys.add(5)).toThrow(UnsupportedOperationError)
      expect(map.size).toBe(3)
    })

    it('fails fast when changed during iteration', () => {
      const map = filled()
      expect(() => {
        for (const [k] of map) if (k === 20) map.set(25, 'x')
      }).toThrow(ConcurrentModificationError)
    })
  })
}
