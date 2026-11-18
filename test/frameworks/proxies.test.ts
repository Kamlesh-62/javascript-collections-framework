// Collections wrapped in a plain `Proxy`, as framework state libraries may do: the shared contract
// suites run through the proxy, so every method sees the proxy as `this`.

import { describe, expect, it } from 'vitest'
import {
  ArrayDeque,
  ArrayList,
  asList,
  copyOfList,
  type Deque,
  equalsSymbol,
  HashMap,
  HashSet,
  isCollection,
  isDeque,
  isList,
  isMapCollection,
  isSetCollection,
  LinkedHashMap,
  LinkedHashSet,
  LinkedList,
  listOf,
  mapOf,
  newSetFromMap,
  PriorityQueue,
  setOf,
  TreeMap,
  TreeSet,
  unmodifiableCollection,
  unmodifiableList,
  unmodifiableMap,
  unmodifiableSequencedCollection,
  unmodifiableSequencedMap,
  unmodifiableSequencedSet,
  unmodifiableSet,
  unmodifiableSortedMap,
  unmodifiableSortedSet,
} from '../../src/index'
import { describeCollection } from '../contracts/collection'
import { describeDeque } from '../contracts/deque'
import { describeList } from '../contracts/list'
import { describeMapCollection } from '../contracts/map'
import { describeQueue } from '../contracts/queue'
import { describeReadonlyCollection } from '../contracts/readonly-collection'
import { describeReadonlyList } from '../contracts/readonly-list'
import { describeReadonlyMap } from '../contracts/readonly-map'
import { describeReadonlySequenced } from '../contracts/readonly-sequenced'
import { describeReadonlySequencedMap } from '../contracts/readonly-sequenced-map'
import { describeReadonlySequencedSet } from '../contracts/readonly-sequenced-set'
import { describeReadonlySet } from '../contracts/readonly-set'
import { describeReadonlySortedMap } from '../contracts/readonly-sorted-map'
import { describeReadonlySortedSet } from '../contracts/readonly-sorted-set'
import { describeSetCollection } from '../contracts/set'
import { describeSortedMap } from '../contracts/sorted-map'
import { describeSortedSet } from '../contracts/sorted-set'
import { combine } from '../fixtures/structural-list'
import { registerProxy } from '../support/owner'

/** Wraps `target` in a plain proxy with no traps, as a framework's state wrapper might. */
function proxied<T extends object>(target: T): T {
  return registerProxy(new Proxy(target, {}), target)
}

/** A proxy of a view or factory result, whose callbacks receive the proxy itself. */
function proxiedView<T extends object>(target: T): T {
  return new Proxy(target, {})
}

const items = (initial?: Iterable<unknown>) => [...(initial ?? [])]
const sumOf = (elements: unknown[], hash: (value: unknown) => number) =>
  elements.reduce<number>((h, e) => (h + hash(e)) | 0, 0)

describe('collections work through a plain Proxy [021 S2-AC5]', () => {
  const lists = (i?: Iterable<unknown>) => proxied(new ArrayList<unknown>(i))
  describeCollection('ArrayList', lists, {
    iteration: 'fail-fast',
    brackets: 'list',
    replace: (c, index, value) => (c as ArrayList<unknown>).set(index, value),
    structural: { expectedHash: combine },
  })
  describeList('ArrayList', lists)

  for (const [name, make, nullElements] of [
    ['ArrayDeque', (i?: Iterable<number>) => proxied(new ArrayDeque<number>(i)), 'reject'],
    ['LinkedList', (i?: Iterable<number>) => proxied(new LinkedList<number>(i)), 'store'],
  ] as const) {
    describeCollection(name, make as never, {
      iteration: 'fail-fast',
      brackets: 'list',
      nullElements,
    })
    describeQueue(name, make as (i?: Iterable<number>) => Deque<number>)
    describeDeque(name, make as (i?: Iterable<number>) => Deque<number>)
  }
  describeQueue('PriorityQueue', (i) => proxied(new PriorityQueue<number>(i)))

  for (const [name, make] of [
    ['HashSet', (i?: Iterable<unknown>) => proxied(new HashSet<unknown>(i))],
    ['LinkedHashSet', (i?: Iterable<unknown>) => proxied(new LinkedHashSet<unknown>(i))],
  ] as const) {
    describeCollection(name, make, {
      iteration: 'live',
      brackets: 'set',
      structural: { expectedHash: sumOf },
    })
    describeSetCollection(name, make)
  }
  describeSortedSet('TreeSet', (i) => proxied(new TreeSet<number>(i)))
  describeMapCollection('HashMap', (i) => proxied(new HashMap(i)))
  describeMapCollection('LinkedHashMap', (i) => proxied(new LinkedHashMap(i)))
  describeSortedMap('TreeMap', (i) => proxied(new TreeMap<number, string>(i ?? [])))

  describeReadonlyList('ImmutableList', (i) => proxiedView(listOf(...items(i))))
  describeReadonlyList('UnmodifiableList', (i) => proxiedView(unmodifiableList(new ArrayList(i))))
  describeReadonlyList('ArrayListView', (i) => proxiedView(asList(items(i))))
  describeReadonlyList('SubList', (i) =>
    proxiedView(new ArrayList<unknown>(['<', ...items(i), '>']).subList(1, 1 + items(i).length)),
  )
  describeReadonlySet('ImmutableSet', (i) => proxiedView(setOf(...items(i))))
  describeReadonlySet('HashMapKeySet', (i) =>
    proxiedView(new HashMap(items(i).map((e) => [e, e] as const)).keySet()),
  )
  describeReadonlyCollection(
    'HashMapValues',
    (i) =>
      proxiedView(new HashMap(items(i).map((e, n) => [`k${n}`, e] as const)).valueCollection()),
    { brackets: 'list', minusZero: 'kept' },
  )
  describeReadonlySet('ReversedLinkedHashSet', (i) =>
    proxiedView(new LinkedHashSet<unknown>(items(i).reverse()).reversed()),
  )
  describeReadonlyCollection(
    'UnmodifiableCollection',
    (i) => proxiedView(unmodifiableCollection(new ArrayList(i))),
    {
      brackets: 'list',
      minusZero: 'kept',
    },
  )
  describeReadonlySequenced('UnmodifiableSequencedCollection', (i) =>
    proxiedView(unmodifiableSequencedCollection(new ArrayList(i))),
  )
  describeReadonlySet('UnmodifiableSet', (i) => proxiedView(unmodifiableSet(new HashSet(i))))
  describeReadonlySequencedSet('UnmodifiableSequencedSet', (i) =>
    proxiedView(unmodifiableSequencedSet(new LinkedHashSet(i))),
  )
  describeReadonlySortedSet('UnmodifiableSortedSet', (i) =>
    proxiedView(unmodifiableSortedSet(new TreeSet<number>(i))),
  )
  describeReadonlySortedSet('TreeSubSet', (i) =>
    proxiedView(new TreeSet<number>(i).subSet(-1000, 1001)),
  )
  describeReadonlySequencedMap('UnmodifiableSequencedMap', (i) =>
    proxiedView(unmodifiableSequencedMap(new LinkedHashMap(i))),
  )
  describeReadonlySortedMap('UnmodifiableSortedMap', (i) =>
    proxiedView(unmodifiableSortedMap(new TreeMap<number, string>(i ?? []))),
  )
  describeReadonlySortedMap('TreeSubMap', (i) =>
    proxiedView(new TreeMap<number, string>(i ?? []).subMap(-1000, 1001)),
  )
  describeReadonlySet('SetFromMap', (i) => {
    const set = newSetFromMap(new HashMap<unknown, boolean>())
    set.addAll(items(i))
    return proxiedView(set)
  })
  describeReadonlySet(
    'HashMapEntrySet',
    (i) => proxiedView(new HashMap(items(i).map((e) => [e, e] as const)).entrySet()),
    {
      member: (entry) => (entry as { key: unknown }).key,
      probe: (e) => [...new HashMap([[e, e]]).entrySet()][0],
      printed: (text) => `${text} => ${text}`,
    },
  )
  describeReadonlyMap('ImmutableMap', (i) =>
    proxiedView(mapOf(...(items(i) as Array<[unknown, unknown]>))),
  )
  describeReadonlyMap('UnmodifiableMap', (i) => proxiedView(unmodifiableMap(new HashMap(i))))
})

