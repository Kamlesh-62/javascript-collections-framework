// The reading half of the set contract: the native `Set` reading methods, order-free equality
// and hashing, `{}` printing and recognition. `describeSetCollection` runs it first; read-only sets
// run it alone.

import { describe, expect, it } from 'vitest'
import {
  hashCode,
  hashCodeSymbol,
  isSetCollection,
  type ReadonlySetCollection,
} from '../../src/index'
import { ownerOf } from '../support/owner'

/** Builds a new set holding `initial`, in first-seen order. */
export type ReadonlySetFactory = (initial?: Iterable<unknown>) => ReadonlySetCollection<unknown>

export interface ReadonlySetContractOptions {
  /**
   * The order the set iterates distinct members in, given them in insertion order. Insertion order
   * (as native `Set`) by default; a sorted set passes a function that sorts them.
   */
  order?: (members: unknown[]) => unknown[]
  /**
   * Turns a member back into the element it was made from, for a set whose members wrap the
   * elements (an entry view, whose members are entries of `[element, element]`); identity by
   * default.
   */
  member?: (member: unknown) => unknown
  /** Turns an element into a value `has` finds, for such a set; identity by default. */
  probe?: (element: unknown) => unknown
  /** How a member made from `text`, the printed element, prints; the text itself by default. */
  printed?: (text: string) => string
}

export function describeReadonlySet(
  name: string,
  make: ReadonlySetFactory,
  options: ReadonlySetContractOptions = {},
): void {
  const order = options.order ?? ((members: unknown[]) => members)
  const member = options.member ?? ((value: unknown) => value)
  const probe = options.probe ?? ((value: unknown) => value)
  const printed = options.printed ?? ((text: string) => text)
  const members = (values: Iterable<unknown>): unknown[] => [...values].map(member)
  describe(`${name} — set contract`, () => {
    it('keys, values and entries iterate in insertion order like a native Set [011 S3-AC1]', () => {
      const values = ['c', 1, null, 'a']
      const set = make(values)
      const native = new Set<unknown>(order([...new Set<unknown>(values)]))
      expect(members(set.keys())).toEqual([...native.keys()])
      expect(members(set.values())).toEqual([...native.values()])
      expect([...set.entries()].map(([a, b]) => [member(a), member(b)])).toEqual([
        ...native.entries(),
      ])
      expect(members(set)).toEqual([...native])
    })

    it('forEach passes each member twice and the set, with thisArg [011 S3-AC2]', () => {
      const set = make([1, 2])
      const calls: unknown[][] = []
      const self = {}
      set.forEach(function (this: unknown, a, b, owner) {
        calls.push([member(a), member(b), owner === ownerOf(set), this === self])
      }, self)
      expect(calls).toEqual([
        [1, 1, true, true],
        [2, 2, true, true],
      ])
    })

    it('exposes size, has and keys so native code reads it as a set [011 S3-AC3]', () => {
      const set = make([1, 2, 3])
      expect(set.size).toBe(3)
      expect(new Set(set).size).toBe(3)
      expect(members(new Set(set.keys()))).toEqual([1, 2, 3])
      const isSubsetOf = (Set.prototype as { isSubsetOf?: (other: unknown) => boolean }).isSubsetOf
      if (typeof isSubsetOf === 'function') {
        expect(isSubsetOf.call(new Set([probe(2), probe(3)]), set)).toBe(true)
        expect(isSubsetOf.call(new Set([probe(4)]), set)).toBe(false)
      }
    })

    it('holds each member once [011 S7-AC1]', () => {
      const set = make([1, 1, 2, Number.NaN, Number.NaN, 0, -0])
      expect(set.size).toBe(4)
    })

    it('equals another set with the same members in any order, both ways [011 S4-AC1]', () => {
      const a = make([1, 2, 3])
      const b = make([3, 2, 1])
      expect(a.equals(b)).toBe(true)
      expect(b.equals(a)).toBe(true)
      expect(a.equals(make([1, 2]))).toBe(false)
      expect(make([1, 2]).equals(a)).toBe(false)
      expect(a.equals(make([1, 2, 4]))).toBe(false)
    })

    it('is never equal to a native Set or an array with the same members [011 S4-AC2]', () => {
      const set = make([1, 2])
      expect(set.equals(new Set([1, 2]))).toBe(false)
      expect(set.equals([1, 2])).toBe(false)
    })

    it('gives equal sets the same hash whatever the insertion order [011 S4-AC3]', () => {
      const a = make([1, 2, 3])
      const b = make([3, 1, 2])
      expect(hashCode(a)).toBe(hashCode(b))
      const standIn = (v: unknown) => (typeof v === 'number' ? v * 13 : 5)
      expect(a[hashCodeSymbol](standIn)).toBe(b[hashCodeSymbol](standIn))
    })

    it('prints its members in braces and is recognised by isSetCollection [011 S7-AC1]', () => {
      expect(String(make([1, 'a']))).toBe(`${name}(2) {${printed('1')}, ${printed("'a'")}}`)
      expect(isSetCollection(make())).toBe(true)
    })
  })
}
