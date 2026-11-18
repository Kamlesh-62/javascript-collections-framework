// A consumer of the published package that uses every exported name once, so a declaration that
// only breaks when used is caught. scripts/old-typescript.mjs compiles it with every supported
// TypeScript version and module resolution; it is never run.

import type {
  BoundOptions,
  Collection,
  Comparable,
  Comparator,
  Cursor,
  Deque,
  Equatable,
  Equivalence,
  HashFunction,
  HashMapOptions,
  HashSetOptions,
  KeyOf,
  LinkedHashMapOptions,
  LinkedHashSetOptions,
  LinkedListNode,
  List,
  ListCursor,
  MapCollection,
  MapEntry,
  PriorityQueueOptions,
  Queue,
  ReadonlyCollection,
  ReadonlyDeque,
  ReadonlyList,
  ReadonlyMapCollection,
  ReadonlyQueue,
  ReadonlySequencedCollection,
  ReadonlySequencedMap,
  ReadonlySequencedSet,
  ReadonlySetCollection,
  ReadonlySortedMap,
  ReadonlySortedSet,
  SequencedCollection,
  SequencedMap,
  SequencedSet,
  SetCollection,
  SortedMap,
  SortedSet,
  SubSetOptions,
  TreeMapOptions,
  TreeSetOptions,
} from 'javascript-collections-framework'
import {
  ArrayDeque,
  ArrayList,
  asList,
  ClassCastError,
  ConcurrentModificationError,
  compareSymbol,
  comparing,
  copyOfList,
  copyOfMap,
  copyOfSet,
  equals,
  equalsSymbol,
  HashMap,
  HashSet,
  hashCode,
  hashCodeSymbol,
  IllegalArgumentError,
  IllegalStateError,
  IndexOutOfBoundsError,
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
  mapOf,
  NoSuchElementError,
  NullElementError,
  naturalOrder,
  newSetFromMap,
  nullsFirst,
  nullsLast,
  PriorityQueue,
  reverseOrder,
  sameValueZeroEquivalence,
  setOf,
  TreeMap,
  TreeSet,
  thenComparing,
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
  valueEquivalence,
} from 'javascript-collections-framework'

export const errors: Error[] = [
  new ClassCastError('m'),
  new ConcurrentModificationError('m'),
  new IllegalArgumentError('m'),
  new IllegalStateError('m'),
  new IndexOutOfBoundsError('m'),
  new NoSuchElementError('m'),
  new NullElementError('m'),
  new UnsupportedOperationError('m'),
]
export const range: RangeError = new IndexOutOfBoundsError()
export const isOutOfBounds: boolean = range instanceof IndexOutOfBoundsError

export class Version implements Comparable<Version>, Equatable {
  constructor(readonly major: number) {}
  [compareSymbol](other: Version): number {
    return this.major - other.major
  }
  [equalsSymbol](other: unknown): boolean {
    return other instanceof Version && other.major === this.major
  }
  [hashCodeSymbol](hash: HashFunction): number {
    return hash(this.major)
  }
}

interface Person {
  readonly name: string
  readonly age: number | null
}
const byAge: Comparator<Person> = comparing((p: Person) => p.age, nullsFirst<number>())
const byName: Comparator<Person> = comparing((p) => p.name)
export const order: Comparator<Person> = thenComparing(byAge, reverseOrder(byName))
export const versions: Comparator<Version> = naturalOrder<Version>()
export const last: Comparator<number | null | undefined> = nullsLast(naturalOrder<number>())

const key: KeyOf<Person> = (p) => p.name
export const sameKey: boolean = key({ name: 'a', age: 1 }) === 'a'
export const equivalences: Equivalence<unknown>[] = [sameValueZeroEquivalence, valueEquivalence]
export const equal: boolean = equals([1, 2], [1, 2])
export const hashed: number = hashCode(new Version(1))

export function total(values: unknown): number {
  if (!isCollection(values)) return 0
  const readable: ReadonlyCollection<unknown> = values
  return readable.size
}
export function drain<E>(collection: Collection<E>): E[] {
  const out: E[] = []
  const cursor: Cursor<E> = collection.cursor()
  while (cursor.hasNext()) {
    out.push(cursor.next())
    cursor.remove()
  }
  return out
}

export const people: List<Person> = new ArrayList<Person>([{ name: 'b', age: 2 }])
  .add({ name: 'a', age: null })
  .insert(0, { name: 'c', age: 3 })
  .sort(order)
