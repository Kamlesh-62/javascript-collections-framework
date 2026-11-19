// The contract suites that also run outside Node.js, each paired with the collection it runs on:
// list on ArrayList, set on HashSet, map on HashMap, sequenced map on LinkedHashMap, sorted set on
// TreeSet, sorted map on TreeMap, deque on ArrayDeque and queue on PriorityQueue, each with the
// read-only suites it includes. The library is a parameter, so the same pairs run against the
// source here and against the built package in browsers; the only difference is `inspect`, which
// checks the Node.js `inspect` output and is off outside Node.js.

import { describe } from 'vitest'
import type * as Library from '../../src/index'
import { listFactories } from '../support/list-factories'
import { describeDeque } from './deque'
import { describeList } from './list'
import { describeMapCollection } from './map'
import { describeQueue } from './queue'
import { describeSequencedMap } from './sequenced-map'
import { describeSetCollection } from './set'
import { describeSortedMap } from './sorted-map'
import { describeSortedSet } from './sorted-set'

/** The library a pair runs against: the source, or the built package with the same exports. */
export type LibraryUnderTest = typeof Library

export interface ContractPairOptions {
  /** Whether to check the Node.js `inspect` output. */
  readonly inspect: boolean
}

export interface ContractPair {
  /** The class the pair runs on. */
  readonly name: string
  /** Registers the pair's suites against `lib`. */
  readonly run: (lib: LibraryUnderTest, options: ContractPairOptions) => void
}

/** A key that returns primitives unchanged and a distinct symbol per object or function. */
function identityKey(): (value: unknown) => unknown {
  const ids = new WeakMap<object, symbol>()
  return (value) => {
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return value
    let id = ids.get(value as object)
    if (id === undefined) {
      id = Symbol('id')
      ids.set(value as object, id)
    }
    return id
  }
}

/** The three ways a hash collection can compare: native, by derived key, by an equivalence. */
function hashPaths(
  lib: LibraryUnderTest,
): ReadonlyArray<readonly [string, () => Library.HashSetOptions<unknown> | undefined]> {
  const { sameValueZeroEquivalence } = lib
  return [
    ['default', () => undefined],
    ['key', () => ({ key: identityKey() as Library.KeyOf<unknown> })],
    [
      // A user-written SameValueZero equivalence: a new object, so the collection uses buckets.
      'equivalence',
      () => ({
        equivalence: {
          equals: (a: unknown, b: unknown) => sameValueZeroEquivalence.equals(a, b),
          hash: (value: unknown) => sameValueZeroEquivalence.hash(value),
        },
      }),
    ],
  ]
}

const descending = (a: number, b: number): number => b - a

export const CONTRACT_PAIRS: readonly ContractPair[] = [
  {
    name: 'ArrayList',
    run: (lib) => {
      const lists = listFactories(lib)
      for (const [name, make] of lists.filter(([kind]) => kind === 'ArrayList')) {
        const peers = lists.map(([, peer]) => peer).filter((peer) => peer !== make)
        describeList(name, make, peers)
      }
    },
  },
  {
    name: 'HashSet',
    run: (lib) => {
      for (const [path, options] of hashPaths(lib)) {
        describe(`HashSet on the ${path} path`, () => {
          describeSetCollection(
            'HashSet',
            (initial) => new lib.HashSet<unknown>(initial, options()),
          )
        })
      }
    },
  },
  {
    name: 'HashMap',
    run: (lib, { inspect }) => {
      for (const [path, options] of hashPaths(lib)) {
        describe(`HashMap on the ${path} path`, () => {
          describeMapCollection(
            'HashMap',
            (initial) => new lib.HashMap<unknown, unknown>(initial, options()),
            { inspect },
          )
        })
      }
    },
  },
  {
    name: 'LinkedHashMap',
    run: (lib) => {
      for (const [path, options] of hashPaths(lib)) {
        for (const reversed of [false, true]) {
          const name = reversed ? 'ReversedLinkedHashMap' : 'LinkedHashMap'
          describe(`${name} on the ${path} path`, () => {
            describeSequencedMap(name, (initial) => {
              const map = new lib.LinkedHashMap<unknown, unknown>(undefined, { ...options() })
              const view = reversed ? map.reversed() : map
              if (initial !== undefined) view.putAll(initial)
              return view as never
            })
          })
        }
      }
    },
  },
  {
    name: 'TreeSet',
    run: (lib) => {
      describeSortedSet('TreeSet', (initial) => new lib.TreeSet<number>(initial))
      describeSortedSet('TreeSubSet', (initial) => {
        const view = new lib.TreeSet<number>([-1e9, 1e9]).subSet(-1e6, 1e6)
        view.addAll(initial ?? [])
        return view
      })
      describeSortedSet('ReversedTreeSet', (initial) => {
        const view = new lib.TreeSet<number>({ comparator: descending }).reversed()
        view.addAll(initial ?? [])
        return view
      })
    },
  },
  {
    name: 'TreeMap',
    run: (lib) => {
      describeSortedMap('TreeMap', (initial) => new lib.TreeMap<number, string>(initial ?? []))
      describeSortedMap('TreeSubMap', (initial) => {
        const view = new lib.TreeMap<number, string>([
          [-1e9, 'low'],
          [1e9, 'high'],
        ]).subMap(-1e6, 1e6)
        view.putAll(initial ?? [])
        return view
      })
      describeSortedMap('ReversedTreeMap', (initial) => {
        const view = new lib.TreeMap<number, string>({ comparator: descending }).reversed()
        view.putAll(initial ?? [])
        return view
      })
    },
  },
  {
    name: 'ArrayDeque',
    run: (lib) => {
      describeDeque('ArrayDeque', (initial) => new lib.ArrayDeque<number>(initial))
      describeDeque('ReversedDeque', (initial) =>
        new lib.ArrayDeque<number>([...(initial ?? [])].reverse()).reversed(),
      )
    },
  },
  {
    name: 'PriorityQueue',
    run: (lib) => {
      describeQueue('PriorityQueue', (initial) => new lib.PriorityQueue<number>(initial))
    },
  },
]

/** Registers the pair that runs on the class `name`. */
export function runContractPair(
  name: string,
  lib: LibraryUnderTest,
  options: ContractPairOptions = { inspect: true },
): void {
  const pair = CONTRACT_PAIRS.find((candidate) => candidate.name === name)
  if (pair === undefined) throw new Error(`no contract pair runs on '${name}'`)
  pair.run(lib, options)
}
