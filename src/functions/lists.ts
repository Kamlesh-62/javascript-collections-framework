/**
 * Lists over arrays.
 *
 * @packageDocumentation
 */

import type { List } from '../interfaces/list'
import { describeValue } from '../internal/checks'
import { ArrayListView } from '../internal/views/array-list-view'

/**
 * Returns a list whose elements are `array` itself, without copying it. Every change made through
 * the list — `add`, `insert`, `removeAt`, `set`, `sort`, `clear`, through its sub-lists, reversed
 * view and cursors — writes to the array, and changes made to the array directly show through the
 * list. A direct change of the array's length makes open iterators, cursors and sub-lists of the
 * list throw `ConcurrentModificationError` on their next move; same-length direct writes show
 * through but are not detected and do not change `revision`.
 *
 * The list follows the list rules, not the array's: `indexOf` uses SameValueZero, `equals`
 * compares with any list by elements, and `sort` is stable and throws `NullElementError` for
 * `null`, `undefined` and holes in natural order (holes read as `undefined`). A frozen array refuses
 * every write, and a sealed or non-extensible one every change of length, with `TypeError` before
 * anything is written. Only those three states are checked: an element made non-writable or
 * non-configurable with `Object.defineProperty` on an extensible array, or a `Proxy` array, can
 * make a write fail part-way and leave elements shifted. Each call returns a new, independent list.
 *
 * Time: O(1). `get`, `set` and `size` are O(1), `add` amortised O(1), `insert` and `removeAt` O(n).
 *
 * @param array - The array to show as a list.
 * @returns A list over `array`, printed as `ArrayListView`.
 * @throws TypeError when `array` is not an array (array-likes and typed arrays included).
 *
 * @example
 * ```ts
 * const scores = [30, 10, 20]
 * const list = asList(scores)
 * list.sort()
 * list.add(40)
 * scores // [10, 20, 30, 40]
 * ```
 */
export function asList<E>(array: E[]): List<E> {
  if (!Array.isArray(array)) {
    throw new TypeError(`asList: array is not an array (${describeValue(array)})`)
  }
  return new ArrayListView<E>(array)
}
