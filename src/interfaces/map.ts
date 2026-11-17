/**
 * The map interfaces: collections of key–value mappings, readable the way native `Map` is.
 *
 * @packageDocumentation
 */

import type { equalsSymbol, HashFunction, hashCodeSymbol } from '../internal/equality'
import type { Collection, ReadonlyCollection } from './collection'
import type { ReadonlySetCollection, SetCollection } from './set'

/**
 * One key–value mapping of a map: a live handle on one key of one map.
 *
 * `key` is the stored key. `value` reads the map's current value while the key is present, and
 * afterwards the value it last returned. Destructuring yields the same two: `const [k, v] = entry`.
 * Two entries are equal when their keys and values are equal under `equals`.
 *
 * @example
 * ```ts
 * for (const entry of map.entrySet()) {
 *   if (entry.value < 0) entry.setValue(0)
 * }
 * ```
 */
export interface MapEntry<K, V> extends Iterable<K | V> {
  /** The key of the mapping. Time: O(1). */
  readonly key: K
  /**
   * The current value of the mapping while its key is present in the map; afterwards, the value
   * this entry last returned or wrote. Time: O(1) average.
   */
  readonly value: V
  /**
   * Writes `value` to the mapping in the map and returns the value it replaced.
   *
   * Time: O(1) average.
   *
   * @param value - The new value.
   * @returns The previous value.
   * @throws IllegalStateError when the key is no longer present in the map.
   */
  setValue(value: V): V
  /**
   * Returns whether `other` is an entry whose key and value are equal to this entry's under
   * `equals`.
   *
   * Time: O(1) plus the protocol methods.
   *
   * @param other - Any value.
   * @returns `true` when `other` is an equal entry.
   */
  equals(other: unknown): boolean
  /** The value-equality protocol; delegates to `equals`. Time: as `equals`. */
  [equalsSymbol](other: unknown): boolean
  /** The value-equality protocol: the same for equal entries. Time: O(1) plus the calls. */
  [hashCodeSymbol](hash: HashFunction): number
  /**
   * Returns the mapping as text, e.g. `'a' => 1`.
   *
   * Time: O(length of the output).
   *
   * @returns The text.
   */
  toString(): string
  /**
   * Returns `[key, value]`, so `JSON.stringify` writes an entry as a pair.
   *
   * Time: O(1).
   *
   * @returns A new two-element array.
   */
  toJSON(): [K, V]
}

/**
 * The read-only view of a map: every question a map answers, with the reading methods of native
 * `Map` (`size`, `get`, `has`, `keys`, `values`, `entries`, `forEach`, iteration over
 * `[key, value]` pairs), so `new Map(map)` copies it.
 *
 * Two maps are equal when they have the same size and each maps every key of the other to an equal
 * value, whatever their insertion order. A map is not a `Collection`; its `keySet()`,
 * `entrySet()` and `valueCollection()` views are.
 *
 * @example
 * ```ts
 * function total(prices: ReadonlyMapCollection<string, number>): number {
 *   let sum = 0
 *   for (const price of prices.values()) sum += price
 *   return sum
 * }
 * ```
 */
