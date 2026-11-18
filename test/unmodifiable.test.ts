import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  ArrayDeque,
  ArrayList,
  asList,
  ConcurrentModificationError,
  HashMap,
  HashSet,
  hashCode,
  hashCodeSymbol,
  IllegalArgumentError,
  isCollection,
  isDeque,
  isList,
  isMapCollection,
  isQueue,
  isSequencedCollection,
  isSetCollection,
  isSortedMap,
  isSortedSet,
  LinkedHashMap,
  LinkedHashSet,
  LinkedList,
  listOf,
  type MapCollection,
  type MapEntry,
  newSetFromMap,
  type ReadonlyList,
  type ReadonlyMapCollection,
  type ReadonlySortedMap,
  type ReadonlySortedSet,
  TreeMap,
  TreeSet,
  UnsupportedOperationError,
  unmodifiableCollection,
  unmodifiableList,
  unmodifiableMap,
  unmodifiableSequencedCollection,
  unmodifiableSequencedMap,
  unmodifiableSequencedSet,
  unmodifiableSet,
  unmodifiableSortedMap,
  unmodifiableSortedSet,
} from '../src/index'
import { caught, describeReadonlyCollection } from './contracts/readonly-collection'
import { describeReadonlyList } from './contracts/readonly-list'
import { describeReadonlyMap } from './contracts/readonly-map'
import { describeReadonlySequenced } from './contracts/readonly-sequenced'
import { describeReadonlySequencedMap } from './contracts/readonly-sequenced-map'
import { describeReadonlySequencedSet } from './contracts/readonly-sequenced-set'
import { describeReadonlySet } from './contracts/readonly-set'
import { describeReadonlySortedMap } from './contracts/readonly-sorted-map'
import { describeReadonlySortedSet } from './contracts/readonly-sorted-set'
import { describeUnsupportedMutators } from './contracts/unsupported'
import { combine } from './fixtures/structural-list'

const sumOf = (elements: unknown[], hash: (value: unknown) => number) =>
  elements.reduce<number>((h, e) => (h + hash(e)) | 0, 0)
const items = (initial?: Iterable<unknown>) => [...(initial ?? [])]

