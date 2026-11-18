// The factories the deep random runs use, by name, and the dispatch from a configured run to its
// reference-model runner.

import {
  ArrayDeque,
  ArrayList,
  asList,
  type Equivalence,
  HashMap,
  type HashMapOptions,
  HashSet,
  type HashSetOptions,
  LinkedHashMap,
  type LinkedHashMapOptions,
  LinkedHashSet,
  LinkedList,
  newSetFromMap,
  PriorityQueue,
  sameValueZeroEquivalence,
  TreeMap,
  TreeSet,
} from '../../src/index'
import type { Collection } from '../../src/interfaces/collection'
import type { List } from '../../src/interfaces/list'
import { integer } from '../support/random'
import {
  type RunTuning,
  runDequeReferenceModel,
  runListReferenceModel,
  runLruReferenceModel,
  runMapReferenceModel,
  runPriorityQueueReferenceModel,
  runReferenceModel,
  runSequencedMapReferenceModel,
  runSequencedSetReferenceModel,
  runSortedMapReferenceModel,
  runSortedSetReferenceModel,
} from '../support/reference-model'
import type { StressRun } from './config'

/** The `maxSize` of the bounded maps in the sequenced-map and LRU runs. */
export const BOUNDED_MAX_SIZE = 1_024

const ascending = (a: number, b: number): number => a - b
const descending = (a: number, b: number): number => b - a
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The equivalence that matches the default, written as a user would. */
const sameValueZero: Equivalence<unknown> = {
  equals: (a, b) => sameValueZeroEquivalence.equals(a, b),
  hash: (v) => sameValueZeroEquivalence.hash(v),
}
/** An equivalence with six hashes, so chains are long. */
const fewHashes: Equivalence<unknown> = {
  equals: (a, b) => sameValueZeroEquivalence.equals(a, b),
  hash: (v) => (typeof v === 'number' ? v % 6 : 0),
}

/** The option paths of the hash collections, by suffix. */
function hashOptions(path: string): HashSetOptions<unknown> & HashMapOptions<unknown> {
  if (path.endsWith('/key')) return { key: (v: unknown) => v as number }
  if (path.endsWith('/equivalence')) return { equivalence: sameValueZero }
  if (path.endsWith('/few-hashes')) return { equivalence: fewHashes }
  return {}
}

function factory<T>(table: Record<string, T>, run: StressRun): T {
  const make = table[run.collection]
  if (make === undefined) throw new Error(`stress: no ${run.model} factory named ${run.collection}`)
  return make
}

const LISTS: Record<string, () => List<number>> = {
  'array-list': () => new ArrayList<number>(),
  'array-list/sub-list': () => new ArrayList<number>([-1, -2]).subList(1, 1),
  'array-list/reversed': () => new ArrayList<number>().reversed() as List<number>,
  'as-list': () => asList<number>([]),
}

const DEQUES: Record<string, () => ArrayDeque<number> | LinkedList<number | null | undefined>> = {
  'array-deque': () => new ArrayDeque<number>(),
  'array-deque/reversed': () => new ArrayDeque<number>().reversed() as ArrayDeque<number>,
  'linked-list': () => new LinkedList<number | null | undefined>(),
  'linked-list/reversed': () =>
    new LinkedList<number | null | undefined>().reversed() as LinkedList<number | null | undefined>,
}

const SETS: Record<string, { model: 'set' | 'array'; make: () => Collection<number> }> = {
  'array-list': { model: 'array', make: () => new ArrayList<number>() },
  'linked-list': { model: 'array', make: () => new LinkedList<number>() },
  'array-deque': { model: 'array', make: () => new ArrayDeque<number>() },
  'hash-set': { model: 'set', make: () => new HashSet<number>() },
  'hash-set/key': { model: 'set', make: () => new HashSet<number>(undefined, hashOptions('/key')) },
  'hash-set/equivalence': {
    model: 'set',
    make: () => new HashSet<number>(undefined, hashOptions('/equivalence')),
  },
  'hash-set/few-hashes': {
    model: 'set',
    make: () => new HashSet<number>(undefined, hashOptions('/few-hashes')),
  },
  'linked-hash-set': { model: 'set', make: () => new LinkedHashSet<number>() },
  'linked-hash-set/few-hashes': {
    model: 'set',
    make: () => new LinkedHashSet<number>(undefined, hashOptions('/few-hashes')),
  },
  'set-from-map/hash-map': {
    model: 'set',
    make: () => newSetFromMap(new HashMap<number, boolean>()),
  },
  'set-from-map/linked-hash-map': {
    model: 'set',
    make: () => newSetFromMap(new LinkedHashMap<number, boolean>()),
  },
}

/** Sequenced-map modes by name: access order and `maxSize`. */
function sequencedMode(collection: string): { accessOrder: boolean; maxSize: number | undefined } {
  return {
    accessOrder: collection.includes('/access'),
    maxSize: collection.includes('/bounded') ? BOUNDED_MAX_SIZE : undefined,
  }
}