export interface ReadonlyMapCollection<K, V> extends Iterable<[K, V]> {
  /** The number of mappings. Time: O(1). */
  readonly size: number
  /**
   * A number that changes on every change to the mappings — adding or removing one, or writing a
   * value — and never on a read. Its exact values are unspecified. Time: O(1).
   */
  readonly revision: number
  /**
   * Returns whether the map has no mappings.
   *
   * Time: O(1).
   *
   * @returns `size === 0`.
   */
  isEmpty(): boolean
  /**
   * Returns the value mapped to a key equal to `key`, or `undefined` when there is none.
   *
   * Time: as the implementation documents.
   *
   * @param key - The key to look up.
   * @returns The value, or `undefined`.
   */
  get(key: K): V | undefined
  /**
   * Returns the value mapped to `key` when the key is present (even when that value is
   * `undefined`), and `fallback` otherwise.
   *
   * Time: as `get`.
   *
   * @param key - The key to look up.
   * @param fallback - The value to return when the key is absent.
   * @returns The mapped value, or `fallback`.
   */
  getOrDefault<D>(key: K, fallback: D): V | D
  /**
   * Returns whether a key equal to `key` is present.
   *
   * Time: as `get`.
   *
   * @param key - The key to look for.
   * @returns `true` when the key is present.
   */
  has(key: K): boolean
  /**
   * Returns whether some value is SameValueZero-equal to `value`.
   *
   * Time: O(n).
   *
   * @param value - The value to look for.
   * @returns `true` when a mapping has that value.
   */
  containsValue(value: V): boolean
  /**
   * Returns a live view of the keys.
   *
   * Time: O(1).
   *
   * @returns A new view.
   */
  keySet(): ReadonlySetCollection<K>
  /**
   * Returns a live view of the mappings as entries.
   *
   * Time: O(1).
   *
   * @returns A new view.
   */
  entrySet(): ReadonlySetCollection<MapEntry<K, V>>
  /**
   * Returns a live view of the values.
   *
   * Time: O(1).
   *
   * @returns A new view.
   */
  valueCollection(): ReadonlyCollection<V>
  /**
   * Returns an iterator over the keys.
   *
   * Time: O(1) to create; O(1) per step.
   *
   * @returns A new iterator.
   */
  keys(): IterableIterator<K>
  /**
   * Returns an iterator over the values.
   *
   * Time: O(1) to create; O(1) per step.
   *
   * @returns A new iterator.
   */
  values(): IterableIterator<V>
  /**
   * Returns an iterator over new `[key, value]` arrays.
   *
   * Time: O(1) to create; O(1) per step.
   *
   * @returns A new iterator.
   */
  entries(): IterableIterator<[K, V]>
  /**
   * Calls `action(value, key, map)` for each mapping, with `this` set to `thisArg`, as native
   * `Map` does.
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
  /**
   * Returns whether `other` is a map with the same size that maps every key of this map to an equal
   * value, and whose keys this map all maps to equal values.
   *
   * Time: O(n) average, plus the lookups and the protocol methods.
   *
   * @param other - Any value.
   * @returns `true` when `other` is an equal map.
   */
  equals(other: unknown): boolean
  /** The value-equality protocol; delegates to `equals`. Time: as `equals`. */
  [equalsSymbol](other: unknown): boolean
  /**
   * The value-equality protocol: an order-independent combination of the mappings' hashes.
   * Time: O(n) plus the calls.
   */
  [hashCodeSymbol](hash: HashFunction): number
  /**
   * Returns the class name, size and mappings, e.g. `HashMap(1) {'a' => 1}`.
   *
   * Time: O(length of the output) for flat contents.
   *
   * @returns The text.
   */
  toString(): string
  /**
   * Returns a new array of `[key, value]` arrays, so `JSON.stringify` writes the map as pairs.
   *
   * Time: O(n).
   *
   * @returns A new array.
   */
  toJSON(): Array<[K, V]>
}

/**
 * A map: the native `Map` methods plus read-modify-write helpers and live views.
 *
 * Callbacks take the value first and the map last, as `forEach` does. In `compute`,
 * `computeIfPresent` and `merge`, a result of `undefined` removes the mapping.
 *
 * @example
 * ```ts
 * function count<K>(counts: MapCollection<K, number>, key: K): void {
 *   counts.merge(key, 1, (old, one) => old + one)
 * }
 * ```
 */