describe('unmodifiable views pass the read halves of their family suites and refuse every change [019 S4-AC2]', () => {
  describe('lists', () => {
    const sources: Array<[string, (initial?: Iterable<unknown>) => ReadonlyList<unknown>]> = [
      ['ArrayList', (i) => new ArrayList<unknown>(i)],
      [
        'sub-list',
        (i) => new ArrayList<unknown>(['<', ...items(i), '>']).subList(1, 1 + items(i).length),
      ],
      ['reversed list', (i) => new ArrayList<unknown>(items(i).reverse()).reversed()],
      ['immutable list', (i) => listOf(...items(i))],
      ['list over an array', (i) => asList(items(i))],
    ]
    for (const [label, source] of sources) {
      describe(`over ${label}`, () => {
        const make = (i?: Iterable<unknown>) => unmodifiableList(source(i))
        describeReadonlyCollection('UnmodifiableList', make, {
          brackets: 'list',
          minusZero: 'kept',
          structural: { expectedHash: combine },
          peers: [(i) => new ArrayList<unknown>(i)],
        })
        describeReadonlyList('UnmodifiableList', make, [(i) => new ArrayList<unknown>(i)])
        describeReadonlySequenced('UnmodifiableList', make)
        describeUnsupportedMutators('UnmodifiableList', () => make([1, 2, 3]), 'list')
      })
    }
  })

  describe('sets', () => {
    for (const [label, source] of [
      ['HashSet', (i?: Iterable<unknown>) => new HashSet<unknown>(i)],
      ['LinkedHashSet', (i?: Iterable<unknown>) => new LinkedHashSet<unknown>(i)],
    ] as const) {
      describe(`over ${label}`, () => {
        const make = (i?: Iterable<unknown>) => unmodifiableSet(source(i))
        describeReadonlyCollection('UnmodifiableSet', make, {
          brackets: 'set',
          structural: { expectedHash: sumOf },
          peers: [(i) => new HashSet<unknown>(i)],
        })
        describeReadonlySet('UnmodifiableSet', make)
        describeUnsupportedMutators('UnmodifiableSet', () => make([1, 2]), 'set')
      })
    }
    describe('sequenced, over LinkedHashSet and its reversed view', () => {
      for (const source of [
        (i?: Iterable<unknown>) => new LinkedHashSet<unknown>(i),
        (i?: Iterable<unknown>) => new LinkedHashSet<unknown>(items(i).reverse()).reversed(),
      ]) {
        const make = (i?: Iterable<unknown>) => unmodifiableSequencedSet(source(i))
        describeReadonlySet('UnmodifiableSequencedSet', make)
        describeReadonlySequenced('UnmodifiableSequencedSet', make)
        describeReadonlySequencedSet('UnmodifiableSequencedSet', make)
        describeUnsupportedMutators('UnmodifiableSequencedSet', () => make([1, 2]), 'sequenced-set')
      }
    })
    describe('sorted, over TreeSet and its range view', () => {
      for (const source of [
        (i?: Iterable<number>) => new TreeSet<number>(i),
        (i?: Iterable<number>) => new TreeSet<number>(i).subSet(-1000, 1001),
      ]) {
        const make = (i?: Iterable<number>): ReadonlySortedSet<number> =>
          unmodifiableSortedSet(source(i))
        describeReadonlySortedSet('UnmodifiableSortedSet', make)
        describeReadonlySequencedSet('UnmodifiableSortedSet', make as never)
        describeUnsupportedMutators('UnmodifiableSortedSet', () => make([1, 2]), 'sorted-set')
      }
    })
  })

  describe('collections and sequenced collections', () => {
    for (const [label, source, nullElements] of [
      ['ArrayDeque', (i?: Iterable<unknown>) => new ArrayDeque<unknown>(i), 'reject'],
      ['LinkedList', (i?: Iterable<unknown>) => new LinkedList<unknown>(i), 'store'],
    ] as const) {
      describe(`over ${label}`, () => {
        const make = (i?: Iterable<unknown>) => unmodifiableCollection(source(i))
        describeReadonlyCollection('UnmodifiableCollection', make, {
          brackets: 'list',
          minusZero: 'kept',
          nullElements,
        })
        describeUnsupportedMutators('UnmodifiableCollection', () => make([1, 2]), 'values')
        const sequenced = (i?: Iterable<unknown>) => unmodifiableSequencedCollection(source(i))
        describeReadonlyCollection('UnmodifiableSequencedCollection', sequenced, {
          brackets: 'list',
          minusZero: 'kept',
          nullElements,
        })
        describeReadonlySequenced('UnmodifiableSequencedCollection', sequenced)
        describeUnsupportedMutators(
          'UnmodifiableSequencedCollection',
          () => sequenced([1, 2]),
          'sequenced',
        )
      })
    }
  })

  describe('maps', () => {
    describeReadonlyMap('UnmodifiableMap', (i) => unmodifiableMap(new HashMap(i)))
    describeReadonlyMap('UnmodifiableMap', (i) => unmodifiableMap(new LinkedHashMap(i)))
    describeReadonlyMap('UnmodifiableMap', (i) => unmodifiableMap(new TreeMap(i as never)), {
      order: 'ascending',
    })
    describeReadonlySet('UnmodifiableSet', (i) =>
      unmodifiableMap(new HashMap(items(i).map((e) => [e, e] as const))).keySet(),
    )
    describeReadonlyCollection(
      'UnmodifiableCollection',
      (i) =>
        unmodifiableMap(
          new HashMap(items(i).map((e, n) => [`k${n}`, e] as const)),
        ).valueCollection(),
      { brackets: 'list', minusZero: 'kept' },
    )
    const filled = () =>
      unmodifiableMap(
        new HashMap<unknown, unknown>([
          ['a', 1],
          ['b', 2],
        ]),
      )
    describeUnsupportedMutators('UnmodifiableMap', filled, 'map')
    describeUnsupportedMutators('UnmodifiableSet', () => filled().keySet(), 'set')
    describeUnsupportedMutators('UnmodifiableSet', () => filled().entrySet(), 'set')
    describeUnsupportedMutators(
      'UnmodifiableCollection',
      () => filled().valueCollection(),
      'values',
    )

    const sequenced = (i?: Iterable<readonly [unknown, unknown]>) =>
      unmodifiableSequencedMap(new LinkedHashMap<unknown, unknown>(i))
    describeReadonlyMap('UnmodifiableSequencedMap', sequenced)
    describeReadonlySequencedMap('UnmodifiableSequencedMap', sequenced)
    describeUnsupportedMutators(
      'UnmodifiableSequencedMap',
      () => sequenced([['a', 1]]),
      'sequenced-map',
    )
    describeUnsupportedMutators(
      'UnmodifiableSequencedSet',
      () => sequenced([['a', 1]]).keySet(),
      'sequenced-set',
    )
    describeUnsupportedMutators(
      'UnmodifiableSequencedSet',
      () => sequenced([['a', 1]]).entrySet(),
      'sequenced-set',
    )
    describeUnsupportedMutators(
      'UnmodifiableSequencedCollection',
      () => sequenced([['a', 1]]).valueCollection(),
      'sequenced',
    )

    for (const source of [
      (i?: Iterable<readonly [number, string]>) => new TreeMap<number, string>(i),
      (i?: Iterable<readonly [number, string]>) =>
        new TreeMap<number, string>(i).subMap(-1000, 1001),
    ]) {
      const make = (i?: Iterable<readonly [number, string]>): ReadonlySortedMap<number, string> =>
        unmodifiableSortedMap(source(i))
      describeReadonlySortedMap('UnmodifiableSortedMap', make)
      describeReadonlySequencedMap('UnmodifiableSortedMap', make as never)
      describeUnsupportedMutators('UnmodifiableSortedMap', () => make([[1, 'a']]), 'sorted-map')
      describeUnsupportedMutators(
        'UnmodifiableSortedSet',
        () => make([[1, 'a']]).keySet(),
        'sorted-set',
      )
    }
  })
})

