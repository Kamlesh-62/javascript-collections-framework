import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type HashEquality, Operation, readEquality } from '../../src/internal/engines/hash-support'
import { setBucketSeedSourceForTesting } from '../../src/internal/engines/hash-table'
import {
  LinkedHashTable,
  type LinkedRecord,
  type LinkedRecordIterator,
} from '../../src/internal/engines/linked-hash-table'
import { ChangeCounter } from '../../src/internal/revision'

let nextSeed = 0
beforeEach(() => {
  nextSeed = 0x5eed
  setBucketSeedSourceForTesting(() => nextSeed++)
})
afterEach(() => setBucketSeedSourceForTesting(undefined))

interface Counts {
  key: number
  hash: number
  equals: number
}

/** The three equalities, each counting the user calls it makes. */
function equalities(counts: Counts): Array<[string, HashEquality<number>]> {
  return [
    ['native', readEquality<number>(undefined, 'T')],
    [
      'keyed',
      readEquality<number>(
        {
          key: (v: number) => {
            counts.key++
            return v
          },
        },
        'T',
      ),
    ],
    [
      'buckets',
      readEquality<number>(
        {
          equivalence: {
            equals: (a: number, b: number) => {
              counts.equals++
              return a === b
            },
            hash: (v: number) => {
              counts.hash++
              return v % 7
            },
          },
        },
        'T',
      ),
    ],
  ]
}

const op = () => new Operation(new ChangeCounter(), 'T.op')

function find(table: LinkedHashTable<number, string>, key: number) {
  const o = op()
  return table.find(key, table.probe(key, o), o)
}

function put(table: LinkedHashTable<number, string>, key: number, front = false) {
  const o = op()
  const probe = table.probe(key, o)
  const found = table.find(key, probe, o)
  if (found !== undefined) return found
  return table.insert(key, probe, `v${key}`, front)
}

function keys(table: LinkedHashTable<number, string>, fromBack = false): number[] {
  return table.records(fromBack).map((r) => r.key)
}

function step(iterator: LinkedRecordIterator<number, string>): number | 'done' {
  const result = iterator.next()
  return result.done ? 'done' : result.value.key
}

function drain(iterator: LinkedRecordIterator<number, string>): number[] {
  const out: number[] = []
  for (let r = iterator.next(); r.done !== true; r = iterator.next()) out.push(r.value.key)
  return out
}

function make(equality: HashEquality<number>, values: number[]): LinkedHashTable<number, string> {
  const table = new LinkedHashTable<number, string>(equality)
  for (const v of values) put(table, v)
  return table
}

describe('linked hash table — order and ends', () => {
  for (const [label, equality] of equalities({ key: 0, hash: 0, equals: 0 })) {
    it(`links at both ends and reads the ends (${label})`, () => {
      const table = make(equality, [2, 3])
      put(table, 1, true)
      put(table, 4)
      expect(keys(table)).toEqual([1, 2, 3, 4])
      expect(keys(table, true)).toEqual([4, 3, 2, 1])
      expect(table.first(false)?.key).toBe(1)
      expect(table.first(true)?.key).toBe(4)
      expect(table.size).toBe(4)
      table.remove(table.first(false) as LinkedRecord<number, string>)
      expect(keys(table)).toEqual([2, 3, 4])
      expect(find(table, 1)).toBeUndefined()
      table.clear()
      expect(table.first(false)).toBeUndefined()
      expect(table.first(true)).toBeUndefined()
      expect(table.size).toBe(0)
    })

    it(`moves a record to either end, keeping its handle, and does nothing at the same end (${label})`, () => {
      const table = make(equality, [1, 2, 3])
      const two = find(table, 2) as LinkedRecord<number, string>
      expect(table.move(two, false)).toBe(true)
      expect(keys(table)).toEqual([1, 3, 2])
      const moved = find(table, 2) as LinkedRecord<number, string>
      expect(moved).not.toBe(two)
      expect(moved.value).toBe('v2')
      expect(two.live).toBe(false)
      expect(table.current(two)).toBe(moved)
      expect(table.move(moved, false)).toBe(false)
      expect(table.move(moved, true)).toBe(true)
      expect(keys(table)).toEqual([2, 1, 3])
      const first = table.first(false) as LinkedRecord<number, string>
      expect(table.move(first, true)).toBe(false)
      expect(table.current(two)).toBe(first)
      table.remove(first)
      expect(table.current(two)).toBeUndefined()
      expect(keys(table)).toEqual([1, 3])
    })
  }
})

