/**
 * Type guards that recognise library types at run time, across copies of the package.
 *
 * @packageDocumentation
 */

import type { ReadonlyCollection } from '../interfaces/collection'
import { isBranded } from '../internal/brand'
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
