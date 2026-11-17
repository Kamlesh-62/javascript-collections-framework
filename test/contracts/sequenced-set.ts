// The contract every sequenced set keeps on top of the set and sequenced-collection contracts: a
// reversed view that is itself a set in the opposite order, and `addFirst`/`addLast` that insert an
// absent member or move the present one (or throw, where the set orders its members itself). Each
// implementation's test file runs it through `describeSequencedSet`.

import { describe, expect, it } from 'vitest'
import { hashCode, isSetCollection, UnsupportedOperationError } from '../../src/index'
import type { SequencedSet } from '../../src/interfaces/sequenced-set'

/** Builds a new sequenced set iterating `initial`, first occurrence winning. */
export type SequencedSetFactory = (initial?: Iterable<unknown>) => SequencedSet<unknown>

export interface SequencedSetContractOptions {
  /**
   * Whether `addFirst` and `addLast` insert or move (`'supported'`, the default) or throw
   * `UnsupportedOperationError` because the set orders its members itself (`'unsupported'`). With
   * `'unsupported'`, the factory's set must keep `1, 2, 3, 4` in that order when they are added.
   */
  addAtEnds?: 'supported' | 'unsupported'
  /**
   * Puts an element into the set some other way than `add`, for a view filled through its owner.
   * With it, the suite never calls `add` or `addAll`, checks that `add` throws
   * `UnsupportedOperationError` and changes nothing, and fills the reversed view through this
   * function called with the factory's set. With `addAtEnds: 'supported'`, only moves are checked.
   */
  insert?: (set: SequencedSet<unknown>, element: unknown) => void
  /**
   * Returns a value distinct from `value` that the set treats as equal to it, so the check that a
   * move keeps the stored member is a real one; the value itself by default.
   */
  twin?: ((value: unknown) => unknown) | undefined
  /**
   * Turns a member back into the element it was made from, for a set whose members wrap the
   * elements (an entry view, whose members are entries of `[element, element]`); identity by
   * default.
   */
  member?: (member: unknown) => unknown
  /** Turns an element into a value `has` and `delete` find, for such a set; identity by default. */
  probe?: (element: unknown) => unknown
}

export function describeSequencedSet(
  name: string,
  make: SequencedSetFactory,
  options: SequencedSetContractOptions = {},
): void {
  const unsupported = options.addAtEnds === 'unsupported'
  const insert = options.insert
  const twin = options.twin ?? ((value: unknown) => value)
  const member = options.member ?? ((value: unknown) => value)
  const probe = options.probe ?? ((value: unknown) => value)
  /** The elements `values` were made from, in order. */
  const elements = (values: Iterable<unknown>): unknown[] => [...values].map(member)
  /** Puts `element` into `owner` (the factory's set) through `add` or the `insert` option. */
  const put = (owner: SequencedSet<unknown>, element: unknown): void => {
    if (insert) insert(owner, element)
    else owner.add(element)
  }

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

    it('reversed().reversed() iterates as the original and its changes reach the set [013 S5-AC3]', () => {
      const set = make([1, 2, 3])
      const twice = set.reversed().reversed()
      expect(elements(twice)).toEqual([1, 2, 3])
      expect(member(twice.removeFirst())).toBe(1)
      expect(elements(set)).toEqual([2, 3])
      twice.delete(probe(3))
      expect(elements(set)).toEqual([2])
    })

    it('changes through the set or its reversed view show in both [013 S5-AC3]', () => {
      const set = make([1, 2, 3])
      const view = set.reversed()
      put(set, 4)
      expect(elements(view)).toEqual([4, 3, 2, 1])
      view.delete(probe(3))
      expect(elements(set)).toEqual([1, 2, 4])
      put(set, 3)
      expect(view.has(probe(3))).toBe(true)
      expect(view.size).toBe(set.size)
      view.clear()
      expect(set.size).toBe(0)
    })

    it('the reversed view’s ends mirror the set’s [013 S5-AC3]', () => {
      const set = make([1, 2, 3, 4])
      const view = set.reversed()
      expect(member(view.getFirst())).toBe(member(set.getLast()))
      expect(member(view.getLast())).toBe(member(set.getFirst()))
      expect(member(view.removeFirst())).toBe(4)
      expect(member(view.removeLast())).toBe(1)
      expect(elements(set)).toEqual([2, 3])
    })

    if (insert) {
      it('add throws UnsupportedOperationError and changes nothing [013 S5-AC3]', () => {
        const set = make([1, 2])
        const revision = set.revision
        expect(() => set.add(probe(3))).toThrow(UnsupportedOperationError)
        expect(() => set.reversed().add(probe(3))).toThrow(UnsupportedOperationError)
        expect(elements(set)).toEqual([1, 2])
        expect(set.revision).toBe(revision)
      })
    }

    if (unsupported) {
      it('addFirst and addLast throw UnsupportedOperationError on the set and its view, changing nothing [013 S5-AC3]', () => {
        const set = make([2, 3])
        const view = set.reversed()
        const revision = set.revision
        for (const target of [set, view]) {
          expect(() => target.addFirst(probe(1))).toThrow(UnsupportedOperationError)
          expect(() => target.addLast(probe(4))).toThrow(UnsupportedOperationError)
          expect(() => target.addFirst(probe(3))).toThrow(UnsupportedOperationError)
          expect(() => target.addLast(probe(2))).toThrow(UnsupportedOperationError)
        }
        expect(elements(set)).toEqual([2, 3])
        expect(set.revision).toBe(revision)
      })
    } else {
      if (!insert) {
        it('addFirst and addLast insert an absent member at that end and return the set [013 S5-AC3]', () => {
          const set = make([2])
          expect(set.addFirst(1)).toBe(set)
          expect(set.addLast(3)).toBe(set)
          expect([...set]).toEqual([1, 2, 3])
          const view = set.reversed()
          expect(view.addFirst(4)).toBe(view)
          expect(view.addLast(0)).toBe(view)
          expect([...set]).toEqual([0, 1, 2, 3, 4])
        })
      }

      it('addFirst and addLast move a present member to that end, keeping the stored member [013 S5-AC3]', () => {
        const one = twin(1)
        const three = twin(3)
        const set = make([1, 2, 3])
        expect(set.addFirst(three)).toBe(set)
        expect([...set]).toEqual([3, 1, 2])
        expect(set.getFirst()).toBe(3)
        expect(set.addLast(one)).toBe(set)
        expect([...set]).toEqual([3, 2, 1])
        expect(set.getLast()).toBe(1)
        expect(set.size).toBe(3)
        const view = set.reversed()
        view.addFirst(three)
        expect([...set]).toEqual([2, 1, 3])
        view.addLast(twin(3))
        expect([...set]).toEqual([3, 2, 1])
        expect(set.getFirst()).toBe(3)
      })

      it('addFirst of the first member and addLast of the last change nothing, revision included [013 S5-AC3]', () => {
        const set = make([1, 2, 3])
        const revision = set.revision
        set.addFirst(twin(1))
        set.addLast(twin(3))
        set.reversed().addFirst(twin(3))
        set.reversed().addLast(twin(1))
        expect([...set]).toEqual([1, 2, 3])
        expect(set.revision).toBe(revision)
      })
    }
  })
}
