// Natural order: the library's single definition of "less than" for values compared without a
// comparator. `compareSymbol` is public (re-exported by the comparators module); everything else in
// this file is internal and marked so on each declaration.

import { ClassCastError, NullElementError } from '../errors/errors'
import { describeValue } from './checks'
import { createWeakMap, getTime, weakMapGet, weakMapSet } from './intrinsics'

/**
 * The key of the protocol by which an object states its own natural order.
 *
 * An object whose `[compareSymbol]` is a method is compared with another such object by calling
 * `a[compareSymbol](b)`, which returns a negative number, zero or a positive number. Only the sign
 * is used. The key is `Symbol.for('javascript-collections-framework.compare')` and does not change
 * between major versions, so classes keep working across upgrades. Implementations must order
 * consistently: if `a` is before `b`, then `b` is after `a`, and the order is transitive.
 *
 * Time: O(1) to read; the method's cost is the implementer's.
 *
 * @example
 * ```ts
 * class Money implements Comparable<Money> {
 *   constructor(readonly cents: number) {}
 *   [compareSymbol](other: Money): number {
 *     return this.cents - other.cents
 *   }
 * }
 * ```
 */
export const compareSymbol: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework.compare',
)

type Kind = 'number' | 'string' | 'bigint' | 'boolean' | 'date' | 'protocol'

type ProtocolMethod = (this: object, other: unknown) => unknown

/**
 * Whether each object seen so far is a date. Telling a non-date apart costs a thrown exception, and
 * whether an object is a date never changes, so the answer is kept per object. A `WeakMap` neither
 * keeps the object alive nor adds anything to it.
 */
const dateCache: WeakMap<object, boolean> = /*#__PURE__*/ createWeakMap<object, boolean>()

/**
 * Returns whether `value` is a date: the built-in `getTime` succeeds on it. True for dates from any
 * realm and for Date subclasses; false for objects that only inherit from `Date.prototype` and for
 * `Proxy` objects. Runs no user code.
 */
function isDate(value: object): boolean {
  let known = weakMapGet(dateCache, value)
  if (known === undefined) {
    try {
      getTime(value as Date)
      known = true
    } catch {
      known = false
    }
    weakMapSet(dateCache, value, known)
  }
  return known
}

/**
 * The kind of a value for natural order, or `undefined` when it has no natural order. For an object
 * that implements the protocol, the method itself is returned, so it is read exactly once per
 * comparison (a getter or `Proxy` trap runs once, and the function checked is the one called).
 * Primitives are classified by `typeof` alone; the protocol is looked up only on objects. The
 * caller has already rejected `null` and `undefined`.
 */
function kindOf(value: unknown): Exclude<Kind, 'protocol'> | ProtocolMethod | undefined {
  switch (typeof value) {
    case 'number':
    case 'string':
    case 'bigint':
    case 'boolean':
      return typeof value as Exclude<Kind, 'protocol' | 'date'>
    case 'object': {
      if (isDate(value as object)) return 'date'
      const method: unknown = (value as Record<symbol, unknown>)[compareSymbol]
      return typeof method === 'function' ? (method as ProtocolMethod) : undefined
    }
    default:
      return undefined
  }
}

function label(value: unknown): string {
  return typeof value === 'object' && value !== null && isDate(value) ? 'date' : typeof value
}

function kindName(kind: Exclude<Kind, 'protocol'> | ProtocolMethod): Kind {
  return typeof kind === 'function' ? 'protocol' : kind
}

function compareProtocol(method: ProtocolMethod, a: object, b: unknown, where: string): -1 | 0 | 1 {
  const result = method.call(a, b)
  if (typeof result !== 'number' || Number.isNaN(result)) {
    throw new TypeError(`${where}: [compareSymbol] returned ${describeValue(result)}`)
  }
  return result < 0 ? -1 : result > 0 ? 1 : 0
}

function compareNumbers(a: number, b: number): -1 | 0 | 1 {
  if (a < b) return -1
  if (a > b) return 1
  if (a === b) return 0
  // At least one is NaN: NaN equals NaN and comes after every other number.
  if (Number.isNaN(a)) return Number.isNaN(b) ? 0 : 1
  return -1
}

function compareOrdered(a: string | bigint, b: string | bigint): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Whether `a` and `b` are both numbers or both strings: values whose natural comparison runs no
 * user code (a primitive never consults `[compareSymbol]`) and cannot throw.
 *
 * Time: O(1).
 *
 * @internal
 */
export function isPlainKind(a: unknown, b: unknown): boolean {
  const kind = typeof a
  return (kind === 'number' || kind === 'string') && typeof b === kind
}

