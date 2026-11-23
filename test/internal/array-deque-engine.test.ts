import { describe, expect, it } from 'vitest'
import { IllegalStateError } from '../../src/index'
import type { Deque } from '../../src/interfaces/queue'
import { ArrayDequeEngine } from '../../src/internal/engines/array-deque-engine'

/** The engine's private buffer, read only by this test. */
function bufferOf(deque: ArrayDequeEngine<number>): Array<number | undefined> {
  return (deque as unknown as { buffer: Array<number | undefined> }).buffer
}

function engine(maxCapacity?: number): ArrayDequeEngine<number> {
  const facade = {} as Deque<number>
  return maxCapacity === undefined
    ? new ArrayDequeEngine<number>(facade)
    : new ArrayDequeEngine<number>(facade, maxCapacity)
}

/** Every slot outside the live range [head, head + size) holds undefined. */
function outsideIsCleared(deque: ArrayDequeEngine<number>): boolean {
  const live = new Set<number>()
  for (let i = 0; i < deque.size; i++) live.add(deque.getAt(i))
  let cleared = 0
  for (let i = 0; i < bufferOf(deque).length; i++) if (bufferOf(deque)[i] === undefined) cleared++
  return cleared === bufferOf(deque).length - deque.size && live.size <= deque.size
}

describe('ArrayDequeEngine', () => {
  it('keeps its capacity through 1,000,000 alternating add/poll pairs on a small deque [008 S6-AC6]', () => {
    const deque = engine()
    for (let i = 0; i < 10; i++) deque.add(i)
    const capacity = bufferOf(deque).length
    // Poll first, so the deque never holds more than 10 elements.
    for (let i = 0; i < 1_000_000; i++) {
      deque.poll()
      deque.add(i)
    }
    expect(bufferOf(deque).length).toBe(capacity)
    expect(deque.size).toBe(10)
  })

  it('clears the slot of every removed element [008 S6-AC7]', () => {
    const removals: Array<[string, (d: ArrayDequeEngine<number>) => unknown]> = [
      ['poll', (d) => d.poll()],
      ['pop', (d) => d.pop()],
      ['removeFirst', (d) => d.removeFirst()],
      ['removeLast', (d) => d.removeLast()],
      ['delete head', (d) => d.delete(d.getAt(0))],
      ['delete middle', (d) => d.delete(d.getAt(3))],
      ['delete tail', (d) => d.delete(d.getAt(d.size - 1))],
      [
        'cursor remove',
        (d) => {
          const c = d.cursor()
          c.next()
          c.next()
          c.remove()
        },
      ],
      ['removeIf', (d) => d.removeIf((n) => n % 2 === 0)],
      ['removeAll', (d) => d.removeAll([d.getAt(1), d.getAt(5)])],
      ['retainAll', (d) => d.retainAll([d.getAt(2)])],
      ['clear', (d) => d.clear()],
    ]
    for (const [name, remove] of removals) {
      const deque = engine()
      // Wrap around the buffer first, so the live range crosses the end.
      for (let i = 0; i < 6; i++) deque.add(100 + i)
      for (let i = 0; i < 5; i++) deque.poll()
      for (let i = 0; i < 6; i++) deque.add(i)
      deque.addFirst(-1)
      remove(deque)
      expect(outsideIsCleared(deque), name).toBe(true)
    }
  })

  it('clear returns the buffer to its minimum size', () => {
    const deque = engine()
    for (let i = 0; i < 1000; i++) deque.add(i)
    const big = bufferOf(deque).length
    deque.clear()
    expect(bufferOf(deque).length).toBeLessThan(big)
    expect(bufferOf(deque).length).toBe(8)
  })

  it('holds max(8, the smallest power of two at least its peak) slots, and 8 after any clear [036 S2-AC3]', () => {
    const smallest = (peak: number) => {
      let capacity = 8
      while (capacity < peak) capacity *= 2
      return capacity
    }
    for (const peak of [0, 1, 7, 8, 9, 16, 17, 100, 1000]) {
      const deque = engine()
      for (let i = 0; i < peak; i++) deque.add(i)
      while (deque.size > 0) {
        deque.poll()
        expect(bufferOf(deque).length).toBe(smallest(peak))
      }
      const revision = deque.revision
      deque.clear()
      expect(bufferOf(deque).length).toBe(8)
      expect(deque.revision).toBe(revision)
      for (let i = 0; i < 5; i++) deque.add(i)
      expect(bufferOf(deque).length).toBe(8)
      deque.clear()
      expect(bufferOf(deque).length).toBe(8)
    }
    const reversedClear = engine()
    for (let i = 0; i < 100; i++) reversedClear.add(i)
    while (reversedClear.size > 0) reversedClear.pop()
    const revision = reversedClear.revision
    reversedClear.reversed().clear()
    expect(bufferOf(reversedClear).length).toBe(8)
    expect(reversedClear.revision).toBe(revision)
  })

  it('refuses to grow past its maximum and changes nothing [008 S6-AC8] [044 S5-AC4]', () => {
    const deque = engine(16)
    for (let i = 0; i < 16; i++) deque.add(i)
    const revision = deque.revision
    for (const call of [
      () => deque.add(16),
      () => deque.addFirst(16),
      () => deque.push(16),
      () => deque.reversed().add(16),
    ]) {
      expect(call).toThrow(IllegalStateError)
    }
    expect(() => deque.reversed().add(16)).toThrow(
      'ReversedDeque.add: the deque cannot hold more than 16 elements',
    )
    expect(() => deque.add(16)).toThrow(
      'ArrayDeque.add: the deque cannot hold more than 16 elements',
    )
    expect(deque.revision).toBe(revision)
    expect(deque.toArray()).toEqual(Array.from({ length: 16 }, (_, i) => i))
    deque.poll()
    deque.poll()
    const afterPolls = deque.revision
    const contents = deque.toArray()
    expect(() => deque.addAll([1, 2, 3])).toThrow(IllegalStateError)
    expect(() => deque.appendAll([1, 2, 3], 'ArrayDeque.from')).toThrow(
      'ArrayDeque.from: the deque cannot hold more than 16 elements',
    )
    expect(deque.revision).toBe(afterPolls)
    expect(deque.toArray()).toEqual(contents)
    expect(deque.addAll([1, 2])).toBe(true)
    expect(deque.size).toBe(16)
  })

  it('grows in place, keeping the order and a full-size buffer [044 S5-AC4]', () => {
    const deque = engine()
    for (let i = 0; i < 5; i++) deque.add(i)
    for (let i = 0; i < 3; i++) deque.poll()
    for (let i = 5; i < 40; i++) deque.add(i)
    expect(deque.toArray()).toEqual(Array.from({ length: 37 }, (_, i) => i + 3))
    expect(bufferOf(deque).length).toBe(64)
  })
})
