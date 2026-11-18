// The reading half of the sequenced map contract: the ends, a reversed view that is a map in the
// opposite order, and sequenced key, entry and value views. `describeSequencedMap` runs it first;
// read-only sequenced maps run it alone.

import { describe, expect, it } from 'vitest'
import { hashCode, isMapCollection, isSequencedCollection, type MapEntry } from '../../src/index'
import type { ReadonlySequencedMap } from '../../src/interfaces/sequenced-map'

/** Builds a new sequenced map iterating the `initial` pairs in order. */
export type ReadonlySequencedMapFactory = (
  initial?: Iterable<readonly [unknown, unknown]>,
) => ReadonlySequencedMap<unknown, unknown>

/** `k → 'v' + k` for each key. */
function pairs(...keys: number[]): Array<[number, string]> {
  return keys.map((k): [number, string] => [k, `v${k}`])
}

function keysOf(map: { keys(): Iterable<unknown> }): unknown[] {
  return [...map.keys()]
}

export function describeReadonlySequencedMap(
  name: string,
  make: ReadonlySequencedMapFactory,
): void {
  const four = () => make(pairs(1, 2, 3, 4))

  describe(`${name} — sequenced map contract`, () => {
    it('firstEntry and lastEntry return the ends, or undefined when empty, without changing the order [014 S7-AC3]', () => {
      const map = four()
      const first = map.firstEntry() as MapEntry<unknown, unknown>
      const last = map.lastEntry() as MapEntry<unknown, unknown>
      expect([first.key, first.value, last.key, last.value]).toEqual([1, 'v1', 4, 'v4'])
      expect(keysOf(map)).toEqual([1, 2, 3, 4])
      expect(make().firstEntry()).toBeUndefined()
      expect(make().lastEntry()).toBeUndefined()
    })

    it('reversed() is a map in the opposite order, equal both ways with the same hash, and reversing it again gives the original order [014 S7-AC3]', () => {
      const map = four()
      const view = map.reversed()
      expect(isMapCollection(view)).toBe(true)
      expect(keysOf(view)).toEqual([4, 3, 2, 1])
      expect(view.size).toBe(4)
      expect(view.get(2)).toBe('v2')
      expect(view.equals(map)).toBe(true)
      expect(map.equals(view)).toBe(true)
      expect(hashCode(view)).toBe(hashCode(map))
      expect(keysOf(view.reversed())).toEqual([1, 2, 3, 4])
    })

    it('gives key, entry and value views in the map’s order with its ends, whose reversed views follow the reversed map [014 S7-AC3]', () => {
      const map = four()
      const keys = map.keySet()
      const entries = map.entrySet()
      const values = map.valueCollection()
      for (const view of [keys, entries, values]) expect(isSequencedCollection(view)).toBe(true)
      expect([...keys]).toEqual([1, 2, 3, 4])
      expect([...values]).toEqual(['v1', 'v2', 'v3', 'v4'])
      expect([...entries].map((e) => e.key)).toEqual([1, 2, 3, 4])
      expect([keys.getFirst(), keys.getLast()]).toEqual([1, 4])
      expect([values.getFirst(), values.getLast()]).toEqual(['v1', 'v4'])
      expect([entries.getFirst().key, entries.getLast().key]).toEqual([1, 4])
      expect([...keys.reversed()]).toEqual(keysOf(map.reversed()))
      expect([...values.reversed()]).toEqual([...map.reversed().values()])
      expect([...entries.reversed()].map((e) => e.key)).toEqual(keysOf(map.reversed()))
    })
  })
}