/**
 * Compares two values in natural order.
 *
 * `null` and `undefined` are rejected first; then both values must be of the same kind. Numbers
 * compare numerically (`-0` equals `0`; `NaN` equals itself and comes after every other number),
 * strings by UTF-16 code units, bigints numerically, booleans with `false` first, dates by time
 * value (invalid dates last), and objects that both implement `[compareSymbol]` by the sign of
 * `a[compareSymbol](b)`, whose result must be a number other than `NaN`. A date is compared by
 * time even when it implements the protocol. Values are never compared by `<` coercion or by
 * conversion to strings.
 *
 * Time: O(1) for numbers and booleans; O(1) amortised for dates and protocol objects (plus the
 * protocol method); O(length of the common prefix) for strings; O(digits) for bigints.
 *
 * @param a - The first value.
 * @param b - The second value.
 * @param where - The name to start error messages with (`naturalOrder`, `TreeMap.put`, …).
 * @returns `-1`, `0` or `1`.
 * @throws NullElementError when either value is `null` or `undefined`.
 * @throws ClassCastError when the values are of different kinds or have no natural order.
 * @throws TypeError when a `[compareSymbol]` method returns a non-number or `NaN`.
 * @internal
 */
export function compareNatural(a: unknown, b: unknown, where: string): -1 | 0 | 1 {
  // Two numbers or two strings: the common case, compared without classifying either value.
  if (typeof a === 'number' && typeof b === 'number') return compareNumbers(a, b)
  if (typeof a === 'string' && typeof b === 'string') return compareOrdered(a, b)
  if (a === null || a === undefined || b === null || b === undefined) {
    const missing = a === null || a === undefined ? a : b
    throw new NullElementError(`${where}: ${describeValue(missing)} cannot be compared`)
  }
  const kind = kindOf(a)
  if (kind === undefined) throw new ClassCastError(`${where}: ${label(a)} cannot be compared`)
  const other = kindOf(b)
  if (other === undefined) throw new ClassCastError(`${where}: ${label(b)} cannot be compared`)
  if (kindName(kind) !== kindName(other)) {
    throw new ClassCastError(`${where}: ${label(a)} and ${label(b)} cannot be compared`)
  }
  if (typeof kind === 'function') return compareProtocol(kind, a as object, b, where)
  switch (kind) {
    case 'number':
      return compareNumbers(a as number, b as number)
    case 'date':
      // Invalid dates have a NaN time value, so they come last, as NaN does among numbers.
      return compareNumbers(getTime(a as Date), getTime(b as Date))
    case 'boolean':
      return a === b ? 0 : a ? 1 : -1
    default:
      return compareOrdered(a as string | bigint, b as string | bigint)
  }
}

/**
 * Compares two values in natural order as `compareNatural` does, but returns `undefined` where
 * `compareNatural` would throw `NullElementError` or `ClassCastError` itself: for `null`,
 * `undefined`, values with no natural order and values of different kinds. An error thrown by a
 * `[compareSymbol]` method, or its invalid result, still propagates. Lookups use it to answer
 * "absent" as a native `Set` does.
 *
 * Time: as `compareNatural`.
 *
 * @param a - The first value.
 * @param b - The second value.
 * @param where - The name to start error messages with.
 * @returns `-1`, `0` or `1`, or `undefined` when the values cannot be compared.
 * @throws TypeError when a `[compareSymbol]` method returns a non-number or `NaN`.
 * @internal
 */
export function compareNaturalOrAbsent(
  a: unknown,
  b: unknown,
  where: string,
): -1 | 0 | 1 | undefined {
  if (typeof a === 'number' && typeof b === 'number') return compareNumbers(a, b)
  if (typeof a === 'string' && typeof b === 'string') return compareOrdered(a, b)
  if (a === null || a === undefined || b === null || b === undefined) return undefined
  const kind = kindOf(a)
  const other = kind === undefined ? undefined : kindOf(b)
  if (kind === undefined || other === undefined || kindName(kind) !== kindName(other)) {
    return undefined
  }
  // The same steps as the end of `compareNatural`, kept separate so code that never needs this
  // function does not pay for sharing them.
  if (typeof kind === 'function') return compareProtocol(kind, a as object, b, where)
  switch (kind) {
    case 'number':
      return compareNumbers(a as number, b as number)
    case 'date':
      return compareNumbers(getTime(a as Date), getTime(b as Date))
    case 'boolean':
      return a === b ? 0 : a ? 1 : -1
    default:
      return compareOrdered(a as string | bigint, b as string | bigint)
  }
}
