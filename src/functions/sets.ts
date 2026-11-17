/**
 * Sets built from maps.
 *
 * @packageDocumentation
 */

import { IllegalArgumentError } from '../errors/errors'
import type { MapCollection } from '../interfaces/map'
import type { SetCollection } from '../interfaces/set'
import { isBranded, MAP_COLLECTION_BRAND } from '../internal/brand'
import { describeValue } from '../internal/checks'
import { SetFromMap } from '../internal/views/set-from-map'

/**
 * Returns a set backed by `map`: its members are the map's keys, iterated, compared, hashed and
 * printed as the map orders and compares its keys.
 *
 * The set is live in both directions. `add(member)` calls `map.getOrInsert(member, true)`, so the
 * map's key rules, access order and `maxSize` eviction apply; a present member is kept and its
 * value is not written. `addAll` returns `true` when some element was absent (`map.has`) just
 * before its own add, so it calls the map twice per element. Iteration, `cursor`, `forEach` and
 * every removal go through `map.keySet()`, so the set iterates live or fails fast as that key set
 * does. Changes made directly to the map show through the set, and the set's `size` and
 * `revision` are the map's. Writing a value of a present key leaves membership unchanged.
 *
 * Errors of the set's own argument checks name `SetFromMap.<method>`; errors raised by the map
 * keep the map's name, and iteration errors keep the key set's name.
 *
 * Time: O(1), or the map's `isEmpty` cost for a range view of a sorted map (O(log n)); each
 * operation of the returned set costs what the matching map or key set operation costs.
 *
 * @param map - An empty map from this library (any copy of the same major version), or an empty
 *   range or reversed view of one.
 * @returns A set whose members are the map's keys.
 * @throws TypeError when `map` is not a map from this library.
 * @throws IllegalArgumentError when `map` is not empty.
 *
 * @example
 * ```ts
 * // A set that keeps the 100 most recently added members.
 * const recent = newSetFromMap(
 *   new LinkedHashMap<string, boolean>({ accessOrder: true, maxSize: 100 }),
 * )
 * recent.add('a').add('b').add('a') // re-adding 'a' makes it the most recent member
 * recent.toArray() // ['b', 'a']
 * ```
 */
export function newSetFromMap<E>(map: MapCollection<E, boolean>): SetCollection<E> {
  if (!isBranded(map, MAP_COLLECTION_BRAND)) {
    throw new TypeError(`newSetFromMap: map is not a map from this library (${describeValue(map)})`)
  }
  if (!map.isEmpty()) {
    const size = map.size
    throw new IllegalArgumentError(
      `newSetFromMap: map must be empty, but has ${size} mapping${size === 1 ? '' : 's'}`,
    )
  }
  return new SetFromMap(map)
}
