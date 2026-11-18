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
