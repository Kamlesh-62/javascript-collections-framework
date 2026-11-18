// The reading half of the map contract: the native `Map` reading methods, order-free equality and
// hashing, printing and recognition. `describeMapCollection` runs it first; read-only maps run it
// alone.

import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  hashCode,
  hashCodeSymbol,
  isCollection,
  isMapCollection,
  type ReadonlyMapCollection,
} from '../../src/index'
import { ownerOf } from '../support/owner'

/** Builds a new map holding `initial`, in order. */
export type ReadonlyMapFactory = (
  initial?: Iterable<readonly [unknown, unknown]>,
) => ReadonlyMapCollection<unknown, unknown>

export interface ReadonlyMapContractOptions {
  /**
   * The order the map iterates in: the order keys were first set (`'insertion'`, the default), or
   * ascending or descending key order. The keys the suite uses are strings of one kind, compared
   * by code unit.
   */
  order?: 'insertion' | 'ascending' | 'descending'
}

/** Runs the reading half of the map contract; `name` is the tag maps print with. */
export function describeReadonlyMap(
  name: string,
  make: ReadonlyMapFactory,
  options: ReadonlyMapContractOptions = {},
): void {
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
          calls.push([value, key, owner === ownerOf(map)])
        })
        expect(calls).toEqual(ordered(pairs).map(([key, value]) => [value, key, true]))
      })
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

      it('prints, inspects and writes JSON as pairs [012 S7-AC3]', () => {
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
