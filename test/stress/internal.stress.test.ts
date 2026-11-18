// Internal checks against the source only: bucket layout under crafted hashes, and the storage a
// collection keeps through long use. They read engine fields, so they are skipped when the suites
// run against a built file.

import { assert, describe, expect, it } from 'vitest'
import {
  ArrayDeque,
  ArrayList,
  type Equivalence,
  HashMap,
  HashSet,
  LinkedHashMap,
  LinkedHashSet,
  LinkedList,
  PriorityQueue,
  TreeMap,
  TreeSet,
} from '../../src/index'
import { fmix, fmixInverse } from '../support/fmix'
import {
  bucketsOf,
  dequeBuffer,
  heapArray,
  listItems,
  longestChain,
  reachable,
  reachableArrays,
} from '../support/storage'
import { LONG } from './config'
import { TARGET } from './target'

const internal = TARGET === 'src'

function same(actual: unknown, expected: unknown, at: string): void {
  if (!Object.is(actual, expected)) assert.fail(`${at}: got ${actual}, reference has ${expected}`)
}

type Table = import('../../src/internal/engines/hash-table').BucketTable<unknown>

/** Every bucket table reachable from `collection`. */
async function tablesOf(collection: object): Promise<Table[]> {
  const { BucketTable } = await import('../../src/internal/engines/hash-table')
  const out: Table[] = []
  for (const value of reachable(collection, () => false)) {
    if (value instanceof BucketTable) out.push(value as Table)
  }
  return out
}

/** `LONG.floodValues` distinct hashes, the first `LONG.craftedValues` in one bucket under `seed`. */
function floodHashes(seed: number): number[] {
  const bucket = 0x123 & (LONG.craftedBuckets - 1)
  const hashes: number[] = []
  const used = new Set<number>()
  for (let k = 0; k < LONG.craftedValues; k++) {
    const h = fmixInverse((bucket + LONG.craftedBuckets * k) | 0) ^ seed
    if ((fmix(h ^ seed) & (LONG.craftedBuckets - 1)) !== bucket) throw new Error('fmix inverse')
    hashes.push(h)
    used.add(h)
  }
  for (let i = 0; hashes.length < LONG.floodValues; i++) {
    if (!used.has(i)) {
      hashes.push(i)
      used.add(i)
    }
  }
  return hashes
}

/** The hash-table collections, each over values 0 … n − 1 hashed through `hashes`. */
function flooded(hashes: readonly number[]): Array<{ name: string; make: () => object }> {
  const equivalence: Equivalence<number> = {
    equals: (a, b) => a === b,
    hash: (v) => hashes[v] ?? v,
  }
  return [
    { name: 'HashSet', make: () => new HashSet<number>(undefined, { equivalence }) },
    { name: 'HashMap', make: () => new HashMap<number, number>(undefined, { equivalence }) },
    { name: 'LinkedHashSet', make: () => new LinkedHashSet<number>(undefined, { equivalence }) },
    {
      name: 'LinkedHashMap',
      make: () => new LinkedHashMap<number, number>(undefined, { equivalence }),
    },
  ]
}

/** Adds 0 … n − 1 to a set or map and checks it against a native set. */
function fill(target: object, n: number, name: string): void {
  const t = target as {
    size: number
    has(v: number): boolean
    add?(v: number): unknown
    set?(k: number, v: number): unknown
  }
  const reference = new Set<number>()
  for (let v = 0; v < n; v++) {
    if (t.add !== undefined) t.add(v)
    else t.set?.(v, v)
    reference.add(v)
  }
  same(t.size, reference.size, `${name} size`)
  for (let v = -1; v <= n; v += 97) same(t.has(v), reference.has(v), `${name}.has(${v})`)
  let i = 0
  for (const member of target as Iterable<number | [number, number]>) {
    same(Array.isArray(member) ? member[0] : member, i, `${name} order at ${i}`)
    i++
  }
}

