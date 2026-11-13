// The contract every sequenced collection keeps (first and last element, both ends, reversed
// view). Each implementation's test file runs it through `describeSequencedCollection`.

import { describe, expect, it } from 'vitest'
import { NoSuchElementError } from '../../src/index'
import type { SequencedCollection } from '../../src/interfaces/list'

/** Builds a new sequenced collection holding `initial`, in order. */
export type SequencedFactory = (initial?: Iterable<unknown>) => SequencedCollection<unknown>

export function describeSequencedCollection(name: string, make: SequencedFactory): void {
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

    it('addFirst and addLast add at the ends and return the collection [006 S2-AC8]', () => {
      const c = make([2])
      expect(c.addFirst(1)).toBe(c)
      expect(c.addLast(3)).toBe(c)
      expect([...c]).toEqual([1, 2, 3])
    })

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
      r.addFirst(4)
      expect([...c]).toEqual([1, 2, 3, 4])
      r.removeLast()
      expect([...c]).toEqual([2, 3, 4])
    })

    it('reversing twice gives the original order', () => {
      const c = make([1, 2, 3])
      expect([...c.reversed().reversed()]).toEqual([1, 2, 3])
    })
  })
}