describe('identity and callbacks through a Proxy [021 S2-AC5]', () => {
  it('an identity-equal collection equals its own proxy, both ways round from the proxy', () => {
    for (const target of [new ArrayDeque([1]), new LinkedList([1]), new PriorityQueue([1])]) {
      const proxy = proxied(target)
      expect(proxy.equals(proxy)).toBe(true)
      expect(proxy[equalsSymbol](proxy)).toBe(true)
      expect(proxy.equals(target)).toBe(true)
      expect(target.equals(proxy)).toBe(false) // documented: the target does not know its proxies
      expect(proxy.equals(new ArrayDeque([1]))).toBe(false)
    }
  })

  it('keeps brands and instanceof through a proxy', () => {
    expect(isList(proxied(new ArrayList()))).toBe(true)
    expect(isDeque(proxied(new LinkedList()))).toBe(true)
    expect(isSetCollection(proxiedView(setOf(1)))).toBe(true)
    expect(isMapCollection(proxied(new TreeMap()))).toBe(true)
    expect(isCollection(proxied(unmodifiableSortedSet(new TreeSet([1]))))).toBe(true)
    expect(proxied(new ArrayList()) instanceof ArrayList).toBe(true)
    expect(proxied(new HashMap()) instanceof HashMap).toBe(true)
    expect(copyOfList(proxiedView(listOf(1, 2))).toArray()).toEqual([1, 2])
  })

  it('passes the target to callbacks of the ten classes, and the proxy for views and factory results', () => {
    const list = new ArrayList([1])
    const listProxy = proxied(list)
    listProxy.forEach((_e, _i, owner) => {
      expect(owner).toBe(list)
    })
    expect(listProxy.reversed().reversed()).toBe(list)
    const map = new HashMap([['a', 1]])
    proxied(map).compute('a', (_v, _k, owner) => {
      expect(owner).toBe(map)
      return 2
    })
    const view = proxied(unmodifiableList(new ArrayList([1])))
    view.forEach((_e, _i, owner) => {
      expect(owner).toBe(view)
    })
    expect(view.reversed().reversed()).not.toBe(view)
    expect(view.reversed().reversed().equals(view)).toBe(true)
    for (const target of [
      new ArrayDeque([1, 2]),
      new LinkedList([1, 2]),
      new LinkedHashSet([1, 2]),
      new TreeSet([1, 2]),
      new TreeMap([[1, 'a']]),
    ]) {
      expect(proxied(target).reversed().reversed()).toBe(target)
    }
    for (const viewTarget of [listOf(1, 2), unmodifiableSortedSet(new TreeSet([1, 2]))]) {
      const proxy = proxiedView(viewTarget)
      expect(proxy.reversed().reversed()).not.toBe(proxy)
      expect([...proxy.reversed().reversed()]).toEqual([...viewTarget])
    }
    const set = proxied(newSetFromMap(new HashMap<number, boolean>()))
    set.add(1)
    set.forEach((_a, _b, owner) => {
      expect(owner).toBe(set)
    })
  })
})
