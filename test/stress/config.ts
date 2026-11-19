// Every count the stress suites use. Nothing here is derived from elapsed time: a run does the same
// work on every machine, and the testing page's counts table is rendered from these values.

/** Where the stress suites import the library from. */
export type StressTarget = 'src' | 'esm' | 'cjs'

/** The reference model a run drives. */
export type StressModel =
  | 'list'
  | 'deque'
  | 'priority-queue'
  | 'set'
  | 'map'
  | 'sorted-set'
  | 'sorted-map'
  | 'sequenced-set'
  | 'sequenced-map'
  | 'lru'

/** One (model, collection, options) combination of the deep random runs. */
export interface StressRun {
  /** Unique, used in test names and in the replay command: `set/hash-set/equivalence`. */
  readonly name: string
  readonly model: StressModel
  /** The factory's name in `test/stress/runs.ts` for this model. */
  readonly collection: string
  /** Distinct values drawn from; exceeds `high`. */
  readonly values: number
  /** Size marks: reach at least `high`, fall back to at most `low`, `cycles` times. */
  readonly high: number
  readonly low: number
  readonly cycles: number
}

/** The scale suites. */
export const SCALE = {
  /** Elements in every scale and view test. */
  elements: 1_000_000,
  /** Lookups, end removals and near-end cursor removals per class in the scale test. */
  queries: 10_000,
  /** Lookups per class where one lookup walks the collection (`has` on a deque or a queue). */
  linearQueries: 100,
  /** Nesting depth that must print, serialize, compare and hash without a stack overflow. */
  nestingDepth: 400,
  /** Nesting depth that must overflow the stack with a `RangeError`. */
  overflowDepth: 100_000,
  /** Elements in each collection when the two builds are loaded together. */
  twoCopiesElements: 100_000,
} as const

/** The deep random runs in `pnpm test:stress`. */
export const DEEP = {
  seeds: 20,
  steps: 100_000,
  /** Full-contents comparison period, in steps. */
  checkEvery: 1_000,
  /** Iterators and cursors held open at once. */
  maxOpen: 8,
} as const

/** The fixed subset of every run that `pnpm test` runs, with lower size marks. */
export const FAST = {
  seeds: 2,
  steps: 2_000,
  checkEvery: 100,
  high: 48,
  low: 8,
  cycles: 1,
} as const

/** The worst-case suites. */
export const WORST = {
  /** Elements in every input shape for sorts, heaps, trees and algorithms. */
  elements: 100_000,
  /** Distinct values given to a hash set or map whose hashes all collide. */
  collidingValues: 2_000,
  /** Elements in the target of a sub-list search. */
  subListTarget: 100,
  /** The smaller size at which each bound is counted per call. */
  smallSize: 1_000,
  /** The larger size: ten times the smaller. */
  largeSize: 10_000,
  /** Operations run with each inconsistent comparator. */
  inconsistentSteps: 2_000,
  /** Depth of each chain of nested views. */
  viewDepth: 10_000,
  /** Times the unmodifiable-view functions are applied in turn. */
  wraps: 10_000,
} as const

/** The long-running suites (source only). */
export const LONG = {
  /** Grow-to-peak and drain-to-zero cycles per class. */
  cycles: 20,
  /** The size each cycle grows to. */
  peak: 100_000,
  /** Small collections created and dropped per class. */
  smallCollections: 100_000,
  /** The largest peak size of a small collection. */
  smallPeak: 10,
  /** The most slots an inspected engine array of a small collection may hold. */
  smallSlots: 16,
  /** Values given to a bucket table in the hash-flooding check. */
  floodValues: 100_000,
  /** Of those, values crafted to share one bucket under the first seed. */
  craftedValues: 2_000,
  /** Buckets the crafted values are aimed at. */
  craftedBuckets: 4_096,
  /** The longest chain allowed at the end. */
  maxChain: 16,
} as const

/** The sizes of one set of realistic workloads (`test/scenarios/`). */
export interface WorkloadSizes {
  /** Seeds each workload runs with. */
  readonly seeds: number
  /** Tokens in the multilingual text of the word count. */
  readonly words: number
  /** Calls in the access trace of the cache. */
  readonly trace: number
  /** The cache's `maxSize`. */
  readonly cacheSize: number
  /** Events in the event log and the scheduler. */
  readonly events: number
  /** Records de-duplicated, grouped and written as JSON. */
  readonly records: number
  /** Values in the stream of the sliding window. */
  readonly stream: number
  /** Values in each window. */
  readonly window: number
  /** Elements in the sorted array searched, and in the largest list shuffled. */
  readonly sorted: number
}