describe('S1 — read-only windows', () => {
  it('reads what the source holds at each call; a get on a view of an access-ordered map is an access [019 S1-AC1]', () => {
    const list = new ArrayList([1, 2])
    const view = unmodifiableList(list)
    expect(view.get(1)).toBe(2)
    expect(view.indexOf(2)).toBe(1)
    const lru = new LinkedHashMap<string, number>(
      [
        ['a', 1],
        ['b', 2],
      ],
      { accessOrder: true },
    )
    const lruView = unmodifiableMap(lru)
    const revision = lru.revision
    expect(lruView.has('a')).toBe(true)
    expect([...lru.keys()]).toEqual(['a', 'b'])
    expect(lru.revision).toBe(revision)
    expect(lruView.get('a')).toBe(1)
    expect([...lru.keys()]).toEqual(['b', 'a'])
    expect(lru.revision).not.toBe(revision)
    expect(lruView.getOrDefault('b', 0)).toBe(2)
    expect([...lru.keys()]).toEqual(['a', 'b'])
  })

  it('shows later changes of the source through the view and everything obtained from it [019 S1-AC2]', () => {
    const list = new ArrayList([1, 2, 3])
    const view = unmodifiableList(list)
    const sub = view.subList(0, 3)
    const reversed = view.reversed()
    list.set(0, 10)
    expect([view.get(0), sub.get(0), reversed.getLast()]).toEqual([10, 10, 10])
    const map = new TreeMap<number, string>([[1, 'a']])
    const mapView = unmodifiableSortedMap(map)
    const keys = mapView.keySet()
    const head = mapView.headMap(10)
    map.set(2, 'b')
    expect([...keys]).toEqual([1, 2])
    expect(head.size).toBe(2)
    expect(mapView.get(2)).toBe('b')
  })

  it('refuses every mutator first with the view name, leaving the source unchanged [019 S1-AC3]', () => {
    const source = new ArrayList([1, 2])
    const view = unmodifiableList(source) as never as ArrayList<number>
    const revision = source.revision
    expect(() => view.add(3)).toThrow('UnmodifiableList.add: the collection cannot be changed')
    expect(() => view.removeAt(99)).toThrow(UnsupportedOperationError)
    expect(() => view.removeIf(5 as never)).toThrow(UnsupportedOperationError)
    expect(() => view.addAll([])).toThrow(UnsupportedOperationError)
    expect(source.toArray()).toEqual([1, 2])
    expect(source.revision).toBe(revision)
    const set = unmodifiableSet(new HashSet([1])) as never as HashSet<number>
    expect(() => set.cursor().remove()).toThrow(
      'UnmodifiableSet.cursor.remove: the collection cannot be changed',
    )
    expect(() => view.listCursor(0).set(1)).toThrow(
      'UnmodifiableList.listCursor.set: the collection cannot be changed',
    )
  })

  it('refuses changes through everything obtained from the view [019 S1-AC4]', () => {
    const list = unmodifiableList(new ArrayList([1, 2, 3])) as never as ArrayList<number>
    expect(() => list.subList(0, 2).clear()).toThrow(UnsupportedOperationError)
    expect(() => list.reversed().add(4)).toThrow(UnsupportedOperationError)
    const sorted = unmodifiableSortedSet(new TreeSet([1, 2, 3])) as never as TreeSet<number>
    for (const derived of [
      sorted.subSet(1, 3),
      sorted.headSet(2),
      sorted.tailSet(2),
      sorted.reversed(),
    ]) {
      expect(() => derived.pollFirst()).toThrow(UnsupportedOperationError)
    }
    const map = unmodifiableSortedMap(new TreeMap([[1, 'a']])) as never as TreeMap<number, string>
    for (const derived of [map.subMap(0, 5), map.headMap(5), map.tailMap(0), map.reversed()]) {
      expect(() => derived.set(2, 'b')).toThrow(UnsupportedOperationError)
    }
    expect(() => map.keySet().delete(1)).toThrow(UnsupportedOperationError)
    expect(() => map.entrySet().clear()).toThrow(UnsupportedOperationError)
    expect(() => map.valueCollection().clear()).toThrow(UnsupportedOperationError)
    expect(() => map.firstEntry()?.setValue('x')).toThrow(
      'MapEntry.setValue: the collection cannot be changed',
    )
  })

  it("answers navigation with the source's answers and wraps range views [019 S1-AC5]", () => {
    const set = new TreeSet([10, 20, 30])
    const view = unmodifiableSortedSet(set)
    expect([
      view.getFirst(),
      view.getLast(),
      view.lower(20),
      view.floor(25),
      view.ceiling(25),
      view.higher(20),
    ]).toEqual([10, 30, 10, 20, 30, 30])
    expect(view.comparator()).toBe(set.comparator())
    expect(String(view.subSet(10, 30))).toBe('UnmodifiableSortedSet(2) {10, 20}')
    const map = new TreeMap<number, string>([
      [10, 'a'],
      [20, 'b'],
    ])
    const mapView = unmodifiableSortedMap(map)
    expect(mapView.firstEntry()?.key).toBe(10)
    expect(mapView.floorEntry(15)?.value).toBe('a')
    expect(mapView.ceilingEntry(15)?.key).toBe(20)
    expect(mapView.lowerEntry(20)?.key).toBe(10)
    expect(mapView.higherEntry(10)?.key).toBe(20)
    expect(mapView.lastEntry()?.key).toBe(20)
    expect(String(mapView.keySet())).toBe('UnmodifiableSortedSet(2) {10, 20}')
  })

  it('rejects values of another family with TypeError naming the function [019 S1-AC6]', () => {
    const cases: Array<[(value: never) => unknown, unknown, string]> = [
      [unmodifiableList, new HashSet(), 'unmodifiableList'],
      [unmodifiableList, unmodifiableSequencedCollection(new ArrayList()), 'unmodifiableList'],
      [unmodifiableSet, new ArrayList(), 'unmodifiableSet'],
      [unmodifiableSequencedSet, new HashSet(), 'unmodifiableSequencedSet'],
      [unmodifiableSortedSet, new LinkedHashSet(), 'unmodifiableSortedSet'],
      [unmodifiableMap, new Map(), 'unmodifiableMap'],
      [unmodifiableSequencedMap, new HashMap(), 'unmodifiableSequencedMap'],
      [unmodifiableSortedMap, new LinkedHashMap(), 'unmodifiableSortedMap'],
      [unmodifiableCollection, [1], 'unmodifiableCollection'],
      [unmodifiableSequencedCollection, new HashSet(), 'unmodifiableSequencedCollection'],
    ]
    for (const [fn, value, name] of cases) {
      const error = caught(() => fn(value as never))
      expect(error, name).toBeInstanceOf(TypeError)
      expect((error as Error).message.startsWith(`${name}: `), name).toBe(true)
    }
    expect(() => unmodifiableSequencedSet(unmodifiableSortedSet(new TreeSet([1])))).not.toThrow()
    expect(() =>
      unmodifiableSequencedMap(unmodifiableSortedMap(new TreeMap([[1, 1]]))),
    ).not.toThrow()
  })

  it('follows the source under change: fail-fast or live, with the source error names [019 S1-AC7]', () => {
    const list = new ArrayList([1, 2, 3])
    const view = unmodifiableList(list)
    const cursor = view.cursor()
    expect(cursor.hasNext()).toBe(true)
    list.add(4)
    expect(() => cursor.next()).toThrow(ConcurrentModificationError)
    const iterator = view[Symbol.iterator]()
    iterator.next()
    list.add(5)
    expect(() => iterator.next()).toThrow(ConcurrentModificationError)
    expect(() =>
      view.forEach((e) => {
        if (e === 5) list.add(6)
      }),
    ).toThrow(/^ArrayList\.forEach: /)
    const live = new HashSet([1, 2])
    const liveView = unmodifiableSet(live)
    const seen: unknown[] = []
    for (const e of liveView) {
      seen.push(e)
      if (e === 1) live.add(3)
    }
    expect(seen).toEqual([1, 2, 3])
    const tree = new TreeSet([1, 2, 3])
    expect(() =>
      unmodifiableSortedSet(tree).forEach((e) => {
        if (e === 3) tree.add(4)
      }),
    ).toThrow(ConcurrentModificationError)
  })

  it('hands out read-only entries that read the source entry by every route [019 S1-AC8]', () => {
    const map = new TreeMap<number, string>([
      [1, 'a'],
      [2, 'b'],
    ])
    const view = unmodifiableSortedMap(map)
    const routes: Array<MapEntry<number, string> | undefined> = [
      view.firstEntry(),
      view.floorEntry(1),
      view.reversed().lastEntry(),
      view.subMap(0, 5).firstEntry(),
      view.entrySet().getFirst(),
      view.entrySet().reversed().getLast(),
      view.entrySet().toArray()[0],
      [...view.entrySet()][0],
      view.entrySet().cursor().next(),
    ]
    view.entrySet().forEach((entry) => {
      if (entry.key === 1) routes.push(entry)
    })
    const [sourceEntry] = [...map.entrySet()]
    map.set(1, 'changed')
    for (const entry of routes) {
      expect(entry).not.toBe(sourceEntry)
      expect(entry?.key).toBe(1)
      expect(entry?.value).toBe('changed')
      expect(entry?.equals(sourceEntry)).toBe(true)
      expect(hashCode(entry)).toBe(hashCode(sourceEntry))
      expect(() => entry?.setValue('x')).toThrow(
        'MapEntry.setValue: the collection cannot be changed',
      )
    }
    const held = view.firstEntry() as MapEntry<number, string>
    map.delete(1)
    expect(held.value).toBe('changed')
  })

  it('newSetFromMap over an empty view gives a set that cannot add [019 S1-AC9]', () => {
    const set = newSetFromMap(
      unmodifiableMap(new HashMap()) as never as MapCollection<string, boolean>,
    )
    expect(() => set.add('a')).toThrow(
      'UnmodifiableMap.getOrInsert: the collection cannot be changed',
    )
    expect(() => set.addAll(['a'])).toThrow(UnsupportedOperationError)
    expect(() => set.delete('a')).toThrow(
      'UnmodifiableSet.delete: the collection cannot be changed',
    )
    expect(() => set.clear()).toThrow('UnmodifiableSet.clear: the collection cannot be changed')
    expect(() =>
      newSetFromMap(
        unmodifiableMap(new HashMap([[1, true]])) as never as MapCollection<number, boolean>,
      ),
    ).toThrow(IllegalArgumentError)
  })
})

