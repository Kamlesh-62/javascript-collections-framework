/**
 * Comparators: the `(a, b) => number` functions that order values, and helpers to build them.
 *
 * A comparator returns a negative number when `a` comes first, a positive number when `b` comes
 * first, and zero when they are equal in the order; only the sign matters. It is the same shape
 * `Array.prototype.sort` accepts, so every comparator here works with native `sort` unchanged.
 *
 * @packageDocumentation
 */

import { compareNatural, compareSymbol } from '../internal/natural-order'

export { compareSymbol }

/**
 * A function that orders two values: negative when `a` comes first, positive when `b` comes
 * first, zero when they are equal in this order. Only the sign is used.
 *
 * It is the shape `Array.prototype.sort` accepts.
 *
 * @example
 * ```ts
 * const byLength: Comparator<string> = (a, b) => a.length - b.length
 * ['ccc', 'a', 'bb'].sort(byLength) // ['a', 'bb', 'ccc']
 * ```
 */
export type Comparator<T> = (a: T, b: T) => number

/**
 * An object that states its own natural order through the `compareSymbol` protocol.
 *
 * `a[compareSymbol](b)` returns a negative number when `a` comes first, a positive number when `b`
 * comes first, and zero when they are equal in the order. Natural order uses it only when both
 * values implement it, and only its sign. Keep the order consistent: if `a` is before `b`, then `b`
 * is after `a`, and if `a` is before `b` and `b` before `c`, then `a` is before `c`.
 *
 * @example
 * ```ts
 * class Version implements Comparable<Version> {
 *   constructor(readonly major: number, readonly minor: number) {}
 *   [compareSymbol](other: Version): number {
 *     return this.major - other.major || this.minor - other.minor
 *   }
 * }
 * [new Version(2, 0), new Version(1, 4)].sort(naturalOrder()) // 1.4, then 2.0
 * ```
 */
export interface Comparable<T> {
  [compareSymbol](other: T): number
}

const natural: Comparator<unknown> = (a, b) => compareNatural(a, b, 'naturalOrder')

/**
 * Returns the comparator for natural order.
 *
 * Numbers compare numerically (`-0` equals `0`; `NaN` comes after every other number), strings by
 * UTF-16 code units (the order of `<` on two strings, identical on every runtime; use
 * `Intl.Collator().compare` for a locale's order), bigints numerically and booleans with `false`
 * first, dates by time value (invalid dates last), and objects that implement `[compareSymbol]` by
 * that method. Values are never converted to strings or compared with `<` coercion.
 *
 * Time: O(1) per comparison for numbers and booleans; O(1) amortised for dates and
 * `[compareSymbol]` objects (plus the method); O(length of the common prefix) for strings;
 * O(digits) for bigints.
 *
 * @returns A comparator for natural order.
 * @throws NullElementError (from the comparator) when a value is `null` or `undefined`.
 * @throws ClassCastError (from the comparator) when the values are of different kinds, such as a
 *   number and a string, or a number and a bigint, or have no natural order.
 * @throws TypeError (from the comparator) when a `[compareSymbol]` method returns a non-number or
 *   `NaN`.
 *
 * @example
 * ```ts
 * [10, 9, 1].sort(naturalOrder()) // [1, 9, 10] — native sort without a comparator gives [1, 10, 9]
 * ```
 */
export function naturalOrder<T>(): Comparator<T> {
  return natural
}

const reverseNatural: Comparator<unknown> = (a, b) => compareNatural(b, a, 'naturalOrder')

function requireFunction(value: unknown, where: string, what: string): void {
  if (typeof value !== 'function') throw new TypeError(`${where}: ${what} is not a function`)
}

/**
 * Returns a comparator for the reverse of `comparator`, or of natural order when it is omitted.
 *
 * The result for `(a, b)` is `comparator(b, a)`, returned unchanged.
 *
 * Time: O(1) plus one call of `comparator` per comparison.
 *
 * @param comparator - The order to reverse; natural order when omitted.
 * @returns The reversed comparator.
 * @throws TypeError when `comparator` is given but is not a function (including `null`).
 * @throws NullElementError, ClassCastError or TypeError (from the comparator, when natural order is
 *   used) as described for {@link naturalOrder}.
 *
 * @example
 * ```ts
 * [1, 3, 2].sort(reverseOrder()) // [3, 2, 1]
 * ```
 */
export function reverseOrder<T>(comparator?: Comparator<T>): Comparator<T> {
  if (comparator === undefined) return reverseNatural
  requireFunction(comparator, 'reverseOrder', 'comparator')
  return (a, b) => comparator(b, a)
}

