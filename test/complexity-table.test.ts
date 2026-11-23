import { describe, expect, it } from 'vitest'
import {
  ArrayList,
  binarySearch,
  compareSymbol,
  type List,
  max,
  min,
  PriorityQueue,
  sortedIndex,
  swap,
  TreeMap,
  TreeSet,
} from '../src/index'
import {
  countingComparator,
  type Input,
  REASONS,
  ROWS,
  RUNNERS,
  runnerKey,
  SHAPES,
  shaped,
  type Tally,
} from './support/complexity'
import { readDocumentedBounds } from './support/tsdoc-bounds'

const documented = readDocumentedBounds()
const SIZES = [1, 2, 100, 1_000] as const
const ALL: readonly Input[] = [...SHAPES, 'random']

const log2 = Math.log2
const ceilLog = (n: number) => Math.ceil(log2(n + 1))
const floorLog = (n: number) => Math.floor(log2(n))

/** A `Proxy` over `list` that counts its `get` and `set` method calls. */
function countingMethods<E>(list: List<E>, gets: Tally, sets: Tally): List<E> {
  return new Proxy(list, {
    get(target, p) {
      if (p === 'get') {
        return (index: number) => {
          gets.calls++
          return target.get(index)
        }
      }
      if (p === 'set') {
        return (index: number, element: E) => {
          sets.calls++
          return target.set(index, element)
        }
      }
      const value = Reflect.get(target, p, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

describe('the bound table', () => {
  it('has a row for every documented member exported from the package, and no other [036 S1-AC11]', () => {
    const fromTable = [...new Set(ROWS.map((row) => row.member))].sort()
    const fromDocs = documented.map((d) => d.member)
    expect(fromTable).toEqual(fromDocs)
    expect(fromDocs.length).toBeGreaterThan(400)
  })

  it("quotes each member's whole Time paragraph exactly, and every member has one [036 S1-AC11]", () => {
    const docs = new Map(documented.map((d) => [d.member, d.time]))
    for (const row of ROWS) expect(row.time, row.member).toBe(docs.get(row.member))
    const without = documented.filter((d) => d.time === undefined).map((d) => d.member)
    expect(without).toEqual([])
  })

  it('gives each row an input and a counter with a measurement, or none with a fixed reason [036 S1-AC11]', () => {
    const reasons = new Set<string>(Object.values(REASONS))
    const keys = new Set<string>()
    for (const row of ROWS) {
      if (row.counter === 'none') {
        expect(row.input, row.member).toBe('none')
        expect(row.growth, row.member).toBeNull()
        expect(reasons.has(row.reason as string), row.member).toBe(true)
      } else {
        expect(row.input, row.member).not.toBe('none')
        expect(row.reason, row.member).toBeUndefined()
        expect(RUNNERS[runnerKey(row)], runnerKey(row)).toBeTypeOf('function')
        if (row.growth !== null) expect(row.time, row.member).toContain('O(')
        keys.add(runnerKey(row))
      }
    }
    expect([...keys].sort()).toEqual(Object.keys(RUNNERS).sort())
  })

  it('reads inline and multi-line Time paragraphs whole', async () => {
    const { timeParagraph } = await import('./support/tsdoc-bounds')
    expect(timeParagraph('Returns x.\n\nTime: O(1).\n\n@example')).toBe('Time: O(1).')
    expect(timeParagraph('Returns x. Time: O(n) for\n   `n` items.\n@returns y')).toBe(
      'Time: O(n) for `n` items.',
    )
    expect(timeParagraph('Returns x.')).toBeUndefined()
  })
})

describe('stated counts', () => {
  it('min and max make exactly n − 1 comparator calls [036 S1-AC12]', () => {
    for (const n of SIZES) {
      for (const shape of ALL) {
        for (const extreme of [min, max]) {
          const tally = { calls: 0 }
          extreme(shaped(shape, n), countingComparator(tally))
          expect(tally.calls, `${extreme.name} ${shape} ${n}`).toBe(n - 1)
        }
      }
    }
  })

  it('sortedIndex and binarySearch stay within their comparator and get counts [036 S1-AC12]', () => {
    for (const n of SIZES) {
      for (const shape of ['ascending', 'all-equal'] as const) {
        const sorted = shaped(shape, n)
        for (const key of [-1, 0, 0.5, n / 2, n - 1, n]) {
          const compares = { calls: 0 }
          const gets = { calls: 0 }
          const list = countingMethods(new ArrayList(sorted), gets, { calls: 0 })
          sortedIndex(list, key, countingComparator(compares))
          expect(compares.calls, `sortedIndex ${shape} ${n} ${key}`).toBeLessThanOrEqual(ceilLog(n))
          expect(gets.calls).toBeLessThanOrEqual(ceilLog(n))
          compares.calls = 0
          gets.calls = 0
          binarySearch(list, key, countingComparator(compares))
          expect(compares.calls, `binarySearch ${shape} ${n} ${key}`).toBeLessThanOrEqual(
            ceilLog(n) + 1,
          )
          expect(gets.calls).toBeLessThanOrEqual(ceilLog(n) + 1)
        }
      }
    }
  })

  it('sort makes at most n·⌈log₂ n⌉ comparator calls on every input shape [036 S1-AC12]', () => {
    for (const n of SIZES.filter((s) => s >= 2)) {
      for (const shape of ALL) {
        const tally = { calls: 0 }
        new ArrayList(shaped(shape, n)).sort(countingComparator(tally))
        expect(tally.calls, `${shape} ${n}`).toBeLessThanOrEqual(n * Math.ceil(log2(n)))
      }
    }
  })

  it('builds a priority queue with at most 2m comparisons [036 S1-AC12]', () => {
    for (const m of SIZES) {
      for (const shape of ALL) {
        for (const build of ['constructor', 'from'] as const) {
          const tally = { calls: 0 }
          const comparator = countingComparator(tally)
          if (build === 'constructor') new PriorityQueue(shaped(shape, m), { comparator })
          else PriorityQueue.from(shaped(shape, m), { comparator })
          expect(tally.calls, `${build} ${shape} ${m}`).toBeLessThanOrEqual(2 * m)
        }
      }
    }
  })

  it('builds a tree from strictly ascending input with at most m − 1 comparisons, one for a single element in natural order [036 S1-AC12] [043 S2-AC4]', () => {
    for (const m of SIZES) {
      const values = shaped('ascending', m)
      const pairs = values.map((v) => [v, v] as [number, number])
      const counts: number[] = []
      for (const build of [
        (c: (a: number, b: number) => number) => new TreeSet(values, { comparator: c }),
        (c: (a: number, b: number) => number) => TreeSet.from(values, { comparator: c }),
        (c: (a: number, b: number) => number) => new TreeMap(pairs, { comparator: c }),
        (c: (a: number, b: number) => number) => TreeMap.from(pairs, { comparator: c }),
      ]) {
        const tally = { calls: 0 }
        build(countingComparator(tally))
        counts.push(tally.calls)
      }
      for (const count of counts) expect(count, `m = ${m}`).toBeLessThanOrEqual(m - 1)
    }
    // In natural order, one element is still compared once, with itself, to check it can be ordered.
    const tally = { calls: 0 }
    class Ranked {
      constructor(readonly rank: number) {}
      [compareSymbol](other: Ranked): number {
        tally.calls++
        return this.rank - other.rank
      }
    }
    for (const build of [
      () => new TreeSet([new Ranked(1)]),
      () => TreeSet.from([new Ranked(1)]),
      () => new TreeMap([[new Ranked(1), 1]]),
      () => TreeMap.from([[new Ranked(1), 1]]),
    ]) {
      tally.calls = 0
      build()
      expect(tally.calls).toBe(1)
    }
    tally.calls = 0
    new TreeSet([1, 2, 3].map((r) => new Ranked(r)))
    expect(tally.calls).toBeLessThanOrEqual(2)
  })

  it('adds to a tree with at most 2⌈log₂(n + 1)⌉ + 2 comparisons, and finds and navigates with at most 2⌈log₂(n + 1)⌉ [036 S1-AC12] [043 S2-AC4]', () => {
    for (const n of SIZES) {
      for (const shape of ['ascending', 'descending', 'random'] as const) {
        const tally = { calls: 0 }
        const comparator = countingComparator(tally)
        const set = new TreeSet<number>(undefined, { comparator })
        const map = new TreeMap<number, number>(undefined, { comparator })
        for (const v of shaped(shape, n)) {
          const size = set.size
          tally.calls = 0
          set.add(v)
          expect(tally.calls, `add ${shape} ${size}`).toBeLessThanOrEqual(2 * ceilLog(size) + 2)
          tally.calls = 0
          map.set(v, v)
          expect(tally.calls, `set ${shape} ${size}`).toBeLessThanOrEqual(2 * ceilLog(size) + 2)
        }
        const bound = 2 * ceilLog(n)
        for (const key of [-1, 0, 0.5, n / 3, n - 1, n]) {
          for (const call of [
            () => set.has(key),
            () => set.lower(key),
            () => set.floor(key),
            () => set.ceiling(key),
            () => set.higher(key),
            () => map.get(key),
            () => map.lowerEntry(key),
            () => map.floorEntry(key),
            () => map.ceilingEntry(key),
            () => map.higherEntry(key),
          ]) {
            tally.calls = 0
            call()
            expect(tally.calls, `${call} ${shape} ${n} ${key}`).toBeLessThanOrEqual(bound)
          }
        }
        const copy = new TreeSet<number>(set, { comparator })
        for (const key of [-1, 0, n - 1, n / 2]) {
          const size = copy.size
          tally.calls = 0
          copy.delete(key)
          expect(tally.calls, `delete ${shape} ${n} ${key}`).toBeLessThanOrEqual(2 * ceilLog(size))
        }
      }
    }
  })

  it('keeps heap add, poll, delete and the bulk removals within their comparison counts [036 S1-AC12]', () => {
    for (const n of SIZES) {
      for (const shape of ALL) {
        const tally = { calls: 0 }
        const comparator = countingComparator(tally)
        const queue = new PriorityQueue<number>(undefined, { comparator })
        for (const v of shaped(shape, n)) {
          tally.calls = 0
          queue.add(v)
          expect(tally.calls, `add ${shape}`).toBeLessThanOrEqual(floorLog(queue.size) + 1)
        }
        const deleting = new PriorityQueue(queue, { comparator })
        const values = shaped('random', n, 3)
        for (const v of values.slice(0, 50)) {
          const size = deleting.size
          tally.calls = 0
          deleting.delete(v)
          expect(tally.calls, `delete ${shape}`).toBeLessThanOrEqual(2 * floorLog(size) + 1)
        }
        for (const bulk of [
          (q: PriorityQueue<number>) => q.removeAll(values.slice(0, n / 2)),
          (q: PriorityQueue<number>) => q.retainAll(values.slice(0, n / 2)),
          (q: PriorityQueue<number>) => q.removeIf((v) => v % 3 === 0),
        ]) {
          const copy = new PriorityQueue(queue, { comparator })
          const size = copy.size
          tally.calls = 0
          bulk(copy)
          expect(tally.calls, `${bulk} ${shape}`).toBeLessThanOrEqual(2 * size)
        }
        while (queue.size > 0) {
          const size = queue.size
          tally.calls = 0
          queue.poll()
          expect(tally.calls, `poll ${shape}`).toBeLessThanOrEqual(2 * floorLog(size))
        }
      }
    }
  })

  it('swap makes two get and two set calls [036 S1-AC12]', () => {
    for (const n of SIZES.filter((s) => s >= 2)) {
      const gets = { calls: 0 }
      const sets = { calls: 0 }
      const list = countingMethods(new ArrayList(shaped('random', n)), gets, sets)
      swap(list, 0, n - 1)
      expect([gets.calls, sets.calls]).toEqual([2, 2])
    }
  })
})