describe('S2 — equality and recognition', () => {
  it('list, set and map views and their derived views compare and hash as their sources, both ways [019 S2-AC1]', () => {
    const pairs: Array<[unknown, unknown]> = [
      [new ArrayList([1, 2]), unmodifiableList(new ArrayList([1, 2]))],
      [new HashSet([1, 2]), unmodifiableSet(new HashSet([2, 1]))],
      [new TreeSet([1, 2]), unmodifiableSortedSet(new TreeSet([1, 2])).subSet(0, 5)],
      [new HashMap([['a', 1]]), unmodifiableMap(new HashMap([['a', 1]]))],
      [new TreeMap([[1, 'a']]), unmodifiableSortedMap(new TreeMap([[1, 'a']])).reversed()],
      [new HashSet(['a']), unmodifiableMap(new HashMap([['a', 1]])).keySet()],
    ]
    for (const [source, view] of pairs as Array<
      [{ equals(o: unknown): boolean }, { equals(o: unknown): boolean }]
    >) {
      expect(view.equals(source)).toBe(true)
      expect(source.equals(view)).toBe(true)
      expect(hashCode(view)).toBe(hashCode(source))
    }
  })

  it('collection, sequenced-collection and value views compare by identity [019 S2-AC2]', () => {
    const list = new ArrayList([1])
    for (const view of [
      unmodifiableCollection(list),
      unmodifiableSequencedCollection(list),
      unmodifiableMap(new HashMap([['a', 1]])).valueCollection(),
    ]) {
      expect(view.equals(view)).toBe(true)
      expect(view.equals(list)).toBe(false)
      expect(list.equals(view)).toBe(false)
      expect(view[hashCodeSymbol](() => 1)).toBe(view[hashCodeSymbol](() => 2))
    }
    const values = unmodifiableMap(new HashMap([['a', 1]])).valueCollection()
    expect(values.equals(unmodifiableMap(new HashMap([['a', 1]])).valueCollection())).toBe(false)
  })

  it('answers the guards for the view family, never as a queue or deque [019 S2-AC3]', () => {
    const guards = [
      isCollection,
      isSequencedCollection,
      isList,
      isSetCollection,
      isSortedSet,
      isMapCollection,
      isSortedMap,
      isQueue,
      isDeque,
    ]
    const answers = (value: unknown) => guards.map((guard) => guard(value))
    const deque = new ArrayDeque([1])
    expect(answers(unmodifiableCollection(deque))).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ])
    expect(answers(unmodifiableSequencedCollection(deque))).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ])
    expect(answers(unmodifiableSequencedCollection(new ArrayList([1])))).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ])
    expect(answers(unmodifiableList(new ArrayList([1])))).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ])
    expect(answers(unmodifiableSet(new LinkedHashSet([1])))).toEqual([
      true,
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      false,
    ])
    expect(answers(unmodifiableSequencedSet(new TreeSet([1])))).toEqual([
      true,
      true,
      false,
      true,
      false,
      false,
      false,
      false,
      false,
    ])
    expect(answers(unmodifiableSortedSet(new TreeSet([1])))).toEqual([
      true,
      true,
      false,
      true,
      true,
      false,
      false,
      false,
      false,
    ])
    expect(answers(unmodifiableMap(new TreeMap([[1, 1]])))).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
    ])
    expect(answers(unmodifiableSequencedMap(new TreeMap([[1, 1]])))).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
    ])
    expect(answers(unmodifiableSortedMap(new TreeMap([[1, 1]])))).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      false,
      false,
    ])
    expect(() => unmodifiableSequencedMap(unmodifiableMap(new LinkedHashMap()) as never)).toThrow(
      TypeError,
    )
    expect(() =>
      unmodifiableList(unmodifiableSequencedCollection(new ArrayList()) as never),
    ).toThrow(TypeError)
  })

  it('types every view as read-only, so mutators do not compile [019 S2-AC4]', () => {
    // Checked by the compiler; the function is never called.
    const typeChecks = (list: ArrayList<number>, map: TreeMap<number, string>) => {
      const l = unmodifiableList(list)
      // @ts-expect-error read-only lists cannot change
      l.add(1)
      // @ts-expect-error read-only lists cannot change
      l.subList(0, 1).clear()
      const s = unmodifiableSortedSet(new TreeSet([1]))
      // @ts-expect-error read-only sorted sets cannot change
      s.pollFirst()
      // @ts-expect-error read-only sorted sets cannot change
      s.headSet(1).add(1)
      const m = unmodifiableSortedMap(map)
      // @ts-expect-error read-only maps cannot change
      m.set(1, 'a')
      // @ts-expect-error read-only maps cannot change
      m.putFirst(1, 'a')
      // @ts-expect-error read-only key sets cannot change
      m.keySet().delete(1)
      const q = unmodifiableSequencedCollection(new ArrayDeque([1]))
      // @ts-expect-error read-only sequenced collections cannot change
      q.removeFirst()
      // Typed, and refused at run time only:
      l.cursor().remove()
      l.listCursor(0).set(1)
      m.firstEntry()?.setValue('x')
    }
    expect(typeof typeChecks).toBe('function')
    const map: ReadonlyMapCollection<string, number> = unmodifiableMap(
      new HashMap<string, number>(),
    )
    expect(map.size).toBe(0)
  })
})

