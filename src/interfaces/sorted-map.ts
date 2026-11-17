/**
 * The sorted-map interfaces: maps kept in the order of their keys, with the ends, nearest-entry
 * queries and live range views.
 *
 * @packageDocumentation
 */

import type { Comparator } from '../functions/comparators'
import type { SequencedCollection } from './list'
import type { MapCollection, MapEntry } from './map'
import type { ReadonlySequencedMap, SequencedMap } from './sequenced-map'
import type { SequencedSet } from './sequenced-set'
import type { BoundOptions, ReadonlySortedSet, SortedSet, SubSetOptions } from './sorted-set'

/**
 * The read-only view of a sorted map: a map whose mappings are kept in the order of its keys under
 * a comparator, with the first and last entries, the entries nearest a key and live range views.
 * Two keys are the same key when the comparator returns `0` for them.
 *
 * "Before" and "after" follow the map's own order, which is descending on a reversed view.
 * Questions about keys alone go through `keySet()`, a sorted set: `map.keySet().floor(k)`. A sorted
 * map is a sequenced map whose order is decided by its keys.
 *
 * @example
 * ```ts
 * function priceAt(levels: ReadonlySortedMap<number, string>, at: number): string | undefined {
 *   return levels.floorEntry(at)?.value
 * }
 * ```
 */
export interface ReadonlySortedMap<K, V> extends ReadonlySequencedMap<K, V> {
  /**
   * The number of mappings. Time: O(1) on a map; O(k + log n) on a range view holding k of the
   * map's n mappings, which counts the mappings in range.
   */
  readonly size: number
  /**
   * Returns whether there are no mappings.
   *
   * Time: O(1) on a map; O(log n) on a range view, which looks for one mapping in range.
   *
   * @returns `size === 0`.
   */
  isEmpty(): boolean
  /**
   * Returns an iterator over new `[key, value]` arrays in key order.
   *
   * Time: O(log n) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
   * @throws ConcurrentModificationError (from `next()`) when mappings are added or removed after
   *   the iterator is created.
   */
  [Symbol.iterator](): IterableIterator<[K, V]>
  /**
   * Returns an iterator over the keys in order.
   *
   * Time: O(log n) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
   */
  keys(): IterableIterator<K>
  /**
   * Returns an iterator over the values in key order.
   *
   * Time: O(log n) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
   */
  values(): IterableIterator<V>
  /**
   * Returns an iterator over new `[key, value]` arrays in key order.
   *
   * Time: O(log n) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
   */
  entries(): IterableIterator<[K, V]>
  /**
   * Returns the comparator that orders the keys, or `undefined` for natural order; a reversed view
   * returns a function that orders in reverse.
   *
   * Time: O(1).
   *
   * @returns The comparator, or `undefined`.
   */
  comparator(): Comparator<K> | undefined
  /**
   * Returns the entry of the first key, or `undefined` when there is none.
   *
   * Time: O(log n).
   *
   * @returns A live entry, or `undefined`.
   */
  firstEntry(): MapEntry<K, V> | undefined
  /**
   * Returns the entry of the last key, or `undefined` when there is none.
   *
   * Time: O(log n).
   *
   * @returns A live entry, or `undefined`.
   */
  lastEntry(): MapEntry<K, V> | undefined
  /**
   * Returns the entry of the greatest key before `key`, or `undefined` when there is none.
   *
   * Time: O(log n).
   *
   * @param key - The key to search from; it need not be present.
   * @returns A live entry, or `undefined`.
   */
  lowerEntry(key: K): MapEntry<K, V> | undefined
  /**
   * Returns the entry of the greatest key equal to or before `key`, or `undefined` when there is
   * none.
   *
   * Time: O(log n).
   *
   * @param key - The key to search from; it need not be present.
   * @returns A live entry, or `undefined`.
   */
  floorEntry(key: K): MapEntry<K, V> | undefined
  /**
   * Returns the entry of the least key equal to or after `key`, or `undefined` when there is none.
   *
   * Time: O(log n).
   *
   * @param key - The key to search from; it need not be present.
   * @returns A live entry, or `undefined`.
   */
  ceilingEntry(key: K): MapEntry<K, V> | undefined
  /**
   * Returns the entry of the least key after `key`, or `undefined` when there is none.
   *
   * Time: O(log n).
   *
   * @param key - The key to search from; it need not be present.
   * @returns A live entry, or `undefined`.
   */
  higherEntry(key: K): MapEntry<K, V> | undefined
  /**
   * Returns a live view of the mappings whose keys run from `from` (inclusive by default) to `to`
   * (exclusive by default).
   *
   * Time: O(log n).
   *
   * @param from - The low end, in this map's order.
   * @param to - The high end, in this map's order.
   * @param options - The inclusive flags.
   * @returns The view.
   */
  subMap(from: K, to: K, options?: SubSetOptions | null): ReadonlySortedMap<K, V>
  /**
   * Returns a live view of the mappings whose keys are before `to` (exclusive by default).
   *
   * Time: O(log n).
   *
   * @param to - The high end, in this map's order.
   * @param options - The inclusive flag.
   * @returns The view.
   */
  headMap(to: K, options?: BoundOptions | null): ReadonlySortedMap<K, V>
  /**
   * Returns a live view of the mappings whose keys are `from` (inclusive by default) or after it.
   *
   * Time: O(log n).
   *
   * @param from - The low end, in this map's order.
   * @param options - The inclusive flag.
   * @returns The view.
   */
  tailMap(from: K, options?: BoundOptions | null): ReadonlySortedMap<K, V>
  /**
   * Returns a live view of this map in the opposite key order.
   *
   * Time: O(1).
   *
   * @returns The reversed view.
   */
  reversed(): ReadonlySortedMap<K, V>
  /**
   * Returns a live view of the keys as a sorted set, in this map's order.
   *
   * Time: O(1).
   *
   * @returns A new view.
   */
  keySet(): ReadonlySortedSet<K>
}

