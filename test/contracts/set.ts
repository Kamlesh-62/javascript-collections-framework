// The contract every set keeps on top of the collection contract: the reading half
// (`describeReadonlySet`) and adding present members. Each implementation's test file runs it
// through `describeSetCollection`.

import { describe, expect, it } from 'vitest'
import type { SetCollection } from '../../src/interfaces/set'
import { describeReadonlySet, type ReadonlySetContractOptions } from './readonly-set'

/** Builds a new set holding `initial`, in first-seen order. */
export type SetFactory = (initial?: Iterable<unknown>) => SetCollection<unknown>

export interface SetContractOptions extends ReadonlySetContractOptions {
  /**
   * Puts an element into the set some other way than `add`, for a view filled through its map.
   * With it, `addAll` of present elements is not checked (a view cannot add).
   */
  insert?: (set: SetCollection<unknown>, element: unknown) => void
}

export function describeSetCollection(
  name: string,
  make: SetFactory,
  options: SetContractOptions = {},
): void {
  describeReadonlySet(name, make, options)

  describe(`${name} — set contract`, () => {
    it.skipIf(!!options.insert)('addAll of present members adds nothing [011 S7-AC1]', () => {
      const set = make([1, 1, 2])
      expect(set.addAll([1, 2])).toBe(false)
      expect(set.size).toBe(2)
    })
  })
}