describe.skipIf(!internal)('hash flooding', () => {
  it('re-seeds and spreads crafted colliding hashes, leaving no long chain [036 S1-AC2]', async () => {
    const { setBucketSeedSourceForTesting } = await import('../../src/internal/engines/hash-table')
    const hashes = floodHashes(0x5eed)
    let longest = 0
    try {
      for (const { name, make } of flooded(hashes)) {
        let next = 0x5eed
        setBucketSeedSourceForTesting(() => next++)
        const target = make()
        fill(target, LONG.floodValues, name)
        const tables = await tablesOf(target)
        same(tables.length > 0, true, `${name} has a bucket table`)
        for (const table of tables) {
          if (table.size === 0) continue
          if (table.reseeds < 1) assert.fail(`${name}: no re-seed`)
          if (table.reseeds > table.growths) {
            assert.fail(`${name}: ${table.reseeds} re-seeds for ${table.growths} growths`)
          }
          const chain = longestChain(table)
          longest = Math.max(longest, chain)
          if (chain > LONG.maxChain) assert.fail(`${name}: a chain of ${chain}`)
        }
      }
    } finally {
      setBucketSeedSourceForTesting(undefined)
    }
    expect(longest).toBeGreaterThan(0)
    console.log(`longest chain after flooding: ${longest}`)
  })

  it('terminates with reference results when every table gets the same seed [036 S1-AC3]', async () => {
    const { setBucketSeedSourceForTesting } = await import('../../src/internal/engines/hash-table')
    const hashes = floodHashes(0x5eed)
    try {
      setBucketSeedSourceForTesting(() => 0x5eed)
      for (const { name, make } of flooded(hashes)) {
        const target = make()
        fill(target, LONG.floodValues, name)
        for (const table of await tablesOf(target)) {
          if (table.reseeds > table.growths) {
            assert.fail(`${name}: ${table.reseeds} re-seeds for ${table.growths} growths`)
          }
        }
        // Lookups still find every crafted value.
        const t = target as { has(v: number): boolean; delete(v: number): boolean }
        for (let v = 0; v < LONG.craftedValues; v += 7) same(t.has(v), true, `${name}.has(${v})`)
        for (let v = 0; v < LONG.craftedValues; v += 7)
          same(t.delete(v), true, `${name}.delete(${v})`)
      }
    } finally {
      setBucketSeedSourceForTesting(undefined)
    }
  })
})

/** An element: an object, so whether a collection still references it can be checked. */
interface Element {
  readonly id: number
}

/** A collection under test: how to build it, add an element, and the ways to drain it. */
interface Subject {
  readonly name: string
  make(): object
  add(target: never, element: Element): void
  /** Each drains the whole collection one way; `evicts` adds fresh elements to push the old out. */
  readonly drains: ReadonlyArray<{
    readonly how: string
    run(target: never, fresh: () => Element): void
  }>
  /** Whether iteration follows insertion order (else the contents are compared as a set). */
  readonly ordered: boolean
}

const byId = (a: Element, b: Element) => a.id - b.id

function cursorDrain(target: {
  cursor(): { hasNext(): boolean; next(): unknown; remove(): void }
}) {
  const cursor = target.cursor()
  while (cursor.hasNext()) {
    cursor.next()
    cursor.remove()
  }
}

type Sized = { readonly size: number; clear(): void }

function setDrains<S extends Sized & { delete(e: Element): boolean }>(extra: Subject['drains']) {
  return [
    {
      how: 'delete',
      run: (s: S) => {
        for (const e of [...(s as unknown as Iterable<Element>)]) s.delete(e)
      },
    },
    { how: 'clear', run: (s: S) => s.clear() },
    { how: 'cursor removal', run: (s: S) => cursorDrain(s as never) },
    ...extra,
  ] as Subject['drains']
}

function mapDrains<M extends Sized & { delete(k: Element): boolean; keySet(): object }>(
  extra: Subject['drains'],
) {
  return [
    {
      how: 'delete',
      run: (m: M) => {
        for (const k of [...(m as unknown as { keys(): Iterable<Element> }).keys()]) m.delete(k)
      },
    },
    { how: 'clear', run: (m: M) => m.clear() },
    { how: 'cursor removal', run: (m: M) => cursorDrain(m.keySet() as never) },
    ...extra,
  ] as Subject['drains']
}

const equivalence: Equivalence<Element> = { equals: (a, b) => a.id === b.id, hash: (e) => e.id }
const key = (e: Element) => e.id

