// A consumer of the published package that uses every exported name once, so a declaration that
// only breaks when used is caught. scripts/old-typescript.mjs compiles it with every supported
// TypeScript version and module resolution; it is never run.

import type {
  Collection,
  Comparable,
  Comparator,
  Cursor,
  Deque,
  Equatable,
  Equivalence,
  HashFunction,
  KeyOf,
  LinkedListNode,
  List,
  ListCursor,
  PriorityQueueOptions,
  Queue,
  ReadonlyCollection,
  ReadonlyDeque,
  ReadonlyList,
  ReadonlyQueue,
  ReadonlySequencedCollection,
  SequencedCollection,
} from 'javascript-collections-framework'
import {
  ArrayDeque,
  ArrayList,
  ClassCastError,
  ConcurrentModificationError,
  compareSymbol,
  comparing,
  equals,
  equalsSymbol,
  hashCode,
  hashCodeSymbol,
  IllegalArgumentError,
  IllegalStateError,
  IndexOutOfBoundsError,
  isCollection,
  isDeque,
  isList,
  isQueue,
  isSequencedCollection,
  LinkedList,
  NoSuchElementError,
  NullElementError,
  naturalOrder,
  nullsFirst,
  nullsLast,
  PriorityQueue,
  reverseOrder,
  sameValueZeroEquivalence,
  thenComparing,
  UnsupportedOperationError,
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

const byDeadline: PriorityQueueOptions<{ deadline: number }> = {
  comparator: (a, b) => a.deadline - b.deadline,
}
export const deadlines = new PriorityQueue([{ deadline: 2 }], byDeadline).add({ deadline: 1 })
export const urgent: { deadline: number } | undefined = deadlines.peek()
export const scheduled: Queue<number> = PriorityQueue.from([3, 1, 2])
export const sameOrder: Comparator<{ deadline: number }> | undefined = deadlines.copy().comparator()
