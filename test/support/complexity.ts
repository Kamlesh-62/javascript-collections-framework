// The bound table: one row per documented member exported from the package (one per clause where a
// `Time:` paragraph has several), with the paragraph itself, the input that is worst for the
// member and the counter that checks it, or `none` with the reason no counter applies. The rows are
// checked against the TSDoc in `test/complexity-table.test.ts`; the counted rows are run at two
// sizes in `test/stress/worst-case.stress.test.ts`.
//
// Counters count calls of user code (comparators, `equals`, `hash`, `has`, `random`) or element
// reads and writes of a list over a counting `Proxy`, never time.

import {
  ArrayList,
  asList,
  binarySearch,
  copyOfMap,
  copyOfSet,
  disjoint,
  type Equivalence,
  fill,
  frequency,
  HashMap,
  HashSet,
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
} from '../../src/index'
import { integer, seeded } from './random'

// ── Inputs ──

/** The input shapes every sort, heap, tree and algorithm is run on. */
export const SHAPES = [
  'ascending',
  'descending',
  'all-equal',
  'organ-pipe',
  'sawtooth',
  'many-duplicates',
] as const

/** An input: one of the shapes, seeded random distinct values, or none (no input is generated). */
export type Input = (typeof SHAPES)[number] | 'random'

/** `n` numbers of `shape`; `random` is a seeded permutation of 0 … n − 1. */
export function shaped(shape: Input, n: number, seed = 0x5eed): number[] {
  const out: number[] = []
  switch (shape) {
    case 'ascending':
      for (let i = 0; i < n; i++) out.push(i)
      return out
    case 'descending':
      for (let i = n - 1; i >= 0; i--) out.push(i)
      return out
    case 'all-equal':
      for (let i = 0; i < n; i++) out.push(0)
      return out
    case 'organ-pipe':
      for (let i = 0; i < n; i++) out.push(i < n / 2 ? i : n - 1 - i)
      return out
    case 'sawtooth':
      for (let i = 0; i < n; i++) out.push(i % 64)
      return out
    case 'many-duplicates': {
      const random = seeded(seed)
      for (let i = 0; i < n; i++) out.push(integer(random, 0, 9))
      return out
    }
    case 'random': {
      const random = seeded(seed)
      for (let i = 0; i < n; i++) out.push(i)
      for (let i = n - 1; i > 0; i--) {
        const j = integer(random, 0, i)
        const t = out[i] as number
        out[i] = out[j] as number
        out[j] = t
      }
      return out
    }
  }
}

// ── Counters ──

/** The user code or element access a row counts. */
export type Counter = 'comparator' | 'equivalence' | 'element-reads' | 'has' | 'random'

/** A tally that counting functions add to. */
export interface Tally {
  calls: number
}

/** A numeric comparator that counts its calls. */
export function countingComparator(tally: Tally): (a: number, b: number) => number {
  return (a, b) => {
    tally.calls++
    return a < b ? -1 : a > b ? 1 : 0
  }
}

/** A value equivalence over numbers that counts its `equals` and `hash` calls. */
export function countingEquivalence(
  tally: Tally,
  hash = (n: number) => n | 0,
): Equivalence<number> {
  return {
    equals: (a, b) => {
      tally.calls++
      return a === b
    },
    hash: (n) => {
      tally.calls++
      return hash(n)
    },
  }
}

/** `asList` over a `Proxy` of `array` that counts every index read and write. */
export function countingList<E>(array: E[], tally: Tally): ReturnType<typeof asList<E>> {
  const isIndex = (p: string | symbol) => typeof p === 'string' && p !== '' && String(+p) === p
  const proxy = new Proxy(array, {
    get(target, p, receiver) {
      if (isIndex(p)) tally.calls++
      return Reflect.get(target, p, receiver)
    },
    set(target, p, value, receiver) {
      if (isIndex(p)) tally.calls++
      return Reflect.set(target, p, value, receiver)
    },
  })
  return asList(proxy)
}

// ── Rows ──

/** The growth a counted row is checked for, per call, between two sizes. */
export type Growth = 'O(1)' | 'O(log n)' | 'O(n)' | 'O(n log n)'

/** The largest per-call ratio allowed between sizes 10n and n for each growth. */
export const GROWTH_LIMIT: { readonly [g in Growth]: number } = {
  'O(1)': 1.5,
  'O(log n)': 2,
  'O(n)': 12,
  'O(n log n)': 15,
}

/** Why a documented bound has no counter. Fixed strings, grouped on the testing page. */
export const REASONS = {
  noUserCode: 'No user code is called, so there is nothing to count',
  native: "Native storage (the engine's `Map` or `Set`) holds the elements",
  amortised: 'Amortised growth with no counter',
  views: 'Views, iteration and output',
  delegated: "The bound is another member's",
  callback: 'A walk whose only user code is the function given to it',
  otherCollection: 'Equality with another collection, whose lookups are its own bound',
  perValue: 'A cost per value or per comparison, independent of any collection size',
} as const

export type Reason = (typeof REASONS)[keyof typeof REASONS]

/** One row of the bound table. */
export interface BoundRow {
  /** `Class.member`, `Class.static member`, or the function or const name. */
  readonly member: string
  /** The member's whole `Time:` paragraph. */
  readonly time: string
  /** For a member with several rows: the clause or size the row checks. */
  readonly clause?: string
  /** The input that is worst for the member, or `none` with a reason. */
  readonly input: Input | 'none'
  readonly counter: Counter | 'none'
  /** The growth checked between two sizes; `null` where the paragraph states only a count. */
  readonly growth: Growth | null
  readonly reason?: Reason
}

/** A counted call: the total of the row's counter over `calls` calls of the member at size `n`. */
export interface Measured {
  readonly count: number
  readonly calls: number
}

/** Calls of each counted member per measurement, so a per-call figure averages over them. */
const PROBES = 200

/** A tree set of `values` with a counting comparator; the tally starts after construction. */
function treeSet(values: number[], tally: Tally): TreeSet<number> {
  const set = new TreeSet<number>(values, { comparator: countingComparator(tally) })
  tally.calls = 0
  return set
}

function treeMap(values: number[], tally: Tally): TreeMap<number, number> {
  const map = new TreeMap<number, number>(
    values.map((v) => [v, v] as [number, number]),
    { comparator: countingComparator(tally) },
  )
  tally.calls = 0
  return map
}

/** Runs `probe` PROBES times over seeded keys in [0, n) and returns the tally per measurement. */
function probes(n: number, tally: Tally, probe: (key: number) => void): Measured {
  const random = seeded(n ^ 0x0b5e)
  tally.calls = 0
  for (let i = 0; i < PROBES; i++) probe(integer(random, 0, Math.max(0, n - 1)))
  return { count: tally.calls, calls: PROBES }
}

/** One measurement: the whole call is one call. */
function once(tally: Tally, body: () => void): Measured {
  tally.calls = 0
  body()
  return { count: tally.calls, calls: 1 }
}

type Runner = (n: number, input: Input) => Measured

const treeProbe =
  (method: string): Runner =>
  (n, input) => {
    const tally = { calls: 0 }
    const set = treeSet(shaped(input, n), tally)
    const call = (set as unknown as Record<string, (k: number) => unknown>)[method] as (
      k: number,
    ) => unknown
    return probes(n, tally, (k) => call.call(set, k + 0.5))
  }

const mapProbe =
  (method: string): Runner =>
  (n, input) => {
    const tally = { calls: 0 }
    const map = treeMap(shaped(input, n), tally)
    const call = (map as unknown as Record<string, (k: number) => unknown>)[method] as (
      k: number,
    ) => unknown
    return probes(n, tally, (k) => call.call(map, k + 0.5))
  }

/** A hash collection of `values` with a counting equivalence; the tally starts after it is built. */
type HashKind = 'HashSet' | 'LinkedHashSet' | 'HashMap' | 'LinkedHashMap'

function hashed(kind: HashKind, values: number[], tally: Tally): unknown {
  const equivalence = countingEquivalence(tally)
  const pairs = () => values.map((v) => [v, v] as [number, number])
  const made =
    kind === 'HashSet'
      ? new HashSet(values, { equivalence })
      : kind === 'LinkedHashSet'
        ? new LinkedHashSet(values, { equivalence })
        : kind === 'HashMap'
          ? new HashMap(pairs(), { equivalence })
          : new LinkedHashMap(pairs(), { equivalence })
  tally.calls = 0
  return made
}

const hashProbe =
  (kind: HashKind, method: string, restore?: string): Runner =>
  (n, input) => {
    const tally = { calls: 0 }
    const target = hashed(kind, shaped(input, n), tally) as Record<
      string,
      (k: number, v?: number) => unknown
    >
    const call = target[method] as (k: number, v?: number) => unknown
    const undo = restore === undefined ? undefined : (target[restore] as (k: number) => unknown)
    const random = seeded(n ^ 0x0b5e)
    let count = 0
    for (let i = 0; i < PROBES; i++) {
      const present = method === 'has' || method === 'get' || method === 'delete'
      const k = integer(random, 0, Math.max(0, n - 1)) + (present ? 0 : n)
      tally.calls = 0
      call.call(target, k, k)
      count += tally.calls
      if (undo !== undefined) undo.call(target, k)
    }
    return { count, calls: PROBES }
  }

