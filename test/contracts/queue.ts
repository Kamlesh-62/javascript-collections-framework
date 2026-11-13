// The contract every queue keeps, whatever order it hands elements out in (first in, first out
// for a deque, priority order for a priority queue). Only order-neutral rules live here; order and
// end rules live in the deque contract.

import { describe, expect, it } from 'vitest'
import { isQueue } from '../../src/index'
import type { Queue } from '../../src/interfaces/queue'

/** Builds a new queue holding `initial`. */
export type QueueFactory = (initial?: Iterable<number>) => Queue<number>

export function describeQueue(name: string, make: QueueFactory): void {
  describe(`${name} — queue contract`, () => {
    it('add returns the queue [008 S6-AC5]', () => {
      const q = make()
      expect(q.add(1)).toBe(q)
      expect(q.size).toBe(1)
    })

    it('peek returns what poll returns next, and poll removes exactly that element [008 S6-AC5]', () => {
      const q = make([5, 3, 9, 3])
      while (!q.isEmpty()) {
        const size = q.size
        const next = q.peek()
        expect(q.size).toBe(size)
        expect(q.poll()).toBe(next)
        expect(q.size).toBe(size - 1)
      }
    })

    it('peek and poll return undefined when empty [008 S6-AC5]', () => {
      const q = make()
      expect(q.peek()).toBeUndefined()
      expect(q.poll()).toBeUndefined()
      expect(q.size).toBe(0)
    })

    it('draining with poll returns what was added [008 S6-AC5]', () => {
      const added = [4, 1, 4, 7, 2]
      const q = make()
      for (const n of added) q.add(n)
      const drained: number[] = []
      for (let n = q.poll(); n !== undefined; n = q.poll()) drained.push(n)
      expect(drained.slice().sort()).toEqual(added.slice().sort())
    })

    it('is recognised by isQueue [008 S7-AC1]', () => {
      expect(isQueue(make())).toBe(true)
    })
  })
}
