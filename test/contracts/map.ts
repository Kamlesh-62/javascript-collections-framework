// The contract every map keeps: the native `Map` methods, the read-modify-write helpers, live
// views and entries, order-free equality and hashing, printing and recognition. Each
// implementation's test file runs it through `describeMapCollection`.

import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  ConcurrentModificationError,
  hashCode,
  hashCodeSymbol,
  IllegalStateError,
  isCollection,
  isMapCollection,
  isSetCollection,
  type MapCollection,
  type MapEntry,
  UnsupportedOperationError,
} from '../../src/index'

/** Builds a new map holding `initial`, in order. */
export type MapFactory = (
  initial?: Iterable<readonly [unknown, unknown]>,
) => MapCollection<unknown, unknown>

export interface MapContractOptions {
  /**
   * How the map reacts to a structural change during iteration: like native `Map` (`'live'`, the
   * default) or with `ConcurrentModificationError` on the next step (`'fail-fast'`).
   */
  iteration?: 'live' | 'fail-fast'
  /**
   * The order the map iterates in: the order keys were first set (`'insertion'`, the default), or
   * ascending or descending key order. The keys the suite uses are strings of one kind, compared
   * by code unit.
   */
  order?: 'insertion' | 'ascending' | 'descending'
}

/** Runs the map contract against `make`; `name` is the class name maps print with. */
export function describeMapCollection(
  name: string,
  make: MapFactory,
  options: MapContractOptions = {},
): void {
  const failFast = options.iteration === 'fail-fast'
  const order = options.order ?? 'insertion'
  const byKey = (a: unknown, b: unknown): number => {
    const x = String(a)
    const y = String(b)
    const c = x < y ? -1 : x > y ? 1 : 0
    return order === 'descending' ? -c : c
  }
  /** `pairs`, given in insertion order, in the order the map iterates them. */
  const ordered = <T extends readonly [unknown, unknown]>(pairs: T[]): T[] =>
    order === 'insertion' ? pairs : pairs.slice().sort((a, b) => byKey(a[0], b[0]))
  /** The keys of `pairs` in iteration order. */
  const keysOf = (pairs: Array<readonly [unknown, unknown]>): unknown[] =>
    ordered(pairs).map((pair) => pair[0])
  /** The values of `pairs` in iteration order. */
  const valuesOf = (pairs: Array<readonly [unknown, unknown]>): unknown[] =>
    ordered(pairs).map((pair) => pair[1])
  const abc = () =>
    make([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])

  describe(`${name} — map contract`, () => {
    describe('read', () => {
      it('reads like a native Map: size, get, has, and undefined for absence [012 S1-AC1]', () => {
        const map = abc()
        expect(map.size).toBe(3)
        expect(map.isEmpty()).toBe(false)
        expect(make().isEmpty()).toBe(true)
        expect(map.get('b')).toBe(2)
        expect(map.get('z')).toBeUndefined()
        expect(map.has('c')).toBe(true)
        expect(map.has('z')).toBe(false)
      })

      it('getOrDefault and containsValue tell a stored undefined from absence [012 S1-AC2]', () => {
        const map = make([['u', undefined]])
        expect(map.getOrDefault('u', 0)).toBeUndefined()
        expect(map.getOrDefault('v', 0)).toBe(0)
        expect(map.containsValue(undefined)).toBe(true)
        expect(map.containsValue(0)).toBe(false)
      })
    })

    describe('write', () => {
      it('set chains and keeps the position of a present key; put, remove, delete and replace return as documented [012 S2-AC1]', () => {
        const map = make()
        expect(map.set('a', 1).set('b', 2).set('a', 3)).toBe(map)
        expect([...map]).toEqual(
          ordered([
            ['a', 3],
            ['b', 2],
          ]),
        )
        expect(map.put('c', 4)).toBeUndefined()
        expect(map.put('c', 5)).toBe(4)
        expect(map.replace('c', 6)).toBe(5)
        expect(map.replace('z', 1)).toBeUndefined()
        expect(map.remove('c')).toBe(6)
        expect(map.remove('c')).toBeUndefined()
        expect(map.delete('b')).toBe(true)
        expect(map.delete('b')).toBe(false)
        expect([...map]).toEqual([['a', 3]])
      })

      it('putAll sets pairs, entries and maps in order, and refuses bad input before changing anything [012 S2-AC3]', () => {
        const map = make([['a', 1]])
        map.putAll([
          ['b', 2],
          ['a', 3],
        ])
        map.putAll(map)
        map.putAll(new Map([['c', 4]]))
        map.putAll(make([['d', 5]]).entrySet())
        expect([...map]).toEqual(
          ordered([
            ['a', 3],
            ['b', 2],
            ['c', 4],
            ['d', 5],
          ]),
        )
        const revision = map.revision
        expect(() => map.putAll([['e', 1], { 0: 'f', 1: 2 }] as never)).toThrow(TypeError)
        expect(() => map.putAll(1 as never)).toThrow(TypeError)
        expect(map.revision).toBe(revision)
        expect(map.has('e')).toBe(false)
      })

      it('getOrInsert and getOrInsertComputed insert only when absent [012 S2-AC6]', () => {
        const map = make([['a', 1]])
        expect(map.getOrInsert('a', 2)).toBe(1)
        expect(map.getOrInsert('b', 2)).toBe(2)
        let calls = 0
        const compute = (key: unknown) => {
          calls++
          return `${String(key)}!`
        }
        expect(map.getOrInsertComputed('a', compute)).toBe(1)
        expect(map.getOrInsertComputed('c', compute)).toBe('c!')
        expect(calls).toBe(1)
        expect(() => map.getOrInsertComputed('a', 1 as never)).toThrow(TypeError)
        expect([...map.keys()]).toEqual(
          keysOf([
            ['a', 0],
            ['b', 0],
            ['c', 0],
          ]),
        )
      })

      it('replaceAll replaces every value in order [012 S2-AC9]', () => {
        const map = abc()
        map.replaceAll((value, key) => `${String(key)}${String(value)}`)
        expect([...map.values()]).toEqual(
          valuesOf([
            ['a', 'a1'],
            ['b', 'b2'],
            ['c', 'c3'],
          ]),
        )
      })

      it('clear removes every mapping and changes revision only when something changed [012 S2-AC10]', () => {
        const map = abc()
        const before = map.revision
        map.clear()
        expect(map.size).toBe(0)
        expect(map.revision).not.toBe(before)
        const after = map.revision
        map.clear()
        expect(map.revision).toBe(after)
      })
    })

    describe('compute and merge', () => {
      it('compute, computeIfPresent and merge store, or remove on undefined [012 S3-AC2]', () => {
        const counts = make()
        for (const word of ['a', 'b', 'a']) {
          counts.merge(word, 1, (old, one) => (old as number) + (one as number))
        }
        expect([...counts]).toEqual(
          ordered([
            ['a', 2],
            ['b', 1],
          ]),
        )
        expect(counts.compute('c', (value) => (value === undefined ? 0 : 1))).toBe(0)
        expect(counts.computeIfPresent('b', () => undefined)).toBeUndefined()
        expect(counts.computeIfPresent('z', () => 1)).toBeUndefined()
        expect(counts.compute('a', () => undefined)).toBeUndefined()
        expect([...counts]).toEqual([['c', 0]])
      })

      it('throws ConcurrentModificationError when a callback adds or removes mappings [012 S3-AC5]', () => {
        const map = abc()
        expect(() => map.compute('a', () => map.delete('b'))).toThrow(ConcurrentModificationError)
        expect(map.has('b')).toBe(false)
        expect(map.get('a')).toBe(1)
      })
    })

    describe('views and entries', () => {
      it('keySet, entrySet and valueCollection are live collections that remove through and cannot add [012 S4-AC1]', () => {
        const map = abc()
        const keys = map.keySet()
        const entries = map.entrySet()
        const values = map.valueCollection()
        expect(isSetCollection(keys)).toBe(true)
        expect(isSetCollection(entries)).toBe(true)
        expect(isCollection(values)).toBe(true)
        expect(keys.delete('a')).toBe(true)
        expect(values.delete(2)).toBe(true)
        map.set('d', 4)
        expect([...keys]).toEqual(
          keysOf([
            ['c', 3],
            ['d', 4],
          ]),
        )
        expect([...values]).toEqual(
          valuesOf([
            ['c', 3],
            ['d', 4],
          ]),
        )
        expect(entries.size).toBe(2)
        for (const view of [keys, entries, values] as Array<{ add(v: unknown): unknown }>) {
          expect(() => view.add('x')).toThrow(UnsupportedOperationError)
        }
        expect(map.size).toBe(2)
      })

      it('entries are handles that write through and destructure as [key, value] [012 S4-AC4]', () => {
        const map = abc()
        const entry = [...map.entrySet()][1] as MapEntry<unknown, unknown>
        const [key, value] = entry
        expect([key, value]).toEqual(['b', 2])
        expect(entry.setValue(20)).toBe(2)
        expect(map.get('b')).toBe(20)
        map.delete('b')
        expect(entry.value).toBe(20)
        expect(() => entry.setValue(1)).toThrow(IllegalStateError)
        expect(String(entry)).toBe("'b' => 20")
        expect(entry.toJSON()).toEqual(['b', 20])
      })

      it.skipIf(failFast)(
        'iterates live like a native Map while mappings are added and deleted [012 S4-AC7]',
        () => {
          const map = abc()
          const native = new Map<unknown, unknown>(map)
          const run = (target: {
            [Symbol.iterator](): Iterator<[unknown, unknown]>
            set(k: unknown, v: unknown): unknown
            delete(k: unknown): unknown
          }) => {
            const seen: unknown[] = []
            let changed = false
            for (const [key] of target as Iterable<[unknown, unknown]>) {
              seen.push(key)
              if (!changed) {
                changed = true
                target.delete('b')
                target.set('d', 4)
                target.delete('a')
                target.set('a', 0)
              }
            }
            return seen
          }
          expect(run(map)).toEqual(run(native))
        },
      )
    })

    describe('iteration', () => {
      it('iterates new [key, value] arrays in the map order and forEach passes (value, key, map) [012 S5-AC1]', () => {
        const map = abc()
        const pairs: Array<[string, number]> = [
          ['a', 1],
          ['b', 2],
          ['c', 3],
        ]
        expect([...map]).toEqual([...new Map(map)])
        expect([...map]).toEqual(ordered(pairs))
        expect([...map.keys()]).toEqual(keysOf(pairs))
        expect([...map.values()]).toEqual(valuesOf(pairs))
        expect([...map.entries()]).toEqual([...map])
        const calls: unknown[] = []
        map.forEach((value, key, owner) => {
          calls.push([value, key, owner === map])
        })
        expect(calls).toEqual(ordered(pairs).map(([key, value]) => [value, key, true]))
      })

      it.skipIf(!failFast)(
        'fails fast on a structural change during iteration, continues after a value write and stays done',
        () => {
          const map = abc()
          const iterator = map[Symbol.iterator]()
          iterator.next()
          map.set(
            keysOf([
              ['a', 0],
              ['b', 0],
              ['c', 0],
            ])[1],
            20,
          )
          expect(iterator.next().done).toBe(false)
          map.set('z', 26)
          expect(() => iterator.next()).toThrow(ConcurrentModificationError)
          const keys = map.keys()
          map.delete('z')
          expect(() => keys.next()).toThrow(ConcurrentModificationError)
          const finished = map.values()
          for (let step = finished.next(); step.done !== true; step = finished.next()) {
            // run to the end
          }
          map.set('y', 25)
          expect(finished.next().done).toBe(true)
        },
      )
    })

    describe('equality, hashing and output', () => {
      it('equals compares mappings in any order, both ways, and never other kinds [012 S7-AC1]', () => {
        const a = abc()
        const b = make([
          ['c', 3],
          ['a', 1],
          ['b', 2],
        ])
        expect(a.equals(b)).toBe(true)
        expect(b.equals(a)).toBe(true)
        expect(a.equals(make([['a', 1]]))).toBe(false)
        expect(
          a.equals(
            make([
              ['a', 1],
              ['b', 2],
              ['c', 4],
            ]),
          ),
        ).toBe(false)
        expect(a.equals(new Map(a))).toBe(false)
        expect(a.equals(a.keySet())).toBe(false)
        expect(a.equals({ a: 1, b: 2, c: 3 })).toBe(false)
      })

      it('gives equal maps the same hash whatever the order [012 S7-AC2]', () => {
        const a = abc()
        const b = make([
          ['c', 3],
          ['b', 2],
          ['a', 1],
        ])
        expect(hashCode(a)).toBe(hashCode(b))
        const standIn = (v: unknown) => (typeof v === 'number' ? v * 13 : 5)
        expect(a[hashCodeSymbol](standIn)).toBe(b[hashCodeSymbol](standIn))
        expect('hashCode' in a).toBe(false)
      })

      it('prints, inspects and writes JSON as pairs, and terminates on itself [012 S7-AC3]', () => {
        const pairs: Array<[string, unknown]> = [
          ['a', 1],
          ['b', 'b'],
        ]
        const map = make(pairs)
        const shown = ordered(pairs)
        const text = (render: (key: string, value: unknown) => string) =>
          shown.map(([key, value]) => render(key, value)).join(', ')
        const quote = (v: unknown) => (typeof v === 'string' ? `'${v}'` : String(v))
        expect(String(map)).toBe(`${name}(2) {${text((k, v) => `${quote(k)} => ${quote(v)}`)}}`)
        expect(String(make())).toBe(`${name}(0) {}`)
        expect(inspect(map)).toBe(`${name}(2) { ${text((k, v) => `${quote(k)} => ${quote(v)}`)} }`)
        expect(Object.prototype.toString.call(map)).toBe(`[object ${name}]`)
        expect(JSON.stringify(map)).toBe(JSON.stringify(shown))
        map.set('self', map)
        expect(String(map)).toContain('[Circular]')
        expect(map.equals(map)).toBe(true)
        expect(typeof hashCode(map)).toBe('number')
      })
    })

    describe('construction and recognition', () => {
      it('is recognised by isMapCollection and never as a collection [012 S9-AC4]', () => {
        expect(isMapCollection(make())).toBe(true)
        expect(isCollection(make())).toBe(false)
      })
    })
  })
}
