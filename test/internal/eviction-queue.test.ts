import { describe, expect, it } from 'vitest'
import { EvictionQueue } from '../../src/internal/engines/eviction-queue'

type Call = [unknown, unknown, unknown, unknown]

function recorder(onCall?: (value: unknown, key: unknown) => void) {
  const calls: Call[] = []
  const map = { name: 'map' }
  const queue = new EvictionQueue<unknown, unknown>(function (
    this: unknown,
    value: unknown,
    key: unknown,
    owner: unknown,
  ) {
    calls.push([value, key, owner, this])
    if (onCall) onCall(value, key)
  }, map)
  return { calls, map, queue }
}

describe('eviction queue', () => {
  it('delivers queued mappings in order after the outermost call, value first, this undefined [014 S4-AC2]', () => {
    const { calls, map, queue } = recorder()
    const result = queue.run(() => {
      queue.push('a', 1)
      queue.run(() => queue.push('b', 2))
      expect(calls).toEqual([])
      return 'done'
    })
    expect(result).toBe('done')
    expect(calls).toEqual([
      [1, 'a', map, undefined],
      [2, 'b', map, undefined],
    ])
  })

  it('only queues from calls made during delivery, and delivers what they add in the same loop [014 S4-AC2] [014 S4-AC4]', () => {
    let queue: EvictionQueue<unknown, unknown>
    const order: unknown[] = []
    const made = recorder((_value, key) => {
      order.push(key)
      if (key === 'a') queue.run(() => queue.push('c', 3))
    })
    queue = made.queue
    queue.run(() => {
      queue.push('a', 1)
      queue.push('b', 2)
    })
    expect(order).toEqual(['a', 'b', 'c'])
    queue.run(() => queue.push('d', 4))
    expect(order).toEqual(['a', 'b', 'c', 'd'])
  })

  it('delivers before a call’s own error propagates, and that error wins over one from onEvict [014 S4-AC3]', () => {
    const own = new Error('own')
    const { calls, queue } = recorder()
    expect(() =>
      queue.run(() => {
        queue.push('a', 1)
        throw own
      }),
    ).toThrow(own)
    expect(calls.length).toBe(1)
    const failing = new EvictionQueue<unknown, unknown>(() => {
      throw new Error('evict')
    }, {})
    expect(() =>
      failing.run(() => {
        failing.push('a', 1)
        throw own
      }),
    ).toThrow(own)
  })

  it('drops the rest of the queue when onEvict throws and propagates its error [014 S4-AC3]', () => {
    const boom = new Error('boom')
    const seen: unknown[] = []
    const queue = new EvictionQueue<unknown, unknown>((_value, key) => {
      seen.push(key)
      if (key === 'a') throw boom
    }, {})
    expect(() =>
      queue.run(() => {
        queue.push('a', 1)
        queue.push('b', 2)
      }),
    ).toThrow(boom)
    expect(seen).toEqual(['a'])
    queue.run(() => queue.push('c', 3))
    expect(seen).toEqual(['a', 'c'])
  })

  it('keeps a constant stack over 100,000 re-entrant deliveries [014 S4-AC2] [014 S4-AC4]', () => {
    let queue: EvictionQueue<number, number>
    let count = 0
    queue = new EvictionQueue<number, number>((value) => {
      count++
      if (value < 100_000) queue.run(() => queue.push(value + 1, value + 1))
    }, {})
    queue.run(() => queue.push(1, 1))
    expect(count).toBe(100_000)
  }, 60000)
})

describe('eviction queue — enter and leave', () => {
  it('delivers when the outermost leave runs, and nests with run [045 S2-AC2]', () => {
    const { calls, map, queue } = recorder()
    queue.enter()
    queue.push('a', 1)
    queue.run(() => queue.push('b', 2))
    queue.enter()
    queue.push('c', 3)
    queue.leave(false)
    expect(calls).toEqual([])
    queue.leave(false)
    expect(calls).toEqual([
      [1, 'a', map, undefined],
      [2, 'b', map, undefined],
      [3, 'c', map, undefined],
    ])
  })

  it('lets a failed call’s error win over one from onEvict, and propagates onEvict’s otherwise [045 S2-AC2]', () => {
    const { queue } = recorder(() => {
      throw new Error('from onEvict')
    })
    queue.enter()
    queue.push('a', 1)
    expect(() => queue.leave(true)).not.toThrow()
    queue.enter()
    queue.push('b', 2)
    expect(() => queue.leave(false)).toThrow('from onEvict')
    // The queue is empty and usable again.
    queue.enter()
    expect(() => queue.leave(false)).not.toThrow()
  })
})
