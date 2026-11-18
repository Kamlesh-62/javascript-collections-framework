import { assert, describe, expect, it } from 'vitest'
import {
  ArrayList,
  asList,
  binarySearch,
  disjoint,
  type Equivalence,
  equalsSymbol,
  fill,
  frequency,
  HashMap,
  HashSet,
  hashCodeSymbol,
  indexOfSubList,
  LinkedHashMap,
  LinkedHashSet,
  lastIndexOfSubList,
  max,
  min,
  PriorityQueue,
  reverse,
  rotate,
  shuffle,
  sortedIndex,
  swap,
  TreeMap,
  TreeSet,
  valueEquivalence,
} from '../../src/index'
import {
  countingComparator,
  countingList,
  GROWTH_LIMIT,
  type Input,
  ROWS,
  RUNNERS,
  runnerKey,
  SHAPES,
  shaped,
  type Tally,
} from '../support/complexity'
import { integer, seeded } from '../support/random'
import { WORST } from './config'

const N = WORST.elements
const ceilLog = (n: number) => Math.ceil(Math.log2(n + 1))

function same(actual: unknown, expected: unknown, at: string): void {
  if (!Object.is(actual, expected)) assert.fail(`${at}: got ${actual}, reference has ${expected}`)
}

function sameArray(actual: readonly unknown[], expected: readonly unknown[], at: string): void {
  same(actual.length, expected.length, `${at} length`)
  for (let i = 0; i < expected.length; i++) same(actual[i], expected[i], `${at}[${i}]`)
}

/** A value whose `[hashCodeSymbol]` is the same for every instance. */
class Colliding {
  constructor(readonly id: number) {}
  [equalsSymbol](other: unknown): boolean {
    return other instanceof Colliding && other.id === this.id
  }
  [hashCodeSymbol](): number {
    return 7
  }
}

describe('colliding hashes', () => {
  it('gives reference results with at most size equality calls per lookup when every hash is the same [036 S1-AC1]', () => {
    const tally: Tally = { calls: 0 }
    const constant: Equivalence<number> = {
      equals: (a, b) => {
        tally.calls++
        return a === b
      },
      hash: () => 0,
    }
    const counted: Equivalence<Colliding> = {
      equals: (a, b) => {
        tally.calls++
        return valueEquivalence.equals(a, b)
      },
      hash: (v) => valueEquivalence.hash(v),
    }
    const m = WORST.collidingValues
    const cases: Array<{ name: string; make: () => unknown; value: (i: number) => unknown }> = [
      {
        name: 'HashSet',
        make: () => new HashSet<number>(undefined, { equivalence: constant }),
        value: (i) => i,
      },
      {
        name: 'LinkedHashSet',
        make: () => new LinkedHashSet<number>(undefined, { equivalence: constant }),
        value: (i) => i,
      },
      {
        name: 'HashMap',
        make: () => new HashMap<number, number>(undefined, { equivalence: constant }),
        value: (i) => i,
      },
      {
        name: 'LinkedHashMap',
        make: () => new LinkedHashMap<number, number>(undefined, { equivalence: constant }),
        value: (i) => i,
      },
      {
        name: 'HashSet/value',
        make: () => new HashSet<Colliding>(undefined, { equivalence: counted }),
        value: (i) => new Colliding(i),
      },
      {
        name: 'HashMap/value',
        make: () => new HashMap<Colliding, number>(undefined, { equivalence: counted }),
        value: (i) => new Colliding(i),
      },
    ]
    for (const { name, make, value } of cases) {
      const target = make() as {
        size: number
        has(v: unknown): boolean
        delete(v: unknown): boolean
        add?(v: unknown): unknown
        set?(k: unknown, v: unknown): unknown
        get?(k: unknown): unknown
      }
      const reference = new Set<number>()
      for (let i = 0; i < m; i++) {
        tally.calls = 0
        if (target.add !== undefined) target.add(value(i))
        else target.set?.(value(i), i)
        reference.add(i)
        if (tally.calls > target.size)
          assert.fail(`${name}: ${tally.calls} equality calls at size ${target.size}`)
      }
      same(target.size, reference.size, `${name} size`)
      for (let i = -1; i <= m; i += 7) {
        tally.calls = 0
        same(target.has(value(i)), reference.has(i), `${name}.has(${i})`)
        if (tally.calls > target.size) assert.fail(`${name}.has: ${tally.calls} equality calls`)
        if (target.get !== undefined && reference.has(i))
          same(target.get(value(i)), i, `${name}.get(${i})`)
      }
      for (let i = 0; i < m; i += 3) {
        const size = target.size
        tally.calls = 0
        same(target.delete(value(i)), reference.delete(i), `${name}.delete(${i})`)
        if (tally.calls > size)
          assert.fail(`${name}.delete: ${tally.calls} equality calls at size ${size}`)
      }
      same(target.size, reference.size, `${name} size after deletes`)
    }
  })
})

