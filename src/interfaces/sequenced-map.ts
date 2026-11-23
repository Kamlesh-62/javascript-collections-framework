/**
 * The sequenced-map interfaces: maps with a defined order and a first and last mapping.
 *
 * @packageDocumentation
 */

import type { ReadonlySequencedCollection, SequencedCollection } from './list'
import type { MapCollection, MapEntry, ReadonlyMapCollection } from './map'
import type { ReadonlySequencedSet, SequencedSet } from './sequenced-set'

/**
 * The read-only view of a map with a defined order and a first and last mapping, readable from
 * either end. Entries returned by `firstEntry` and `lastEntry` are live: they read the map's
 * current value of their key.
 *
 * @example
 * ```ts
 * function oldest<K, V>(history: ReadonlySequencedMap<K, V>): K | undefined {
 *   return history.firstEntry()?.key
 * }
 * ```
 */
export interface ReadonlySequencedMap<K, V> extends ReadonlyMapCollection<K, V> {
  /**
   * Returns the entry of the first mapping, or `undefined` when the map is empty. Reading the ends
   * never changes the order.
   *
   * Time: as the implementation documents (O(1) amortised for a `LinkedHashMap`).
   *
   * @returns A live entry, or `undefined`.
   */
  firstEntry(): MapEntry<K, V> | undefined
  /**
   * Returns the entry of the last mapping, or `undefined` when the map is empty. Reading the ends
   * never changes the order.
   *
   * Time: as the implementation documents (O(1) amortised for a `LinkedHashMap`).
   *
   * @returns A live entry, or `undefined`.
   */
  lastEntry(): MapEntry<K, V> | undefined
  /**
   * Returns a live view of this map in the opposite order: changes to either show in the other.
   *
   * Time: O(1).
   *
   * @returns The reversed view.
   */
  reversed(): ReadonlySequencedMap<K, V>
  /**
   * Returns a live view of the keys, in this map's order.
   *
   * Time: O(1).
   *
   * @returns A new view.
   */
  keySet(): ReadonlySequencedSet<K>
  /**
   * Returns a live view of the mappings as entries, in this map's order.
   *
   * Time: O(1).
   *
   * @returns A new view.
   */
  entrySet(): ReadonlySequencedSet<MapEntry<K, V>>
  /**
   * Returns a live view of the values, in this map's order.
   *
   * Time: O(1).
   *
   * @returns A new view.
   */
  valueCollection(): ReadonlySequencedCollection<V>
  /**
   * Calls `action(value, key, map)` for each mapping in order, with `this` set to `thisArg`.
   *
   * Time: O(n) plus the calls.
   *
   * @param action - Called with each value, its key and the map.
   * @param thisArg - The `this` value for `action`.
   * @throws TypeError when `action` is not a function.
   */
  forEach(
    action: (value: V, key: K, map: ReadonlyMapCollection<K, V>) => void,
    thisArg?: unknown,
  ): void
}

/**
 * A map with a defined order that can be changed at both ends. `putFirst` and `putLast` insert an
 * absent key at that end or move the present mapping of an equal key there (keeping the stored
 * key), or throw `UnsupportedOperationError` where the map orders its keys itself. Whether
 * iteration is live or fail-fast is stated by each implementation.
 *
 * @example
 * ```ts
 * function touch<K, V>(recent: SequencedMap<K, V>, key: K, value: V, limit: number): void {
 *   recent.putLast(key, value)
 *   while (recent.size > limit) recent.pollFirstEntry()
 * }
 * ```
 */
export interface SequencedMap<K, V> extends MapCollection<K, V>, ReadonlySequencedMap<K, V> {
  /**
   * Removes the first mapping and returns its entry, or returns `undefined` when the map is
   * empty. The entry still reads its value; `setValue` on it throws until the key is set again.
   *
   * Time: as the implementation documents.
   *
   * @returns The entry of the removed mapping, or `undefined`.
   */
  pollFirstEntry(): MapEntry<K, V> | undefined
  /**
   * Removes the last mapping and returns its entry, or returns `undefined` when the map is empty.
   * The entry still reads its value; `setValue` on it throws until the key is set again.
   *
   * Time: as the implementation documents.
   *
   * @returns The entry of the removed mapping, or `undefined`.
   */
  pollLastEntry(): MapEntry<K, V> | undefined
  /**
   * Maps `key` to `value` at the front: inserts the mapping there when the key is absent, or moves
   * the present mapping there (keeping its stored key) and writes its value. Returns the map.
   *
   * Time: as the implementation documents.
   *
   * @param key - The key.
   * @param value - The value.
   * @returns The map.
   * @throws UnsupportedOperationError where the map orders its keys itself.
   */
  putFirst(key: K, value: V): this
  /**
   * Maps `key` to `value` at the end: inserts the mapping there when the key is absent, or moves
   * the present mapping there (keeping its stored key) and writes its value. Returns the map.
   *
   * Time: as the implementation documents.
   *
   * @param key - The key.
   * @param value - The value.
   * @returns The map.
   * @throws UnsupportedOperationError where the map orders its keys itself.
   */
  putLast(key: K, value: V): this
  /**
   * Returns a live view of this map in the opposite order; changes through the view reach this
   * map at the mirrored end.
   *
   * Time: O(1).
   *
   * @returns The reversed view.
   */
  reversed(): SequencedMap<K, V>
  /**
   * Returns a live view of the keys, in this map's order; removing a key removes its mapping, and
   * adding throws `UnsupportedOperationError`.
   *
   * Time: O(1).
   *
   * @returns A new view.
   */
  keySet(): SequencedSet<K>
  /**
   * Returns a live view of the mappings as entries, in this map's order; removing an entry
   * removes its mapping, and adding throws `UnsupportedOperationError`.
   *
   * Time: O(1).
   *
   * @returns A new view.
   */
  entrySet(): SequencedSet<MapEntry<K, V>>
  /**
   * Returns a live view of the values, in this map's order; removing a value removes a mapping
   * with that value, and adding throws `UnsupportedOperationError`.
   *
   * Time: O(1).
   *
   * @returns A new view.
   */
  valueCollection(): SequencedCollection<V>
  /**
   * Calls `action(value, key, map)` for each mapping in order, with `this` set to `thisArg`.
   *
   * Time: O(n) plus the calls.
   *
   * @param action - Called with each value, its key and the map.
   * @param thisArg - The `this` value for `action`.
   * @throws TypeError when `action` is not a function.
   */
  forEach(action: (value: V, key: K, map: MapCollection<K, V>) => void, thisArg?: unknown): void
}
