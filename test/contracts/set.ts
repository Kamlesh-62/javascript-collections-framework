// The contract every set keeps on top of the collection contract: the native `Set` reading methods,
// order-free equality and hashing, `{}` printing and recognition. Each implementation's test file
// runs it through `describeSetCollection`.

import { describe, expect, it } from 'vitest'
import { hashCode, hashCodeSymbol, isSetCollection } from '../../src/index'
import type { SetCollection } from '../../src/interfaces/set'

/** Builds a new set holding `initial`, in first-seen order. */
export type SetFactory = (initial?: Iterable<unknown>) => SetCollection<unknown>

export interface SetContractOptions {
  /**
   * The order the set iterates distinct members in, given them in insertion order. Insertion order
   * (as native `Set`) by default; a sorted set passes a function that sorts them.
   */
  order?: (members: unknown[]) => unknown[]
}

export function describeSetCollection(
  name: string,
  make: SetFactory,
  options: SetContractOptions = {},
): void {
  const order = options.order ?? ((members: unknown[]) => members)
  describe(`${name} — set contract`, () => {
    it('keys, values and entries iterate in insertion order like a native Set [011 S3-AC1]', () => {
      const values = ['c', 1, null, 'a']
      const set = make(values)
      const native = new Set<unknown>(order([...new Set<unknown>(values)]))
      expect([...set.keys()]).toEqual([...native.keys()])
      expect([...set.values()]).toEqual([...native.values()])
      expect([...set.entries()]).toEqual([...native.entries()])
      expect([...set]).toEqual([...native])
    })

    it('forEach passes each member twice and the set, with thisArg [011 S3-AC2]', () => {
      const set = make([1, 2])
      const calls: unknown[][] = []
      const self = {}
      set.forEach(function (this: unknown, a, b, owner) {
        calls.push([a, b, owner, this])
      }, self)
      expect(calls).toEqual([
        [1, 1, set, self],
        [2, 2, set, self],
      ])
    })

    it('exposes size, has and keys so native code reads it as a set [011 S3-AC3]', () => {
      const set = make([1, 2, 3])
      expect(set.size).toBe(3)
      expect(new Set(set).size).toBe(3)
      expect([...new Set(set.keys())]).toEqual([1, 2, 3])
      const isSubsetOf = (Set.prototype as { isSubsetOf?: (other: unknown) => boolean }).isSubsetOf
      if (typeof isSubsetOf === 'function') {
        expect(isSubsetOf.call(new Set([2, 3]), set)).toBe(true)
        expect(isSubsetOf.call(new Set([4]), set)).toBe(false)
      }
    })

    it('holds each member once [011 S7-AC1]', () => {
      const set = make([1, 1, 2, Number.NaN, Number.NaN, 0, -0])
      expect(set.size).toBe(4)
      expect(set.addAll([1, 2])).toBe(false)
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
      expect(String(make([1, 'a']))).toBe(`${name}(2) {1, 'a'}`)
      expect(isSetCollection(make())).toBe(true)
    })
  })
}
