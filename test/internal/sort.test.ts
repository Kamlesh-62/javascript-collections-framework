import { describe, expect, it } from 'vitest'
import { stableSort } from '../../src/internal/sort'
import { integer, seeded } from '../support/random'

interface Item {
  readonly key: number
  readonly order: number
}

function counting<T>(compare: (a: T, b: T) => number): {
  compare: (a: T, b: T) => number
  calls: () => number
} {
  let calls = 0
  return {
    compare: (a, b) => {
      calls++
      return compare(a, b)
    },
    calls: () => calls,
  }
}

function bound(n: number): number {
  return n < 2 ? 0 : n * Math.ceil(Math.log2(n))
}

const byKey = (a: Item, b: Item) => a.key - b.key
const nothing = () => {}

function items(keys: number[]): Item[] {
  return keys.map((key, order) => ({ key, order }))
}

describe('stableSort', () => {
  it('sorts and keeps equal elements in their original order [006 S3-AC3]', () => {
    const random = seeded(6)
    for (let n = 0; n < 200; n++) {
      const input = items(Array.from({ length: n }, () => integer(random, 0, 9)))
      const sorted = stableSort(input, byKey, nothing)
      const expected = input.slice().sort((a, b) => a.key - b.key || a.order - b.order)
      expect(sorted).toEqual(expected)
    }
  })

  it('returns a new array and leaves the input unchanged', () => {
    const input = [3, 1, 2]
    const sorted = stableSort(input, (a, b) => a - b, nothing)
    expect(sorted).toEqual([1, 2, 3])
    expect(input).toEqual([3, 1, 2])
    expect(sorted).not.toBe(input)
  })

  it('makes at most n·⌈log₂ n⌉ comparisons and none below two elements [006 S3-AC6]', () => {
    const random = seeded(61)
    const inputs: number[][] = [[], [1]]
    for (const n of [2, 3, 5, 8, 17, 100, 1000, 1025]) {
      inputs.push(Array.from({ length: n }, () => integer(random, 0, n)))
      inputs.push(Array.from({ length: n }, (_, i) => n - i))
      inputs.push(Array.from({ length: n }, () => 7))
    }
    for (const input of inputs) {
      const { compare, calls } = counting((a: number, b: number) => a - b)
      stableSort(input, compare, nothing)
      expect(calls()).toBeLessThanOrEqual(bound(input.length))
      if (input.length < 2) expect(calls()).toBe(0)
    }
  })

  it('finishes with a permutation for an inconsistent comparator [006 S3-AC10]', () => {
    const random = seeded(610)
    for (const n of [2, 10, 333]) {
      const input = Array.from({ length: n }, (_, i) => i)
      const { compare, calls } = counting(() => (random() < 0.5 ? -1 : 1))
      const sorted = stableSort(input, compare, nothing)
      expect(sorted.slice().sort((a, b) => a - b)).toEqual(input)
      expect(calls()).toBeLessThanOrEqual(bound(n))
    }
  })

  it('propagates an error from the comparator or the after-call hook and returns nothing', () => {
    const failure = new Error('stop')
    expect(() =>
      stableSort(
        [2, 1],
        () => {
          throw failure
        },
        nothing,
      ),
    ).toThrow(failure)
    let calls = 0
    expect(() =>
      stableSort(
        [3, 2, 1],
        (a, b) => a - b,
        () => {
          if (++calls === 2) throw failure
        },
      ),
    ).toThrow(failure)
    expect(calls).toBe(2)
  })
})