describe('S3 — output', () => {
  it('iterates, copies and serialises what the source does [019 S3-AC1]', () => {
    const set = new LinkedHashSet([3, 1, 2])
    const view = unmodifiableSet(set)
    expect([...view]).toEqual([...set])
    expect(view.toArray()).toEqual(set.toArray())
    expect(JSON.stringify(view)).toBe(JSON.stringify(set))
    const map = new HashMap([['a', 1]])
    expect(JSON.stringify(unmodifiableMap(map))).toBe(JSON.stringify(map))
    expect(JSON.stringify(unmodifiableCollection(new ArrayDeque([1, 2])))).toBe('[1,2]')
  })

  it("keeps revision equal to the source's [019 S3-AC2]", () => {
    const list = new ArrayList([1])
    const view = unmodifiableList(list)
    list.add(2)
    list.set(0, 5)
    expect(view.revision).toBe(list.revision)
    const map = new LinkedHashMap([['a', 1]])
    const mapView = unmodifiableSequencedMap(map)
    map.set('a', 2)
    expect(mapView.revision).toBe(map.revision)
    expect(mapView.keySet().revision).toBe(map.keySet().revision)
  })

  it('prints each view with the tag of its family [019 S3-AC3]', () => {
    const map = new TreeMap<number, string>([[1, 'a']])
    const shown: Array<[unknown, string]> = [
      [unmodifiableCollection(new ArrayDeque([1])), 'UnmodifiableCollection'],
      [unmodifiableSequencedCollection(new ArrayDeque([1])), 'UnmodifiableSequencedCollection'],
      [unmodifiableList(new ArrayList([1])), 'UnmodifiableList'],
      [unmodifiableList(new ArrayList([1])).subList(0, 1), 'UnmodifiableList'],
      [unmodifiableSet(new HashSet([1])), 'UnmodifiableSet'],
      [unmodifiableSequencedSet(new LinkedHashSet([1])), 'UnmodifiableSequencedSet'],
      [unmodifiableSortedSet(new TreeSet([1])), 'UnmodifiableSortedSet'],
      [unmodifiableMap(new HashMap([[1, 'a']])), 'UnmodifiableMap'],
      [unmodifiableMap(new HashMap([[1, 'a']])).keySet(), 'UnmodifiableSet'],
      [unmodifiableSequencedMap(new LinkedHashMap([[1, 'a']])), 'UnmodifiableSequencedMap'],
      [
        unmodifiableSequencedMap(new LinkedHashMap([[1, 'a']])).valueCollection(),
        'UnmodifiableSequencedCollection',
      ],
      [unmodifiableSortedMap(map), 'UnmodifiableSortedMap'],
      [unmodifiableSortedMap(map).keySet(), 'UnmodifiableSortedSet'],
      [unmodifiableSortedMap(map).entrySet(), 'UnmodifiableSequencedSet'],
    ]
    for (const [view, tag] of shown) {
      expect(String(view).startsWith(`${tag}(1) `), String(view)).toBe(true)
      expect(Object.prototype.toString.call(view)).toBe(`[object ${tag}]`)
      expect(inspect(view).startsWith(`${tag}(1) `)).toBe(true)
    }
  })
})

