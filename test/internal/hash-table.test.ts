import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  type BucketEntry,
  BucketTable,
  setBucketSeedSourceForTesting,
} from '../../src/internal/engines/hash-table'

// Seeds come from a counter, so bucket layout and re-seeding are the same on every run.
let nextSeed = 0
beforeEach(() => {
  nextSeed = 0x5eed
  setBucketSeedSourceForTesting(() => nextSeed++)
})
afterEach(() => setBucketSeedSourceForTesting(undefined))

/** Adds `value` under `hash` unless an equal value is stored, counting `equals` calls. */
function addCounting(
  table: BucketTable<number>,
  hash: number,
  value: number,
  counter: { calls: number },
): boolean {
  const found = table.find(hash, (stored) => {
    counter.calls++
    return stored === value
  })
  if (found !== undefined) return false
  table.insert(hash, value)
  return true
}

function values(table: BucketTable<number>): number[] {
  const out: number[] = []
  for (const entry of table.entries()) out.push(entry.value)
  return out
}

/** Finds `count` distinct hashes, none in `avoid`, that fall in the same bucket as `target`. */
function collidingHashes(
  table: BucketTable<number>,
  target: number,
  count: number,
  avoid: Set<number>,
): number[] {
  const index = table.indexOf(target)
  const out: number[] = []
  for (let h = 1; out.length < count; h++) {
    if (!avoid.has(h) && table.indexOf(h) === index) out.push(h)
  }
  return out
}