export interface MapCollection<K, V> extends ReadonlyMapCollection<K, V> {
  /**
   * Maps `key` to `value` and returns the map, so calls chain.
   *
   * Time: as the implementation documents.
   *
   * @param key - The key.
   * @param value - The value.
   * @returns The map.
   */
  set(key: K, value: V): this
  /**
   * Maps `key` to `value` and returns the previous value, or `undefined` when the key was absent.
   *
   * Time: as `set`.
   *
   * @param key - The key.
   * @param value - The value.
   * @returns The previous value, or `undefined`.
   */
  put(key: K, value: V): V | undefined
  /**
   * Sets every mapping of `entries` in order, after reading and checking them all.
   *
   * Time: O(m) average for `m` mappings.
   *
   * @param entries - `[key, value]` pairs, map entries, a native `Map` or a map.
   * @throws TypeError when `entries` is not iterable or an item is not a pair or an entry.
   */
  putAll(entries: Iterable<readonly [K, V] | MapEntry<K, V>>): void
  /**
   * Removes the mapping of `key` and returns whether there was one.
   *
   * Time: as `set`.
   *
   * @param key - The key.
   * @returns `true` when a mapping was removed.
   */
  delete(key: K): boolean
  /**
   * Removes the mapping of `key` and returns its value, or `undefined` when there was none.
   *
   * Time: as `set`.
   *
   * @param key - The key.
   * @returns The removed value, or `undefined`.
   */
  remove(key: K): V | undefined
  /**
   * Replaces the value of `key` only when the key is present, and returns the previous value, or
   * `undefined`.
   *
   * Time: as `set`.
   *
   * @param key - The key.
   * @param value - The new value.
   * @returns The previous value, or `undefined`.
   */
  replace(key: K, value: V): V | undefined
  /**
   * Replaces each value with `fn(value, key, map)`, in iteration order.
   *
   * Time: O(n) plus the calls.
   *
   * @param fn - Returns the new value.
   * @throws TypeError when `fn` is not a function.
   * @throws ConcurrentModificationError when `fn` adds or removes mappings.
   */
  replaceAll(fn: (value: V, key: K, map: MapCollection<K, V>) => V): void
  /**
   * Returns the value of `key` when present; otherwise maps `key` to `value` and returns `value`,
   * as native `Map.prototype.getOrInsert` does.
   *
   * Time: as `set`.
   *
   * @param key - The key.
   * @param value - The value to insert when the key is absent.
   * @returns The mapped value.
   */
  getOrInsert(key: K, value: V): V
  /**
   * Returns the value of `key` when present; otherwise calls `fn(key)`, maps `key` to its result
   * and returns it, as native `Map.prototype.getOrInsertComputed` does.
   *
   * Time: as `set`, plus the call.
   *
   * @param key - The key.
   * @param fn - Computes the value to insert.
   * @returns The mapped value.
   * @throws TypeError when `fn` is not a function, even when the key is present.
   */
  getOrInsertComputed(key: K, fn: (key: K) => V): V
  /**
   * Maps `key` to `fn(currentValueOrUndefined, key, map)`, or removes the mapping when the result
   * is `undefined`, and returns the result.
   *
   * Time: as `set`, plus the call.
   *
   * @param key - The key.
   * @param fn - Computes the new value.
   * @returns The result of `fn`.
   * @throws TypeError when `fn` is not a function.
   * @throws ConcurrentModificationError when `fn` adds or removes mappings.
   */
  compute(
    key: K,
    fn: (value: V | undefined, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined
  /**
   * When `key` is present, maps it to `fn(value, key, map)`, or removes the mapping when the
   * result is `undefined`, and returns the result; otherwise returns `undefined` without calling
   * `fn`.
   *
   * Time: as `set`, plus the call.
   *
   * @param key - The key.
   * @param fn - Computes the new value.
   * @returns The result of `fn`, or `undefined`.
   * @throws TypeError when `fn` is not a function.
   * @throws ConcurrentModificationError when `fn` adds or removes mappings.
   */
  computeIfPresent(
    key: K,
    fn: (value: V, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined
  /**
   * Maps `key` to `value` when it is absent; otherwise to `fn(old, value, key, map)`, removing
   * the mapping when that result is `undefined`. Returns the stored value, or `undefined`.
   *
   * Time: as `set`, plus the call.
   *
   * @param key - The key.
   * @param value - The value to store, or to combine with the present one.
   * @param fn - Combines the present value with `value`.
   * @returns The stored value, or `undefined` when the mapping was removed.
   * @throws TypeError when `fn` is not a function.
   * @throws ConcurrentModificationError when `fn` adds or removes mappings.
   */
  merge(
    key: K,
    value: V,
    fn: (old: V, value: V, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined
  /** Removes every mapping. Time: as the implementation documents. */
  clear(): void
  /**
   * Returns a live view of the keys; removing a key removes its mapping.
   *
   * Time: O(1).
   *
   * @returns A new view.
   */
  keySet(): SetCollection<K>
  /**
   * Returns a live view of the mappings as entries; removing an entry removes its mapping.
   *
   * Time: O(1).
   *
   * @returns A new view.
   */
  entrySet(): SetCollection<MapEntry<K, V>>
  /**
   * Returns a live view of the values; removing a value removes a mapping with that value.
   *
   * Time: O(1).
   *
   * @returns A new view.
   */
  valueCollection(): Collection<V>
  /**
   * Calls `action(value, key, map)` for each mapping, with `this` set to `thisArg`, as native
   * `Map` does.
   *
   * Time: O(n) plus the calls.
   *
   * @param action - Called with each value, its key and the map.
   * @param thisArg - The `this` value for `action`.
   * @throws TypeError when `action` is not a function.
   */
  forEach(action: (value: V, key: K, map: MapCollection<K, V>) => void, thisArg?: unknown): void
}