describe('S4 — cost', () => {
  it('creates views in O(1) and adds one call per delegated operation [019 S4-AC1]', () => {
    /** Wraps `target` so every property read is counted. */
    const counting = <T extends object>(target: T): [T, () => number] => {
      let reads = 0
      const proxy = new Proxy(target, {
        get(t, property, receiver) {
          reads++
          return Reflect.get(t, property, receiver)
        },
      })
      return [proxy, () => reads]
    }
    const [list, listReads] = counting(new ArrayList(Array.from({ length: 1000 }, (_, i) => i)))
    const view = unmodifiableList(list)
    expect(listReads()).toBeLessThan(10)
    const beforeGet = listReads()
    view.get(500)
    expect(listReads() - beforeGet).toBeLessThan(10)
    const [map, mapReads] = counting(
      new HashMap(Array.from({ length: 1000 }, (_, i) => [i, i] as const)),
    )
    const mapView = unmodifiableMap(map)
    expect(mapReads()).toBeLessThan(10)
    const beforeLookups = mapReads()
    mapView.get(1)
    mapView.has(2)
    expect(mapReads() - beforeLookups).toBeLessThan(10)
    let sizes = 0
    const range = new TreeSet(Array.from({ length: 1000 }, (_, i) => i)).subSet(0, 1000)
    const watched = new Proxy(range, {
      get(t, property, receiver) {
        if (property === 'size') sizes++
        return Reflect.get(t, property, receiver)
      },
    })
    expect(unmodifiableSortedSet(watched).isEmpty()).toBe(false)
    expect(sizes).toBe(0) // isEmpty asks the source and never counts the range
  })
})

