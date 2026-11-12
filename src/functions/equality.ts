/**
 * Equality and hashing: SameValueZero by default, as native `Map` and `Set` use, with opt-in value
 * equality through a `key` function, an `Equivalence`, or a symbol protocol.
 *
 * @packageDocumentation
 */

export type { Equatable, Equivalence, HashFunction, KeyOf } from '../internal/equality'
export {
  equals,
  equalsSymbol,
  hashCode,
  hashCodeSymbol,
  sameValueZeroEquivalence,
  valueEquivalence,
} from '../internal/equality'