const hashBuild =
  (kind: HashKind, how: 'constructor' | 'from' | 'addAll'): Runner =>
  (n, input) => {
    const tally = { calls: 0 }
    const values = shaped(input, n)
    const equivalence = countingEquivalence(tally)
    const pairs = values.map((v) => [v, v] as [number, number])
    return once(tally, () => {
      if (kind === 'HashSet') {
        if (how === 'constructor') new HashSet(values, { equivalence })
        else if (how === 'from') HashSet.from(values, { equivalence })
        else new HashSet<number>(undefined, { equivalence }).addAll(values)
      } else if (kind === 'LinkedHashSet') {
        if (how === 'constructor') new LinkedHashSet(values, { equivalence })
        else if (how === 'from') LinkedHashSet.from(values, { equivalence })
        else new LinkedHashSet<number>(undefined, { equivalence }).addAll(values)
      } else if (kind === 'HashMap') {
        if (how === 'constructor') new HashMap(pairs, { equivalence })
        else if (how === 'from') HashMap.from(pairs, { equivalence })
        else new HashMap<number, number>(undefined, { equivalence }).putAll(pairs)
      } else {
        if (how === 'constructor') new LinkedHashMap(pairs, { equivalence })
        else if (how === 'from') LinkedHashMap.from(pairs, { equivalence })
        else new LinkedHashMap<number, number>(undefined, { equivalence }).putAll(pairs)
      }
    })
  }

/** `removeAll` or `retainAll` on a hash set: `vary` names the size that changes, the other is 100. */
const hashBulk =
  (kind: 'HashSet' | 'LinkedHashSet', method: 'removeAll' | 'retainAll', vary: 'n' | 'm'): Runner =>
  (size, input) => {
    const tally = { calls: 0 }
    const n = vary === 'n' ? size : 100
    const m = vary === 'm' ? size : 100
    const set = hashed(kind, shaped(input, n), tally) as HashSet<number>
    const other = shaped(input, m, 7).map((v) => v * 2)
    return once(tally, () => set[method](other))
  }

/** A priority queue of `values` ordered by a counting comparator; the tally starts after it. */
function heap(values: number[], tally: Tally): PriorityQueue<number> {
  const queue = new PriorityQueue<number>(values, { comparator: countingComparator(tally) })
  tally.calls = 0
  return queue
}

/** The measurement of each counted row, by `member` or `member#clause`. */
export const RUNNERS: { readonly [key: string]: Runner } = {
  // Sorted sets and maps
  'TreeSet.add': (n, input) => {
    const tally = { calls: 0 }
    const set = treeSet(shaped(input, n), tally)
    return probes(n, tally, (k) => {
      set.add(k + 0.5)
    })
  },
  'TreeMap.set': (n, input) => {
    const tally = { calls: 0 }
    const map = treeMap(shaped(input, n), tally)
    return probes(n, tally, (k) => {
      map.set(k + 0.5, k)
    })
  },
  'TreeSet.has': treeProbe('has'),
  'TreeSet.delete': treeProbe('delete'),
  'TreeSet.ceiling': treeProbe('ceiling'),
  'TreeSet.floor': treeProbe('floor'),
  'TreeSet.higher': treeProbe('higher'),
  'TreeSet.lower': treeProbe('lower'),
  'TreeMap.get': mapProbe('get'),
  'TreeMap.ceilingEntry': mapProbe('ceilingEntry'),
  'TreeMap.floorEntry': mapProbe('floorEntry'),
  'TreeMap.higherEntry': mapProbe('higherEntry'),
  'TreeMap.lowerEntry': mapProbe('lowerEntry'),
  'TreeSet.constructor': (n, input) => {
    const tally = { calls: 0 }
    const values = shaped(input, n)
    return once(tally, () => new TreeSet(values, { comparator: countingComparator(tally) }))
  },
  'TreeSet.static from': (n, input) => {
    const tally = { calls: 0 }
    const values = shaped(input, n)
    return once(tally, () => TreeSet.from(values, { comparator: countingComparator(tally) }))
  },
  'TreeMap.constructor': (n, input) => {
    const tally = { calls: 0 }
    const pairs = shaped(input, n).map((v) => [v, v] as [number, number])
    return once(tally, () => new TreeMap(pairs, { comparator: countingComparator(tally) }))
  },
  'TreeMap.static from': (n, input) => {
    const tally = { calls: 0 }
    const pairs = shaped(input, n).map((v) => [v, v] as [number, number])
    return once(tally, () => TreeMap.from(pairs, { comparator: countingComparator(tally) }))
  },
  'TreeSet.addAll': (n, input) => {
    const tally = { calls: 0 }
    const set = treeSet([], tally)
    const values = shaped(input, n)
    return once(tally, () => set.addAll(values))
  },
  'TreeMap.putAll': (n, input) => {
    const tally = { calls: 0 }
    const map = treeMap([], tally)
    const pairs = shaped(input, n).map((v) => [v, v] as [number, number])
    return once(tally, () => map.putAll(pairs))
  },
  'TreeSet.removeAll#n': (n, input) => {
    const tally = { calls: 0 }
    const set = treeSet(shaped(input, n), tally)
    const other = shaped('random', 100, 7).map((v) => v * 2)
    return once(tally, () => set.removeAll(other))
  },
  'TreeSet.removeAll#m': (m, input) => {
    const tally = { calls: 0 }
    const set = treeSet(shaped(input, 100), tally)
    const other = shaped('random', m, 7).map((v) => v * 2)
    return once(tally, () => set.removeAll(other))
  },
  'TreeSet.retainAll#n': (n, input) => {
    const tally = { calls: 0 }
    const set = treeSet(shaped(input, n), tally)
    const other = shaped('random', 100, 7).map((v) => v * 2)
    return once(tally, () => set.retainAll(other))
  },
  'TreeSet.retainAll#m': (m, input) => {
    const tally = { calls: 0 }
    const set = treeSet(shaped(input, 100), tally)
    const other = shaped('random', m, 7).map((v) => v * 2)
    return once(tally, () => set.retainAll(other))
  },
  // Priority queues
  'PriorityQueue.constructor': (n, input) => {
    const tally = { calls: 0 }
    const values = shaped(input, n)
    return once(tally, () => new PriorityQueue(values, { comparator: countingComparator(tally) }))
  },
  'PriorityQueue.static from': (n, input) => {
    const tally = { calls: 0 }
    const values = shaped(input, n)
    return once(tally, () => PriorityQueue.from(values, { comparator: countingComparator(tally) }))
  },
  'PriorityQueue.add': (n, input) => {
    const tally = { calls: 0 }
    const queue = heap(shaped(input, n), tally)
    let next = -1
    return probes(n, tally, () => {
      queue.add(next--)
    })
  },
  'PriorityQueue.poll': (n, input) => {
    const tally = { calls: 0 }
    const queue = heap(shaped(input, n + PROBES), tally)
    return probes(n, tally, () => {
      queue.poll()
    })
  },
  'PriorityQueue.delete': (n, input) => {
    const tally = { calls: 0 }
    const queue = heap(shaped(input, n + PROBES), tally)
    return probes(n, tally, (k) => {
      queue.delete(k)
    })
  },
  'PriorityQueue.addAll': (n, input) => {
    const tally = { calls: 0 }
    const queue = heap([], tally)
    const values = shaped(input, n)
    return once(tally, () => queue.addAll(values))
  },
  'PriorityQueue.removeAll': (n, input) => {
    const tally = { calls: 0 }
    const queue = heap(shaped(input, n), tally)
    const other = shaped('random', 100, 7)
    return once(tally, () => queue.removeAll(other))
  },
  'PriorityQueue.retainAll': (n, input) => {
    const tally = { calls: 0 }
    const queue = heap(shaped(input, n), tally)
    const other = shaped('random', 100, 7)
    return once(tally, () => queue.retainAll(other))
  },
  'PriorityQueue.removeIf': (n, input) => {
    const tally = { calls: 0 }
    const queue = heap(shaped(input, n), tally)
    return once(tally, () => queue.removeIf((v) => v % 3 === 0))
  },
  // Lists and algorithms
  'ArrayList.sort': (n, input) => {
    const tally = { calls: 0 }
    const list = new ArrayList(shaped(input, n))
    return once(tally, () => list.sort(countingComparator(tally)))
  },
  min: (n, input) => {
    const tally = { calls: 0 }
    const values = shaped(input, n)
    return once(tally, () => min(values, countingComparator(tally)))
  },
  max: (n, input) => {
    const tally = { calls: 0 }
    const values = shaped(input, n)
    return once(tally, () => max(values, countingComparator(tally)))
  },
  binarySearch: (n, input) => {
    const tally = { calls: 0 }
    const list = new ArrayList(shaped(input, n))
    const comparator = countingComparator(tally)
    return probes(n, tally, (k) => binarySearch(list, k + 0.5, comparator))
  },
  sortedIndex: (n, input) => {
    const tally = { calls: 0 }
    const list = new ArrayList(shaped(input, n))
    const comparator = countingComparator(tally)
    return probes(n, tally, (k) => sortedIndex(list, k + 0.5, comparator))
  },
  reverse: (n, input) => {
    const tally = { calls: 0 }
    const list = countingList(shaped(input, n), tally)
    return once(tally, () => reverse(list))
  },
  rotate: (n, input) => {
    const tally = { calls: 0 }
    const list = countingList(shaped(input, n), tally)
    return once(tally, () => rotate(list, Math.floor(n / 3)))
  },
  fill: (n, input) => {
    const tally = { calls: 0 }
    const list = countingList(shaped(input, n), tally)
    return once(tally, () => fill(list, 1))
  },
  frequency: (n, input) => {
    const tally = { calls: 0 }
    const list = countingList(shaped(input, n), tally)
    return once(tally, () => frequency(list, 0))
  },
  swap: (n, input) => {
    const tally = { calls: 0 }
    const list = countingList(shaped(input, Math.max(n, 2)), tally)
    return once(tally, () => swap(list, 0, list.size - 1))
  },
  'shuffle#random': (n, input) => {
    const tally = { calls: 0 }
    const list = asList(shaped(input, n))
    const random = seeded(1)
    return once(tally, () =>
      shuffle(list, () => {
        tally.calls++
        return random()
      }),
    )
  },
  'shuffle#reads': (n, input) => {
    const tally = { calls: 0 }
    const list = countingList(shaped(input, n), tally)
    const random = seeded(1)
    return once(tally, () => shuffle(list, random))
  },
  'indexOfSubList#n': (n, input) => subList(indexOfSubList, n, 100, input),
  'lastIndexOfSubList#n': (n, input) => subList(lastIndexOfSubList, n, 100, input),
  'disjoint#hash': (n, input) => {
    const tally = { calls: 0 }
    const lookup = countingHas(new HashSet(shaped(input, 100).map((v) => -1 - v)), tally)
    const probe = shaped(input, n)
    return once(tally, () => disjoint(probe, lookup))
  },
  'disjoint#sorted': (n, input) => {
    const tally = { calls: 0 }
    const lookup = treeSet(
      shaped(input, 100).map((v) => -1 - v),
      tally,
    )
    const probe = shaped(input, n)
    return once(tally, () => disjoint(probe, lookup))
  },
  'disjoint#list': (n, input) => {
    const tally = { calls: 0 }
    const lookup = countingList(
      shaped(input, 100).map((v) => -1 - v),
      tally,
    )
    const probe = shaped(input, n)
    return once(tally, () => disjoint(probe, lookup))
  },
  // Hash sets and maps with an equivalence
  'HashMap.get': hashProbe('HashMap', 'get'),
  'HashMap.set': hashProbe('HashMap', 'set', 'delete'),
  'HashSet.add': hashProbe('HashSet', 'add', 'delete'),
  'HashSet.delete': hashProbe('HashSet', 'delete', 'add'),
  'HashSet.has': hashProbe('HashSet', 'has'),
  'LinkedHashMap.get': hashProbe('LinkedHashMap', 'get'),
  'LinkedHashMap.set': hashProbe('LinkedHashMap', 'set', 'delete'),
  'LinkedHashMap.putFirst': hashProbe('LinkedHashMap', 'putFirst', 'delete'),
  'LinkedHashMap.putLast': hashProbe('LinkedHashMap', 'putLast', 'delete'),
  'LinkedHashSet.add': hashProbe('LinkedHashSet', 'add', 'delete'),
  'LinkedHashSet.addFirst': hashProbe('LinkedHashSet', 'addFirst', 'delete'),
  'LinkedHashSet.addLast': hashProbe('LinkedHashSet', 'addLast', 'delete'),
  'LinkedHashSet.delete': hashProbe('LinkedHashSet', 'delete', 'add'),
  'LinkedHashSet.has': hashProbe('LinkedHashSet', 'has'),
  'HashSet.constructor': hashBuild('HashSet', 'constructor'),
  'HashSet.static from': hashBuild('HashSet', 'from'),
  'HashSet.addAll': hashBuild('HashSet', 'addAll'),
  'LinkedHashSet.constructor': hashBuild('LinkedHashSet', 'constructor'),
  'LinkedHashSet.static from': hashBuild('LinkedHashSet', 'from'),
  'LinkedHashSet.addAll': hashBuild('LinkedHashSet', 'addAll'),
  'HashMap.constructor': hashBuild('HashMap', 'constructor'),
  'HashMap.static from': hashBuild('HashMap', 'from'),
  'HashMap.putAll': hashBuild('HashMap', 'addAll'),
  'LinkedHashMap.constructor': hashBuild('LinkedHashMap', 'constructor'),
  'LinkedHashMap.static from': hashBuild('LinkedHashMap', 'from'),
  'LinkedHashMap.putAll': hashBuild('LinkedHashMap', 'addAll'),
  'HashSet.removeAll#n': hashBulk('HashSet', 'removeAll', 'n'),
  'HashSet.removeAll#m': hashBulk('HashSet', 'removeAll', 'm'),
  'HashSet.retainAll#n': hashBulk('HashSet', 'retainAll', 'n'),
  'HashSet.retainAll#m': hashBulk('HashSet', 'retainAll', 'm'),
  'LinkedHashSet.removeAll#n': hashBulk('LinkedHashSet', 'removeAll', 'n'),
  'LinkedHashSet.removeAll#m': hashBulk('LinkedHashSet', 'removeAll', 'm'),
  'LinkedHashSet.retainAll#n': hashBulk('LinkedHashSet', 'retainAll', 'n'),
  'LinkedHashSet.retainAll#m': hashBulk('LinkedHashSet', 'retainAll', 'm'),
  copyOfSet: (n, input) => {
    const tally = { calls: 0 }
    const values = shaped(input, n)
    return once(tally, () => copyOfSet(values, { equivalence: countingEquivalence(tally) }))
  },
  copyOfMap: (n, input) => {
    const tally = { calls: 0 }
    const pairs = shaped(input, n).map((v) => [v, v] as [number, number])
    return once(tally, () => copyOfMap(pairs, { equivalence: countingEquivalence(tally) }))
  },
}

