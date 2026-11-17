// Reading the entries a map is built or filled from.

import type { MapEntry } from '../interfaces/map'
import { isBranded, MAP_ENTRY_BRAND } from './brand'
import { describeValue, isIterable } from './checks'

/**
 * Reads `entries` whole and checks every item before anything is stored: each must be an array of
 * length exactly 2 or a map entry.
 *
 * Time: O(m) for `m` items.
 *
 * @param entries - The argument as given.
 * @param where - The API to name in errors.
 * @returns The `[key, value]` pairs, in order.
 * @throws TypeError when `entries` is not iterable or an item is neither a pair nor an entry.
 * @internal
 */
export function readPairs<K, V>(entries: unknown, where: string): Array<[K, V]> {
  if (!isIterable(entries)) {
    throw new TypeError(`${where}: entries is not iterable (${describeValue(entries)})`)
  }
  const pairs: Array<[K, V]> = []
  for (const item of entries as Iterable<unknown>) {
    if (Array.isArray(item) && item.length === 2) {
      pairs.push([item[0] as K, item[1] as V])
    } else if (isBranded(item, MAP_ENTRY_BRAND)) {
      const entry = item as MapEntry<K, V>
      pairs.push([entry.key, entry.value])
    } else {
      throw new TypeError(
        `${where}: item ${pairs.length} is not a [key, value] pair or a map entry (${describeValue(item)})`,
      )
    }
  }
  return pairs
}
