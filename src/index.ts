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
  isQueue,
  isSequencedCollection,
} from './functions/guards'
export type { Collection, Cursor, ReadonlyCollection } from './interfaces/collection'
export type {
  List,
  ListCursor,
  ReadonlyList,
  ReadonlySequencedCollection,
  SequencedCollection,
} from './interfaces/list'
export type { Deque, Queue, ReadonlyDeque, ReadonlyQueue } from './interfaces/queue'
