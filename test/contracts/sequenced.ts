// The contract every sequenced collection keeps (first and last element, both ends, reversed
// view). Each implementation's test file runs it through `describeSequencedCollection`.

import { describe, expect, it } from 'vitest'
import { NoSuchElementError, UnsupportedOperationError } from '../../src/index'
import type { SequencedCollection } from '../../src/interfaces/list'
import { describeReadonlySequenced } from './readonly-sequenced'

/** Builds a new sequenced collection holding `initial`, in order. */
export type SequencedFactory = (initial?: Iterable<unknown>) => SequencedCollection<unknown>

export interface SequencedContractOptions {
  /**
   * Whether `addFirst` and `addLast` add at the ends (`'supported'`, the default) or throw
   * `UnsupportedOperationError` because the collection places elements itself (`'unsupported'`,
   * as sorted sets do). With `'unsupported'`, the factory's collection must keep `1, 2, 3, 4` in
   * that order when they are added.
   */
  addAtEnds?: 'supported' | 'unsupported'
  /**
   * Puts an element into the collection some other way than `add`, for a view that cannot add (a
   * sorted map's key set, filled through its map). With it, `add` must throw
   * `UnsupportedOperationError`; the default is `add`.
   */
  insert?: (collection: SequencedCollection<unknown>, element: unknown) => void
}

export function describeSequencedCollection(
  name: string,
  make: SequencedFactory,
  options: SequencedContractOptions = {},
): void {
  const unsupported = options.addAtEnds === 'unsupported'
  const insert = options.insert
  describeReadonlySequenced(name, make)

  describe(`${name} — sequenced collection contract`, () => {
    if (unsupported) {
      it('addFirst and addLast throw UnsupportedOperationError and change nothing [015 S2-AC4]', () => {
        const c = make([2])
        const revision = c.revision
        expect(() => c.addFirst(1)).toThrow(UnsupportedOperationError)
        expect(() => c.addLast(3)).toThrow(UnsupportedOperationError)
        expect([...c]).toEqual([2])
        expect(c.revision).toBe(revision)
      })
    } else {
      it('addFirst and addLast add at the ends and return the collection [006 S2-AC8]', () => {
        const c = make([2])
        expect(c.addFirst(1)).toBe(c)
        expect(c.addLast(3)).toBe(c)
        expect([...c]).toEqual([1, 2, 3])
      })
    }

    it('removeFirst and removeLast remove the ends, or throw when empty [006 S2-AC9]', () => {
      const c = make([1, 2, 3])
      expect(c.removeFirst()).toBe(1)
      expect(c.removeLast()).toBe(3)
      expect([...c]).toEqual([2])
      c.clear()
      expect(() => c.removeFirst()).toThrow(NoSuchElementError)
      expect(() => c.removeLast()).toThrow(NoSuchElementError)
    })

    it('reversed is a live view in reverse order whose changes reach the collection [006 S6-AC1] [006 S6-AC2]', () => {
      const c = make([1, 2, 3])
      const r = c.reversed()
      expect([...r]).toEqual([3, 2, 1])
      expect(r.getFirst()).toBe(3)
      if (insert) insert(c, 4)
      else if (unsupported) r.add(4)
      else r.addFirst(4)
      expect([...c]).toEqual([1, 2, 3, 4])
      r.removeLast()
      expect([...c]).toEqual([2, 3, 4])
    })

    it.skipIf(!insert)('add throws UnsupportedOperationError and changes nothing', () => {
      const c = make([1, 2])
      const revision = c.revision
      expect(() => c.add(3)).toThrow(UnsupportedOperationError)
      expect(() => c.reversed().add(3)).toThrow(UnsupportedOperationError)
      expect([...c]).toEqual([1, 2])
      expect(c.revision).toBe(revision)
    })
  })
}