/**
 * A map kept in the order of its keys under a comparator, with the ends, nearest-entry queries,
 * removal of the first and last mappings, and live range views. Two keys are the same key when
 * the comparator returns `0` for them. Setting a key outside a range view's range through the view
 * throws `IllegalArgumentError`. As a sequenced map it has ends and a reversed view, but `putFirst`
 * and `putLast` throw `UnsupportedOperationError`: each mapping's place is decided by its key.
 *
 * @example
 * ```ts
 * function takeBefore<K, V>(map: SortedMap<K, V>, limit: K): Array<[K, V]> {
 *   const head = map.headMap(limit)
 *   const taken = head.toJSON()
 *   head.clear()
 *   return taken
 * }
 * ```
 */
export interface SortedMap<K, V> extends SequencedMap<K, V>, ReadonlySortedMap<K, V> {
  /**
   * Returns an iterator over new `[key, value]` arrays in key order.
   *
   * Time: O(log n) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
   * @throws ConcurrentModificationError (from `next()`) when mappings are added or removed after
   *   the iterator is created.
   */
  [Symbol.iterator](): IterableIterator<[K, V]>
  /**
   * Removes the first mapping and returns its entry, or returns `undefined` when the map is
   * empty. The entry still reads its value; `setValue` on it throws until the key is set again.
   *
   * Time: O(log n).
   *
   * @returns The entry of the removed mapping, or `undefined`.
   */
  pollFirstEntry(): MapEntry<K, V> | undefined
  /**
   * Removes the last mapping and returns its entry, or returns `undefined` when the map is empty.
   *
   * Time: O(log n).
   *
   * @returns The entry of the removed mapping, or `undefined`.
   */
  pollLastEntry(): MapEntry<K, V> | undefined
  /**
   * Always throws: a sorted map places each mapping by its key. Use `set`. Nothing is checked or
   * changed.
   *
   * Time: O(1).
   *
   * @param key - Ignored.
   * @param value - Ignored.
   * @returns Never returns.
   * @throws UnsupportedOperationError always.
   */
  putFirst(key: K, value: V): this
  /**
   * Always throws: a sorted map places each mapping by its key. Use `set`. Nothing is checked or
   * changed.
   *
   * Time: O(1).
   *
   * @param key - Ignored.
   * @param value - Ignored.
   * @returns Never returns.
   * @throws UnsupportedOperationError always.
   */
  putLast(key: K, value: V): this
  /**
   * Returns a live view of the mappings whose keys run from `from` (inclusive by default) to `to`
   * (exclusive by default); changes through the view reach this map.
   *
   * Time: O(log n).
   *
   * @param from - The low end, in this map's order.
   * @param to - The high end, in this map's order.
   * @param options - The inclusive flags.
   * @returns The view.
   */
  subMap(from: K, to: K, options?: SubSetOptions | null): SortedMap<K, V>
  /**
   * Returns a live view of the mappings whose keys are before `to` (exclusive by default); changes
   * through the view reach this map.
   *
   * Time: O(log n).
   *
   * @param to - The high end, in this map's order.
   * @param options - The inclusive flag.
   * @returns The view.
   */
  headMap(to: K, options?: BoundOptions | null): SortedMap<K, V>
  /**
   * Returns a live view of the mappings whose keys are `from` (inclusive by default) or after it;
   * changes through the view reach this map.
   *
   * Time: O(log n).
   *
   * @param from - The low end, in this map's order.
   * @param options - The inclusive flag.
   * @returns The view.
   */
  tailMap(from: K, options?: BoundOptions | null): SortedMap<K, V>
  /**
   * Returns a live view of this map in the opposite key order; changes through the view reach
   * this map.
   *
   * Time: O(1).
   *
   * @returns The reversed view.
   */
  reversed(): SortedMap<K, V>
  /**
   * Returns a live view of the keys as a sorted set, in this map's order; removing a key removes
   * its mapping, and adding throws `UnsupportedOperationError`.
   *
   * Time: O(1).
   *
   * @returns A new view.
   */
  keySet(): SortedSet<K>
  /**
   * Returns a live view of the mappings as entries, in key order, with the ends of this map;
   * removing an entry removes its mapping, and adding throws `UnsupportedOperationError`.
   *
   * Time: O(1).
   *
   * @returns A new view.
   */
  entrySet(): SequencedSet<MapEntry<K, V>>
  /**
   * Returns a live view of the values, in key order, with the ends of this map; removing a value
   * removes a mapping with that value, and adding throws `UnsupportedOperationError`.
   *
   * Time: O(1).
   *
   * @returns A new view.
   */
  valueCollection(): SequencedCollection<V>
  /**
   * Calls `action(value, key, map)` for each mapping in key order, with `this` set to `thisArg`.
   *
   * Time: O(n) plus the calls.
   *
   * @param action - Called with each value, its key and the map.
   * @param thisArg - The `this` value for `action`.
   * @throws TypeError when `action` is not a function.
   * @throws ConcurrentModificationError when `action` adds or removes mappings.
   */
  forEach(action: (value: V, key: K, map: MapCollection<K, V>) => void, thisArg?: unknown): void
}
