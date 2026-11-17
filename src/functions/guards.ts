/**
 * Type guards that recognise library types at run time, across copies of the package.
 *
 * @packageDocumentation
 */

import type { ReadonlyCollection } from '../interfaces/collection'
import type { ReadonlyList, ReadonlySequencedCollection } from '../interfaces/list'
import type { ReadonlyMapCollection } from '../interfaces/map'
import type { ReadonlyDeque, ReadonlyQueue } from '../interfaces/queue'
import type { ReadonlySetCollection } from '../interfaces/set'
import type { ReadonlySortedSet } from '../interfaces/sorted-set'
import {
  DEQUE_BRAND,
  isBranded,
  LIST_BRAND,
  MAP_COLLECTION_BRAND,
  QUEUE_BRAND,
  SEQUENCED_COLLECTION_BRAND,
  SET_COLLECTION_BRAND,
  SORTED_SET_BRAND,
} from '../internal/brand'
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

/**
 * Returns whether `value` is a queue from this library — an `ArrayDeque` or its reversed view —
 * of the same major version, from any loaded copy of the package.
 *
 * Time: O(1), plus any getter or proxy trap that reading a property of `value` runs.
 *
 * @param value - Any value.
 * @returns `true` when `value` is a library queue.
 * @throws whatever a getter or proxy trap on `value` throws while the property is read.
 *
 * @example
 * ```ts
 * isQueue(new ArrayDeque()) // true
 * isQueue([])               // false
 * ```
 */
export function isQueue(value: unknown): value is ReadonlyQueue<unknown> {
  return isBranded(value, QUEUE_BRAND)
}

/**
 * Returns whether `value` is a deque from this library — an `ArrayDeque` or its reversed view —
 * of the same major version, from any loaded copy of the package.
 *
 * Time: O(1), plus any getter or proxy trap that reading a property of `value` runs.
 *
 * @param value - Any value.
 * @returns `true` when `value` is a library deque.
 * @throws whatever a getter or proxy trap on `value` throws while the property is read.
 *
 * @example
 * ```ts
 * function last(value: unknown): unknown {
 *   return isDeque(value) ? value.peekLast() : undefined
 * }
 * ```
 */
export function isDeque(value: unknown): value is ReadonlyDeque<unknown> {
  return isBranded(value, DEQUE_BRAND)
}

/**
 * Returns whether `value` is a set from this library — a `HashSet` or any other set — of the same
 * major version, from any loaded copy of the package. Native `Set` is not.
 *
 * Time: O(1), plus any getter or proxy trap that reading a property of `value` runs.
 *
 * @param value - Any value.
 * @returns `true` when `value` is a library set.
 * @throws whatever a getter or proxy trap on `value` throws while the property is read.
 *
 * @example
 * ```ts
 * isSetCollection(new HashSet([1])) // true
 * isSetCollection(new Set([1]))     // false
 * ```
 */
export function isSetCollection(value: unknown): value is ReadonlySetCollection<unknown> {
  return isBranded(value, SET_COLLECTION_BRAND)
}

/**
 * Returns whether `value` is a map from this library — a `HashMap` or any other map — of the same
 * major version, from any loaded copy of the package. Native `Map` is not, and neither are the
 * views a map returns (they are collections).
 *
 * Time: O(1), plus any getter or proxy trap that reading a property of `value` runs.
 *
 * @param value - Any value.
 * @returns `true` when `value` is a library map.
 * @throws whatever a getter or proxy trap on `value` throws while the property is read.
 *
 * @example
 * ```ts
 * isMapCollection(new HashMap([['a', 1]])) // true
 * isMapCollection(new Map([['a', 1]]))     // false
 * ```
 */
export function isMapCollection(value: unknown): value is ReadonlyMapCollection<unknown, unknown> {
  return isBranded(value, MAP_COLLECTION_BRAND)
}

/**
 * Returns whether `value` is a sorted set from this library — a `TreeSet`, one of its range views
 * or a reversed view — of the same major version, from any loaded copy of the package. A `HashSet`
 * and native `Set` are not.
 *
 * Time: O(1), plus any getter or proxy trap that reading a property of `value` runs.
 *
 * @param value - Any value.
 * @returns `true` when `value` is a library sorted set.
 * @throws whatever a getter or proxy trap on `value` throws while the property is read.
 *
 * @example
 * ```ts
 * isSortedSet(new TreeSet([1]))  // true
 * isSortedSet(new HashSet([1]))  // false
 * ```
 */
export function isSortedSet(value: unknown): value is ReadonlySortedSet<unknown> {
  return isBranded(value, SORTED_SET_BRAND)
}