describe('unmodifiable views over the remaining sources [019 S4-AC2]', () => {
  const items = (initial?: Iterable<unknown>) => [...(initial ?? [])]
  describe('sets over a map key set', () => {
    const make = (i?: Iterable<unknown>) =>
      unmodifiableSet(new HashMap(items(i).map((e) => [e, e] as const)).keySet())
    describeReadonlySet('UnmodifiableSet', make)
    describeUnsupportedMutators('UnmodifiableSet', () => make([1, 2]), 'set')
  })
  describe('sequenced sets over a LinkedHashMap key set', () => {
    const make = (i?: Iterable<unknown>) =>
      unmodifiableSequencedSet(new LinkedHashMap(items(i).map((e) => [e, e] as const)).keySet())
    describeReadonlySequencedSet('UnmodifiableSequencedSet', make)
    describeUnsupportedMutators('UnmodifiableSequencedSet', () => make([1, 2]), 'sequenced-set')
  })
  for (const [label, source] of [
    ['TreeSet', (i?: Iterable<number>) => new TreeSet<number>(i)],
    ['headSet', (i?: Iterable<number>) => new TreeSet<number>(i).headSet(1001)],
    ['tailSet', (i?: Iterable<number>) => new TreeSet<number>(i).tailSet(-1000)],
    [
      'a TreeMap key set',
      (i?: Iterable<number>) =>
        new TreeMap<number, number>([...(i ?? [])].map((e) => [e, e] as const)).keySet(),
    ],
  ] as const) {
    describe(`sorted, sequenced and plain set views over ${label}`, () => {
      const sorted = (i?: Iterable<number>): ReadonlySortedSet<number> =>
        unmodifiableSortedSet(source(i))
      describeReadonlySortedSet('UnmodifiableSortedSet', sorted)
      describeUnsupportedMutators('UnmodifiableSortedSet', () => sorted([1, 2]), 'sorted-set')
      const sequenced = (i?: Iterable<number>) => unmodifiableSequencedSet(source(i))
      describeReadonlySequencedSet('UnmodifiableSequencedSet', sequenced as never)
      describeUnsupportedMutators(
        'UnmodifiableSequencedSet',
        () => sequenced([1, 2]),
        'sequenced-set',
      )
      describeUnsupportedMutators('UnmodifiableSet', () => unmodifiableSet(source([1, 2])), 'set')
    })
  }
  for (const [label, source, nullElements] of [
    [
      'a reversed ArrayDeque',
      (i?: Iterable<unknown>) => new ArrayDeque<unknown>(items(i).reverse()).reversed(),
      'reject',
    ],
    ['ArrayList', (i?: Iterable<unknown>) => new ArrayList<unknown>(i), 'store'],
    ['LinkedHashSet', (i?: Iterable<unknown>) => new LinkedHashSet<unknown>(i), 'store'],
  ] as const) {
    describe(`collection and sequenced views over ${label}`, () => {
      const sequenced = (i?: Iterable<unknown>) =>
        unmodifiableSequencedCollection(source(i) as never)
      describeReadonlySequenced('UnmodifiableSequencedCollection', sequenced)
      describeUnsupportedMutators(
        'UnmodifiableSequencedCollection',
        () => sequenced([1, 2]),
        'sequenced',
      )
      const plain = (i?: Iterable<unknown>) => unmodifiableCollection(source(i) as never)
      describeReadonlyCollection('UnmodifiableCollection', plain, {
        brackets: 'list',
        minusZero: label === 'LinkedHashSet' ? 'zero' : 'kept',
        nullElements,
      })
      describeUnsupportedMutators('UnmodifiableCollection', () => plain([1, 2]), 'values')
    })
  }
  describe('collection views over HashSet', () => {
    describeUnsupportedMutators(
      'UnmodifiableCollection',
      () => unmodifiableCollection(new HashSet([1, 2])),
      'values',
    )
  })
  describe('map views over LinkedHashMap and TreeMap', () => {
    describeUnsupportedMutators(
      'UnmodifiableMap',
      () => unmodifiableMap(new LinkedHashMap([['a', 1]])),
      'map',
    )
    describeUnsupportedMutators(
      'UnmodifiableMap',
      () => unmodifiableMap(new TreeMap([['a', 1]])),
      'map',
    )
    describeReadonlySequencedMap('UnmodifiableSequencedMap', (i) =>
      unmodifiableSequencedMap(
        new LinkedHashMap<unknown, unknown>([...(i ?? [])].reverse()).reversed(),
      ),
    )
    describeReadonlySequencedMap('UnmodifiableSequencedMap', (i) =>
      unmodifiableSequencedMap(new TreeMap<unknown, unknown>(i as never)),
    )
    describeUnsupportedMutators(
      'UnmodifiableSequencedMap',
      () => unmodifiableSequencedMap(new TreeMap([['a', 1]])),
      'sequenced-map',
    )
  })
  for (const [label, source] of [
    [
      'reversed',
      (i?: Iterable<readonly [number, string]>) =>
        new TreeMap<number, string>([...(i ?? [])]).reversed().reversed(),
    ],
    [
      'headMap',
      (i?: Iterable<readonly [number, string]>) => new TreeMap<number, string>(i).headMap(1001),
    ],
    [
      'tailMap',
      (i?: Iterable<readonly [number, string]>) => new TreeMap<number, string>(i).tailMap(-1000),
    ],
  ] as const) {
    describe(`sorted map views over a ${label} TreeMap`, () => {
      const make = (i?: Iterable<readonly [number, string]>): ReadonlySortedMap<number, string> =>
        unmodifiableSortedMap(source(i))
      describeReadonlySortedMap('UnmodifiableSortedMap', make)
      describeUnsupportedMutators('UnmodifiableSortedMap', () => make([[1, 'a']]), 'sorted-map')
    })
  }
})

