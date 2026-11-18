// The contract every sequenced map keeps on top of the map contract: the first and last mappings,
// polls, a reversed view that is itself a map in the opposite order, `putFirst`/`putLast` that
// insert or move (or throw, where the map orders its keys itself), and key, entry and value views
// with the map's ends. Each implementation's test file runs it through `describeSequencedMap`.

import { describe, expect, it } from 'vitest'
import {
  ConcurrentModificationError,
  isSequencedCollection,
  type MapEntry,
  UnsupportedOperationError,
} from '../../src/index'
import type { SequencedMap } from '../../src/interfaces/sequenced-map'
import { describeReadonlySequencedMap } from './readonly-sequenced-map'

/** Builds a new sequenced map iterating the `initial` pairs in order. */
export type SequencedMapFactory = (
  initial?: Iterable<readonly [unknown, unknown]>,
) => SequencedMap<unknown, unknown>

export interface SequencedMapContractOptions {
  /**
   * How the map reacts to a structural change during iteration: live, like native `Map` (the
   * default), or with `ConcurrentModificationError` on the next step (`'fail-fast'`).
   */
  iteration?: 'live' | 'fail-fast'
  /**
   * Whether `putFirst` and `putLast` insert or move (`'supported'`, the default) or throw
   * `UnsupportedOperationError` because the map orders its keys itself (`'unsupported'`). With
   * `'unsupported'`, the factory's map must keep the keys `1, 2, 3, 4, 5` in that order.
   */
  putAtEnds?: 'supported' | 'unsupported'
}

/** `k → 'v' + k` for each key. */
function pairs(...keys: number[]): Array<[number, string]> {
  return keys.map((k): [number, string] => [k, `v${k}`])
}

function keysOf(map: { keys(): Iterable<unknown> }): unknown[] {
  return [...map.keys()]
}

