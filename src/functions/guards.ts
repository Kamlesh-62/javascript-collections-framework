/**
 * Type guards that recognise library types at run time, across copies of the package.
 *
 * @packageDocumentation
 */

import type { ReadonlyCollection } from '../interfaces/collection'
import type { ReadonlyList, ReadonlySequencedCollection } from '../interfaces/list'
import { isBranded, LIST_BRAND, SEQUENCED_COLLECTION_BRAND } from '../internal/brand'
import { COLLECTION_BRAND } from '../internal/output'

/**
 * Returns whether `value` is a collection from this library — any collection, view or read-only
 * wrapper of the same major version, from any loaded copy of the package. Maps, arrays and native
 * `Set`/`Map` are not.
 *
 * Time: O(1), plus any getter or proxy trap that reading a property of `value` runs.
 *
 * @param value - Any value.
 * @returns `true` when `value` is a library collection.
 * @throws whatever a getter or proxy trap on `value` throws while the property is read.
 *
 * @example
 * ```ts
 * function count(value: unknown): number {
 *   return isCollection(value) ? value.size : 0
 * }
 * ```
 */
export function isCollection(value: unknown): value is ReadonlyCollection<unknown> {
  return isBranded(value, COLLECTION_BRAND)
}

/**
 * Returns whether `value` is a sequenced collection from this library — a collection with a first
 * and last element, such as a list or one of its views — of the same major version, from any loaded
 * copy of the package.
 *
 * Time: O(1), plus any getter or proxy trap that reading a property of `value` runs.
 *
 * @param value - Any value.
 * @returns `true` when `value` is a library sequenced collection.
 * @throws whatever a getter or proxy trap on `value` throws while the property is read.
 *
 * @example
 * ```ts
 * isSequencedCollection(new ArrayList([1])) // true
 * isSequencedCollection([1])                // false
 * ```
 */
export function isSequencedCollection(
  value: unknown,
): value is ReadonlySequencedCollection<unknown> {
  return isBranded(value, SEQUENCED_COLLECTION_BRAND)
}

/**
 * Returns whether `value` is a list from this library — an `ArrayList`, a sub-list or a reversed
 * view — of the same major version, from any loaded copy of the package. Arrays are not.
 *
 * Time: O(1), plus any getter or proxy trap that reading a property of `value` runs.
 *
 * @param value - Any value.
 * @returns `true` when `value` is a library list.
 * @throws whatever a getter or proxy trap on `value` throws while the property is read.
 *
 * @example
 * ```ts
 * function first(value: unknown): unknown {
 *   return isList(value) && !value.isEmpty() ? value.get(0) : undefined
 * }
 * ```
 */
export function isList(value: unknown): value is ReadonlyList<unknown> {
  return isBranded(value, LIST_BRAND)
}