/** The realistic workloads: `fast` in `pnpm test`, `full` in `pnpm test:stress`. */
export const WORKLOADS: { readonly fast: WorkloadSizes; readonly full: WorkloadSizes } = {
  fast: {
    seeds: 3,
    words: 2_000,
    trace: 2_000,
    cacheSize: 32,
    events: 500,
    records: 300,
    stream: 1_000,
    window: 24,
    sorted: 1_000,
  },
  full: {
    seeds: 3,
    words: 1_000_000,
    trace: 100_000,
    cacheSize: 100,
    events: 100_000,
    records: 20_000,
    stream: 100_000,
    window: 64,
    sorted: 100_000,
  },
} as const

/** The table of unusual and hostile values. */
export const HOSTILE = {
  /** Code units in the very long string. */
  longString: 1_048_576,
  /** Companions of each kind stored next to a value. */
  companions: 2,
  /** Bytes allowed in all of `test/support/data/`. */
  dataBudget: 65_536,
} as const

/** The nightly job. */
export const NIGHTLY = {
  /** Stops a hung run; never a pass condition. */
  timeoutMinutes: 60,
} as const

function run(
  model: StressModel,
  collection: string,
  marks: { values: number; high: number; low: number; cycles: number },
): StressRun {
  return { name: `${model}/${collection}`, model, collection, ...marks }
}

/** Sizes for models whose reference does linear work per step. */
const WIDE = { values: 4_096, high: 2_048, low: 64, cycles: 3 }
/** Sizes for models whose reference filters or stamps every member per step. */
const NARROW = { values: 2_048, high: 1_024, low: 32, cycles: 3 }
/** Sizes for the bounded maps (`maxSize` 1,024 in `runs.ts`). */
const BOUNDED = { values: 1_536, high: 1_000, low: 32, cycles: 3 }

/** Every deep random run: each model with every collection and option path it applies to. */
export const RUNS: readonly StressRun[] = [
  run('list', 'array-list', WIDE),
  run('list', 'array-list/sub-list', WIDE),
  run('list', 'array-list/reversed', WIDE),
  run('list', 'as-list', WIDE),
  run('deque', 'array-deque', WIDE),
  run('deque', 'array-deque/reversed', WIDE),
  run('deque', 'linked-list', WIDE),
  run('deque', 'linked-list/reversed', WIDE),
  run('priority-queue', 'priority-queue', WIDE),
  run('priority-queue', 'priority-queue/descending', WIDE),
  run('set', 'array-list', WIDE),
  run('set', 'linked-list', WIDE),
  run('set', 'array-deque', WIDE),
  run('set', 'hash-set', WIDE),
  run('set', 'hash-set/key', WIDE),
  run('set', 'hash-set/equivalence', WIDE),
  run('set', 'hash-set/few-hashes', WIDE),
  run('set', 'linked-hash-set', WIDE),
  run('set', 'linked-hash-set/few-hashes', WIDE),
  run('set', 'set-from-map/hash-map', WIDE),
  run('set', 'set-from-map/linked-hash-map', WIDE),
  run('map', 'hash-map', WIDE),
  run('map', 'hash-map/key', WIDE),
  run('map', 'hash-map/equivalence', WIDE),
  run('map', 'hash-map/few-hashes', WIDE),
  run('map', 'linked-hash-map', WIDE),
  run('map', 'linked-hash-map/few-hashes', WIDE),
  run('sorted-set', 'tree-set', NARROW),
  run('sorted-set', 'tree-set/descending', NARROW),
  run('sorted-set', 'tree-set/strings', NARROW),
  run('sorted-map', 'tree-map', NARROW),
  run('sorted-map', 'tree-map/descending', NARROW),
  run('sorted-map', 'tree-map/strings', NARROW),
  run('sequenced-set', 'linked-hash-set', NARROW),
  run('sequenced-set', 'linked-hash-set/key', NARROW),
  run('sequenced-set', 'linked-hash-set/equivalence', NARROW),
  run('sequenced-set', 'linked-hash-set/few-hashes', NARROW),
  run('sequenced-map', 'linked-hash-map', NARROW),
  run('sequenced-map', 'linked-hash-map/access/key', NARROW),
  run('sequenced-map', 'linked-hash-map/access/bounded/equivalence', BOUNDED),
  run('sequenced-map', 'linked-hash-map/bounded/few-hashes', BOUNDED),
  run('lru', 'linked-hash-map', BOUNDED),
  run('lru', 'linked-hash-map/key', BOUNDED),
  run('lru', 'linked-hash-map/few-hashes', BOUNDED),
]
