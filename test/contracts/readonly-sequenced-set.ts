// The reading half of the sequenced set contract: a reversed view that is itself a set in the
// opposite order. `describeSequencedSet` runs it first; read-only sequenced sets run it alone.

import { describe, expect, it } from 'vitest'
import { hashCode, isSetCollection } from '../../src/index'
import type { ReadonlySequencedSet } from '../../src/interfaces/sequenced-set'

/** Builds a new sequenced set iterating `initial`, first occurrence winning. */
export type ReadonlySequencedSetFactory = (
  initial?: Iterable<unknown>,
) => ReadonlySequencedSet<unknown>

export interface ReadonlySequencedSetContractOptions {
  /** Turns a member back into the element it was made from; identity by default. */
  member?: (member: unknown) => unknown
  /** Turns an element into a value `has` finds; identity by default. */
  probe?: (element: unknown) => unknown
}

export function describeReadonlySequencedSet(
  name: string,
  make: ReadonlySequencedSetFactory,
  options: ReadonlySequencedSetContractOptions = {},
): void {
  const member = options.member ?? ((value: unknown) => value)
  const probe = options.probe ?? ((value: unknown) => value)
  /** The elements `values` were made from, in order. */
  const elements = (values: Iterable<unknown>): unknown[] => [...values].map(member)

  describe(`${name} — sequenced set contract`, () => {
    it('reversed() is a set in the opposite order with the same size, members, equality and hash [013 S5-AC3]', () => {
      const set = make([1, 2, 3])
      const view = set.reversed()
      expect(isSetCollection(view)).toBe(true)
      expect(elements(view)).toEqual([3, 2, 1])
      expect(view.size).toBe(3)
      expect(view.has(probe(2))).toBe(true)
      expect(view.has(probe(4))).toBe(false)
      expect(view.equals(set)).toBe(true)
      expect(set.equals(view)).toBe(true)
      expect(hashCode(view)).toBe(hashCode(set))
    })

    it('the reversed view’s ends mirror the set’s, and reversing twice restores the order [013 S5-AC3]', () => {
      const set = make([1, 2, 3, 4])
      const view = set.reversed()
      expect(member(view.getFirst())).toBe(member(set.getLast()))
      expect(member(view.getLast())).toBe(member(set.getFirst()))
      expect(elements(view.reversed())).toEqual([1, 2, 3, 4])
    })
  })
}