/** Elements tagged with their input position, so a stable order can be checked. */
interface Tagged {
  readonly v: number
  readonly at: number
}

const byValue = (tally: Tally) => (a: Tagged, b: Tagged) => {
  tally.calls++
  return a.v - b.v
}

describe('worst-case input shapes', () => {
  for (const shape of SHAPES) {
    it(`sorts, heaps and builds trees from ${shape} input within their bounds, matching the reference [036 S1-AC4]`, () => {
      const values = shaped(shape, N)
      const tagged: Tagged[] = values.map((v, at) => ({ v, at }))
      const stable = [...tagged].sort((a, b) => a.v - b.v)

      // ArrayList.sort is stable and makes at most n·⌈log₂ n⌉ comparisons.
      const tally: Tally = { calls: 0 }
      const list = new ArrayList(tagged)
      list.sort(byValue(tally))
      if (tally.calls > N * Math.ceil(Math.log2(N))) assert.fail(`sort: ${tally.calls} comparisons`)
      sameArray(list.toArray(), stable, `sort ${shape}`)

      // A priority queue polls in order; equal elements come out as a multiset.
      tally.calls = 0
      const queue = new PriorityQueue(tagged, { comparator: byValue(tally) })
      if (tally.calls > 2 * N) assert.fail(`PriorityQueue: ${tally.calls} comparisons`)
      const polled: Tagged[] = []
      for (let e = queue.poll(); e !== undefined; e = queue.poll()) polled.push(e)
      same(polled.length, N, 'polled')
      let i = 0
      while (i < N) {
        let j = i
        while (j < N && (stable[j] as Tagged).v === (stable[i] as Tagged).v) j++
        const got = polled
          .slice(i, j)
          .map((e) => e.at)
          .sort((a, b) => a - b)
        const want = stable
          .slice(i, j)
          .map((e) => e.at)
          .sort((a, b) => a - b)
        sameArray(got, want, `poll ties at ${i}`)
        i = j
      }

      // A tree keeps one of each distinct value, in order.
      tally.calls = 0
      const set = new TreeSet(values, { comparator: countingComparator(tally) })
      const distinct = [...new Set(values)].sort((a, b) => a - b)
      if (shape === 'ascending' && tally.calls > N - 1) assert.fail(`TreeSet: ${tally.calls}`)
      if (tally.calls > N * (2 * ceilLog(N) + 2)) assert.fail(`TreeSet: ${tally.calls} comparisons`)
      sameArray(set.toArray(), distinct, `TreeSet ${shape}`)
      tally.calls = 0
      const map = new TreeMap(
        values.map((v, at) => [v, at] as [number, number]),
        { comparator: countingComparator(tally) },
      )
      if (tally.calls > N * (2 * ceilLog(N) + 2)) assert.fail(`TreeMap: ${tally.calls} comparisons`)
      sameArray([...map.keys()], distinct, `TreeMap ${shape}`)
      const last = new Map<number, number>()
      for (let at = 0; at < N; at++) last.set(values[at] as number, at)
      for (const [k, v] of map) same(v, last.get(k), `TreeMap value of ${k}`)
    })

    it(`runs every algorithm on ${shape} input within its bound, matching the reference [036 S1-AC4]`, () => {
      const values = shaped(shape, N)
      const tally: Tally = { calls: 0 }
      const sorted = [...values].sort((a, b) => a - b)

      // binarySearch and sortedIndex over the sorted values.
      const sortedList = new ArrayList(sorted)
      const comparator = countingComparator(tally)
      const random = seeded(N)
      for (let q = 0; q < 1_000; q++) {
        const key = integer(random, -2, sorted[N - 1] as number) + (q % 2 === 0 ? 0 : 0.5)
        let lower = 0
        let hi: number = N
        while (lower < hi) {
          const mid = (lower + hi) >>> 1
          if ((sorted[mid] as number) < key) lower = mid + 1
          else hi = mid
        }
        tally.calls = 0
        same(sortedIndex(sortedList, key, comparator), lower, `sortedIndex(${key})`)
        if (tally.calls > ceilLog(N)) assert.fail(`sortedIndex: ${tally.calls}`)
        tally.calls = 0
        const found = binarySearch(sortedList, key, comparator)
        if (tally.calls > ceilLog(N) + 1) assert.fail(`binarySearch: ${tally.calls}`)
        same(found, sorted[lower] === key ? lower : -1, `binarySearch(${key})`)
      }

      // min and max make exactly n − 1 comparisons.
      tally.calls = 0
      same(min(values, comparator), sorted[0], 'min')
      same(tally.calls, N - 1, 'min comparisons')
      tally.calls = 0
      same(max(values, comparator), sorted[N - 1], 'max')
      same(tally.calls, N - 1, 'max comparisons')

      // frequency reads each element once.
      tally.calls = 0
      const counted = countingList([...values], tally)
      same(frequency(counted, values[0]), values.filter((v) => v === values[0]).length, 'frequency')
      if (tally.calls > N) assert.fail(`frequency: ${tally.calls} reads`)

      // disjoint calls `has` on the collection argument once per probe at most.
      const hasTally: Tally = { calls: 0 }
      const lookup = new Proxy(new HashSet(values.map((v) => v + N)), {
        get(target, p) {
          if (p === 'has') {
            return (v: number) => {
              hasTally.calls++
              return target.has(v)
            }
          }
          const value = Reflect.get(target, p, target)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
      same(disjoint(values, lookup), true, 'disjoint')
      if (hasTally.calls > N) assert.fail(`disjoint: ${hasTally.calls} has calls`)
      same(disjoint(values, new HashSet([values[N - 1]])), false, 'disjoint overlap')

      // Sub-list searches with a 100-element target that matches all but its last element.
      const m = WORST.subListTarget
      const target = asList(values.slice(N - m, N - 1).concat([-1]))
      let first = -1
      let lastAt = -1
      for (let s = 0; s + m <= N; s++) {
        let k = 0
        while (k < m && values[s + k] === target.get(k)) k++
        if (k === m) {
          if (first < 0) first = s
          lastAt = s
        }
      }
      tally.calls = 0
      same(indexOfSubList(countingList([...values], tally), target), first, 'indexOfSubList')
      if (tally.calls > (N - m + 1) * m) assert.fail(`indexOfSubList: ${tally.calls} reads`)
      tally.calls = 0
      same(
        lastIndexOfSubList(countingList([...values], tally), target),
        lastAt,
        'lastIndexOfSubList',
      )
      if (tally.calls > (N - m + 1) * m) assert.fail(`lastIndexOfSubList: ${tally.calls} reads`)
      const present = asList(values.slice(N - m))
      same(lastIndexOfSubList(asList([...values]), present), N - m, 'lastIndexOfSubList present')

      // reverse, rotate, swap, fill and shuffle read and write each element a bounded number of times.
      const expectReads = (name: string, limit: number) => {
        if (tally.calls > limit) assert.fail(`${name}: ${tally.calls} reads and writes`)
      }
      let array = [...values]
      tally.calls = 0
      reverse(countingList(array, tally))
      expectReads('reverse', 3 * N)
      sameArray(array, [...values].reverse(), 'reverse')
      array = [...values]
      const distance = Math.floor(N / 3)
      tally.calls = 0
      rotate(countingList(array, tally), distance)
      expectReads('rotate', 6 * N)
      sameArray(array, values.slice(N - distance).concat(values.slice(0, N - distance)), 'rotate')
      array = [...values]
      tally.calls = 0
      swap(countingList(array, tally), 0, N - 1)
      expectReads('swap', 6)
      same(array[0], values[N - 1], 'swap first')
      same(array[N - 1], values[0], 'swap last')
      array = [...values]
      tally.calls = 0
      fill(countingList(array, tally), 7)
      expectReads('fill', 2 * N)
      same(
        array.every((v) => v === 7),
        true,
        'fill',
      )
      array = [...values]
      const randomTally: Tally = { calls: 0 }
      const draw = seeded(3)
      tally.calls = 0
      shuffle(countingList(array, tally), () => {
        randomTally.calls++
        return draw()
      })
      same(randomTally.calls, N - 1, 'shuffle random calls')
      expectReads('shuffle', 6 * N)
      sameArray(
        [...array].sort((a, b) => a - b),
        sorted,
        'shuffle is a permutation',
      )
    })
  }
})

/** Objects compared only through the comparators below. */
interface Item {
  readonly key: number
}

/**
 * The inconsistent comparators: random, non-transitive, and one that flips its answer. `steady`
 * marks the one whose answer for a pair never changes: only then can a tree recognise an element
 * it already holds, since a comparator that changes its answer can send the search for that
 * element down another path.
 */
function inconsistent(
  seed: number,
): Array<{ name: string; steady: boolean; compare: (a: Item, b: Item) => number }> {
  const random = seeded(seed)
  let calls = 0
  return [
    { name: 'random', steady: false, compare: () => integer(random, -1, 1) },
    {
      // Rock, paper, scissors over three classes: each beats the next.
      name: 'non-transitive',
      steady: true,
      compare: (a, b) => {
        const x = a.key % 3
        const y = b.key % 3
        if (x === y) return a.key - b.key
        return (x + 1) % 3 === y ? -1 : 1
      },
    },
    {
      name: 'flipping',
      steady: false,
      compare: (a, b) => {
        calls++
        const sign = Math.floor(calls / 97) % 2 === 0 ? 1 : -1
        return sign * (a.key - b.key)
      },
    },
  ]
}

describe('inconsistent comparators', () => {
  it('terminate every sort, tree, heap and search with consistent sizes and only added elements, distinct ones when the answers never change [036 S1-AC5]', () => {
    const steps = WORST.inconsistentSteps
    for (const { name, steady, compare } of inconsistent(0x1c0)) {
      const items: Item[] = []
      for (let i = 0; i < steps; i++) items.push({ key: i })
      const added = new Set<Item>(items)
      const random = seeded(steps)
      const pick = () => items[integer(random, 0, steps - 1)] as Item

      // Sorts give a permutation of the input.
      for (const sortable of [new ArrayList(items), asList([...items])]) {
        sortable.sort(compare)
        const out = sortable.toArray()
        same(out.length, steps, `${name} sort length`)
        same(new Set(out).size, steps, `${name} sort is a permutation`)
      }

      // Trees: size grows by 0 or 1 per add, falls by 1 exactly when delete returns true.
      const set = new TreeSet<Item>(undefined, { comparator: compare })
      const map = new TreeMap<Item, number>(undefined, { comparator: compare })
      for (let s = 0; s < steps; s++) {
        const item = pick()
        const op = integer(random, 0, 9)
        if (op < 5) {
          const before = set.size
          set.add(item)
          const grew = set.size - before
          if (grew !== 0 && grew !== 1) assert.fail(`${name}: add changed size by ${grew}`)
          const mapBefore = map.size
          map.set(item, s)
          const mapGrew = map.size - mapBefore
          if (mapGrew !== 0 && mapGrew !== 1) assert.fail(`${name}: set changed size by ${mapGrew}`)
        } else if (op < 8) {
          const before = set.size
          const removed = set.delete(item)
          same(set.size, before - (removed ? 1 : 0), `${name} delete`)
          const mapBefore = map.size
          const mapRemoved = map.delete(item)
          same(map.size, mapBefore - (mapRemoved ? 1 : 0), `${name} map delete`)
        } else {
          set.has(item)
          set.floor(item)
          set.ceiling(item)
          set.lower(item)
          set.higher(item)
          map.get(item)
          map.floorEntry(item)
        }
      }
      for (const [label, members] of [
        ['TreeSet', [...set]],
        ['TreeMap', [...map.keys()]],
      ] as const) {
        const size = label === 'TreeSet' ? set.size : map.size
        same(members.length, size, `${name} ${label} iterated count`)
        // Only a comparator whose answers never change guarantees distinct members; with one that
        // changes, a tree may hold an element twice, and its results are unspecified.
        if (steady) {
          same(new Set(members).size, members.length, `${name} ${label} distinct by identity`)
        }
        for (const member of members) same(added.has(member), true, `${name} ${label} member added`)
      }

      // A heap: the polled, deleted and remaining elements are a permutation of what was added.
      const queue = new PriorityQueue<Item>(items.slice(0, steps / 2), { comparator: compare })
      const pushed: Item[] = items.slice(0, steps / 2)
      const polled: Item[] = []
      const deleted: Item[] = []
      for (let s = 0; s < steps; s++) {
        const op = integer(random, 0, 2)
        if (op === 0) {
          const item = items[steps / 2 + (s % (steps / 2))] as Item
          if (!pushed.includes(item)) {
            queue.add(item)
            pushed.push(item)
          }
        } else if (op === 1) {
          const e = queue.poll()
          if (e !== undefined) polled.push(e)
        } else {
          const item = pick()
          if (queue.delete(item)) deleted.push(item)
        }
      }
      const rest = [...queue]
      const out = [...polled, ...rest, ...deleted]
      same(new Set(out).size, out.length, `${name} heap distinct`)
      same(out.length, pushed.length, `${name} heap keeps every element`)
      for (const e of out) same(pushed.includes(e), true, `${name} heap member`)

      // Searches and extremes terminate and return an index or an element.
      const list = new ArrayList(items)
      for (let q = 0; q < 100; q++) {
        const index = sortedIndex(list, pick(), compare)
        same(index >= 0 && index <= steps, true, `${name} sortedIndex range`)
        const found = binarySearch(list, pick(), compare)
        same(found >= -(steps + 1) && found < steps, true, `${name} binarySearch range`)
      }
      same(added.has(min(items, compare) as Item), true, `${name} min`)
      same(added.has(max(items, compare) as Item), true, `${name} max`)
    }
  })
})

/** Removes the first element through a cursor. */
function removeFirstByCursor(collection: { cursor(): { next(): unknown; remove(): void } }): void {
  const cursor = collection.cursor()
  cursor.next()
  cursor.remove()
}

describe('comparators that fail', () => {
  const POISON = 13
  /** Fails as `how` when either argument is the poison value or when `armed` is set. */
  function failing(how: 'throw' | 'NaN' | 'text' | 'bigint', state: { armed: boolean }) {
    const error = new Error('comparator failed')
    return {
      error,
      compare: (a: number, b: number): number => {
        if (state.armed || a === POISON || b === POISON) {
          if (how === 'throw') throw error
          if (how === 'NaN') return Number.NaN
          if (how === 'text') return '1' as unknown as number
          return 1n as unknown as number
        }
        return a - b
      },
    }
  }

  function expectFailure(how: string, error: Error, where: string, run: () => unknown): void {
    let thrown: unknown
    try {
      run()
    } catch (e) {
      thrown = e
    }
    if (thrown === undefined) return
    if (how === 'throw') same(thrown, error, `${where}: the comparator's error`)
    else {
      same(thrown instanceof TypeError, true, `${where}: TypeError`)
      expect((thrown as Error).message, where).toMatch(/^\w+\.\w+: comparator returned /)
    }
  }

  it('propagates the error or throws TypeError, leaving single-element and in-place operations unchanged [036 S1-AC6]', () => {
    type Compare = (a: number, b: number) => number
    type Target = { readonly revision: number; toJSON(): unknown[] }
    /**
     * An operation: whether every comparison fails (`armed`) or only those with the poison value,
     * and whether it compares at all (`false` for those that succeed without comparing).
     */
    type Op = [
      name: string,
      armed: boolean,
      run: (target: never, compare: Compare) => unknown,
      compares?: boolean,
    ]
    const base = [5, 1, 9, 3, 7, 2, 8, 4, 6, 0, 11, 15, 12, 14]
    const subjects: Array<{ name: string; make: (c: Compare) => Target; ops: Op[] }> = [
      {
        name: 'TreeSet',
        make: (comparator) => new TreeSet(base, { comparator }),
        ops: [
          ['add', false, (s: TreeSet<number>) => s.add(POISON)],
          ['delete', false, (s: TreeSet<number>) => s.delete(POISON)],
          ['delete', true, (s: TreeSet<number>) => s.delete(5)],
          // Removing by predicate or through a cursor unlinks nodes without comparing.
          ['removeIf', true, (s: TreeSet<number>) => s.removeIf((v) => v === 5), false],
          ['cursor remove', true, (s: TreeSet<number>) => removeFirstByCursor(s), false],
        ],
      },
      {
        name: 'TreeMap',
        make: (comparator) =>
          new TreeMap(
            base.map((v) => [v, v] as [number, number]),
            { comparator },
          ),
        ops: [
          ['set', false, (m: TreeMap<number, number>) => m.set(POISON, 1)],
          ['delete', false, (m: TreeMap<number, number>) => m.delete(POISON)],
          ['delete', true, (m: TreeMap<number, number>) => m.delete(5)],
        ],
      },
      {
        name: 'PriorityQueue',
        make: (comparator) => new PriorityQueue(base, { comparator }),
        ops: [
          ['add', false, (q: PriorityQueue<number>) => q.add(POISON)],
          ['poll', true, (q: PriorityQueue<number>) => q.poll()],
          ['delete', true, (q: PriorityQueue<number>) => q.delete(5)],
          ['removeIf', true, (q: PriorityQueue<number>) => q.removeIf((v) => v % 2 === 0)],
          ['cursor remove', true, (q: PriorityQueue<number>) => removeFirstByCursor(q)],
        ],
      },
      {
        name: 'ArrayList',
        make: () => new ArrayList(base),
        ops: [['sort', true, (l: ArrayList<number>, compare) => l.sort(compare)]],
      },
      {
        name: 'asList',
        make: () => asList([...base]),
        ops: [['sort', true, (l: ArrayList<number>, compare) => l.sort(compare)]],
      },
    ]
    const passed: string[] = []
    for (const how of ['throw', 'NaN', 'text', 'bigint'] as const) {
      for (const subject of subjects) {
        for (const [op, armed, run, compares] of subject.ops) {
          const state = { armed: false }
          const { error, compare } = failing(how, state)
          const target = subject.make(compare)
          const before = target.toJSON()
          const revision = target.revision
          state.armed = armed
          const where = `${how} ${subject.name}.${op}${armed ? ' (every comparison fails)' : ''}`
          let thrown: unknown
          try {
            run(target as never, compare)
          } catch (e) {
            thrown = e
          }
          if (thrown === undefined) {
            passed.push(where)
            continue
          }
          if (compares === false) assert.fail(`${where}: compared`)
          if (how === 'throw') same(thrown, error, `${where}: the comparator's error`)
          else {
            same(thrown instanceof TypeError, true, `${where}: TypeError`)
            expect((thrown as Error).message, where).toMatch(/^\w+\.\w+: comparator returned /)
          }
          expect(target.toJSON(), `${where}: contents unchanged`).toEqual(before)
          same(target.revision, revision, `${where}: revision unchanged`)
        }
      }
    }
    // Only the operations that never compare succeed.
    expect(passed).toEqual(
      ['throw', 'NaN', 'text', 'bigint'].flatMap((how) => [
        `${how} TreeSet.removeIf (every comparison fails)`,
        `${how} TreeSet.cursor remove (every comparison fails)`,
      ]),
    )
  })

  it('keeps the elements added before the failing one in addAll, and throws from constructors [036 S1-AC6]', () => {
    for (const how of ['throw', 'NaN', 'text', 'bigint'] as const) {
      const input = [4, 2, 6, POISON, 1, 3]
      const prefix = [2, 4, 6]
      for (const make of [
        (c: (a: number, b: number) => number) => new TreeSet<number>(undefined, { comparator: c }),
        (c: (a: number, b: number) => number) =>
          new PriorityQueue<number>(undefined, { comparator: c }),
      ]) {
        const { error, compare } = failing(how, { armed: false })
        const target = make(compare)
        expectFailure(how, error, `${how} addAll`, () => target.addAll(input))
        sameArray(
          [...target.toArray()].sort((a, b) => a - b),
          prefix,
          `${how} addAll prefix kept`,
        )
      }
      const { error, compare } = failing(how, { armed: false })
      const map = new TreeMap<number, number>(undefined, { comparator: compare })
      expectFailure(how, error, `${how} putAll`, () => map.putAll(input.map((v) => [v, v])))
      sameArray([...map.keys()], prefix, `${how} putAll prefix kept`)
      for (const build of [
        () => new TreeSet(input, { comparator: compare }),
        () => TreeSet.from(input, { comparator: compare }),
        () =>
          new TreeMap(
            input.map((v) => [v, v] as [number, number]),
            { comparator: compare },
          ),
        () =>
          TreeMap.from(
            input.map((v) => [v, v] as [number, number]),
            { comparator: compare },
          ),
        () => new PriorityQueue(input, { comparator: compare }),
        () => PriorityQueue.from(input, { comparator: compare }),
      ]) {
        let built: unknown
        let threw = false
        try {
          built = build()
        } catch (e) {
          threw = true
          if (how === 'throw') same(e, error, `${how} constructor error`)
          else same(e instanceof TypeError, true, `${how} constructor TypeError`)
        }
        same(threw, true, `${how} constructor throws`)
        same(built, undefined, `${how} constructor returns nothing`)
      }
    }
  })
})

describe('growth of every counted bound', () => {
  const counted = ROWS.filter((row) => row.counter !== 'none' && row.growth !== null)
  it('has rows to check', () => {
    expect(counted.length).toBeGreaterThan(50)
  })
  for (const row of counted) {
    const key = runnerKey(row)
    it(`${key} grows per call as ${row.growth} between ${WORST.smallSize} and ${WORST.largeSize} elements [036 S1-AC13]`, () => {
      const run = RUNNERS[key] as (n: number, input: Input) => { count: number; calls: number }
      const small = run(WORST.smallSize, row.input as Input)
      const large = run(WORST.largeSize, row.input as Input)
      const perSmall = small.count / small.calls
      const perLarge = large.count / large.calls
      expect(perSmall, `${key} counts at the smaller size`).toBeGreaterThan(0)
      const ratio = perLarge / perSmall
      expect(ratio, `${key}: ${perSmall} then ${perLarge} per call`).toBeLessThanOrEqual(
        GROWTH_LIMIT[row.growth as keyof typeof GROWTH_LIMIT],
      )
    })
  }
})
