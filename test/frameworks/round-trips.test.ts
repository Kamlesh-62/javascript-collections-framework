// Sending collections through JSON, structuredClone and message ports, and rebuilding them.

import { MessageChannel } from 'node:worker_threads'
import { describe, expect, it } from 'vitest'
import {
  ArrayDeque,
  ArrayList,
  asList,
  copyOfList,
  copyOfMap,
  copyOfSet,
  HashMap,
  HashSet,
  LinkedHashMap,
  LinkedHashSet,
  LinkedList,
  listOf,
  mapOf,
  NullElementError,
  newSetFromMap,
  PriorityQueue,
  reverseOrder,
  setOf,
  TreeMap,
  TreeSet,
  unmodifiableList,
  unmodifiableMap,
  unmodifiableSet,
} from '../../src/index'
import { caught } from '../contracts/readonly-collection'

/** Something with `toJSON` that can be rebuilt from that JSON and compared with the original. */
interface Case {
  name: string
  original: { toJSON(): unknown }
  rebuild: (json: unknown) => unknown
  same: (a: unknown, b: unknown) => boolean
}

type Equals = { equals(other: unknown): boolean }
const byEquals = (a: unknown, b: unknown) => (a as Equals).equals(b)
const byArray = (a: unknown, b: unknown) =>
  JSON.stringify((a as { toArray(): unknown[] }).toArray()) ===
  JSON.stringify((b as { toArray(): unknown[] }).toArray())
/** The order a priority queue gives up its elements, which is what two queues share. */
function drained(queue: unknown): unknown[] {
  const copy = (queue as PriorityQueue<number>).copy()
  const out: unknown[] = []
  while (!copy.isEmpty()) out.push(copy.poll())
  return out
}
const byPolling = (a: unknown, b: unknown) =>
  JSON.stringify(drained(a)) === JSON.stringify(drained(b))

const values = ['a', 1, 2.5, true, 'é😀']
const withNull = [...values, null]
const pairs: Array<[unknown, unknown]> = [
  ['a', 1],
  [2, 'two'],
  [true, null],
  [null, 'nothing'],
]

/** The rebuild table, one case per class or factory, with JSON-safe values. */
function cases(): Case[] {
  return [
    {
      name: 'ArrayList',
      original: new ArrayList(withNull),
      rebuild: (j) => ArrayList.from(j as unknown[]),
      same: byEquals,
    },
    {
      name: 'LinkedList',
      original: new LinkedList(withNull),
      rebuild: (j) => LinkedList.from(j as unknown[]),
      same: byArray,
    },
    {
      name: 'ArrayDeque',
      original: new ArrayDeque(values),
      rebuild: (j) => ArrayDeque.from(j as unknown[]),
      same: byArray,
    },
    {
      name: 'HashSet',
      original: new HashSet(withNull),
      rebuild: (j) => HashSet.from(j as unknown[]),
      same: byEquals,
    },
    {
      name: 'LinkedHashSet',
      original: new LinkedHashSet(withNull),
      rebuild: (j) => LinkedHashSet.from(j as unknown[]),
      same: (a, b) => byEquals(a, b) && byArray(a, b),
    },
    {
      name: 'TreeSet',
      original: new TreeSet([3, 1, 2]),
      rebuild: (j) => TreeSet.from(j as number[]),
      same: (a, b) => byEquals(a, b) && byArray(a, b),
    },
    {
      name: 'PriorityQueue',
      original: new PriorityQueue([5, 1, 3, 1]),
      rebuild: (j) => PriorityQueue.from(j as number[]),
      same: byPolling,
    },
    {
      name: 'HashMap',
      original: new HashMap(pairs),
      rebuild: (j) => HashMap.from(j as Array<[unknown, unknown]>),
      same: byEquals,
    },
    {
      name: 'LinkedHashMap',
      original: new LinkedHashMap(pairs),
      rebuild: (j) => LinkedHashMap.from(j as Array<[unknown, unknown]>),
      same: (a, b) => byEquals(a, b) && JSON.stringify(a) === JSON.stringify(b),
    },
    {
      name: 'TreeMap',
      original: new TreeMap([
        [2, 'b'],
        [1, 'a'],
      ]),
      rebuild: (j) => TreeMap.from(j as Array<[number, string]>),
      same: byEquals,
    },
    {
      name: 'listOf',
      original: listOf(...withNull),
      rebuild: (j) => copyOfList(j as unknown[]),
      same: byEquals,
    },
    {
      name: 'setOf',
      original: setOf(...withNull),
      rebuild: (j) => copyOfSet(j as unknown[]),
      same: byEquals,
    },
    {
      name: 'mapOf',
      original: mapOf(...pairs),
      rebuild: (j) => copyOfMap(j as Array<[unknown, unknown]>),
      same: byEquals,
    },
    {
      name: 'unmodifiableList',
      original: unmodifiableList(new ArrayList(values)),
      rebuild: (j) => unmodifiableList(ArrayList.from(j as unknown[])),
      same: byEquals,
    },
    {
      name: 'unmodifiableSet',
      original: unmodifiableSet(new HashSet(values)),
      rebuild: (j) => unmodifiableSet(HashSet.from(j as unknown[])),
      same: byEquals,
    },
    {
      name: 'unmodifiableMap',
      original: unmodifiableMap(new HashMap(pairs)),
      rebuild: (j) => unmodifiableMap(HashMap.from(j as Array<[unknown, unknown]>)),
      same: byEquals,
    },
    {
      name: 'newSetFromMap',
      original: newSetFromMap(new HashMap<unknown, boolean>()).add('a').add(1),
      rebuild: (j) => {
        const set = newSetFromMap(new HashMap<unknown, boolean>())
        set.addAll(j as unknown[])
        return set
      },
      same: byEquals,
    },
    {
      name: 'asList',
      original: asList([...withNull]),
      rebuild: (j) => asList(j as unknown[]),
      same: byEquals,
    },
  ]
}