describe('linked hash table — live record iterator', () => {
  const equality = readEquality<number>(undefined, 'T')

  it('skips removed records ahead and continues after a removed last record, forward and back', () => {
    for (const fromBack of [false, true]) {
      const table = make(equality, [1, 2, 3, 4, 5])
      const it = table.iterator(fromBack)
      const firstKey = step(it)
      expect(firstKey).toBe(fromBack ? 5 : 1)
      // Remove the record just returned and the two after it.
      for (const k of fromBack ? [5, 4, 3] : [1, 2, 3]) {
        table.remove(find(table, k) as LinkedRecord<number, string>)
      }
      expect(drain(it)).toEqual(fromBack ? [2, 1] : [4, 5])
    }
  })

  it('walks back through a chain of removed records to the nearest live one', () => {
    const table = make(equality, [1, 2, 3, 4, 5, 6])
    const it = table.iterator(false)
    step(it)
    step(it)
    step(it) // 3
    table.remove(find(table, 2) as LinkedRecord<number, string>)
    table.remove(find(table, 3) as LinkedRecord<number, string>)
    table.remove(find(table, 1) as LinkedRecord<number, string>)
    table.remove(find(table, 4) as LinkedRecord<number, string>)
    put(table, 0, true)
    expect(drain(it)).toEqual([5, 6])
  })

  it('does not visit records linked at the front behind a fresh iteration, and visits ones at the back', () => {
    const table = make(equality, [1, 2])
    const forward = table.iterator(false)
    const backward = table.iterator(true)
    put(table, 0, true)
    put(table, 3)
    expect(drain(forward)).toEqual([1, 2, 3])
    expect(drain(backward)).toEqual([2, 1, 0])
  })

  it('does not visit front records when every record before the position was removed', () => {
    const table = make(equality, [1, 2, 3])
    const it = table.iterator(false)
    step(it)
    step(it) // 2
    table.remove(find(table, 1) as LinkedRecord<number, string>)
    table.remove(find(table, 2) as LinkedRecord<number, string>)
    put(table, 9, true)
    put(table, 8, true)
    expect(drain(it)).toEqual([3])
  })

  it('treats a move as removal plus insertion at the new end', () => {
    const table = make(equality, [1, 2, 3, 4])
    const it = table.iterator(false)
    step(it) // 1
    step(it) // 2
    // Moving the last returned record continues from its old successor and visits it again ahead.
    table.move(find(table, 2) as LinkedRecord<number, string>, false)
    // Moving an unvisited record to the front means it is not visited.
    table.move(find(table, 4) as LinkedRecord<number, string>, true)
    expect(drain(it)).toEqual([3, 2])
  })

  it('starts over after clear: records added at the back are visited, at the front not', () => {
    for (const fromBack of [false, true]) {
      const table = make(equality, [1, 2, 3])
      const it = table.iterator(fromBack)
      step(it)
      table.clear()
      put(table, 7, fromBack)
      put(table, 8, !fromBack)
      expect(drain(it)).toEqual([7])
    }
  })

  it('stays done once done, whatever is added later', () => {
    const table = make(equality, [1])
    const it = table.iterator(false)
    expect(drain(it)).toEqual([1])
    put(table, 2)
    expect(step(it)).toBe('done')
    table.clear()
    put(table, 3)
    expect(step(it)).toBe('done')
  })

  it('stays live across bucket growth, shrinking and re-seeding', () => {
    const buckets = readEquality<number>(
      { equivalence: { equals: (a: number, b: number) => a === b, hash: (v: number) => v % 13 } },
      'T',
    )
    const table = make(buckets, [0])
    const it = table.iterator(false)
    const seen: number[] = []
    for (let r = it.next(); r.done !== true; r = it.next()) {
      seen.push(r.value.key)
      if (r.value.key < 2000) put(table, r.value.key + 1)
      if (r.value.key === 2000) {
        for (let i = 0; i < 1990; i++)
          table.remove(table.first(false) as LinkedRecord<number, string>)
      }
    }
    expect(seen).toEqual(Array.from({ length: 2001 }, (_, i) => i))
    expect(keys(table)).toEqual(Array.from({ length: 11 }, (_, i) => 1990 + i))
  }, 60000)
})