/** Draws a number in [0, values). */
const numbers = (values: number) => (random: () => number) => integer(random, 0, values - 1)
/** Draws a string key `k0` … `k<values − 1>`, so code-unit order differs from numeric order. */
const strings = (values: number) => (random: () => number) => `k${integer(random, 0, values - 1)}`

/** Every run's name: one per entry in `RUNS`. */
export function runNames(runs: readonly StressRun[]): string[] {
  return runs.map((r) => r.name)
}

/** The title prefix of one deep run's test; with the describe title it names exactly one test. */
export function deepTitle(run: StressRun, seed: number): string {
  return `${run.name} seed ${seed}:`
}

/** The command that replays one seed of one run against `src/`. */
export function replayCommand(run: StressRun, seed: number): string {
  return `pnpm test:stress --project src -t "deep random runs ${deepTitle(run, seed)}"`
}

/** Runs `body`; if it throws, adds the replay command to the error and rethrows it. */
export async function replayOnFailure(
  run: StressRun,
  seed: number,
  body: () => Promise<void>,
): Promise<void> {
  try {
    await body()
  } catch (error) {
    const replay = `Replay this seed against the source: ${replayCommand(run, seed)}`
    if (error instanceof Error) error.message = `${error.message}\n${replay}`
    else throw new Error(`${String(error)}\n${replay}`)
    throw error
  }
}

/** Runs `run` under `seed` for `steps` steps with `tuning`, through its reference-model runner. */
export function runStress(run: StressRun, seed: number, steps: number, tuning: RunTuning): void {
  const common = { seed, steps, tuning: { ...tuning, values: run.values } }
  switch (run.model) {
    case 'list':
      runListReferenceModel({ ...common, make: factory(LISTS, run) })
      return
    case 'deque': {
      const make = factory(DEQUES, run)
      const values = run.collection.startsWith('linked-list')
        ? [...Array.from({ length: run.values - 2 }, (_, i) => i), null, undefined]
        : undefined
      runDequeReferenceModel({ ...common, make: make as never, ...(values ? { values } : {}) })
      return
    }
    case 'priority-queue': {
      const compare = run.collection.endsWith('/descending') ? descending : ascending
      runPriorityQueueReferenceModel({
        ...common,
        compare,
        make: () =>
          compare === ascending
            ? new PriorityQueue<number>()
            : new PriorityQueue<number>({ comparator: descending }),
      })
      return
    }
    case 'set': {
      const entry = factory(SETS, run)
      runReferenceModel({ ...common, model: entry.model, make: entry.make })
      return
    }
    case 'map': {
      const options = hashOptions(run.collection) as HashMapOptions<number>
      const linked = run.collection.startsWith('linked-hash-map')
      runMapReferenceModel({
        ...common,
        make: () =>
          linked
            ? new LinkedHashMap<number, number>(
                undefined,
                options as LinkedHashMapOptions<number, number>,
              )
            : new HashMap<number, number>(undefined, options),
      })
      return
    }
    case 'sorted-set':
      if (run.collection.endsWith('/strings')) {
        runSortedSetReferenceModel({
          ...common,
          make: () => new TreeSet<string>(),
          compare: byCodeUnit,
          value: strings(run.values),
        })
      } else {
        const compare = run.collection.endsWith('/descending') ? descending : ascending
        runSortedSetReferenceModel({
          ...common,
          make: () =>
            compare === ascending
              ? new TreeSet<number>()
              : new TreeSet<number>({ comparator: descending }),
          compare,
          value: numbers(run.values),
        })
      }
      return
    case 'sorted-map':
      if (run.collection.endsWith('/strings')) {
        runSortedMapReferenceModel({
          ...common,
          make: () => new TreeMap<string, number>(),
          compare: byCodeUnit,
          key: strings(run.values),
        })
      } else {
        const compare = run.collection.endsWith('/descending') ? descending : ascending
        runSortedMapReferenceModel({
          ...common,
          make: () =>
            compare === ascending
              ? new TreeMap<number, number>()
              : new TreeMap<number, number>({ comparator: descending }),
          compare,
          key: numbers(run.values),
        })
      }
      return
    case 'sequenced-set':
      runSequencedSetReferenceModel({
        ...common,
        make: () => new LinkedHashSet<unknown>(undefined, hashOptions(run.collection)),
      })
      return
    case 'sequenced-map': {
      const { accessOrder, maxSize } = sequencedMode(run.collection)
      runSequencedMapReferenceModel({
        ...common,
        accessOrder,
        maxSize,
        make: (onEvict) =>
          new LinkedHashMap<unknown, number>({
            ...(hashOptions(run.collection) as LinkedHashMapOptions<unknown, number>),
            accessOrder,
            maxSize,
            onEvict: maxSize === undefined ? undefined : onEvict,
          }),
      })
      return
    }
    case 'lru':
      runLruReferenceModel({
        ...common,
        maxSize: BOUNDED_MAX_SIZE,
        make: (onEvict) =>
          new LinkedHashMap<number, number>({
            ...(hashOptions(run.collection) as LinkedHashMapOptions<number, number>),
            accessOrder: true,
            maxSize: BOUNDED_MAX_SIZE,
            onEvict,
          }),
      })
      return
  }
}