describe('S1 — serialise and rebuild', () => {
  it('rebuilds every list, set, queue and deque from JSON as an equal collection [021 S1-AC1]', () => {
    for (const c of cases()) {
      const json = JSON.parse(JSON.stringify(c.original))
      expect(c.same(c.original, c.rebuild(json)), c.name).toBe(true)
    }
  })

  it('rebuilds maps from JSON pairs, keeping number, boolean and null keys [021 S1-AC2]', () => {
    const map = new HashMap<unknown, unknown>(pairs)
    const rebuilt = HashMap.from(JSON.parse(JSON.stringify(map)) as Array<[unknown, unknown]>)
    expect(rebuilt.equals(map)).toBe(true)
    expect(rebuilt.get(2)).toBe('two')
    expect(rebuilt.get(true)).toBeNull()
    expect(rebuilt.get(null)).toBe('nothing')
    expect(() => TreeMap.from([[null, 1]] as never)).toThrow(NullElementError) // natural order refuses null
  })

  it('rebuilds from structuredClone of the JSON form and from a message port [021 S1-AC3]', async () => {
    for (const c of cases()) {
      expect(c.same(c.original, c.rebuild(structuredClone(c.original.toJSON()))), c.name).toBe(true)
    }
    const { port1, port2 } = new MessageChannel()
    try {
      const received = new Promise<unknown>((resolve) => port2.once('message', resolve))
      const original = new TreeMap<number, string>([
        [2, 'b'],
        [1, 'a'],
      ])
      port1.postMessage(original.toJSON())
      const rebuilt = TreeMap.from((await received) as Array<[number, string]>)
      expect(rebuilt.equals(original)).toBe(true)
    } finally {
      port1.close()
      port2.close()
    }
  })

  it('leaves an instance intact when structuredClone is given it directly [021 S1-AC4]', () => {
    const instances: Array<{ toJSON(): unknown }> = [
      new ArrayList([1, 2]),
      new LinkedList([1, 2]),
      new ArrayDeque([1, 2]),
      new LinkedHashSet([1]),
      new TreeSet([1, 2]),
      new HashMap([['a', 1]]),
      new LinkedHashMap([['a', 1]], { accessOrder: true, maxSize: 3 }),
      setOf(1),
      asList([1, 2]),
      new HashSet(['a'], { key: (s: string) => s.toLowerCase() }),
      new TreeMap([[1, 'a']], { comparator: reverseOrder<number>() }),
      new PriorityQueue([3, 1]),
      listOf(1, 2),
      unmodifiableMap(new HashMap([['a', 1]])),
    ]
    for (const instance of instances) {
      const before = JSON.stringify(instance)
      caught(() => structuredClone(instance))
      expect(JSON.stringify(instance)).toBe(before)
      expect(String(instance)).toContain('(')
    }
  })

  it('rebuilds equal collections when the same options are passed again [021 S1-AC5]', () => {
    const caseless = { key: (s: string) => s.toLowerCase() }
    const set = new HashSet(['Ann', 'Bo'], caseless)
    const set2 = HashSet.from(JSON.parse(JSON.stringify(set)) as string[], caseless)
    expect(set2.equals(set)).toBe(true)
    expect(set2.has('ANN')).toBe(true)
    const linked = new LinkedHashSet(['Ann'], caseless)
    expect(
      LinkedHashSet.from(JSON.parse(JSON.stringify(linked)) as string[], caseless).has('ann'),
    ).toBe(true)
    const byId = { key: (p: { id: number }) => p.id }
    const records = new HashMap<{ id: number }, string>([[{ id: 1 }, 'one']], byId)
    const records2 = HashMap.from(
      JSON.parse(JSON.stringify(records)) as Array<[{ id: number }, string]>,
      byId,
    )
    expect(records2.get({ id: 1 })).toBe('one')
    const equivalence = {
      equivalence: {
        equals: (a: { id: number }, b: { id: number }) => a.id === b.id,
        hash: (p: { id: number }) => p.id,
      },
    }
    const eqSet = new HashSet([{ id: 7 }], equivalence)
    expect(
      HashSet.from(JSON.parse(JSON.stringify(eqSet)) as Array<{ id: number }>, equivalence).has({
        id: 7,
      }),
    ).toBe(true)
    const descending = { comparator: reverseOrder<number>() }
    const tree = new TreeSet([1, 3, 2], descending)
    expect(
      TreeSet.from(JSON.parse(JSON.stringify(tree)) as number[], descending).toArray(),
    ).toEqual([3, 2, 1])
    const treeMap = new TreeMap(
      [
        [1, 'a'],
        [2, 'b'],
      ],
      descending,
    )
    expect([
      ...TreeMap.from(
        JSON.parse(JSON.stringify(treeMap)) as Array<[number, string]>,
        descending,
      ).keys(),
    ]).toEqual([2, 1])
    const queue = new PriorityQueue([1, 5, 3], descending)
    expect(
      drained(PriorityQueue.from(JSON.parse(JSON.stringify(queue)) as number[], descending)),
    ).toEqual([5, 3, 1])
    const evicted: string[] = []
    const lruOptions = {
      accessOrder: true,
      maxSize: 2,
      onEvict: (_v: number, k: string) => evicted.push(k),
    }
    const lru = new LinkedHashMap<string, number>(
      [
        ['a', 1],
        ['b', 2],
      ],
      lruOptions,
    )
    const lru2 = LinkedHashMap.from(
      JSON.parse(JSON.stringify(lru)) as Array<[string, number]>,
      lruOptions,
    )
    lru2.get('a')
    lru2.set('c', 3)
    expect(evicted).toEqual(['b'])
    expect(copyOfSet(JSON.parse(JSON.stringify(set)) as string[], caseless).has('BO')).toBe(true)
    expect(
      copyOfMap(JSON.parse(JSON.stringify(records)) as Array<[{ id: number }, string]>, byId).get({
        id: 1,
      }),
    ).toBe('one')
  })

  it('documents what JSON loses, with each case checked [021 S1-AC6]', () => {
    expect(
      JSON.parse(JSON.stringify(new ArrayList([undefined, Number.NaN, Number.POSITIVE_INFINITY]))),
    ).toEqual([null, null, null])
    expect(() =>
      ArrayDeque.from(JSON.parse(JSON.stringify(new ArrayList([Number.NaN]))) as number[]),
    ).toThrow(NullElementError)
    expect(() =>
      PriorityQueue.from(JSON.parse(JSON.stringify(new ArrayList([Number.NaN]))) as number[]),
    ).toThrow(NullElementError)
    expect(() =>
      TreeSet.from(JSON.parse(JSON.stringify(new ArrayList([Number.NaN]))) as number[]),
    ).toThrow(NullElementError)
    expect(() =>
      TreeMap.from(JSON.parse(JSON.stringify(new HashMap([[Number.NaN, 1]]))) as never),
    ).toThrow(NullElementError)
    const date = new Date(0)
    expect(JSON.parse(JSON.stringify(new ArrayList([date])))).toEqual([date.toISOString()])
    expect(() => JSON.stringify(new ArrayList([1n]))).toThrow(TypeError)
    const record = { id: 1 }
    const set = new HashSet([record])
    expect(HashSet.from(JSON.parse(JSON.stringify(set)) as unknown[]).equals(set)).toBe(false) // new objects
    const nested = new ArrayList([new ArrayList([1, 2])])
    const rebuilt = ArrayList.from(JSON.parse(JSON.stringify(nested)) as unknown[])
    expect(rebuilt.get(0)).toEqual([1, 2]) // an array, not a list
    expect(rebuilt.equals(nested)).toBe(false)
  })

  it('rejects non-iterables and bad map items with TypeError naming X.from; strings become characters [021 S1-AC7]', () => {
    expect(caught(() => ArrayList.from(5 as never))).toEqual(
      expect.objectContaining({
        name: 'TypeError',
        message: expect.stringMatching(/^ArrayList\.from: /),
      }),
    )
    expect(caught(() => HashSet.from({} as never))).toEqual(
      expect.objectContaining({
        name: 'TypeError',
        message: expect.stringMatching(/^HashSet\.from: /),
      }),
    )
    expect(caught(() => TreeSet.from(null as never))).toEqual(
      expect.objectContaining({
        name: 'TypeError',
        message: expect.stringMatching(/^TreeSet\.from: /),
      }),
    )
    expect(caught(() => HashMap.from([['a', 1], 'bad'] as never))).toEqual(
      expect.objectContaining({
        name: 'TypeError',
        message: expect.stringMatching(/^HashMap\.from: /),
      }),
    )
    expect(caught(() => LinkedHashMap.from([[1]] as never))).toEqual(
      expect.objectContaining({
        name: 'TypeError',
        message: expect.stringMatching(/^LinkedHashMap\.from: /),
      }),
    )
    expect(ArrayList.from(JSON.parse('"ab"') as string).toArray()).toEqual(['a', 'b'])
    expect(HashSet.from('aab').size).toBe(2)
  })
})
