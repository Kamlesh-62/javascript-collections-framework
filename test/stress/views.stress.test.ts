import { assert, describe, expect, it } from 'vitest'
import {
  ArrayDeque,
  ArrayList,
  asList,
  equalsSymbol,
  HashMap,
  HashSet,
  hashCodeSymbol,
  LinkedHashMap,
  LinkedHashSet,
  LinkedList,
  TreeMap,
  TreeSet,
  unmodifiableCollection,
  unmodifiableList,
  unmodifiableMap,
  unmodifiableSequencedMap,
  unmodifiableSequencedSet,
  unmodifiableSet,
  unmodifiableSortedMap,
  unmodifiableSortedSet,
  valueEquivalence,
} from '../../src/index'
import { integer, seeded } from '../support/random'
import { expectSameSequence } from '../support/sequence'
import { SCALE } from './config'

const counts = { compare: 0, equals: 0, hash: 0, reads: 0 }

/** An element compared by value that counts its `[equalsSymbol]` and `[hashCodeSymbol]` calls. */
class Item {
  constructor(readonly n: number) {}
  [equalsSymbol](other: unknown): boolean {
    counts.equals++
    return other instanceof Item && other.n === this.n
  }
  [hashCodeSymbol](): number {
    counts.hash++
    return this.n
  }
}

const comparator = (a: number, b: number): number => {
  counts.compare++
  return a - b
}

/** An array whose element reads are counted. */
function countingArray<T>(items: T[]): T[] {
  return new Proxy(items, {
    get(target, property, receiver) {
      if (typeof property === 'string' && property.length > 0 && property >= '0' && property <= '9')
        counts.reads++
      return Reflect.get(target, property, receiver)
    },
  })
}

interface View {
  readonly name: string
  /** Creates the view; only this is counted. */
  readonly create: () => unknown
  /** What iterating the view yields, in order. */
  readonly reference: () => readonly unknown[]
  /** Reads what iterating the view yields, with entries as pairs. */
  readonly read?: (view: never) => unknown[]
  /** Searches the view and checks the answers. */
  readonly search: (view: never, random: () => number) => void
}

const pairsOf = (entries: Iterable<{ key: unknown; value: unknown }>) =>
  [...entries].map((e) => [e.key, e.value])