export const names: ArrayList<string> = ArrayList.from(people, (p) => p.name)
export const view: ReadonlyList<Person> = people.subList(0, 1)
export const backwards: SequencedCollection<Person> = people.reversed()
export const ends: ReadonlySequencedCollection<string> = names
export function edit(list: List<number>): void {
  const cursor: ListCursor<number> = list.listCursor(list.size)
  while (cursor.hasPrevious()) {
    const n = cursor.previous()
    if (n < 0) cursor.remove()
    else cursor.set(n * 2)
  }
  list.forEach((n, i, self) => {
    self.set(i, n + 1)
  })
}
export function firstOf(value: unknown): unknown {
  if (isList(value) && !value.isEmpty()) return value.get(0)
  return isSequencedCollection(value) && !value.isEmpty() ? value.getFirst() : undefined
}

export const jobs: Queue<string> = new ArrayDeque<string>(['a']).add('b')
export const nextJob: string | undefined = jobs.poll()
export const waiting: ReadonlyQueue<string> = jobs
export const stack: Deque<number> = ArrayDeque.from([1, 2], (n) => n * 10).push(30)
export const top: number | undefined = stack.pop()
export const backwardsStack: ReadonlyDeque<number> = stack.reversed()
export function lastOf(value: unknown): unknown {
  if (isDeque(value)) return value.peekLast()
  return isQueue(value) ? value.peek() : undefined
}

export const recent = new LinkedList<string | undefined>(['a', undefined])
export const newest: LinkedListNode<string | undefined> = recent.addFirstNode('b')
recent.insertAfter(newest, 'c')
recent.addFirstNode(recent.removeNode(recent.lastNode() as LinkedListNode<string | undefined>))
export const asDeque: Deque<string | undefined> = recent.reversed()
export const firstHandle: LinkedListNode<string | undefined> | undefined = recent.firstNode()?.next

const byPersonName: HashSetOptions<Person> = { key: (p) => p.name }
export const members: SetCollection<Person> = new HashSet<Person>(byPersonName).add({
  name: 'a',
  age: 1,
})
export const tags: HashSet<string> = HashSet.from<string>('abc', {
  equivalence: valueEquivalence,
}).copy()
export const pairs: Array<[string, string]> = [...tags.entries()]
tags.forEach((tag, same, set) => {
  set.has(tag + same)
})
export function sizeOfSet(value: unknown): number {
  if (!isSetCollection(value)) return 0
  const readable: ReadonlySetCollection<unknown> = value
  return readable.size
}
const byDeadline: PriorityQueueOptions<{ deadline: number }> = {
  comparator: (a, b) => a.deadline - b.deadline,
}
export const deadlines = new PriorityQueue([{ deadline: 2 }], byDeadline).add({ deadline: 1 })
export const urgent: { deadline: number } | undefined = deadlines.peek()
export const scheduled: Queue<number> = PriorityQueue.from([3, 1, 2])
export const sameOrder: Comparator<{ deadline: number }> | undefined = deadlines.copy().comparator()

const byPersonKey: HashMapOptions<Person> = { key: (p) => p.name }
export const ages: MapCollection<Person, number> = new HashMap<Person, number>(byPersonKey).set(
  { name: 'a', age: 1 },
  1,
)
export const counts: HashMap<string, number> = HashMap.from<string, number>([['a', 1]], {
  equivalence: valueEquivalence,
}).copy()
counts.merge('a', 1, (old, one) => old + one)
counts.compute('b', (value, key, map) => (value ?? map.size) + key.length)
export const counted: number = counts.getOrInsertComputed('c', (key) => key.length)
export const firstEntry: MapEntry<string, number> | undefined = [...counts.entrySet()][0]
export const keysOnly: SetCollection<string> = counts.keySet()
export const valuesOnly: Collection<number> = counts.valueCollection()
counts.forEach((value, key, map) => {
  map.set(key, value)
})
export const native: Map<string, number> = new Map(counts)
export function sizeOfMap(value: unknown): number {
  if (!isMapCollection(value)) return 0
  const readable: ReadonlyMapCollection<unknown, unknown> = value
  return readable.size
}

const byLength: TreeSetOptions<string> = { comparator: (a, b) => a.length - b.length }
export const words: SortedSet<string> = new TreeSet(['ccc', 'a'], byLength).add('bb')
const window: SubSetOptions = { fromInclusive: false, toInclusive: true }
const upTo: BoundOptions = { inclusive: true }
export const middle: SortedSet<string> = words.subSet('a', 'ccc', window)
export const short: ReadonlySortedSet<string> = words.headSet('bb', upTo).reversed()
export const nearest: string | undefined = TreeSet.from([3, 1, 2]).copy().ceiling(2)
  ? words.floor('zz')
  : words.pollFirst()
export function firstSorted(value: unknown): unknown {
  if (!isSortedSet(value)) return undefined
  const readable: ReadonlySortedSet<unknown> = value
  return readable.isEmpty() ? undefined : readable.getFirst()
}

