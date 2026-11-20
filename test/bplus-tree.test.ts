import { describe, expect, it } from 'vitest'
import { BPlusTreeMap } from '../bench/bplus-tree.mjs'
import { TreeMap } from '../src/index'
import { integer, seeded } from './support/random'

describe('the B+ tree prototype used in the tree benchmark', () => {
  it('agrees with TreeMap on a seeded sequence of 20,000 mixed operations [041 S1-AC6]', () => {
    const random = seeded(41)
    const tree = new TreeMap<number, number>()
    const plus = new BPlusTreeMap<number, number>()
    for (let step = 0; step < 20_000; step++) {
      const key = integer(random, 0, 3_000)
      const op = integer(random, 0, 9)
      if (op < 4) {
        tree.set(key, step)
        plus.set(key, step)
      } else if (op < 7) {
        expect(plus.delete(key), `delete ${key} at ${step}`).toBe(tree.delete(key))
      } else if (op === 7) {
        expect(plus.get(key)).toBe(tree.get(key))
        expect(plus.has(key)).toBe(tree.has(key))
      } else {
        expect(plus.floorKey(key)).toBe(tree.floorEntry(key)?.key)
        expect(plus.ceilingKey(key)).toBe(tree.ceilingEntry(key)?.key)
      }
      expect(plus.size).toBe(tree.size)
      if (step % 1_000 === 999) {
        expect([...plus]).toEqual([...tree].map(([k, v]) => [k, v]))
        expect(plus.firstKey()).toBe(tree.firstEntry()?.key)
      }
    }
    // Empty it completely, then refill, so every merge path down to an empty root runs.
    for (const [k] of [...tree]) expect(plus.delete(k)).toBe(true)
    expect(plus.size).toBe(0)
    expect([...plus]).toEqual([])
    for (let k = 0; k < 2_000; k++) plus.set(k, k)
    expect([...plus].map(([k]) => k)).toEqual(Array.from({ length: 2_000 }, (_, k) => k))
  })

  it('checks comparator results and fails an iterator after a change, as TreeMap does [041 S1-AC6]', () => {
    const bad = new BPlusTreeMap<number, number>(undefined, { comparator: () => Number.NaN })
    bad.set(1, 1)
    expect(() => bad.set(2, 2)).toThrow(TypeError)
    expect(bad.size).toBe(1)
    const plus = new BPlusTreeMap<number, number>([
      [1, 1],
      [2, 2],
    ])
    const it = plus[Symbol.iterator]()
    it.next()
    plus.set(3, 3)
    expect(() => it.next()).toThrow(/changed during iteration/)
  })
})
