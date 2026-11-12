/**
 * javascript-collections-framework
 *
 * A typed collections framework for JavaScript and TypeScript.
 * Every public type and function is exported from this module.
 *
 * @packageDocumentation
 */

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