/** A sub-list search of an all-`input` source of size `n` for a target of size `m` that misses. */
function subList(
  search: (source: never, target: never) => number,
  n: number,
  m: number,
  input: Input,
): Measured {
  const tally = { calls: 0 }
  const source = countingList(shaped(input, n), tally)
  const target = asList(shaped(input, m).map((v, i) => (i === m - 1 ? -1 : v)))
  return once(tally, () => search(source as never, target as never))
}

/** `set` behind a `Proxy` whose `has` counts its calls. */
function countingHas<E>(set: HashSet<E>, tally: Tally): HashSet<E> {
  return new Proxy(set, {
    get(target, p) {
      if (p === 'has') {
        return (value: E) => {
          tally.calls++
          return target.has(value)
        }
      }
      const value = Reflect.get(target, p, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/** The key a row's measurement is found under in `RUNNERS`. */
export function runnerKey(row: BoundRow): string {
  if (row.clause === undefined) return row.member
  const key = `${row.member}#${row.clause}`
  // Clauses that differ only in their input share the member's measurement.
  return key in RUNNERS ? key : row.member
}

/**
 * The Markdown list of the documented members whose bound no counter checks, grouped by reason,
 * as it sits between the unchecked markers on the testing page.
 */
export function renderUnchecked(rows: readonly BoundRow[] = ROWS): string {
  const out: string[] = []
  for (const reason of Object.values(REASONS)) {
    const owners = new Map<string, string[]>()
    for (const row of rows) {
      if (row.reason !== reason) continue
      const dot = row.member.indexOf('.')
      const owner = dot < 0 ? 'Functions and constants' : `\`${row.member.slice(0, dot)}\``
      const name = dot < 0 ? row.member : row.member.slice(dot + 1)
      const names = owners.get(owner) ?? []
      if (!names.includes(name)) names.push(name)
      owners.set(owner, names)
    }
    if (owners.size === 0) continue
    out.push(`- **${reason}.**`)
    for (const [owner, names] of owners) {
      out.push(`  - ${owner}: ${names.map((n) => `\`${n}\``).join(', ')}`)
    }
  }
  return out.join('\n')
}

/** The table: every documented member, sorted by name. */
// biome-ignore format: one row per line keeps the table readable
export const ROWS: readonly BoundRow[] = [
  { member: 'ArrayDeque.[ARRAY_DEQUE_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.[COLLECTION_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.[DEQUE_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.[INSPECT]', time: 'Time: as `toString`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'ArrayDeque.[QUEUE_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.[SEQUENCED_COLLECTION_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.[Symbol.iterator]', time: 'Time: O(1) to create; O(1) per step.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'ArrayDeque.[Symbol.toStringTag]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.[equalsSymbol]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.otherCollection },
  { member: 'ArrayDeque.[hashCodeSymbol]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.add', time: 'Time: amortised O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.amortised },
  { member: 'ArrayDeque.addAll', time: 'Time: amortised O(m) for `m` elements.', input: 'none', counter: 'none', growth: null, reason: REASONS.amortised },
  { member: 'ArrayDeque.addFirst', time: 'Time: amortised O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.amortised },
  { member: 'ArrayDeque.addLast', time: 'Time: amortised O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.amortised },
  { member: 'ArrayDeque.clear', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.constructor', time: 'Time: O(m) for `m` elements.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.copy', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'ArrayDeque.cursor', time: 'Time: O(1) to create; `next` O(1); `remove` O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'ArrayDeque.delete', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.equals', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.otherCollection },
  { member: 'ArrayDeque.forEach', time: 'Time: O(n) plus the calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'ArrayDeque.getFirst', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.getLast', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.has', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.isEmpty', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.peek', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.peekLast', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.poll', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.pop', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.push', time: 'Time: amortised O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.amortised },
  { member: 'ArrayDeque.removeAll', time: 'Time: O(n + m) for `m` elements.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.removeFirst', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.removeIf', time: 'Time: O(n) plus the calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'ArrayDeque.removeLast', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.retainAll', time: 'Time: O(n + m) for `m` elements.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.reversed', time: 'Time: O(1); each operation on the view costs what its mirror costs.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'ArrayDeque.revision', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.size', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.static [Symbol.hasInstance]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'ArrayDeque.static from', time: 'Time: O(m) for `m` elements.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayDeque.toArray', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'ArrayDeque.toJSON', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'ArrayDeque.toString', time: 'Time: O(length of the output) for flat contents.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'ArrayList.[ARRAY_LIST_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.[COLLECTION_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.[INSPECT]', time: 'Time: as `toString`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'ArrayList.[LIST_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.[SEQUENCED_COLLECTION_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.[Symbol.iterator]', time: 'Time: O(1) to create; O(1) per step.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'ArrayList.[Symbol.toStringTag]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.[equalsSymbol]', time: 'Time: as `equals`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'ArrayList.[hashCodeSymbol]', time: 'Time: O(n) plus element hashes.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'ArrayList.add', time: 'Time: amortised O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.amortised },
  { member: 'ArrayList.addAll', time: 'Time: O(m) amortised for `m` elements.', input: 'none', counter: 'none', growth: null, reason: REASONS.amortised },
  { member: 'ArrayList.addFirst', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.addLast', time: 'Time: amortised O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.amortised },
  { member: 'ArrayList.clear', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.constructor', time: 'Time: O(m) for `m` elements.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.copy', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'ArrayList.cursor', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'ArrayList.delete', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.equals', time: 'Time: O(n) plus element comparisons.', input: 'none', counter: 'none', growth: null, reason: REASONS.otherCollection },
  { member: 'ArrayList.forEach', time: 'Time: O(n) plus the calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'ArrayList.get', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.getFirst', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.getLast', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.has', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.indexOf', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.insert', time: 'Time: O(size − index).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.insertAll', time: 'Time: O(size + m) for `m` elements.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.isEmpty', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.lastIndexOf', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.listCursor', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'ArrayList.removeAll', time: 'Time: O(n + m) for `m` elements.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.removeAt', time: 'Time: O(size − index).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.removeFirst', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.removeIf', time: 'Time: O(n) plus the calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'ArrayList.removeLast', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.replaceAll', time: 'Time: O(n) plus the calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'ArrayList.retainAll', time: 'Time: O(n + m) for `m` elements.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.reversed', time: 'Time: O(1); each operation on the view costs what it costs on this list at the mirrored index.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'ArrayList.revision', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.set', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.size', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.sort', time: 'Time: O(n log n); at most `n·⌈log₂ n⌉` comparator calls.', input: 'random', counter: 'comparator', growth: 'O(n log n)' },
  { member: 'ArrayList.static [Symbol.hasInstance]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'ArrayList.static from', time: 'Time: O(m) for `m` elements.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ArrayList.subList', time: 'Time: O(1); each operation on the view costs what it costs on this list at the mapped index; a change of size also updates each enclosing sub-list, one step per level of nesting.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'ArrayList.toArray', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'ArrayList.toJSON', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'ArrayList.toString', time: 'Time: O(length of the output) for flat contents.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'ClassCastError.[CLASS_CAST_ERROR_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ClassCastError.constructor', time: 'Time: O(1) to construct, plus the runtime\'s stack capture.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ClassCastError.static [Symbol.hasInstance]', time: 'Time: O(1); O(prototype-chain depth) when evaluated against a subclass.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'ConcurrentModificationError.[CONCURRENT_MODIFICATION_ERROR_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ConcurrentModificationError.constructor', time: 'Time: O(1) to construct, plus the runtime\'s stack capture.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'ConcurrentModificationError.static [Symbol.hasInstance]', time: 'Time: O(1); O(prototype-chain depth) when evaluated against a subclass.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'HashMap.[HASH_MAP_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'HashMap.[INSPECT]', time: 'Time: as `toString`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'HashMap.[MAP_COLLECTION_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'HashMap.[Symbol.iterator]', time: 'Time: O(1) to create; O(1) per step.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'HashMap.[Symbol.toStringTag]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'HashMap.[equalsSymbol]', time: 'Time: as `equals`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'HashMap.[hashCodeSymbol]', time: 'Time: O(n) plus the `hash` calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'HashMap.clear', time: 'Time: O(1) with an `equivalence`; one native `clear` otherwise (at most O(n)).', input: 'none', counter: 'none', growth: null, reason: REASONS.native },
  { member: 'HashMap.compute', time: 'Time: as `set`, plus the call.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'HashMap.computeIfPresent', time: 'Time: as `set`, plus the call.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'HashMap.constructor', time: 'Time: O(m) average for `m` items, plus the `key` or `equivalence` calls.', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'HashMap.containsValue', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'HashMap.copy', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'HashMap.delete', time: 'Time: as `set`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'HashMap.entries', time: 'Time: O(1) to create; O(1) per step.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'HashMap.entrySet', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'HashMap.equals', time: 'Time: O(n) average, plus the lookups on both maps and the protocol methods.', input: 'none', counter: 'none', growth: null, reason: REASONS.otherCollection },
  { member: 'HashMap.forEach', time: 'Time: O(n) plus the calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'HashMap.get', time: 'Time: O(1) average, plus one `key` or `hash` call and the `equals` calls.', input: 'random', counter: 'equivalence', growth: 'O(1)' },
  { member: 'HashMap.getOrDefault', time: 'Time: as `get`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'HashMap.getOrInsert', time: 'Time: as `set`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'HashMap.getOrInsertComputed', time: 'Time: as `set`, plus the call.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'HashMap.has', time: 'Time: as `get`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'HashMap.isEmpty', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'HashMap.keySet', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'HashMap.keys', time: 'Time: O(1) to create; O(1) per step.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'HashMap.merge', time: 'Time: as `set`, plus the call.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'HashMap.put', time: 'Time: as `set`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'HashMap.putAll', time: 'Time: O(m) average for `m` items, plus the calls.', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'HashMap.remove', time: 'Time: as `set`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'HashMap.replace', time: 'Time: as `set`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'HashMap.replaceAll', time: 'Time: O(n) plus the calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'HashMap.revision', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'HashMap.set', time: 'Time: O(1) average, plus one `key` or `hash` call and the `equals` calls.', input: 'random', counter: 'equivalence', growth: 'O(1)' },
  { member: 'HashMap.size', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'HashMap.static [Symbol.hasInstance]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'HashMap.static from', time: 'Time: O(m) average for `m` items, plus the `key` or `equivalence` calls.', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'HashMap.toJSON', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'HashMap.toString', time: 'Time: O(length of the output) for flat contents.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'HashMap.valueCollection', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'HashMap.values', time: 'Time: O(1) to create; O(1) per step.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'HashSet.[COLLECTION_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'HashSet.[HASH_SET_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'HashSet.[INSPECT]', time: 'Time: as `toString`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'HashSet.[SET_COLLECTION_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'HashSet.[Symbol.iterator]', time: 'Time: O(1) to create; O(1) per step.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'HashSet.[Symbol.toStringTag]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'HashSet.[equalsSymbol]', time: 'Time: as `equals`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'HashSet.[hashCodeSymbol]', time: 'Time: O(n) plus the `hash` calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'HashSet.add', time: 'Time: O(1) average, plus one `key` or `hash` call and the `equals` calls.', input: 'random', counter: 'equivalence', growth: 'O(1)' },
  { member: 'HashSet.addAll', time: 'Time: O(m) average for `m` elements, plus the calls.', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'HashSet.clear', time: 'Time: O(1) with an `equivalence`; one native `clear` otherwise (at most O(n)).', input: 'none', counter: 'none', growth: null, reason: REASONS.native },
  { member: 'HashSet.constructor', time: 'Time: O(m) average for `m` elements, plus the `key` or `equivalence` calls.', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'HashSet.copy', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'HashSet.cursor', time: 'Time: O(1) to create; `next` O(1); `remove` O(1) average.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'HashSet.delete', time: 'Time: O(1) average, plus one `key` or `hash` call and the `equals` calls.', input: 'random', counter: 'equivalence', growth: 'O(1)' },
  { member: 'HashSet.entries', time: 'Time: O(1) to create; O(1) per step.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'HashSet.equals', time: 'Time: O(n) average, plus the `has` calls on both sets.', input: 'none', counter: 'none', growth: null, reason: REASONS.otherCollection },
  { member: 'HashSet.forEach', time: 'Time: O(n) plus the calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'HashSet.has', time: 'Time: O(1) average, plus one `key` or `hash` call and the `equals` calls.', input: 'random', counter: 'equivalence', growth: 'O(1)' },
  { member: 'HashSet.isEmpty', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'HashSet.keys', time: 'Time: O(1) to create; O(1) per step.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'HashSet.removeAll', time: 'Time: O(n + m) average, plus one `key` or `hash` call per element and the `equals` calls.', clause: 'n', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'HashSet.removeAll', time: 'Time: O(n + m) average, plus one `key` or `hash` call per element and the `equals` calls.', clause: 'm', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'HashSet.removeIf', time: 'Time: O(n) plus the calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'HashSet.retainAll', time: 'Time: O(n + m) average, plus one `key` or `hash` call per element and the `equals` calls.', clause: 'n', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'HashSet.retainAll', time: 'Time: O(n + m) average, plus one `key` or `hash` call per element and the `equals` calls.', clause: 'm', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'HashSet.revision', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'HashSet.size', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'HashSet.static [Symbol.hasInstance]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'HashSet.static from', time: 'Time: O(m) average for `m` elements, plus the `key` or `equivalence` calls.', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'HashSet.toArray', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'HashSet.toJSON', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'HashSet.toString', time: 'Time: O(length of the output) for flat contents.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'HashSet.values', time: 'Time: O(1) to create; O(1) per step.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'IllegalArgumentError.[ILLEGAL_ARGUMENT_ERROR_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'IllegalArgumentError.constructor', time: 'Time: O(1) to construct, plus the runtime\'s stack capture.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'IllegalArgumentError.static [Symbol.hasInstance]', time: 'Time: O(1); O(prototype-chain depth) when evaluated against a subclass.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'IllegalStateError.[ILLEGAL_STATE_ERROR_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'IllegalStateError.constructor', time: 'Time: O(1) to construct, plus the runtime\'s stack capture.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'IllegalStateError.static [Symbol.hasInstance]', time: 'Time: O(1); O(prototype-chain depth) when evaluated against a subclass.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'IndexOutOfBoundsError.[INDEX_OUT_OF_BOUNDS_ERROR_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'IndexOutOfBoundsError.constructor', time: 'Time: O(1) to construct, plus the runtime\'s stack capture.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'IndexOutOfBoundsError.static [Symbol.hasInstance]', time: 'Time: O(1); O(prototype-chain depth) when evaluated against a subclass.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'LinkedHashMap.[INSPECT]', time: 'Time: as `toString`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'LinkedHashMap.[LINKED_HASH_MAP_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashMap.[MAP_COLLECTION_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashMap.[SEQUENCED_MAP_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashMap.[Symbol.iterator]', time: 'Time: O(1) to create; O(1) per step, amortised over the steps and the changes made while it is open.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedHashMap.[Symbol.toStringTag]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashMap.[equalsSymbol]', time: 'Time: as `equals`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'LinkedHashMap.[hashCodeSymbol]', time: 'Time: O(n) plus the `hash` calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'LinkedHashMap.clear', time: 'Time: O(1) with an `equivalence`; one native `clear` otherwise (at most O(n)).', input: 'none', counter: 'none', growth: null, reason: REASONS.native },
  { member: 'LinkedHashMap.compute', time: 'Time: as `set`, plus the call.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'LinkedHashMap.computeIfPresent', time: 'Time: as `set`, plus the call.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'LinkedHashMap.constructor', time: 'Time: O(m) average for `m` items, plus the `key` or `equivalence` calls.', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'LinkedHashMap.containsValue', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashMap.copy', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedHashMap.delete', time: 'Time: as `set`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'LinkedHashMap.entries', time: 'Time: O(1) to create; O(1) per step, amortised over the steps and the changes made while it is open.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedHashMap.entrySet', time: 'Time: O(1). A call through the view other than `size`, `isEmpty` and `has` needs linked order: the first such call on the map costs O(n), once, and the view\'s ends cost what the map\'s cost, amortised.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedHashMap.equals', time: 'Time: O(n) average, plus the lookups on both maps and the protocol methods.', input: 'none', counter: 'none', growth: null, reason: REASONS.otherCollection },
  { member: 'LinkedHashMap.firstEntry', time: 'Time: O(1) amortised.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashMap.forEach', time: 'Time: O(n) plus the calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'LinkedHashMap.get', time: 'Time: O(1) average, plus one `key` or `hash` call and the `equals` calls.', input: 'random', counter: 'equivalence', growth: 'O(1)' },
  { member: 'LinkedHashMap.getOrDefault', time: 'Time: as `get`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'LinkedHashMap.getOrInsert', time: 'Time: as `set`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'LinkedHashMap.getOrInsertComputed', time: 'Time: as `set`, plus the call.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'LinkedHashMap.has', time: 'Time: as `get`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'LinkedHashMap.isEmpty', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashMap.keySet', time: 'Time: O(1). A call through the view other than `size`, `isEmpty` and `has` needs linked order: the first such call on the map costs O(n), once, and the view\'s ends cost what the map\'s cost, amortised.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedHashMap.keys', time: 'Time: O(1) to create; O(1) per step, amortised over the steps and the changes made while it is open.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedHashMap.lastEntry', time: 'Time: O(1) amortised (the first call that needs linked order costs O(n), once).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashMap.merge', time: 'Time: as `set`, plus the call.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'LinkedHashMap.pollFirstEntry', time: 'Time: O(1) amortised average.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashMap.pollLastEntry', time: 'Time: O(1) amortised average (the first call that needs linked order costs O(n), once).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashMap.put', time: 'Time: as `set`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'LinkedHashMap.putAll', time: 'Time: O(m) average for `m` items, plus the calls; O(m) amortised average with `maxSize`.', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'LinkedHashMap.putFirst', time: 'Time: O(1) amortised average, plus one `key` or `hash` call and the `equals` calls (the first call that needs linked order costs O(n), once).', input: 'random', counter: 'equivalence', growth: 'O(1)' },
  { member: 'LinkedHashMap.putLast', time: 'Time: O(1) amortised average, plus one `key` or `hash` call and the `equals` calls (the first call that needs linked order costs O(n), once).', input: 'random', counter: 'equivalence', growth: 'O(1)' },
  { member: 'LinkedHashMap.remove', time: 'Time: as `set`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'LinkedHashMap.replace', time: 'Time: as `set`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'LinkedHashMap.replaceAll', time: 'Time: O(n) plus the calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'LinkedHashMap.reversed', time: 'Time: O(1). Every call through the view needs linked order: the first such call on the map costs O(n), once, and the view\'s operations cost what the map\'s cost, amortised.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedHashMap.revision', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashMap.set', time: 'Time: O(1) average, plus one `key` or `hash` call and the `equals` calls; O(1) amortised average with `maxSize`.', input: 'random', counter: 'equivalence', growth: 'O(1)' },
  { member: 'LinkedHashMap.size', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashMap.static [Symbol.hasInstance]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'LinkedHashMap.static from', time: 'Time: O(m) average for `m` items, plus the `key` or `equivalence` calls.', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'LinkedHashMap.toJSON', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedHashMap.toString', time: 'Time: O(length of the output) for flat contents.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedHashMap.valueCollection', time: 'Time: O(1). A call through the view other than `size`, `isEmpty` and `has` needs linked order: the first such call on the map costs O(n), once, and the view\'s ends cost what the map\'s cost, amortised.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedHashMap.values', time: 'Time: O(1) to create; O(1) per step, amortised over the steps and the changes made while it is open.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedHashSet.[COLLECTION_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashSet.[INSPECT]', time: 'Time: as `toString`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'LinkedHashSet.[LINKED_HASH_SET_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashSet.[SEQUENCED_COLLECTION_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashSet.[SET_COLLECTION_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashSet.[Symbol.iterator]', time: 'Time: O(1) to create; O(1) per step, amortised over the steps and the changes made while it is open.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedHashSet.[Symbol.toStringTag]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashSet.[equalsSymbol]', time: 'Time: as `equals`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'LinkedHashSet.[hashCodeSymbol]', time: 'Time: O(n) plus the `hash` calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'LinkedHashSet.add', time: 'Time: O(1) average, plus one `key` or `hash` call and the `equals` calls.', input: 'random', counter: 'equivalence', growth: 'O(1)' },
  { member: 'LinkedHashSet.addAll', time: 'Time: O(m) average for `m` elements, plus the calls.', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'LinkedHashSet.addFirst', time: 'Time: O(1) amortised average, plus one `key` or `hash` call and the `equals` calls (the first call that needs linked order costs O(n), once).', input: 'random', counter: 'equivalence', growth: 'O(1)' },
  { member: 'LinkedHashSet.addLast', time: 'Time: O(1) amortised average, plus one `key` or `hash` call and the `equals` calls (the first call that needs linked order costs O(n), once).', input: 'random', counter: 'equivalence', growth: 'O(1)' },
  { member: 'LinkedHashSet.clear', time: 'Time: O(1) with an `equivalence`; one native `clear` otherwise (at most O(n)).', input: 'none', counter: 'none', growth: null, reason: REASONS.native },
  { member: 'LinkedHashSet.constructor', time: 'Time: O(m) average for `m` elements, plus the `key` or `equivalence` calls.', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'LinkedHashSet.copy', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedHashSet.cursor', time: 'Time: O(1) to create; `next` O(1) amortised over the steps and the changes made while it is open; `remove` O(1) average.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedHashSet.delete', time: 'Time: O(1) average, plus one `key` or `hash` call and the `equals` calls.', input: 'random', counter: 'equivalence', growth: 'O(1)' },
  { member: 'LinkedHashSet.entries', time: 'Time: O(1) to create; O(1) per step, amortised over the steps and the changes made while it is open.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedHashSet.equals', time: 'Time: O(n) average, plus the `has` calls on both sets.', input: 'none', counter: 'none', growth: null, reason: REASONS.otherCollection },
  { member: 'LinkedHashSet.forEach', time: 'Time: O(n) plus the calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'LinkedHashSet.getFirst', time: 'Time: O(1) amortised. Calls no `key`, `equals` or `hash` function.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashSet.getLast', time: 'Time: O(1) amortised (the first call that needs linked order costs O(n), once). Calls no `key`, `equals` or `hash` function.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashSet.has', time: 'Time: O(1) average, plus one `key` or `hash` call and the `equals` calls.', input: 'random', counter: 'equivalence', growth: 'O(1)' },
  { member: 'LinkedHashSet.isEmpty', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashSet.keys', time: 'Time: O(1) to create; O(1) per step, amortised over the steps and the changes made while it is open.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedHashSet.removeAll', time: 'Time: O(n + m) average, plus one `key` or `hash` call per element and the `equals` calls.', clause: 'n', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'LinkedHashSet.removeAll', time: 'Time: O(n + m) average, plus one `key` or `hash` call per element and the `equals` calls.', clause: 'm', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'LinkedHashSet.removeFirst', time: 'Time: O(1) amortised average. Calls no `key`, `equals` or `hash` function.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashSet.removeIf', time: 'Time: O(n) plus the calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'LinkedHashSet.removeLast', time: 'Time: O(1) amortised average (the first call that needs linked order costs O(n), once). Calls no `key`, `equals` or `hash` function.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashSet.retainAll', time: 'Time: O(n + m) average, plus one `key` or `hash` call per element and the `equals` calls.', clause: 'n', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'LinkedHashSet.retainAll', time: 'Time: O(n + m) average, plus one `key` or `hash` call per element and the `equals` calls.', clause: 'm', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'LinkedHashSet.reversed', time: 'Time: O(1). Every call through the view needs linked order: the first such call on the set costs O(n), once, and the view\'s operations cost what the set\'s cost, amortised.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedHashSet.revision', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashSet.size', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedHashSet.static [Symbol.hasInstance]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'LinkedHashSet.static from', time: 'Time: O(m) average for `m` elements, plus the `key` or `equivalence` calls.', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'LinkedHashSet.toArray', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedHashSet.toJSON', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedHashSet.toString', time: 'Time: O(length of the output) for flat contents.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedHashSet.values', time: 'Time: O(1) to create; O(1) per step, amortised over the steps and the changes made while it is open.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedList.[COLLECTION_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.[DEQUE_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.[INSPECT]', time: 'Time: as `toString`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'LinkedList.[LINKED_LIST_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.[QUEUE_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.[SEQUENCED_COLLECTION_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.[Symbol.iterator]', time: 'Time: O(1) to create; O(1) per step.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedList.[Symbol.toStringTag]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.[equalsSymbol]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.otherCollection },
  { member: 'LinkedList.[hashCodeSymbol]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.add', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.addAll', time: 'Time: O(m) for `m` elements.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.addFirst', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.addFirstNode', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.addLast', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.addLastNode', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.clear', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.constructor', time: 'Time: O(m) for `m` elements.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.copy', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedList.cursor', time: 'Time: O(1) to create; `next` and `remove` O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedList.delete', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.equals', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.otherCollection },
  { member: 'LinkedList.firstNode', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.forEach', time: 'Time: O(n) plus the calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'LinkedList.getFirst', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.getLast', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.has', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.insertAfter', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.insertBefore', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.isEmpty', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.lastNode', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.peek', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.peekLast', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.poll', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.pop', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.push', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.removeAll', time: 'Time: O(n + m) for `m` elements.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.removeFirst', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.removeIf', time: 'Time: O(n) plus the calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'LinkedList.removeLast', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.removeNode', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.retainAll', time: 'Time: O(n + m) for `m` elements.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.reversed', time: 'Time: O(1); each operation on the view costs what its mirror costs.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedList.revision', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.size', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.static [Symbol.hasInstance]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'LinkedList.static from', time: 'Time: O(m) for `m` elements.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'LinkedList.toArray', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedList.toJSON', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'LinkedList.toString', time: 'Time: O(length of the output) for flat contents.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'NoSuchElementError.[NO_SUCH_ELEMENT_ERROR_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'NoSuchElementError.constructor', time: 'Time: O(1) to construct, plus the runtime\'s stack capture.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'NoSuchElementError.static [Symbol.hasInstance]', time: 'Time: O(1); O(prototype-chain depth) when evaluated against a subclass.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'NullElementError.[NULL_ELEMENT_ERROR_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'NullElementError.constructor', time: 'Time: O(1) to construct, plus the runtime\'s stack capture.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'NullElementError.static [Symbol.hasInstance]', time: 'Time: O(1); O(prototype-chain depth) when evaluated against a subclass.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'PriorityQueue.[COLLECTION_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'PriorityQueue.[INSPECT]', time: 'Time: as `toString`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'PriorityQueue.[PRIORITY_QUEUE_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'PriorityQueue.[QUEUE_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'PriorityQueue.[Symbol.iterator]', time: 'Time: O(1) to create; O(1) per step.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'PriorityQueue.[Symbol.toStringTag]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'PriorityQueue.[equalsSymbol]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.otherCollection },
  { member: 'PriorityQueue.[hashCodeSymbol]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'PriorityQueue.add', time: 'Time: O(log n), with at most ⌊log2 n⌋ + 1 comparisons, where n is the size after the add.', input: 'ascending', counter: 'comparator', growth: 'O(log n)' },
  { member: 'PriorityQueue.addAll', time: 'Time: O(m log(n + m)) for `m` elements.', input: 'descending', counter: 'comparator', growth: 'O(n log n)' },
  { member: 'PriorityQueue.clear', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'PriorityQueue.comparator', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'PriorityQueue.constructor', time: 'Time: O(m) for `m` elements, with at most 2m comparisons.', input: 'descending', counter: 'comparator', growth: 'O(n)' },
  { member: 'PriorityQueue.copy', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'PriorityQueue.cursor', time: 'Time: O(1) to create; `next` O(1); `remove` O(log n), or O(n) for an element the removal of another moved behind the cursor.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'PriorityQueue.delete', time: 'Time: O(n) to find it, then at most 2⌊log2 n⌋ + 1 comparisons.', input: 'random', counter: 'comparator', growth: null },
  { member: 'PriorityQueue.equals', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.otherCollection },
  { member: 'PriorityQueue.forEach', time: 'Time: O(n) plus the calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'PriorityQueue.has', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'PriorityQueue.isEmpty', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'PriorityQueue.peek', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'PriorityQueue.poll', time: 'Time: O(log n), with at most 2⌊log2 n⌋ comparisons.', input: 'random', counter: 'comparator', growth: 'O(log n)' },
  { member: 'PriorityQueue.removeAll', time: 'Time: O(n + m) for `m` elements, plus at most 2n comparisons; O(n) extra memory.', input: 'random', counter: 'comparator', growth: 'O(n)' },
  { member: 'PriorityQueue.removeIf', time: 'Time: O(n) plus the calls, plus at most 2n comparisons; O(n) extra memory.', input: 'random', counter: 'comparator', growth: 'O(n)' },
  { member: 'PriorityQueue.retainAll', time: 'Time: O(n + m) for `m` elements, plus at most 2n comparisons; O(n) extra memory.', input: 'random', counter: 'comparator', growth: 'O(n)' },
  { member: 'PriorityQueue.revision', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'PriorityQueue.size', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'PriorityQueue.static [Symbol.hasInstance]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'PriorityQueue.static from', time: 'Time: O(m) for `m` elements, with at most 2m comparisons.', input: 'descending', counter: 'comparator', growth: 'O(n)' },
  { member: 'PriorityQueue.toArray', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'PriorityQueue.toJSON', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'PriorityQueue.toString', time: 'Time: O(length of the output) for flat contents.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeMap.[INSPECT]', time: 'Time: as `toString`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'TreeMap.[MAP_COLLECTION_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeMap.[SEQUENCED_MAP_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeMap.[SORTED_MAP_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeMap.[Symbol.iterator]', time: 'Time: O(log n) to create; O(1) amortised per step.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeMap.[Symbol.toStringTag]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeMap.[TREE_MAP_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeMap.[equalsSymbol]', time: 'Time: as `equals`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'TreeMap.[hashCodeSymbol]', time: 'Time: O(n) plus the `hash` calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'TreeMap.ceilingEntry', time: 'Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.', input: 'ascending', counter: 'comparator', growth: 'O(log n)' },
  { member: 'TreeMap.clear', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeMap.comparator', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeMap.compute', time: 'Time: as `set`, plus the call.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'TreeMap.computeIfPresent', time: 'Time: as `get`, plus the call.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'TreeMap.constructor', time: 'Time: O(m) with at most m − 1 comparisons (one when m is 1 in natural order) for `m` items whose keys are strictly ascending; O(m log m) otherwise.', clause: 'ascending', input: 'ascending', counter: 'comparator', growth: 'O(n)' },
  { member: 'TreeMap.constructor', time: 'Time: O(m) with at most m − 1 comparisons (one when m is 1 in natural order) for `m` items whose keys are strictly ascending; O(m log m) otherwise.', clause: 'otherwise', input: 'random', counter: 'comparator', growth: 'O(n log n)' },
  { member: 'TreeMap.containsValue', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeMap.copy', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeMap.delete', time: 'Time: as `get`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'TreeMap.entries', time: 'Time: O(log n) to create; O(1) amortised per step.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeMap.entrySet', time: 'Time: O(1); the view\'s ends O(log n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeMap.equals', time: 'Time: O(n log n), plus the lookups on `other` and the protocol methods.', input: 'none', counter: 'none', growth: null, reason: REASONS.otherCollection },
  { member: 'TreeMap.firstEntry', time: 'Time: O(log n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeMap.floorEntry', time: 'Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.', input: 'ascending', counter: 'comparator', growth: 'O(log n)' },
  { member: 'TreeMap.forEach', time: 'Time: O(n) plus the calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'TreeMap.get', time: 'Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.', input: 'ascending', counter: 'comparator', growth: 'O(log n)' },
  { member: 'TreeMap.getOrDefault', time: 'Time: as `get`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'TreeMap.getOrInsert', time: 'Time: as `set`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'TreeMap.getOrInsertComputed', time: 'Time: as `set`, plus the call, plus one more search when `fn` added or removed mappings.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'TreeMap.has', time: 'Time: as `get`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'TreeMap.headMap', time: 'Time: O(log n) to create; as `subMap` for the view\'s operations.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeMap.higherEntry', time: 'Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.', input: 'ascending', counter: 'comparator', growth: 'O(log n)' },
  { member: 'TreeMap.isEmpty', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeMap.keySet', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeMap.keys', time: 'Time: O(log n) to create; O(1) amortised per step.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeMap.lastEntry', time: 'Time: O(log n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeMap.lowerEntry', time: 'Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.', input: 'ascending', counter: 'comparator', growth: 'O(log n)' },
  { member: 'TreeMap.merge', time: 'Time: as `set`, plus the call.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'TreeMap.pollFirstEntry', time: 'Time: O(log n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeMap.pollLastEntry', time: 'Time: O(log n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeMap.put', time: 'Time: as `set`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'TreeMap.putAll', time: 'Time: O(m log(n + m)) for `m` items.', input: 'random', counter: 'comparator', growth: 'O(n log n)' },
  { member: 'TreeMap.putFirst', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeMap.putLast', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeMap.remove', time: 'Time: as `get`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'TreeMap.replace', time: 'Time: as `get`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'TreeMap.replaceAll', time: 'Time: O(n) plus the calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'TreeMap.reversed', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeMap.revision', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeMap.set', time: 'Time: O(log n), with at most 2⌈log2(n + 1)⌉ + 2 comparisons.', input: 'ascending', counter: 'comparator', growth: 'O(log n)' },
  { member: 'TreeMap.size', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeMap.static [Symbol.hasInstance]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'TreeMap.static from', time: 'Time: O(m) with at most m − 1 comparisons (one when m is 1 in natural order) for `m` items whose keys are strictly ascending; O(m log m) otherwise.', clause: 'ascending', input: 'ascending', counter: 'comparator', growth: 'O(n)' },
  { member: 'TreeMap.static from', time: 'Time: O(m) with at most m − 1 comparisons (one when m is 1 in natural order) for `m` items whose keys are strictly ascending; O(m log m) otherwise.', clause: 'otherwise', input: 'random', counter: 'comparator', growth: 'O(n log n)' },
  { member: 'TreeMap.subMap', time: 'Time: O(log n) to create; the view\'s operations cost O(log n), its `size` O(k + log n) for `k` mappings in range.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeMap.tailMap', time: 'Time: O(log n) to create; as `subMap` for the view\'s operations.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeMap.toJSON', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeMap.toString', time: 'Time: O(length of the output) for flat contents.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeMap.valueCollection', time: 'Time: O(1); the view\'s ends O(log n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeMap.values', time: 'Time: O(log n) to create; O(1) amortised per step.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeSet.[COLLECTION_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeSet.[INSPECT]', time: 'Time: as `toString`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'TreeSet.[SEQUENCED_COLLECTION_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeSet.[SET_COLLECTION_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeSet.[SORTED_SET_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeSet.[Symbol.iterator]', time: 'Time: O(log n) to create; O(1) amortised per step.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeSet.[Symbol.toStringTag]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeSet.[TREE_SET_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeSet.[equalsSymbol]', time: 'Time: as `equals`.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
  { member: 'TreeSet.[hashCodeSymbol]', time: 'Time: O(n) plus the `hash` calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'TreeSet.add', time: 'Time: O(log n), with at most 2⌈log2(n + 1)⌉ + 2 comparisons.', input: 'ascending', counter: 'comparator', growth: 'O(log n)' },
  { member: 'TreeSet.addAll', time: 'Time: O(m log(n + m)) for `m` elements.', input: 'random', counter: 'comparator', growth: 'O(n log n)' },
  { member: 'TreeSet.addFirst', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeSet.addLast', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeSet.ceiling', time: 'Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.', input: 'ascending', counter: 'comparator', growth: 'O(log n)' },
  { member: 'TreeSet.clear', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeSet.comparator', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeSet.constructor', time: 'Time: O(m) with at most m − 1 comparisons (one when m is 1 in natural order) for `m` elements in strictly ascending order; O(m log m) otherwise.', clause: 'ascending', input: 'ascending', counter: 'comparator', growth: 'O(n)' },
  { member: 'TreeSet.constructor', time: 'Time: O(m) with at most m − 1 comparisons (one when m is 1 in natural order) for `m` elements in strictly ascending order; O(m log m) otherwise.', clause: 'otherwise', input: 'random', counter: 'comparator', growth: 'O(n log n)' },
  { member: 'TreeSet.copy', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeSet.cursor', time: 'Time: O(log n) to create; `next` O(1) amortised; `remove` O(log n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeSet.delete', time: 'Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.', input: 'ascending', counter: 'comparator', growth: 'O(log n)' },
  { member: 'TreeSet.entries', time: 'Time: O(log n) to create; O(1) amortised per step.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeSet.equals', time: 'Time: O(n log n), plus the `has` calls on `other`.', input: 'none', counter: 'none', growth: null, reason: REASONS.otherCollection },
  { member: 'TreeSet.floor', time: 'Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.', input: 'ascending', counter: 'comparator', growth: 'O(log n)' },
  { member: 'TreeSet.forEach', time: 'Time: O(n) plus the calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'TreeSet.getFirst', time: 'Time: O(log n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeSet.getLast', time: 'Time: O(log n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeSet.has', time: 'Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.', input: 'ascending', counter: 'comparator', growth: 'O(log n)' },
  { member: 'TreeSet.headSet', time: 'Time: O(log n) to create; as `subSet` for the view\'s operations.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeSet.higher', time: 'Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.', input: 'ascending', counter: 'comparator', growth: 'O(log n)' },
  { member: 'TreeSet.isEmpty', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeSet.keys', time: 'Time: O(log n) to create; O(1) amortised per step.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeSet.lower', time: 'Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.', input: 'ascending', counter: 'comparator', growth: 'O(log n)' },
  { member: 'TreeSet.pollFirst', time: 'Time: O(log n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeSet.pollLast', time: 'Time: O(log n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeSet.removeAll', time: 'Time: O((n + m) log n) for `m` elements.', clause: 'n', input: 'random', counter: 'comparator', growth: 'O(n log n)' },
  { member: 'TreeSet.removeAll', time: 'Time: O((n + m) log n) for `m` elements.', clause: 'm', input: 'random', counter: 'comparator', growth: 'O(n)' },
  { member: 'TreeSet.removeFirst', time: 'Time: O(log n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeSet.removeIf', time: 'Time: O(n log n) plus the calls.', input: 'none', counter: 'none', growth: null, reason: REASONS.callback },
  { member: 'TreeSet.removeLast', time: 'Time: O(log n).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeSet.retainAll', time: 'Time: O((n + m) log n) for `m` elements.', clause: 'n', input: 'random', counter: 'comparator', growth: 'O(n log n)' },
  { member: 'TreeSet.retainAll', time: 'Time: O((n + m) log n) for `m` elements.', clause: 'm', input: 'random', counter: 'comparator', growth: 'O(n)' },
  { member: 'TreeSet.reversed', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeSet.revision', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeSet.size', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'TreeSet.static [Symbol.hasInstance]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'TreeSet.static from', time: 'Time: O(m) with at most m − 1 comparisons (one when m is 1 in natural order) for `m` elements in strictly ascending order; O(m log m) otherwise.', clause: 'ascending', input: 'ascending', counter: 'comparator', growth: 'O(n)' },
  { member: 'TreeSet.static from', time: 'Time: O(m) with at most m − 1 comparisons (one when m is 1 in natural order) for `m` elements in strictly ascending order; O(m log m) otherwise.', clause: 'otherwise', input: 'random', counter: 'comparator', growth: 'O(n log n)' },
  { member: 'TreeSet.subSet', time: 'Time: O(log n) to create; the view\'s operations cost O(log n), its `size` O(k + log n) for `k` members in range.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeSet.tailSet', time: 'Time: O(log n) to create; as `subSet` for the view\'s operations.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeSet.toArray', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeSet.toJSON', time: 'Time: O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeSet.toString', time: 'Time: O(length of the output) for flat contents.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'TreeSet.values', time: 'Time: O(log n) to create; O(1) amortised per step.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'UnsupportedOperationError.[UNSUPPORTED_OPERATION_ERROR_BRAND]', time: 'Time: O(1).', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'UnsupportedOperationError.constructor', time: 'Time: O(1) to construct, plus the runtime\'s stack capture.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'UnsupportedOperationError.static [Symbol.hasInstance]', time: 'Time: O(1); O(prototype-chain depth) when evaluated against a subclass.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'asList', time: 'Time: O(1). `get`, `set` and `size` are O(1), `add` amortised O(1), `insert` and `removeAt` O(n).', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'binarySearch', time: 'Time: at most ⌈log₂(n + 1)⌉ + 1 comparator calls and as many `get` calls.', input: 'ascending', counter: 'comparator', growth: null },
  { member: 'compareSymbol', time: 'Time: O(1) to read; the method\'s cost is the implementer\'s.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'comparing', time: 'Time: O(1) plus two calls of `key` and one of `comparator` per comparison.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'copyOfList', time: 'Time: O(n) for `n` elements.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'copyOfMap', time: 'Time: O(n) average for `n` items, plus the `key` or `equivalence` calls.', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'copyOfSet', time: 'Time: O(n) average for `n` elements, plus the `key` or `equivalence` calls.', input: 'random', counter: 'equivalence', growth: 'O(n)' },
  { member: 'disjoint', time: 'Time: O(n + m) expected with hash lookups, O(n log m) with a sorted collection, O(n·m) with a list.', clause: 'hash', input: 'random', counter: 'has', growth: 'O(n)' },
  { member: 'disjoint', time: 'Time: O(n + m) expected with hash lookups, O(n log m) with a sorted collection, O(n·m) with a list.', clause: 'sorted', input: 'random', counter: 'comparator', growth: 'O(n)' },
  { member: 'disjoint', time: 'Time: O(n + m) expected with hash lookups, O(n log m) with a sorted collection, O(n·m) with a list.', clause: 'list', input: 'random', counter: 'element-reads', growth: 'O(n)' },
  { member: 'equals', time: 'Time: O(1) plus the `[equalsSymbol]` method when one is called.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'equalsSymbol', time: 'Time: O(1) to read; the method\'s cost is the implementer\'s.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'fill', time: 'Time: O(n).', input: 'random', counter: 'element-reads', growth: 'O(n)' },
  { member: 'frequency', time: 'Time: O(n).', input: 'random', counter: 'element-reads', growth: 'O(n)' },
  { member: 'hashCode', time: 'Time: O(1) for numbers, booleans, `null` and `undefined`; O(1) amortised for objects; O(length) for strings and symbol descriptions; O(digits) for bigints; plus the `[hashCodeSymbol]` method when one is called.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'hashCodeSymbol', time: 'Time: O(1) to read; the method\'s cost is the implementer\'s.', input: 'none', counter: 'none', growth: null, reason: REASONS.noUserCode },
  { member: 'indexOfSubList', time: 'Time: O(n·m) for sizes `n` and `m`.', clause: 'n', input: 'all-equal', counter: 'element-reads', growth: 'O(n)' },
  { member: 'isCollection', time: 'Time: O(1), plus any getter or proxy trap that reading a property of `value` runs.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'isDeque', time: 'Time: O(1), plus any getter or proxy trap that reading a property of `value` runs.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'isList', time: 'Time: O(1), plus any getter or proxy trap that reading a property of `value` runs.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'isMapCollection', time: 'Time: O(1), plus any getter or proxy trap that reading a property of `value` runs.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'isQueue', time: 'Time: O(1), plus any getter or proxy trap that reading a property of `value` runs.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'isSequencedCollection', time: 'Time: O(1), plus any getter or proxy trap that reading a property of `value` runs.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'isSetCollection', time: 'Time: O(1), plus any getter or proxy trap that reading a property of `value` runs.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'isSortedMap', time: 'Time: O(1), plus any getter or proxy trap that reading a property of `value` runs.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'isSortedSet', time: 'Time: O(1), plus any getter or proxy trap that reading a property of `value` runs.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'lastIndexOfSubList', time: 'Time: O(n·m) for sizes `n` and `m`.', clause: 'n', input: 'all-equal', counter: 'element-reads', growth: 'O(n)' },
  { member: 'listOf', time: 'Time: O(n) for `n` elements.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'mapOf', time: 'Time: O(n) average for `n` entries.', input: 'none', counter: 'none', growth: null, reason: REASONS.native },
  { member: 'max', time: 'Time: O(n), exactly n − 1 comparator calls.', input: 'random', counter: 'comparator', growth: 'O(n)' },
  { member: 'min', time: 'Time: O(n), exactly n − 1 comparator calls.', input: 'random', counter: 'comparator', growth: 'O(n)' },
  { member: 'naturalOrder', time: 'Time: O(1) per comparison for numbers and booleans; O(1) amortised for dates and `[compareSymbol]` objects (plus the method); O(length of the common prefix) for strings; O(digits) for bigints.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'newSetFromMap', time: 'Time: O(1), or the map\'s `isEmpty` cost for a range view of a sorted map (O(log n)); each operation of the returned set costs what the matching map or key set operation costs.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'nullsFirst', time: 'Time: O(1) plus at most one call of `comparator` per comparison.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'nullsLast', time: 'Time: O(1) plus at most one call of `comparator` per comparison.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'reverse', time: 'Time: O(n).', input: 'random', counter: 'element-reads', growth: 'O(n)' },
  { member: 'reverseOrder', time: 'Time: O(1) plus one call of `comparator` per comparison.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'rotate', time: 'Time: O(n).', input: 'random', counter: 'element-reads', growth: 'O(n)' },
  { member: 'sameValueZeroEquivalence', time: 'Time: O(1) for `equals`; `hash` as {@link hashCode} without the protocol.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'setOf', time: 'Time: O(n) average for `n` elements.', input: 'none', counter: 'none', growth: null, reason: REASONS.native },
  { member: 'shuffle', time: 'Time: O(n).', clause: 'random', input: 'random', counter: 'random', growth: 'O(n)' },
  { member: 'shuffle', time: 'Time: O(n).', clause: 'reads', input: 'random', counter: 'element-reads', growth: 'O(n)' },
  { member: 'sortedIndex', time: 'Time: at most ⌈log₂(n + 1)⌉ comparator calls and as many `get` calls.', input: 'ascending', counter: 'comparator', growth: null },
  { member: 'swap', time: 'Time: O(1) plus two `get` and two `set` calls.', input: 'random', counter: 'element-reads', growth: null },
  { member: 'thenComparing', time: 'Time: O(k) for k comparators, plus at most one call of each per comparison.', input: 'none', counter: 'none', growth: null, reason: REASONS.perValue },
  { member: 'unmodifiableCollection', time: 'Time: O(1); each operation costs what the collection\'s costs.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'unmodifiableList', time: 'Time: O(1); each operation costs what the list\'s costs.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'unmodifiableMap', time: 'Time: O(1); each operation costs what the map\'s costs.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'unmodifiableSequencedCollection', time: 'Time: O(1); each operation costs what the collection\'s costs.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'unmodifiableSequencedMap', time: 'Time: O(1); each operation costs what the map\'s costs.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'unmodifiableSequencedSet', time: 'Time: O(1); each operation costs what the set\'s costs.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'unmodifiableSet', time: 'Time: O(1); each operation costs what the set\'s costs.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'unmodifiableSortedMap', time: 'Time: O(1); each operation costs what the map\'s costs.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'unmodifiableSortedSet', time: 'Time: O(1); each operation costs what the set\'s costs.', input: 'none', counter: 'none', growth: null, reason: REASONS.views },
  { member: 'valueEquivalence', time: 'Time: as {@link equals} and {@link hashCode}.', input: 'none', counter: 'none', growth: null, reason: REASONS.delegated },
]