const byLowerCase: LinkedHashSetOptions<string> = { key: (s) => s.toLowerCase() }
export const history: SequencedSet<string> = new LinkedHashSet(['a', 'b'], byLowerCase)
  .addFirst('B')
  .addLast('c')
export const oldestFirst: LinkedHashSet<number> = LinkedHashSet.from([3, 1, 2]).copy()
export const newestFirst: ReadonlySequencedSet<string> = history.reversed()
export const oldest: number = oldestFirst.removeFirst()
export const sortedAsSequenced: SequencedSet<string> = new TreeSet(['b', 'a'])
history.forEach((item, same, set) => {
  set.has(item + same)
})

const highestFirst: TreeMapOptions<number> = { comparator: (a, b) => b - a }
export const levels: SortedMap<number, string> = new TreeMap([[100, 'low']], highestFirst).set(
  500,
  'mid',
)
export const ks: SortedSet<number> = new TreeMap<number, string>().keySet()
export const band: SortedMap<number, string> = levels.subMap(500, 100, window).reversed()
export const level: string | undefined = TreeMap.from([[1, 'a']])
  .copy()
  .floorEntry(2)?.value
export const polled: MapEntry<number, string> | undefined = levels
  .headMap(300, upTo)
  .pollFirstEntry()
export function firstKey(value: unknown): unknown {
  if (!isSortedMap(value)) return undefined
  const readable: ReadonlySortedMap<unknown, unknown> = value
  return readable.firstEntry()?.key
}

const lruOptions: LinkedHashMapOptions<string, number> = {
  accessOrder: true,
  maxSize: 2,
  onEvict: (value, key, map) => {
    map.has(key + value)
  },
}
export const lru: SequencedMap<string, number> = new LinkedHashMap([['a', 1]], lruOptions)
  .putFirst('b', 2)
  .putLast('c', 3)
export const lruCopy: LinkedHashMap<string, number> = LinkedHashMap.from([['a', 1]]).copy()
export const lruNewest: ReadonlySequencedMap<string, number> = lru.reversed()
export const lruOldest: MapEntry<string, number> | undefined = lru.pollFirstEntry()
export const lruKeys: SequencedSet<string> = lru.keySet()
export const lruValues: SequencedCollection<number> = lruCopy.valueCollection()
export const sortedAsSequencedMap: SequencedMap<number, string> = new TreeMap<number, string>()
export const sortedEntries: SequencedSet<MapEntry<number, string>> = new TreeMap<
  number,
  string
>().entrySet()
export const sortedValues: SequencedCollection<string> = new TreeMap<
  number,
  string
>().valueCollection()
export const readonlySorted: ReadonlySequencedMap<number, string> = levels
export const recentlySeen: SetCollection<string> = newSetFromMap(
  new LinkedHashMap<string, boolean>({ accessOrder: true, maxSize: 2 }),
)
export const weekdays: ReadonlyList<string> = listOf('mon', 'tue')
export const copiedWeekdays: ReadonlyList<string> = copyOfList(['mon', 'tue'])
export const vowels: ReadonlySetCollection<string> = setOf('a', 'e')
export const caselessNames: ReadonlySetCollection<string> = copyOfSet(['Ann', 'ann'], {
  key: (s) => s.toLowerCase(),
})
export const limits: ReadonlyMapCollection<string, number> = mapOf(['small', 10], ['large', 100])
export const copiedLimits: ReadonlyMapCollection<string, number> = copyOfMap(new Map([['a', 1]]))
export const readOnlyQueue: ReadonlyCollection<number> = unmodifiableCollection(new ArrayDeque([1]))
export const readOnlyDeque: ReadonlySequencedCollection<number> = unmodifiableSequencedCollection(
  new ArrayDeque([1]),
)
export const readOnlyItems: ReadonlyList<string> = unmodifiableList(new ArrayList(['a']))
export const readOnlyTags: ReadonlySetCollection<string> = unmodifiableSet(new HashSet(['a']))
export const readOnlyRecent: ReadonlySequencedSet<string> = unmodifiableSequencedSet(
  new LinkedHashSet(['a']),
)
export const readOnlyScores: ReadonlySortedSet<number> = unmodifiableSortedSet(new TreeSet([1]))
export const readOnlyPrices: ReadonlyMapCollection<string, number> = unmodifiableMap(
  new HashMap([['tea', 3]]),
)
export const readOnlyCache: ReadonlySequencedMap<string, number> = unmodifiableSequencedMap(
  new LinkedHashMap([['a', 1]]),
)
export const readOnlyLevels: ReadonlySortedMap<number, string> = unmodifiableSortedMap(
  new TreeMap([[1, 'low']]),
)
const scores = [3, 1, 2]
export const scoreList: List<number> = asList(scores)