function subjects(): Subject[] {
  const list = (name: string, make: () => ArrayList<Element>): Subject => ({
    name,
    make,
    add: (l: ArrayList<Element>, e) => {
      l.add(e)
    },
    ordered: true,
    drains: [
      {
        how: 'removeAt',
        run: (l: ArrayList<Element>) => {
          while (l.size > 0) l.removeAt(l.size - 1)
        },
      },
      { how: 'clear', run: (l: ArrayList<Element>) => l.clear() },
      {
        how: 'cursor removal',
        run: (l: ArrayList<Element>) => {
          const cursor = l.listCursor(l.size)
          while (cursor.hasPrevious()) {
            cursor.previous()
            cursor.remove()
          }
        },
      },
    ] as Subject['drains'],
  })
  const deque = (name: string, make: () => ArrayDeque<Element> | LinkedList<Element>): Subject => ({
    name,
    make,
    add: (d: ArrayDeque<Element>, e) => {
      d.add(e)
    },
    ordered: true,
    drains: [
      {
        how: 'poll',
        run: (d: ArrayDeque<Element>) => {
          while (d.poll() !== undefined) {
            // Drains from the front.
          }
        },
      },
      {
        how: 'pop',
        run: (d: ArrayDeque<Element>) => {
          while (d.pop() !== undefined) {
            // Drains from the back.
          }
        },
      },
      { how: 'clear', run: (d: ArrayDeque<Element>) => d.clear() },
      { how: 'cursor removal', run: (d: ArrayDeque<Element>) => cursorDrain(d) },
    ] as Subject['drains'],
  })
  const evicting = (fresh: () => Element, m: LinkedHashMap<Element, Element>) => {
    const old = m.size
    for (let i = 0; i < old; i++) {
      const e = fresh()
      m.set(e, e)
    }
  }
  return [
    list('ArrayList', () => new ArrayList<Element>()),
    deque('ArrayDeque', () => new ArrayDeque<Element>()),
    deque('LinkedList', () => new LinkedList<Element>()),
    {
      name: 'PriorityQueue',
      make: () => new PriorityQueue<Element>(undefined, { comparator: byId }),
      add: (q: PriorityQueue<Element>, e) => {
        q.add(e)
      },
      ordered: false,
      drains: [
        {
          how: 'poll',
          run: (q: PriorityQueue<Element>) => {
            while (q.poll() !== undefined) {
              // Drains in order.
            }
          },
        },
        { how: 'clear', run: (q: PriorityQueue<Element>) => q.clear() },
        { how: 'cursor removal', run: (q: PriorityQueue<Element>) => cursorDrain(q) },
        { how: 'removeIf', run: (q: PriorityQueue<Element>) => q.removeIf(() => true) },
      ] as Subject['drains'],
    },
    ...(
      [
        ['HashSet', () => new HashSet<Element>()],
        ['HashSet/key', () => new HashSet<Element>(undefined, { key })],
        ['HashSet/equivalence', () => new HashSet<Element>(undefined, { equivalence })],
        ['LinkedHashSet', () => new LinkedHashSet<Element>()],
        ['LinkedHashSet/equivalence', () => new LinkedHashSet<Element>(undefined, { equivalence })],
        ['TreeSet', () => new TreeSet<Element>(undefined, { comparator: byId })],
      ] as const
    ).map(
      ([name, make]): Subject => ({
        name,
        make,
        add: (s: HashSet<Element>, e) => {
          s.add(e)
        },
        ordered: name !== 'TreeSet',
        drains: setDrains(
          name.startsWith('LinkedHashSet') || name === 'TreeSet'
            ? [
                {
                  how: 'removeFirst',
                  run: (s: LinkedHashSet<Element>) => {
                    while (s.size > 0) s.removeFirst()
                  },
                },
              ]
            : [{ how: 'removeIf', run: (s: HashSet<Element>) => s.removeIf(() => true) }],
        ),
      }),
    ),
    ...(
      [
        ['HashMap', () => new HashMap<Element, Element>()],
        ['HashMap/key', () => new HashMap<Element, Element>(undefined, { key })],
        ['HashMap/equivalence', () => new HashMap<Element, Element>(undefined, { equivalence })],
        ['TreeMap', () => new TreeMap<Element, Element>(undefined, { comparator: byId })],
      ] as const
    ).map(
      ([name, make]): Subject => ({
        name,
        make,
        add: (m: HashMap<Element, Element>, e) => {
          m.set(e, e)
        },
        ordered: name !== 'TreeMap',
        drains: mapDrains(
          name === 'TreeMap'
            ? [
                {
                  how: 'pollFirstEntry',
                  run: (m: TreeMap<Element, Element>) => {
                    while (m.pollFirstEntry() !== undefined) {
                      // Drains in order.
                    }
                  },
                },
              ]
            : [],
        ),
      }),
    ),
    ...(
      [
        ['LinkedHashMap', undefined],
        ['LinkedHashMap/equivalence', equivalence],
      ] as const
    ).map(
      ([name, eq]): Subject => ({
        name,
        make: () =>
          new LinkedHashMap<Element, Element>(undefined, {
            equivalence: eq,
            maxSize: LONG.peak,
            onEvict: () => {
              // Delivered through the eviction queue.
            },
          }),
        add: (m: LinkedHashMap<Element, Element>, e) => {
          m.set(e, e)
        },
        ordered: true,
        drains: mapDrains([
          {
            how: 'pollFirstEntry',
            run: (m: LinkedHashMap<Element, Element>) => {
              while (m.pollFirstEntry() !== undefined) {
                // Drains in order.
              }
            },
          },
          {
            how: 'eviction',
            run: (m: LinkedHashMap<Element, Element>, fresh) => {
              evicting(fresh, m)
              m.clear()
            },
          },
        ]),
      }),
    ),
  ]
}

