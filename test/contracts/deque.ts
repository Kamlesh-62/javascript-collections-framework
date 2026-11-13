// The contract every deque keeps: first in, first out through add/poll, both ends, push/pop at the
// end like an array, and a reversed view with the ends swapped.

import { describe, expect, it } from 'vitest'
import {
  isCollection,
  isDeque,
  isList,
  isQueue,
  isSequencedCollection,
  NoSuchElementError,
} from '../../src/index'
import type { Deque } from '../../src/interfaces/queue'

/** Builds a new deque holding `initial`, first element at the front. */
export type DequeFactory = (initial?: Iterable<number>) => Deque<number>

export function describeDeque(name: string, make: DequeFactory): void {
  describe(`${name} — deque contract`, () => {
    it('add and poll are first in, first out [008 S1-AC1] [008 S1-AC2]', () => {
      const d = make()
      d.add(1).add(2).add(3)
      expect([d.poll(), d.poll(), d.poll(), d.poll()]).toEqual([1, 2, 3, undefined])
    })

    it('delete removes the first match from the front [008 S1-AC4]', () => {
      const d = make([1, 2, 1])
      expect(d.delete(1)).toBe(true)
      expect([...d]).toEqual([2, 1])
    })

    it('works at both ends [008 S2-AC1] [008 S2-AC2] [008 S2-AC3] [008 S2-AC4]', () => {
      const d = make([2])
      d.addFirst(1).addLast(3)
      expect([d.getFirst(), d.getLast(), d.peek(), d.peekLast()]).toEqual([1, 3, 1, 3])
      expect(d.removeFirst()).toBe(1)
      expect(d.removeLast()).toBe(3)
      d.clear()
      expect(() => d.removeLast()).toThrow(NoSuchElementError)
      expect(d.peekLast()).toBeUndefined()
    })

    it('push and pop work at the end, like an array [008 S3-AC1] [008 S3-AC2] [008 S3-AC3]', () => {
      const d = make()
      d.push(1).push(2).push(3)
      expect([...d]).toEqual([1, 2, 3])
      expect([d.pop(), d.pop(), d.pop(), d.pop()]).toEqual([3, 2, 1, undefined])
    })

    it('the reversed view swaps the ends and writes through [008 S4-AC3]', () => {
      const d = make([1, 2, 3])
      const r = d.reversed()
      expect([...r]).toEqual([3, 2, 1])
      r.push(0)
      expect([...d]).toEqual([0, 1, 2, 3])
      expect(r.poll()).toBe(3)
      expect([...d]).toEqual([0, 1, 2])
    })

    it('is a collection, sequenced collection, queue and deque, and not a list [008 S7-AC1]', () => {
      const d = make()
      expect([
        isCollection(d),
        isSequencedCollection(d),
        isQueue(d),
        isDeque(d),
        isList(d),
      ]).toEqual([true, true, true, true, false])
    })
  })
}
