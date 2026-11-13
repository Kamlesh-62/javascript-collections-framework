// A consumer of the published package that uses every exported name once, so a declaration that
// only breaks when used is caught. scripts/old-typescript.mjs compiles it with every supported
// TypeScript version and module resolution; it is never run.

import type {
  Collection,
  Comparable,
  Comparator,
  Cursor,
  Equatable,
  Equivalence,
  HashFunction,
  KeyOf,
  List,
  ListCursor,
  ReadonlyCollection,
  ReadonlyList,
  ReadonlySequencedCollection,
  SequencedCollection,
} from 'javascript-collections-framework'
import {
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
  isList,
  isSequencedCollection,
  NoSuchElementError,
  NullElementError,
  naturalOrder,
  nullsFirst,
  nullsLast,
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