describe('linked hash table — copy', () => {
  it('copies keys, values and order on every path without calling user functions', () => {
    const counts: Counts = { key: 0, hash: 0, equals: 0 }
    for (const [label, equality] of equalities(counts)) {
      const table = make(equality, [3, 1, 2, 10])
      table.move(find(table, 1) as LinkedRecord<number, string>, false)
      put(table, 0, true)
      const before = { ...counts }
      const copy = table.copy(equality)
      expect(counts, label).toEqual(before)
      expect(keys(copy), label).toEqual([0, 3, 2, 10, 1])
      expect(copy.records(false).map((r) => r.value)).toEqual(['v0', 'v3', 'v2', 'v10', 'v1'])
      put(copy, 5)
      copy.remove(find(copy, 3) as LinkedRecord<number, string>)
      expect(keys(table), label).toEqual([0, 3, 2, 10, 1])
      expect(keys(copy), label).toEqual([0, 2, 10, 1, 5])
      expect(find(copy, 10)?.key).toBe(10)
      expect(copy.size).toBe(5)
    }
  })

  it('sums the stored key hashes in any order', () => {
    const equality = readEquality<number>(undefined, 'T')
    const a = make(equality, [1, 2, 3])
    const b = make(equality, [3, 1, 2])
    const hash = (v: unknown) => (v as number) * 31
    expect(a.keyHashes(hash)).toBe(b.keyHashes(hash))
  })
})

describe('linked hash table — access order', () => {
  const equality = readEquality<number>(undefined, 'T')
  const rec = (table: LinkedHashTable<number, string>, k: number) =>
    find(table, k) as LinkedRecord<number, string>
  function accessOrdered(values: number[]): LinkedHashTable<number, string> {
    const table = new LinkedHashTable<number, string>(equality, undefined, true)
    for (const v of values) put(table, v)
    return table
  }

  it('moves a record to the back keeping its origin, and does nothing for the last record [014 S3-AC4]', () => {
    const table = accessOrdered([1, 2, 3])
    const two = rec(table, 2)
    expect(table.access(two)).toBe(true)
    expect(keys(table)).toEqual([1, 3, 2])
    const moved = rec(table, 2)
    expect(moved).not.toBe(two)
    expect(moved.origin).toBe(two.origin)
    expect(moved.seq).toBeGreaterThan(two.seq)
    expect(table.current(two)).toBe(moved)
    expect(table.access(moved)).toBe(false)
    expect(rec(table, 2)).toBe(moved)
  })

  it('never returns an accessed mapping twice on a forward walk, and visits an unvisited one at its new place [014 S3-AC4]', () => {
    const table = accessOrdered([1, 2, 3, 4])
    const it = table.iterator(false)
    expect(step(it)).toBe(1)
    table.access(rec(table, 1)) // visited: not again
    table.access(rec(table, 3)) // unvisited: visited at the back
    expect(drain(it)).toEqual([2, 4, 3])
    const loop = table.iterator(false)
    const seen: number[] = []
    for (let r = loop.next(); r.done !== true; r = loop.next()) {
      seen.push(r.value.key)
      table.access(rec(table, r.value.key))
    }
    expect(seen).toEqual([2, 4, 1, 3])
  })

  it('continues from the old successor when the record last returned is accessed [014 S3-AC4]', () => {
    const table = accessOrdered([1, 2, 3, 4])
    const it = table.iterator(false)
    step(it)
    expect(step(it)).toBe(2)
    table.access(rec(table, 2))
    expect(keys(table)).toEqual([1, 3, 4, 2])
    expect(drain(it)).toEqual([3, 4])
  })

  it('skips an accessed unvisited record on a backward walk [014 S3-AC4]', () => {
    const table = accessOrdered([1, 2, 3, 4])
    const it = table.iterator(true)
    expect(step(it)).toBe(4)
    table.access(rec(table, 2))
    expect(drain(it)).toEqual([3, 1])
  })

  it('forgets the returned origins on clear, and treats an explicit move as a new mapping [014 S3-AC4] [014 S5-AC4]', () => {
    const table = accessOrdered([1, 2])
    const it = table.iterator(false)
    expect(step(it)).toBe(1)
    table.move(rec(table, 1), false) // explicit: visited again
    expect(drain(it)).toEqual([2, 1])
    const after = accessOrdered([1, 2])
    const again = after.iterator(false)
    step(again)
    after.clear()
    put(after, 1)
    put(after, 2)
    after.access(rec(after, 1))
    expect(drain(again)).toEqual([2, 1])
  })

  it('keeps no record of returned origins on a table without access order, and copy keeps the flag', () => {
    const plain = make(equality, [1, 2])
    expect(plain.accessOrder).toBe(false)
    const it = plain.iterator(false)
    step(it)
    plain.move(rec(plain, 1), false)
    expect(drain(it)).toEqual([2, 1])
    expect(accessOrdered([1]).copy(equality).accessOrder).toBe(true)
    expect(plain.copy(equality).accessOrder).toBe(false)
  })
})