describe.skipIf(!internal)('long-running use', () => {
  for (const subject of subjects()) {
    it(`${subject.name} gives reference results through repeated growth and draining, and keeps no removed element [036 S2-AC1] [036 S2-AC2]`, () => {
      const target = subject.make()
      const elements = new WeakSet<object>()
      let nextId = 0
      const fresh = (): Element => {
        const e = { id: nextId++ }
        elements.add(e)
        return e
      }
      const isElement = (value: object) => elements.has(value)
      for (let cycle = 0; cycle < LONG.cycles; cycle++) {
        const added: Element[] = []
        for (let i = 0; i < LONG.peak; i++) {
          const e = fresh()
          subject.add(target as never, e)
          added.push(e)
        }
        const t = target as Iterable<unknown> & { readonly size: number }
        same(t.size, LONG.peak, `${subject.name} cycle ${cycle} size`)
        const members = [...t].map((m) => (Array.isArray(m) ? m[0] : m) as Element)
        if (subject.ordered) {
          for (let i = 0; i < added.length; i++) {
            if (members[i] !== added[i]) assert.fail(`${subject.name} cycle ${cycle} order at ${i}`)
          }
        } else {
          const ids = members.map((m) => m.id).sort((a, b) => a - b)
          for (let i = 0; i < added.length; i++) {
            if (ids[i] !== (added[i] as Element).id)
              assert.fail(`${subject.name} cycle ${cycle} at ${i}`)
          }
        }
        if (cycle === 0) {
          // The walk reaches stored elements, so finding none after a drain means none are kept.
          const walked = reachable(target, isElement)
          same(walked.has(added[0] as Element), true, `${subject.name}: the walk reaches elements`)
        }
        const drain = subject.drains[cycle % subject.drains.length] as Subject['drains'][number]
        drain.run(target as never, fresh)
        same(t.size, 0, `${subject.name} cycle ${cycle} size after ${drain.how}`)
        same([...t].length, 0, `${subject.name} cycle ${cycle} iteration after ${drain.how}`)
        const kept = [...reachable(target, isElement)].filter(isElement)
        if (kept.length > 0) {
          assert.fail(
            `${subject.name}: ${kept.length} removed elements still reachable after ${drain.how}`,
          )
        }
      }
    })
  }

  it('keeps every engine array of small collections within a few slots, and list and heap arrays exactly their size [036 S2-AC4]', () => {
    const elements = new WeakSet<object>()
    const isElement = (value: object) => elements.has(value)
    for (const subject of subjects()) {
      for (let n = 0; n < LONG.smallCollections; n++) {
        const target = subject.make() as Iterable<unknown> & { readonly size: number }
        const peak = n % (LONG.smallPeak + 1)
        for (let i = 0; i < peak; i++) {
          const e = { id: i }
          elements.add(e)
          subject.add(target as never, e)
        }
        if (peak > 0 && n % 3 === 0) {
          const drain = subject.drains[n % subject.drains.length] as Subject['drains'][number]
          let id = 1_000
          drain.run(target as never, () => {
            const e = { id: id++ }
            elements.add(e)
            return e
          })
        }
        for (const array of reachableArrays(target, isElement)) {
          if (array.length > LONG.smallSlots) {
            assert.fail(`${subject.name}: an array of ${array.length} slots at peak ${peak}`)
          }
        }
        if (subject.name === 'ArrayList') same(listItems(target).length, target.size, 'items')
        if (subject.name === 'PriorityQueue') same(heapArray(target).length, target.size, 'heap')
        if (subject.name === 'ArrayDeque') {
          if (dequeBuffer(target).length > LONG.smallSlots) assert.fail('ArrayDeque buffer')
        }
      }
    }
  })
})

describe.skipIf(!internal)('storage accessors', () => {
  it('read the bucket array of a table', async () => {
    const set = new HashSet<number>([1, 2, 3], {
      equivalence: { equals: Object.is, hash: (v) => v },
    })
    const [table] = await tablesOf(set)
    expect(bucketsOf(table as Table).length).toBeGreaterThanOrEqual(8)
  })
})