/**
 * Returns a comparator that orders values by a key derived from each of them.
 *
 * `key` is called exactly once for each of the two values in every comparison, and its errors
 * propagate. The keys are compared with `comparator`, or in natural order when it is omitted (so
 * keys of mixed kinds throw `ClassCastError`). Wrap the key comparator with {@link nullsFirst} or
 * {@link nullsLast} to allow missing keys.
 *
 * Time: O(1) plus two calls of `key` and one of `comparator` per comparison.
 *
 * @param key - Derives the value to compare.
 * @param comparator - Orders the keys; natural order when omitted.
 * @returns The comparator.
 * @throws TypeError when `key` is not a function, or `comparator` is given but is not a function.
 * @throws NullElementError, ClassCastError or TypeError (from the comparator, when natural order is
 *   used) as described for {@link naturalOrder}.
 *
 * @example
 * ```ts
 * const byAge = comparing((user: { age: number }) => user.age)
 * const byNickname = comparing((user: { nickname?: string }) => user.nickname, nullsFirst())
 * ```
 */
export function comparing<T, U>(key: (value: T) => U, comparator?: Comparator<U>): Comparator<T> {
  requireFunction(key, 'comparing', 'key')
  if (comparator === undefined) return (a, b) => compareNatural(key(a), key(b), 'naturalOrder')
  requireFunction(comparator, 'comparing', 'comparator')
  return (a, b) => comparator(key(a), key(b))
}

/**
 * Returns a comparator that applies `first`, then each of `next` in turn to break ties.
 *
 * The result is the first one that is not `0`, returned unchanged; later comparators are not
 * called once one result is not `0`. When every result is `0`, the result is `0`.
 *
 * Time: O(k) for k comparators, plus at most one call of each per comparison.
 *
 * @param first - The primary order.
 * @param next - Tie-breakers, in order.
 * @returns The combined comparator.
 * @throws TypeError when any argument is not a function.
 *
 * @example
 * ```ts
 * type Person = { last: string; first: string }
 * const byName = thenComparing<Person>(
 *   comparing((p) => p.last),
 *   comparing((p) => p.first),
 * )
 * ```
 */
export function thenComparing<T>(first: Comparator<T>, ...next: Comparator<T>[]): Comparator<T> {
  const all = [first, ...next]
  for (let i = 0; i < all.length; i++) {
    requireFunction(all[i], 'thenComparing', `comparator ${i + 1}`)
  }
  return (a, b) => {
    for (const comparator of all) {
      const result = comparator(a, b)
      if (result !== 0) return result
    }
    return 0
  }
}

function nulls<T>(
  comparator: Comparator<T> | undefined,
  where: string,
  nullResult: -1 | 1,
): Comparator<T | null | undefined> {
  let compareRest: Comparator<T> = natural
  if (comparator !== undefined) {
    requireFunction(comparator, where, 'comparator')
    compareRest = comparator
  }
  return (a, b) => {
    if (a === null || a === undefined) return b === null || b === undefined ? 0 : nullResult
    if (b === null || b === undefined) return -nullResult
    return compareRest(a, b)
  }
}

/**
 * Returns a comparator that puts `null` and `undefined` before every other value, treats them as
 * equal to each other, and orders the rest with `comparator` (natural order when omitted).
 * `comparator` is never called with `null` or `undefined`.
 *
 * Native `Array.prototype.sort` always moves `undefined` and empty slots to the end without calling
 * the comparator, so with native `sort` this moves only `null` to the front.
 *
 * Time: O(1) plus at most one call of `comparator` per comparison.
 *
 * @param comparator - Orders the values that are not `null` or `undefined`.
 * @returns The comparator.
 * @throws TypeError when `comparator` is given but is not a function (including `null`).
 * @throws NullElementError, ClassCastError or TypeError (from the comparator, when natural order is
 *   used) as described for {@link naturalOrder}.
 *
 * @example
 * ```ts
 * [3, null, 1].sort(nullsFirst()) // [null, 1, 3]
 * ```
 */
export function nullsFirst<T>(comparator?: Comparator<T>): Comparator<T | null | undefined> {
  return nulls(comparator, 'nullsFirst', -1)
}

/**
 * Returns a comparator that puts `null` and `undefined` after every other value, treats them as
 * equal to each other, and orders the rest with `comparator` (natural order when omitted).
 * `comparator` is never called with `null` or `undefined`.
 *
 * Time: O(1) plus at most one call of `comparator` per comparison.
 *
 * @param comparator - Orders the values that are not `null` or `undefined`.
 * @returns The comparator.
 * @throws TypeError when `comparator` is given but is not a function (including `null`).
 * @throws NullElementError, ClassCastError or TypeError (from the comparator, when natural order is
 *   used) as described for {@link naturalOrder}.
 *
 * @example
 * ```ts
 * [null, 3, 1].sort(nullsLast()) // [1, 3, null]
 * ```
 */
export function nullsLast<T>(comparator?: Comparator<T>): Comparator<T | null | undefined> {
  return nulls(comparator, 'nullsLast', 1)
}
