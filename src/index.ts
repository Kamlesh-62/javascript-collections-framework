/**
 * javascript-collections-framework
 *
 * A typed collections framework for JavaScript and TypeScript.
 * Every public type and function is exported from this module.
 *
 * @packageDocumentation
 */

// Collections
export { ArrayDeque } from './collections/array-deque'
export { ArrayList } from './collections/array-list'
export type { HashMapOptions } from './collections/hash-map'
export { HashMap } from './collections/hash-map'
export type { HashSetOptions } from './collections/hash-set'
export { HashSet } from './collections/hash-set'
export type { LinkedHashMapOptions } from './collections/linked-hash-map'
export { LinkedHashMap } from './collections/linked-hash-map'
export type { LinkedHashSetOptions } from './collections/linked-hash-set'
export { LinkedHashSet } from './collections/linked-hash-set'
export { LinkedList } from './collections/linked-list'
export type { PriorityQueueOptions } from './collections/priority-queue'
export { PriorityQueue } from './collections/priority-queue'
export type { TreeMapOptions } from './collections/tree-map'
export { TreeMap } from './collections/tree-map'
export type { TreeSetOptions } from './collections/tree-set'
export { TreeSet } from './collections/tree-set'
// Errors
export {
  ClassCastError,
  ConcurrentModificationError,
  IllegalArgumentError,
  IllegalStateError,
  IndexOutOfBoundsError,
  NoSuchElementError,
  NullElementError,
  UnsupportedOperationError,
} from './errors/errors'
// Comparators
export type { Comparable, Comparator } from './functions/comparators'
export {
  compareSymbol,
  comparing,
  naturalOrder,
  nullsFirst,
  nullsLast,
  reverseOrder,
  thenComparing,
} from './functions/comparators'
// Equality and hashing
export type { Equatable, Equivalence, HashFunction, KeyOf } from './functions/equality'
export {
  equals,
  equalsSymbol,
  hashCode,
  hashCodeSymbol,
  sameValueZeroEquivalence,
  valueEquivalence,
} from './functions/equality'
// Guards and collection interfaces
export {
  isCollection,
  isDeque,
  isList,
  isMapCollection,
  isQueue,
  isSequencedCollection,
  isSetCollection,
  isSortedMap,
  isSortedSet,
} from './functions/guards'
export type { Collection, Cursor, ReadonlyCollection } from './interfaces/collection'
export type { LinkedListNode } from './interfaces/linked-list-node'
export type {
  List,
  ListCursor,
  ReadonlyList,
  ReadonlySequencedCollection,
  SequencedCollection,
} from './interfaces/list'
export type { MapCollection, MapEntry, ReadonlyMapCollection } from './interfaces/map'
export type { Deque, Queue, ReadonlyDeque, ReadonlyQueue } from './interfaces/queue'
export type { ReadonlySequencedMap, SequencedMap } from './interfaces/sequenced-map'
export type { ReadonlySequencedSet, SequencedSet } from './interfaces/sequenced-set'
export type { ReadonlySetCollection, SetCollection } from './interfaces/set'
export type { ReadonlySortedMap, SortedMap } from './interfaces/sorted-map'
export type {
  BoundOptions,
  ReadonlySortedSet,
  SortedSet,
  SubSetOptions,
} from './interfaces/sorted-set'
