import { describe, expect, it } from 'vitest'
import { done, IteratorBase } from '../../src/internal/iteration'

class CountTo extends IteratorBase implements IterableIterator<number> {
  private i = 0
  private readonly n: number
  constructor(n: number) {
    super()
    this.n = n
  }
  next(): IteratorResult<number> {
    return this.i < this.n ? { done: false, value: this.i++ } : done()
  }
  [Symbol.iterator](): this {
    return this
  }
}

const iteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()))

describe('IteratorBase', () => {
  it('makes iterators iterable and gives them %IteratorPrototype% [004 S3-AC2]', () => {
    const it = new CountTo(3)
    expect(Object.prototype.isPrototypeOf.call(iteratorPrototype, it)).toBe(true)
    expect(it[Symbol.iterator]()).toBe(it)
    expect([...new CountTo(3)]).toEqual([0, 1, 2])
  })

  it('lets ES2025 iterator helpers work where the runtime has them [004 S3-AC3]', () => {
    const helpers = new CountTo(6) as unknown as {
      filter(f: (n: number) => boolean): { map(f: (n: number) => number): { toArray(): number[] } }
    }
    if (typeof (helpers as { filter?: unknown }).filter !== 'function') return // older runtime
    expect(
      helpers
        .filter((n) => n % 2 === 1)
        .map((n) => n * 10)
        .toArray(),
    ).toEqual([10, 30, 50])
    const take = (new CountTo(9) as unknown as { take(n: number): { toArray(): number[] } }).take(2)
    expect(take.toArray()).toEqual([0, 1])
  })
})