/** Every view kind over sources of `n` elements. */
function views(n: number): View[] {
  const numbers = Array.from({ length: n }, (_, i) => i)
  const items = numbers.map((i) => new Item(i))
  const list = new ArrayList<Item>(items)
  const viewed = asList(countingArray(items.slice()))
  const linked = new LinkedList<Item>(items)
  const deque = new ArrayDeque<Item>(items)
  const options = { equivalence: valueEquivalence }
  const hashSet = new HashSet<Item>(items, options)
  const linkedSet = new LinkedHashSet<Item>(items, options)
  const entries = items.map((item) => [item, item.n] as [Item, number])
  const hashMap = new HashMap<Item, number>(entries, options)
  const linkedMap = new LinkedHashMap<Item, number>(entries, options)
  const treeSet = new TreeSet<number>(numbers, { comparator })
  const treeMap = new TreeMap<number, number>(
    numbers.map((i) => [i, i * 2] as [number, number]),
    { comparator },
  )
  const low = Math.floor(n / 4)
  const high = Math.floor((3 * n) / 4)
  const reversedItems = () => items.slice().reverse()
  const range = (from: number, to: number) => numbers.slice(from, to)

  const listSearch =
    (offset: number, length: number) =>
    (view: { get(i: number): Item; indexOf(e: Item): number }, random: () => number) => {
      for (let q = 0; q < SCALE.queries; q++) {
        const i = integer(random, 0, length - 1)
        if (view.get(i) !== items[offset + i]) assert.fail(`get(${i})`)
      }
      for (let q = 0; q < SCALE.linearQueries; q++) {
        const i = integer(random, 0, length - 1)
        if (view.indexOf(items[offset + i] as Item) !== i) assert.fail(`indexOf at ${i}`)
      }
    }
  const reversedSearch = (view: { get(i: number): Item }, random: () => number) => {
    for (let q = 0; q < SCALE.queries; q++) {
      const i = integer(random, 0, n - 1)
      if (view.get(i) !== items[n - 1 - i]) assert.fail(`reversed get(${i})`)
    }
  }
  const hasItems = (view: { has(e: Item): boolean }, random: () => number) => {
    for (let q = 0; q < SCALE.queries; q++) {
      const i = integer(random, -n, 2 * n)
      if (view.has(new Item(i)) !== (i >= 0 && i < n)) assert.fail(`has(${i})`)
    }
  }
  const linearHas = (view: { has(e: Item): boolean }, random: () => number) => {
    for (let q = 0; q < SCALE.linearQueries; q++) {
      const i = integer(random, 0, n - 1)
      if (!view.has(items[i] as Item)) assert.fail(`has(${i})`)
    }
  }
  const getItems = (view: { get(k: Item): number | undefined }, random: () => number) => {
    for (let q = 0; q < SCALE.queries; q++) {
      const i = integer(random, -n, 2 * n)
      if (view.get(new Item(i)) !== (i >= 0 && i < n ? i : undefined)) assert.fail(`get(${i})`)
    }
  }
  const hasIn =
    (from: number, to: number) => (view: { has(x: number): boolean }, random: () => number) => {
      for (let q = 0; q < SCALE.queries; q++) {
        const x = integer(random, -1, n)
        if (view.has(x) !== (x >= from && x < to)) assert.fail(`has(${x})`)
      }
    }
  const getIn =
    (from: number, to: number) =>
    (view: { get(x: number): number | undefined }, random: () => number) => {
      for (let q = 0; q < SCALE.queries; q++) {
        const x = integer(random, -1, n)
        if (view.get(x) !== (x >= from && x < to ? x * 2 : undefined)) assert.fail(`get(${x})`)
      }
    }
  const pairs = (keys: number[]) => keys.map((k) => [k, k * 2])
  const itemPairs = (source: Item[]) => source.map((item) => [item, item.n])

  return [
    {
      name: 'ArrayList.subList',
      create: () => list.subList(low, high),
      reference: () => items.slice(low, high),
      search: listSearch(low, high - low),
    },
    {
      name: 'ArrayList.reversed',
      create: () => list.reversed(),
      reference: reversedItems,
      search: reversedSearch,
    },
    {
      name: 'unmodifiableList',
      create: () => unmodifiableList(list),
      reference: () => items,
      search: listSearch(0, n),
    },
    {
      name: 'asList.subList',
      create: () => viewed.subList(low, high),
      reference: () => items.slice(low, high),
      search: listSearch(low, high - low),
    },
    {
      name: 'asList.reversed',
      create: () => viewed.reversed(),
      reference: reversedItems,
      search: reversedSearch,
    },
    {
      name: 'LinkedList.reversed',
      create: () => linked.reversed(),
      reference: reversedItems,
      search: linearHas,
    },
    {
      name: 'ArrayDeque.reversed',
      create: () => deque.reversed(),
      reference: reversedItems,
      search: linearHas,
    },
    {
      name: 'unmodifiableCollection',
      create: () => unmodifiableCollection(deque),
      reference: () => items,
      search: linearHas,
    },
    {
      name: 'unmodifiableSet',
      create: () => unmodifiableSet(hashSet),
      reference: () => items,
      search: hasItems,
    },
    {
      name: 'LinkedHashSet.reversed',
      create: () => linkedSet.reversed(),
      reference: reversedItems,
      search: hasItems,
    },
    {
      name: 'unmodifiableSequencedSet',
      create: () => unmodifiableSequencedSet(linkedSet),
      reference: () => items,
      search: hasItems,
    },
    {
      name: 'HashMap.keySet',
      create: () => hashMap.keySet(),
      reference: () => items,
      search: hasItems,
    },
    {
      name: 'HashMap.entrySet',
      create: () => hashMap.entrySet(),
      reference: () => itemPairs(items),
      read: pairsOf as never,
      search: () => {},
    },
    {
      name: 'HashMap.valueCollection',
      create: () => hashMap.valueCollection(),
      reference: () => numbers,
      search: (view: { has(v: number): boolean }, random: () => number) => {
        for (let q = 0; q < SCALE.linearQueries; q++) {
          const v = integer(random, -1, n)
          if (view.has(v) !== (v >= 0 && v < n)) assert.fail(`has(${v})`)
        }
      },
    },
    {
      name: 'unmodifiableMap',
      create: () => unmodifiableMap(hashMap),
      reference: () => itemPairs(items),
      read: ((m: Map<Item, number>) => [...m.entries()]) as never,
      search: getItems,
    },
    {
      name: 'LinkedHashMap.reversed',
      create: () => linkedMap.reversed(),
      reference: () => itemPairs(reversedItems()),
      read: ((m: Map<Item, number>) => [...m.entries()]) as never,
      search: getItems,
    },
    {
      name: 'unmodifiableSequencedMap',
      create: () => unmodifiableSequencedMap(linkedMap),
      reference: () => itemPairs(items),
      read: ((m: Map<Item, number>) => [...m.entries()]) as never,
      search: getItems,
    },
    {
      name: 'TreeSet.subSet',
      create: () => treeSet.subSet(low, high, { fromInclusive: true, toInclusive: false }),
      reference: () => range(low, high),
      search: hasIn(low, high),
    },
    {
      name: 'TreeSet.headSet',
      create: () => treeSet.headSet(high, { inclusive: false }),
      reference: () => range(0, high),
      search: hasIn(0, high),
    },
    {
      name: 'TreeSet.tailSet',
      create: () => treeSet.tailSet(low, { inclusive: true }),
      reference: () => range(low, n),
      search: hasIn(low, n),
    },
    {
      name: 'TreeSet.reversed',
      create: () => treeSet.reversed(),
      reference: () => numbers.slice().reverse(),
      search: hasIn(0, n),
    },
    {
      name: 'unmodifiableSortedSet',
      create: () => unmodifiableSortedSet(treeSet),
      reference: () => numbers,
      search: hasIn(0, n),
    },
    {
      name: 'TreeMap.subMap',
      create: () => treeMap.subMap(low, high, { fromInclusive: true, toInclusive: false }),
      reference: () => pairs(range(low, high)),
      read: ((m: Map<number, number>) => [...m.entries()]) as never,
      search: getIn(low, high),
    },
    {
      name: 'TreeMap.headMap',
      create: () => treeMap.headMap(high, { inclusive: false }),
      reference: () => pairs(range(0, high)),
      read: ((m: Map<number, number>) => [...m.entries()]) as never,
      search: getIn(0, high),
    },
    {
      name: 'TreeMap.tailMap',
      create: () => treeMap.tailMap(low, { inclusive: true }),
      reference: () => pairs(range(low, n)),
      read: ((m: Map<number, number>) => [...m.entries()]) as never,
      search: getIn(low, n),
    },
    {
      name: 'TreeMap.reversed',
      create: () => treeMap.reversed(),
      reference: () => pairs(numbers.slice().reverse()),
      read: ((m: Map<number, number>) => [...m.entries()]) as never,
      search: getIn(0, n),
    },
    {
      name: 'TreeMap.keySet',
      create: () => treeMap.keySet(),
      reference: () => numbers,
      search: hasIn(0, n),
    },
    {
      name: 'TreeMap.entrySet',
      create: () => treeMap.entrySet(),
      reference: () => pairs(numbers),
      read: pairsOf as never,
      search: () => {},
    },
    {
      name: 'TreeMap.valueCollection',
      create: () => treeMap.valueCollection(),
      reference: () => numbers.map((i) => i * 2),
      search: () => {},
    },
    {
      name: 'unmodifiableSortedMap',
      create: () => unmodifiableSortedMap(treeMap),
      reference: () => pairs(numbers),
      read: ((m: Map<number, number>) => [...m.entries()]) as never,
      search: getIn(0, n),
    },
  ]
}

/** Creates every view with the counters reset and returns each one's counts. */
function creationCounts(n: number): Record<string, string> {
  const result: Record<string, string> = {}
  for (const view of views(n)) {
    counts.compare = 0
    counts.equals = 0
    counts.hash = 0
    counts.reads = 0
    view.create()
    result[view.name] =
      `compare ${counts.compare}, equals ${counts.equals}, hash ${counts.hash}, reads ${counts.reads}`
  }
  return result
}

describe('views over a million elements', () => {
  it('creates every kind of view with as many comparisons, equality and hash calls and element reads at a million elements as at a thousand [033 S1-AC3]', () => {
    expect(creationCounts(SCALE.elements)).toEqual(creationCounts(1_000))
  })

  it('iterates and searches every kind of view as the reference does [033 S1-AC3]', () => {
    const random = seeded(6)
    for (const view of views(SCALE.elements)) {
      const created = view.create() as Iterable<unknown>
      const read = view.read ?? ((v: Iterable<unknown>) => [...v])
      expectSameSequence(read(created as never), view.reference(), `${view.name} iteration`)
      try {
        view.search(created as never, random)
      } catch (error) {
        assert.fail(`${view.name} search: ${(error as Error).message}`)
      }
    }
  })
})
