// The reading half of the list contract: what every list, mutable or not, keeps without being
// changed. `describeList` runs it first; read-only lists run it alone.

import { describe, expect, it } from 'vitest'
import {
  hashCode,
  IndexOutOfBoundsError,
  isCollection,
  isList,
  isSequencedCollection,
  type ReadonlyList,
} from '../../src/index'
import { ownerOf } from '../support/owner'
import { caught } from './readonly-collection'

/** Builds a new list holding `initial`, in order. */
export type ReadonlyListFactory = (initial?: Iterable<unknown>) => ReadonlyList<unknown>

/** Runs the reading half of the list contract; `peers` are other kinds of list it must equal. */
export function describeReadonlyList(
  name: string,
  make: ReadonlyListFactory,
  peers: ReadonlyListFactory[] = [],
): void {
  describe(`${name} — list contract`, () => {
    it('get reads by index and rejects indexes out of range [006 S1-AC1] [006 S1-AC2]', () => {
      const l = make(['a', 'b', 'c'])
      expect([l.get(0), l.get(1), l.get(2)]).toEqual(['a', 'b', 'c'])
      expect(() => l.get(3)).toThrow(IndexOutOfBoundsError)
      expect(() => l.get(-1)).toThrow(IndexOutOfBoundsError)
      expect((caught(() => l.get(3)) as Error).message).toBe(
        `${name}.get: index 3 is out of bounds for size 3`,
      )
    })

    it('indexOf and lastIndexOf use SameValueZero [006 S1-AC3] [006 S1-AC4]', () => {
      const l = make([1, Number.NaN, 1, 0])
      expect(l.indexOf(1)).toBe(0)
      expect(l.lastIndexOf(1)).toBe(2)
      expect(l.indexOf(Number.NaN)).toBe(1)
      expect(l.indexOf(-0)).toBe(3)
      expect(l.indexOf(7)).toBe(-1)
    })

    it('equals any list with equal elements in order, symmetrically [006 S7-AC1] [006 S7-AC2]', () => {
      const a = make([1, 'x', null])
      const b = make([1, 'x', null])
      const others = [...peers.map((peer) => peer([1, 'x', null]))]
      for (const other of [b, ...others]) {
        expect(a.equals(other)).toBe(true)
        expect(other.equals(a)).toBe(true)
      }
      expect(a.equals(make([1, 'x']))).toBe(false)
      expect(a.equals([1, 'x', null])).toBe(false)
    })

    it('equal lists hash the same [006 S7-AC3]', () => {
      expect(hashCode(make([1, 2, 'x', null]))).toBe(hashCode(make([1, 2, 'x', null])))
      for (const peer of peers) expect(hashCode(peer([4, 5]))).toBe(hashCode(make([4, 5])))
    })

    it('forEach passes (element, index, list) with thisArg [006 S7-AC4]', () => {
      const l = make(['a', 'b'])
      const seen: unknown[][] = []
      const receiver = {}
      l.forEach(function (this: unknown, e, i, list) {
        seen.push([e, i, list === ownerOf(l), this === receiver])
      }, receiver)
      expect(seen).toEqual([
        ['a', 0, true, true],
        ['b', 1, true, true],
      ])
    })

    it('carries the collection, sequenced collection and list brands [006 S7-AC5]', () => {
      const l = make()
      expect(isCollection(l)).toBe(true)
      expect(isSequencedCollection(l)).toBe(true)
      expect(isList(l)).toBe(true)
      expect(Object.prototype.toString.call(l)).toBe(`[object ${name}]`)
    })
  })
}