describe('seeded bucket table', () => {
  it('keeps equals calls per lookup at most 2 when 10,000 hashes share their low 16 bits [011 S5-AC2]', () => {
    const table = new BucketTable<number>()
    const counter = { calls: 0 }
    const hashOf = (i: number) => (i << 16) | 0x2026
    for (let i = 0; i < 10000; i++) addCounting(table, hashOf(i), i, counter)
    expect(table.size).toBe(10000)
    expect(counter.calls / 10000).toBeLessThanOrEqual(2)

    counter.calls = 0
    for (let i = 0; i < 10000; i++) {
      const found = table.find(hashOf(i), (stored) => {
        counter.calls++
        return stored === i
      })
      expect(found?.value).toBe(i)
    }
    expect(counter.calls / 10000).toBeLessThanOrEqual(2)

    counter.calls = 0
    for (let i = 10000; i < 20000; i++) {
      table.find(hashOf(i), () => {
        counter.calls++
        return false
      })
    }
    expect(counter.calls / 10000).toBeLessThanOrEqual(2)
  })

  it('stays correct and never re-seeds when 10,000 values share one hash [011 S5-AC3]', () => {
    const table = new BucketTable<number>()
    for (let i = 0; i < 10000; i++) table.insert(42, i)
    expect(table.size).toBe(10000)
    expect(table.reseeds).toBeLessThanOrEqual(table.growths)
    expect(table.reseeds).toBe(0)
    expect(values(table)).toEqual(Array.from({ length: 10000 }, (_, i) => i))
    for (let i = 0; i < 10000; i += 997) {
      expect(table.find(42, (stored) => stored === i)?.value).toBe(i)
    }
    expect(table.find(42, () => false)).toBeUndefined()
  })

  it('re-seeds a long chain of different hashes at most once per growth step [011 S5-AC3]', () => {
    const table = new BucketTable<number>()
    const used = new Set<number>()
    for (let i = 0; i < 100; i++) {
      const h = 1_000_000 + i
      used.add(h)
      table.insert(h, i)
    }
    expect(table.capacity).toBe(256)
    const growths = table.growths
    const firstSeed = table.seed

    const first = collidingHashes(table, 7, 9, used)
    for (const h of first) {
      used.add(h)
      table.insert(h, h)
    }
    expect(table.reseeds).toBe(1)
    expect(table.seed).not.toBe(firstSeed)

    // Under the new seed another long chain is left alone: no growth has happened since.
    const second = collidingHashes(table, 11, 12, used)
    for (const h of second) {
      used.add(h)
      table.insert(h, h)
    }
    expect(table.growths).toBe(growths)
    expect(table.chainLength(11)).toBeGreaterThan(8)
    expect(table.reseeds).toBe(1)

    // After a growth step one more re-seed is allowed.
    for (let i = 0; table.growths === growths; i++) {
      const h = 2_000_000 + i
      used.add(h)
      table.insert(h, h)
    }
    const third = collidingHashes(table, 13, 12, used)
    for (const h of third) table.insert(h, h)
    expect(table.reseeds).toBe(2)
    expect(table.reseeds).toBeLessThanOrEqual(table.growths)
    for (const h of [...first, ...second, ...third]) {
      expect(table.find(h, (stored) => stored === h)?.value).toBe(h)
    }
  })

  it('gives every table its own seed, so the same hashes are laid out differently [011 S5-AC4]', () => {
    const a = new BucketTable<number>()
    const b = new BucketTable<number>()
    expect(a.seed).not.toBe(b.seed)
    const hashes = Array.from({ length: 64 }, (_, i) => i * 7919)
    for (const h of hashes) {
      a.insert(h, h)
      b.insert(h, h)
    }
    expect(hashes.map((h) => a.indexOf(h))).not.toEqual(hashes.map((h) => b.indexOf(h)))
    expect(a.copy().seed).not.toBe(a.seed)
  })

  it('keeps every value findable and the order unchanged across growth and shrinking [011 S5-AC5]', () => {
    const table = new BucketTable<number>()
    const entries: Array<BucketEntry<number>> = []
    for (let i = 0; i < 2000; i++) entries.push(table.insert(i * 31, i))
    expect(table.capacity).toBeGreaterThanOrEqual(2048)
    for (let i = 0; i < 2000; i++) {
      if (i % 50 !== 0) expect(table.remove(entries[i] as BucketEntry<number>)).toBe(true)
    }
    expect(table.capacity).toBeLessThan(2048)
    expect(table.remove(entries[1] as BucketEntry<number>)).toBe(false)
    expect(table.contains(entries[1] as BucketEntry<number>)).toBe(false)
    expect(table.contains(entries[50] as BucketEntry<number>)).toBe(true)
    const kept = Array.from({ length: 40 }, (_, i) => i * 50)
    expect(values(table)).toEqual(kept)
    for (const i of kept) expect(table.find(i * 31, (v) => v === i)?.value).toBe(i)
    const copy = table.copy()
    expect(values(copy)).toEqual(kept)
    expect(copy.capacity).toBe(table.capacity)
    for (const i of kept) expect(copy.find(i * 31, (v) => v === i)?.value).toBe(i)
    table.clear()
    expect(table.size).toBe(0)
    expect(table.capacity).toBe(8)
    expect(table.find(0, () => true)).toBeUndefined()
    expect(values(copy)).toEqual(kept)
  })

  it('copies a table whose values share one hash in one layout pass, with no growth or re-seed [011 S5-AC3]', () => {
    const table = new BucketTable<number>()
    for (let i = 0; i < 3000; i++) table.insert(42, i)
    const copy = table.copy()
    expect(copy.size).toBe(3000)
    expect(copy.capacity).toBe(table.capacity)
    expect(copy.growths).toBe(0)
    expect(copy.reseeds).toBe(0)
    expect(copy.chainLength(42)).toBe(3000)
    expect(copy.find(42, (v) => v === 2999)?.value).toBe(2999)
  })

  it('lets an open iterator continue across growth, shrinking and re-seeding, like a native Set [011 S5-AC5]', () => {
    const table = new BucketTable<number>()
    const native = new Set<number>()
    const ours = table.entries()
    const theirs = native.values()
    const entries: Array<BucketEntry<number>> = []
    for (let i = 0; i < 3; i++) {
      entries.push(table.insert(i, i))
      native.add(i)
    }
    expect(ours.next().value?.value).toBe(theirs.next().value)
    for (let i = 3; i < 500; i++) {
      entries.push(table.insert(i, i))
      native.add(i)
    }
    // A long chain of different hashes forces a re-seed while the iterator is open.
    const colliders = collidingHashes(table, 3, 12, new Set(entries.map((e) => e.hash)))
    for (const h of colliders) {
      table.insert(h, -h)
      native.add(-h)
    }
    expect(table.reseeds).toBeGreaterThan(0)
    for (let i = 1; i < 480; i++) {
      table.remove(entries[i] as BucketEntry<number>)
      native.delete(i)
    }
    for (;;) {
      const a = ours.next()
      const b = theirs.next()
      expect(a.done).toBe(b.done)
      if (a.done === true) break
      expect(a.value.value).toBe(b.value)
    }
    table.clear()
    expect(table.entries().next().done).toBe(true)
  })
})
