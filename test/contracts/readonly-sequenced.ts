// The reading half of the sequenced collection contract: both ends and the reversed order.
// `describeSequencedCollection` runs it first; read-only sequenced collections run it alone.

import { describe, expect, it } from 'vitest'
import { NoSuchElementError } from '../../src/index'
import type { ReadonlySequencedCollection } from '../../src/interfaces/list'

/** Builds a new sequenced collection holding `initial`, in order. */
export type ReadonlySequencedFactory = (
  initial?: Iterable<unknown>,
) => ReadonlySequencedCollection<unknown>

export function describeReadonlySequenced(name: string, make: ReadonlySequencedFactory): void {
  describe(`${name} — sequenced collection contract`, () => {
    it('getFirst and getLast return the ends [006 S1-AC5]', () => {
      const c = make([1, 2, 3])
      expect(c.getFirst()).toBe(1)
      expect(c.getLast()).toBe(3)
    })

    it('getFirst and getLast throw NoSuchElementError when empty [006 S1-AC6]', () => {
      const c = make()
      expect(() => c.getFirst()).toThrow(NoSuchElementError)
      expect(() => c.getLast()).toThrow(NoSuchElementError)
      expect(
        (() => {
          try {
            c.getFirst()
          } catch (error) {
            return (error as Error).message
          }
          return ''
        })().startsWith(`${name}.getFirst: `),
      ).toBe(true)
    })

    it('reversed shows the elements in reverse order, with the ends swapped [006 S6-AC1]', () => {
      const r = make([1, 2, 3]).reversed()
      expect([...r]).toEqual([3, 2, 1])
      expect(r.getFirst()).toBe(3)
      expect(r.getLast()).toBe(1)
    })

    it('reversing twice gives the original order', () => {
      const c = make([1, 2, 3])
      expect([...c.reversed().reversed()]).toEqual([1, 2, 3])
    })
  })
}
