/**
 * The guarded comparator call used by every sorted structure.
 *
 * A comparator is user code. Sorted structures call it through `guardedCompare` before they change
 * anything, so a broken result throws instead of corrupting a tree or heap.
 *
 * @internal
 * @packageDocumentation
 */

import { describeValue } from './checks'

/**
 * Calls `comparator(a, b)` once and returns the sign of its result.
 *
 * An error thrown by the comparator propagates unchanged.
 *
 * Time: O(1) plus the comparator.
 *
 * @param comparator - The user's comparator.
 * @param a - The first value.
 * @param b - The second value.
 * @param where - `<Class>.<method>` of the collection, for the message.
 * @returns `-1`, `0` or `1`.
 * @throws TypeError when the result is not a number or is `NaN`.
 * @internal
 */
export function guardedCompare<T>(
  comparator: (a: T, b: T) => number,
  a: T,
  b: T,
  where: string,
): -1 | 0 | 1 {
  const result: unknown = comparator(a, b)
  if (typeof result !== 'number' || Number.isNaN(result)) {
    throw new TypeError(`${where}: comparator returned ${describeValue(result)}`)
  }
  return result < 0 ? -1 : result > 0 ? 1 : 0
}
