// Checking an `equivalence` option given to a collection, and calling it safely.

import { describeValue } from './checks'
import {
  equalsAt,
  type HashFunction,
  hashAt,
  type ProtocolMethods,
  sameValueZero,
  sameValueZeroEquivalence,
  valueEquivalence,
} from './equality'
import { hashPrimitiveOrIdentity } from './hashing'
import { apply } from './intrinsics'

/**
 * An equivalence a collection can call, with results validated and errors naming the collection
 * method that called it.
 *
 * @internal
 */
export interface CheckedEquivalence {
  /** `methodsOfA`: `a`'s protocol methods already read by the caller (used by `valueEquivalence`). */
  equals(a: unknown, b: unknown, where: string, methodsOfA?: ProtocolMethods): boolean
  /** `methods`: the value's protocol methods already read by the caller (used by `valueEquivalence`). */
  hash(value: unknown, where: string, methods?: ProtocolMethods): number
}

const sameValueZeroChecked: CheckedEquivalence = {
  equals: (a, b) => sameValueZero(a, b),
  hash: (value) => hashPrimitiveOrIdentity(value),
}

/** A hash function for nested protocol values that reports errors with `where`. */
function nestedHash(where: string): HashFunction {
  const hash: HashFunction = (value) => hashAt(value, where, hash)
  return hash
}

const valueChecked: CheckedEquivalence = {
  equals: (a, b, where, methodsOfA) => equalsAt(a, b, where, methodsOfA),
  hash: (value, where, methods) => hashAt(value, where, nestedHash(where), methods),
}

/**
 * Checks a collection's `equivalence` option at construction.
 *
 * An omitted option, or this copy's `sameValueZeroEquivalence`, means SameValueZero; this copy's
 * `valueEquivalence` is routed to the internal entry points so protocol errors (including those of
 * nested values) name the collection method. Any other object must have `equals` and `hash`
 * functions; they are read once and called with `this` set to the object, and their results are
 * validated: `equals` must return a boolean, `hash` a finite number (reduced with ToInt32).
 *
 * Time: O(1).
 *
 * @param option - The `equivalence` option as given.
 * @param where - The constructor to name in errors (`HashMap.constructor`).
 * @throws TypeError when the option is `null`, not an object, or lacks either function.
 * @internal
 */
export function checkEquivalence(option: unknown, where: string): CheckedEquivalence {
  if (option === undefined || option === sameValueZeroEquivalence) return sameValueZeroChecked
  if (option === valueEquivalence) return valueChecked
  const fail = () =>
    new TypeError(`${where}: equivalence must be an object with equals and hash functions`)
  if (typeof option !== 'object' || option === null) throw fail()
  const record = option as Record<string, unknown>
  const equals = record.equals
  const hash = record.hash
  if (typeof equals !== 'function' || typeof hash !== 'function') throw fail()
  const callEquals = equals as (this: unknown, a: unknown, b: unknown) => unknown
  const callHash = hash as (this: unknown, value: unknown) => unknown
  return {
    equals(a, b, at) {
      const result = apply(callEquals, option, [a, b])
      if (typeof result !== 'boolean') {
        throw new TypeError(`${at}: equivalence.equals returned ${describeValue(result)}`)
      }
      return result
    },
    hash(value, at) {
      const result = apply(callHash, option, [value])
      if (typeof result !== 'number' || result - result !== 0) {
        throw new TypeError(`${at}: equivalence.hash returned ${describeValue(result)}`)
      }
      return result | 0
    },
  }
}