export function describeSequencedMap(
  name: string,
  make: SequencedMapFactory,
  options: SequencedMapContractOptions = {},
): void {
  const failFast = options.iteration === 'fail-fast'
  const unsupported = options.putAtEnds === 'unsupported'
  const four = () => make(pairs(1, 2, 3, 4))

  describeReadonlySequencedMap(name, make)

  describe(`${name} — sequenced map contract`, () => {
    it('firstEntry and lastEntry return live entries of the ends, or undefined when empty, without changing the order [014 S7-AC3]', () => {
      const map = four()
      const first = map.firstEntry() as MapEntry<unknown, unknown>
      const last = map.lastEntry() as MapEntry<unknown, unknown>
      expect([first.key, first.value, last.key, last.value]).toEqual([1, 'v1', 4, 'v4'])
      expect(keysOf(map)).toEqual([1, 2, 3, 4])
      map.set(1, 'x')
      expect(first.value).toBe('x')
      expect(make().firstEntry()).toBeUndefined()
      expect(make().lastEntry()).toBeUndefined()
    })

    it('pollFirstEntry and pollLastEntry remove the ends and return entries that read the removed values [014 S7-AC3]', () => {
      const map = four()
      const first = map.pollFirstEntry() as MapEntry<unknown, unknown>
      const last = map.pollLastEntry() as MapEntry<unknown, unknown>
      expect([first.key, first.value, last.key, last.value]).toEqual([1, 'v1', 4, 'v4'])
      expect(keysOf(map)).toEqual([2, 3])
      const empty = make()
      expect(empty.pollFirstEntry()).toBeUndefined()
      expect(empty.pollLastEntry()).toBeUndefined()
    })

    it('changes through the map or its reversed view show in both, and the view’s ends mirror the map’s [014 S7-AC3]', () => {
      const map = four()
      const view = map.reversed()
      view.delete(2)
      map.set(5, 'v5')
      expect(keysOf(view)).toEqual([5, 4, 3, 1])
      expect(view.firstEntry()?.key).toBe(map.lastEntry()?.key)
      expect(view.lastEntry()?.key).toBe(map.firstEntry()?.key)
      expect(view.pollFirstEntry()?.key).toBe(5)
      expect(view.pollLastEntry()?.key).toBe(1)
      expect(keysOf(map)).toEqual([3, 4])
      view.clear()
      expect(map.size).toBe(0)
    })

    if (unsupported) {
      it('putFirst and putLast throw UnsupportedOperationError on the map and its view, changing nothing [014 S7-AC3]', () => {
        const map = make(pairs(2, 3))
        const revision = map.revision
        for (const target of [map, map.reversed()]) {
          expect(() => target.putFirst(1, 'x')).toThrow(UnsupportedOperationError)
          expect(() => target.putLast(4, 'x')).toThrow(UnsupportedOperationError)
          expect(() => target.putFirst(3, 'x')).toThrow(UnsupportedOperationError)
          expect(() => target.putLast(2, 'x')).toThrow(UnsupportedOperationError)
        }
        expect(map.toJSON()).toEqual(pairs(2, 3))
        expect(map.revision).toBe(revision)
      })
    } else {
      it('putFirst and putLast insert an absent key at that end, or move the present mapping there and write its value, returning the map [014 S7-AC3]', () => {
        const map = make(pairs(2))
        expect(map.putFirst(1, 'a')).toBe(map)
        expect(map.putLast(3, 'c')).toBe(map)
        expect(map.toJSON()).toEqual([
          [1, 'a'],
          [2, 'v2'],
          [3, 'c'],
        ])
        map.putFirst(3, 'C')
        map.putLast(1, 'A')
        expect(map.toJSON()).toEqual([
          [3, 'C'],
          [2, 'v2'],
          [1, 'A'],
        ])
        const view = map.reversed()
        expect(view.putFirst(0, 'z')).toBe(view)
        expect(view.putLast(4, 'y')).toBe(view)
        expect(keysOf(map)).toEqual([4, 3, 2, 1, 0])
      })
    }

    it('gives key, entry and value views in the map’s order with its ends, as sequenced collections whose reversed views follow the reversed map [014 S7-AC3]', () => {
      const map = four()
      const keys = map.keySet()
      const entries = map.entrySet()
      const values = map.valueCollection()
      for (const view of [keys, entries, values]) {
        expect(isSequencedCollection(view)).toBe(true)
        expect(() => view.addFirst(undefined as never)).toThrow(UnsupportedOperationError)
        expect(() => view.addLast(undefined as never)).toThrow(UnsupportedOperationError)
      }
      expect([...keys]).toEqual([1, 2, 3, 4])
      expect([...values]).toEqual(['v1', 'v2', 'v3', 'v4'])
      expect([...entries].map((e) => e.key)).toEqual([1, 2, 3, 4])
      expect([keys.getFirst(), keys.getLast()]).toEqual([1, 4])
      expect([values.getFirst(), values.getLast()]).toEqual(['v1', 'v4'])
      expect([entries.getFirst().key, entries.getLast().key]).toEqual([1, 4])
      expect([...keys.reversed()]).toEqual(keysOf(map.reversed()))
      expect([...values.reversed()]).toEqual([...map.reversed().values()])
      expect([...entries.reversed()].map((e) => e.key)).toEqual(keysOf(map.reversed()))
      expect(keys.removeFirst()).toBe(1)
      expect(values.removeLast()).toBe('v4')
      expect(entries.reversed().removeFirst().key).toBe(3)
      expect(keysOf(map)).toEqual([2])
    })

    if (failFast) {
      it('fails fast: a structural change makes the next step throw, a value write does not [014 S7-AC3]', () => {
        const map = four()
        const it = map.keys()
        it.next()
        map.set(2, 'x')
        expect(it.next().value).toBe(2)
        map.delete(4)
        expect(() => it.next()).toThrow(ConcurrentModificationError)
      })
    } else {
      it('iterates live: deletes ahead and behind are survived, and putLast of a visited key visits it again [014 S7-AC3]', () => {
        const map = four()
        const seen: unknown[] = []
        for (const k of map.keys()) {
          seen.push(k)
          if (k === 1) map.delete(3)
          if (seen.length === 2) {
            map.delete(1)
            map.putLast(2, 'again')
          }
        }
        expect(seen).toEqual([1, 2, 4, 2])
      })
    }
  })
}