describe('S1 — iteration follows more sources', () => {
  it('fails fast or runs live through views of deques, linked lists and tree and linked maps [019 S1-AC7]', () => {
    const deque = new ArrayDeque([1, 2])
    const dequeCursor = unmodifiableSequencedCollection(deque).cursor()
    expect(dequeCursor.hasNext()).toBe(true)
    deque.push(3)
    expect(() => dequeCursor.next()).toThrow(ConcurrentModificationError)
    const linked = new LinkedList([1, 2])
    expect(() =>
      unmodifiableCollection(linked).forEach((e) => {
        if (e === 2) linked.push(3)
      }),
    ).toThrow(ConcurrentModificationError)
    const treeMap = new TreeMap([[1, 'a']])
    const entries = unmodifiableSortedMap(treeMap).entrySet()[Symbol.iterator]()
    entries.next()
    treeMap.set(2, 'b')
    expect(() => entries.next()).toThrow(ConcurrentModificationError)
    const linkedMap = new LinkedHashMap([
      ['a', 1],
      ['b', 2],
    ])
    const liveKeys: string[] = []
    for (const [key] of unmodifiableSequencedMap(linkedMap)) {
      liveKeys.push(key)
      if (key === 'a') linkedMap.set('c', 3)
    }
    expect(liveKeys).toEqual(['a', 'b', 'c'])
  })
})
