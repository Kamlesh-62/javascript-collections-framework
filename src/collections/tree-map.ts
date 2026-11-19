/**
 * `TreeMap`: a map kept in the order of its keys, with nearest-entry queries and live range views.
 *
 * @packageDocumentation
 */

import type { Comparator } from '../functions/comparators'
import type { SequencedCollection } from '../interfaces/list'
import type { MapCollection, MapEntry } from '../interfaces/map'
import type { SequencedSet } from '../interfaces/sequenced-set'
import type { SortedMap } from '../interfaces/sorted-map'
import type { BoundOptions, SortedSet, SubSetOptions } from '../interfaces/sorted-set'
import {
  brandedHasInstance,
  MAP_COLLECTION_BRAND,
  SEQUENCED_MAP_BRAND,
  SORTED_MAP_BRAND,
} from '../internal/brand'
import { isIterable } from '../internal/checks'
import { notIterable, readComparator, requireOptions } from '../internal/comparator-options'
import { TreeMapEngine } from '../internal/engines/tree-map-engine'
import { equalsSymbol, type HashFunction, hashCodeSymbol } from '../internal/equality'
import { readPairs } from '../internal/map-input'
import { INSPECT } from '../internal/output'

const TREE_MAP_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/TreeMap',
)

/**
 * Options for a `TreeMap`.
 *
 * @example
 * ```ts
 * const byLength: TreeMapOptions<string> = { comparator: (a, b) => a.length - b.length }
 * const words = new TreeMap<string, number>(byLength)
 * ```
 */
export interface TreeMapOptions<K> {
  /**
   * The order of the keys; two keys are the same key when it returns `0` for them. Natural order
   * (numbers, strings, bigints, booleans, dates or `[compareSymbol]` objects) when omitted.
   */
  comparator?: Comparator<K> | undefined
}

/**
 * A map kept in the order of its keys, stored as a balanced binary search tree: `get`, `set`,
 * `has`, `delete` and the nearest-entry queries `lowerEntry`, `floorEntry`, `ceilingEntry` and
 * `higherEntry` cost O(log n). The order is the natural order of the keys, or the `comparator`
 * option.
 *
 * Key sameness is decided by the order alone: two keys are the same key when the comparator
 * returns `0` for them, whatever their identity, and setting such a key keeps the stored key object
 * and replaces only the value. Iteration, `keys`, `values`, `entries`, `forEach`, `toJSON` and
 * `toString` visit the mappings in ascending key order. `subMap`, `headMap` and `tailMap` return
 * live views of a key range, and `reversed()` a live view in descending order; changes through any
 * view reach the map. Questions about keys alone go through `keySet()`, a live sorted set.
 *
 * In natural order, `null` and `undefined` cannot be keys, and lookups (`get`, `has`, `delete`, …)
 * answer "absent" for them and for keys of another kind, as a native `Map` does; `-0` is stored as
 * `0`. Values may be anything, `undefined` included. A comparator that throws or returns `NaN`
 * leaves the map as it was (`putAll` keeps the mappings it set before the failure). A comparator that is not a consistent total order may make lookups
 * give wrong answers, but never loses mappings or loops. Adding or removing mappings while
 * iterating throws `ConcurrentModificationError`; writing a value does not.
 *
 * Two maps are equal when they have the same size and each maps every key of the other to an
 * equal value, so a `TreeMap` equals a `HashMap` with the same mappings. The class is not designed
 * to be subclassed.
 *
 * @example
 * ```ts
 * const prices = new TreeMap([[100, 'low'], [500, 'mid'], [900, 'high']])
 * prices.floorEntry(640)?.value // 'mid': the level at or below 640
 * prices.headMap(500).toJSON()  // [[100, 'low']]
 *
 * const byLength = new TreeMap<string, number>({ comparator: (a, b) => a.length - b.length })
 * byLength.set('bb', 1).set('cc', 2) // 'cc' is the same key as 'bb'
 * byLength.toString()                // "TreeMap(1) {'bb' => 2}"
 * ```
 *
 * @sealed
 */
export class TreeMap<K, V> implements SortedMap<K, V> {
  private readonly engine: TreeMapEngine<K, V>

  /**
   * Creates a map in natural key order holding each mapping of `entries`; empty when `entries` is
   * omitted, `undefined` or `null`. Every item is checked before anything is stored; of several
   * equal keys the first key object is kept with the last value.
   *
   * Time: O(m) with at most m − 1 comparisons (one when m is 1 in natural order) for `m` items
   * whose keys are strictly ascending; O(m log m) otherwise.
   *
   * @param entries - `[key, value]` arrays, map entries, a native `Map` or another map. The
   *   comparator of a `TreeMap` given here is not used; pass it as an option, or call `copy()`.
   * @throws TypeError when `entries` is neither iterable nor `null`/`undefined`, or an item is not
   *   an array of length 2 or a map entry.
   * @throws NullElementError when, in natural order, a key is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, the keys cannot be compared.
   *
   * @example
   * ```ts
   * new TreeMap([[3, 'c'], [1, 'a']]) // TreeMap(2) {1 => 'a', 3 => 'c'}
   * ```
   */
  constructor(entries?: Iterable<readonly [K, V] | MapEntry<K, V>> | null)
  /**
   * Creates an empty map with the given options.
   *
   * Time: O(1).
   *
   * @param options - The options; `comparator` is read once.
   * @throws TypeError when `comparator` is neither `undefined` nor a function.
   *
   * @example
   * ```ts
   * new TreeMap<string, number>({ comparator: (a, b) => b.localeCompare(a) })
   * ```
   */
  constructor(options: TreeMapOptions<K>)
  /**
   * Creates a map holding each mapping of `entries` (empty when `undefined` or `null`), with keys
   * ordered by `options.comparator`, or by natural order when it is omitted.
   *
   * Time: O(m) with at most m − 1 comparisons (one when m is 1 in natural order) for `m` items
   * whose keys are strictly ascending; O(m log m) otherwise.
   *
   * @param entries - `[key, value]` arrays, map entries, a native `Map` or another map.
   * @param options - The options; `comparator` is read once.
   * @throws TypeError when `entries` is neither iterable nor `null`/`undefined`, an item is not a
   *   pair or an entry, `options` is not an object, or `comparator` is neither `undefined` nor a
   *   function, or returns a non-number or `NaN`.
   * @throws NullElementError when, in natural order, a key is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, the keys cannot be compared.
   *
   * @example
   * ```ts
   * new TreeMap([[1, 'a'], [2, 'b']], { comparator: (a, b) => b - a }) // TreeMap(2) {2 => 'b', 1 => 'a'}
   * ```
   */
  constructor(
    entries: Iterable<readonly [K, V] | MapEntry<K, V>> | null | undefined,
    options?: TreeMapOptions<K>,
  )
  constructor(
    entriesOrOptions?: Iterable<readonly [K, V] | MapEntry<K, V>> | TreeMapOptions<K> | null,
    options?: TreeMapOptions<K>,
  ) {
    let entries: unknown
    let settings: object | undefined
    const first: unknown = entriesOrOptions
    if (options === undefined) {
      if (first === undefined || first === null) {
        // An empty map in natural order.
      } else if (isIterable(first)) {
        entries = first
      } else if (typeof first === 'object') {
        settings = first
      } else {
        throw notIterable('TreeMap', first, 'entries')
      }
    } else {
      if (first !== undefined && first !== null) {
        if (!isIterable(first)) throw notIterable('TreeMap', first, 'entries')
        entries = first
      }
      requireOptions(options, 'TreeMap')
      settings = options
    }
    this.engine = new TreeMapEngine<K, V>(this, readComparator<K>(settings, 'TreeMap'))
    if (entries !== undefined) this.engine.build(readPairs<K, V>(entries, 'TreeMap'), 'TreeMap')
  }

  /**
   * Returns a new map of the mappings of `entries`, with keys ordered by `options.comparator`, or
   * by natural order when it is omitted. Every item is checked before anything is stored. The
   * comparator of a `TreeMap` given as `entries` is not used.
   *
   * Time: O(m) with at most m − 1 comparisons (one when m is 1 in natural order) for `m` items
   * whose keys are strictly ascending; O(m log m) otherwise.
   *
   * @param entries - `[key, value]` arrays, map entries, a native `Map` or another map; of several
   *   equal keys the first key object is kept with the last value.
   * @param options - The options; `comparator` is read once.
   * @returns A new map.
   * @throws TypeError when `entries` is not iterable (`null` and `undefined` included), an item is
   *   not a pair or an entry, `options` is given and is not an object, or `comparator` is neither
   *   `undefined` nor a function, or returns a non-number or `NaN`.
   * @throws NullElementError when, in natural order, a key is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, the keys cannot be compared.
   *
   * @example
   * ```ts
   * TreeMap.from(Object.entries({ b: 2, a: 1 })).firstEntry()?.key // 'a'
   * ```
   */
  static from<K, V>(
    entries: Iterable<readonly [K, V] | MapEntry<K, V>>,
    options?: TreeMapOptions<K>,
  ): TreeMap<K, V> {
    if (options !== undefined) requireOptions(options, 'TreeMap.from')
    const comparator = readComparator<K>(options, 'TreeMap.from')
    if (!isIterable(entries)) throw notIterable('TreeMap.from', entries, 'entries')
    const pairs = readPairs<K, V>(entries, 'TreeMap.from')
    const map = new TreeMap<K, V>(null, { comparator })
    map.engine.build(pairs, 'TreeMap.from')
    return map
  }

  /**
   * Returns whether `value` is a `TreeMap`, including one created by another copy of the library
   * with the same major version. Its range and reversed views are not.
   *
   * Time: O(1).
   *
   * @param value - The value on the left of `instanceof`.
   * @returns `true` when `value` is a `TreeMap`.
   *
   * @example
   * ```ts
   * new TreeMap() instanceof TreeMap // true
   * ```
   */
  static [Symbol.hasInstance](value: unknown): boolean {
    // biome-ignore lint/complexity/noThisInStatic: `this` is the class on the right of `instanceof`
    return brandedHasInstance(this, TreeMap, TREE_MAP_BRAND, value)
  }

  /**
   * Marks instances of this class so `instanceof` recognises them across copies of the package.
   * Its key is not exported, so the getter is not called directly. Time: O(1).
   */
  get [TREE_MAP_BRAND](): true {
    return true
  }

  /**
   * Marks sorted maps so `isSortedMap` recognises them across copies of the package. Its key is
   * not exported, so the getter is not called directly. Time: O(1).
   */
  get [SORTED_MAP_BRAND](): true {
    return true
  }

  /**
   * Marks maps so `isMapCollection` recognises them across copies of the package. Its key is not
   * exported, so the getter is not called directly. Time: O(1).
   */
  get [MAP_COLLECTION_BRAND](): true {
    return true
  }

  /**
   * Marks sequenced maps across copies of the package. Its key is not exported, so the getter is
   * not called directly. Time: O(1).
   */
  get [SEQUENCED_MAP_BRAND](): true {
    return true
  }

  /** The number of mappings. Time: O(1). */
  get size(): number {
    return this.engine.size
  }

  /**
   * A number that changes when a mapping is added or removed or a value is written (even the same
   * value), and never on a read or on a call that changes nothing. Its exact values are
   * unspecified; views share it. Time: O(1).
   */
  get revision(): number {
    return this.engine.revision
  }

  /** `'TreeMap'`, for `Object.prototype.toString`. Time: O(1). */
  get [Symbol.toStringTag](): string {
    return 'TreeMap'
  }

  /**
   * Returns the comparator given at construction, or `undefined` when the map uses natural order.
   *
   * Time: O(1).
   *
   * @returns The comparator, or `undefined`.
   *
   * @example
   * ```ts
   * const byLength = (a: string, b: string) => a.length - b.length
   * new TreeMap({ comparator: byLength }).comparator() === byLength // true
   * new TreeMap().comparator() // undefined
   * ```
   */
  comparator(): Comparator<K> | undefined {
    return this.engine.comparator()
  }

  /**
   * Returns whether the map has no mappings.
   *
   * Time: O(1).
   *
   * @returns `size === 0`.
   *
   * @example
   * ```ts
   * new TreeMap().isEmpty() // true
   * ```
   */
  isEmpty(): boolean {
    return this.engine.isEmpty()
  }

  /**
   * Returns the value mapped to the key that compares equal to `key`, or `undefined` when there is
   * none. In natural order, `null`, `undefined` and keys that cannot be compared with the stored
   * keys give `undefined`. Use `has` or `getOrDefault` to tell a stored `undefined` from absence.
   *
   * Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.
   *
   * @param key - The key to look up.
   * @returns The value, or `undefined`.
   * @throws TypeError when the comparator or a `[compareSymbol]` method returns a non-number or
   *   `NaN`.
   * @throws ConcurrentModificationError when the comparator adds or removes mappings.
   *
   * @example
   * ```ts
   * new TreeMap([[1, 'a']]).get(1)   // 'a'
   * new TreeMap([[1, 'a']]).get('1') // undefined
   * ```
   */
  get(key: K): V | undefined {
    return this.engine.get(key)
  }

  /**
   * Returns the value mapped to `key` when the key is present (even when that value is
   * `undefined`), and `fallback` otherwise.
   *
   * Time: as `get`.
   *
   * @param key - The key to look up.
   * @param fallback - The value to return when the key is absent.
   * @returns The mapped value, or `fallback`.
   * @throws TypeError when the comparator returns an invalid result.
   * @throws ConcurrentModificationError when the comparator adds or removes mappings.
   *
   * @example
   * ```ts
   * new TreeMap([[1, 'a']]).getOrDefault(2, '-') // '-'
   * ```
   */
  getOrDefault<D>(key: K, fallback: D): V | D {
    return this.engine.getOrDefault(key, fallback)
  }

  /**
   * Returns whether a key that compares equal to `key` is present. In natural order, `null`,
   * `undefined` and keys that cannot be compared give `false`.
   *
   * Time: as `get`.
   *
   * @param key - The key to look for.
   * @returns `true` when the key is present.
   * @throws TypeError when the comparator returns an invalid result.
   * @throws ConcurrentModificationError when the comparator adds or removes mappings.
   *
   * @example
   * ```ts
   * new TreeMap([[1, 'a']]).has(1) // true
   * ```
   */
  has(key: K): boolean {
    return this.engine.has(key)
  }

  /**
   * Returns whether some value is SameValueZero-equal to `value`.
   *
   * Time: O(n).
   *
   * @param value - The value to look for.
   * @returns `true` when a mapping has that value.
   *
   * @example
   * ```ts
   * new TreeMap([[1, 'a']]).containsValue('a') // true
   * ```
   */
  containsValue(value: V): boolean {
    return this.engine.containsValue(value)
  }

  /**
   * Maps `key` to `value` and returns the map, so calls chain. When a key that compares equal is
   * present, its stored key object is kept and only the value is replaced. On an error nothing is
   * stored.
   *
   * Time: O(log n), with at most 2⌈log2(n + 1)⌉ + 2 comparisons.
   *
   * @param key - The key (in natural order, `-0` is stored as `0`).
   * @param value - The value.
   * @returns The map.
   * @throws NullElementError when, in natural order, `key` is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, `key` cannot be compared with the stored keys.
   * @throws TypeError when the comparator returns a non-number or `NaN`.
   * @throws ConcurrentModificationError when the comparator adds or removes mappings; the map
   *   keeps those changes and stores nothing itself.
   *
   * @example
   * ```ts
   * new TreeMap<number, string>().set(2, 'b').set(1, 'a') // TreeMap(2) {1 => 'a', 2 => 'b'}
   * ```
   */
  set(key: K, value: V): this {
    this.engine.store(key, value, 'TreeMap.set')
    return this
  }

  /**
   * Maps `key` to `value`, as `set` does, and returns the previous value, or `undefined` when the
   * key was absent.
   *
   * Time: as `set`.
   *
   * @param key - The key.
   * @param value - The value.
   * @returns The previous value, or `undefined`.
   * @throws NullElementError when, in natural order, `key` is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, `key` cannot be compared with the stored keys.
   * @throws TypeError when the comparator returns an invalid result.
   * @throws ConcurrentModificationError when the comparator adds or removes mappings.
   *
   * @example
   * ```ts
   * new TreeMap([[1, 'a']]).put(1, 'b') // 'a'
   * ```
   */
  put(key: K, value: V): V | undefined {
    return this.engine.put(key, value)
  }

  /**
   * Sets every mapping of `entries` in order, later ones replacing earlier ones for equal keys. The
   * whole argument is read and checked first — each item's shape and, in natural order, that every
   * key can be compared — so `map.putAll(map)` is safe and bad input stores nothing; mappings set
   * before a comparator error stay.
   *
   * Time: O(m log(n + m)) for `m` items.
   *
   * @param entries - `[key, value]` arrays, map entries, a native `Map` or a map.
   * @throws TypeError when `entries` is not iterable, an item is not an array of length 2 or a map
   *   entry, or the comparator returns an invalid result.
   * @throws NullElementError when, in natural order, a key is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, a key cannot be compared.
   * @throws ConcurrentModificationError when the comparator adds or removes mappings.
   *
   * @example
   * ```ts
   * map.putAll(new Map([[1, 'a'], [2, 'b']]))
   * ```
   */
  putAll(entries: Iterable<readonly [K, V] | MapEntry<K, V>>): void {
    this.engine.putAll(entries)
  }

  /**
   * Removes the mapping of `key` and returns whether there was one. In natural order, `null`,
   * `undefined` and keys that cannot be compared remove nothing.
   *
   * Time: as `get`.
   *
   * @param key - The key.
   * @returns `true` when a mapping was removed.
   * @throws TypeError when the comparator returns an invalid result.
   * @throws ConcurrentModificationError when the comparator adds or removes mappings.
   *
   * @example
   * ```ts
   * new TreeMap([[1, 'a']]).delete(1) // true
   * ```
   */
  delete(key: K): boolean {
    return this.engine.delete(key)
  }

  /**
   * Removes the mapping of `key` and returns its value, or `undefined` when there was none.
   *
   * Time: as `get`.
   *
   * @param key - The key.
   * @returns The removed value, or `undefined`.
   * @throws TypeError when the comparator returns an invalid result.
   * @throws ConcurrentModificationError when the comparator adds or removes mappings.
   *
   * @example
   * ```ts
   * new TreeMap([[1, 'a']]).remove(1) // 'a'
   * ```
   */
  remove(key: K): V | undefined {
    return this.engine.remove(key)
  }

  /**
   * Replaces the value of `key` only when the key is present, and returns the previous value, or
   * `undefined`.
   *
   * Time: as `get`.
   *
   * @param key - The key.
   * @param value - The new value.
   * @returns The previous value, or `undefined`.
   * @throws TypeError when the comparator returns an invalid result.
   * @throws ConcurrentModificationError when the comparator adds or removes mappings.
   *
   * @example
   * ```ts
   * new TreeMap([[1, 'a']]).replace(2, 'b') // undefined; nothing is added
   * ```
   */
  replace(key: K, value: V): V | undefined {
    return this.engine.replace(key, value)
  }

  /**
   * Replaces each value with `fn(value, key, map)`, in key order. Values replaced before an error
   * stay.
   *
   * Time: O(n) plus the calls.
   *
   * @param fn - Returns the new value.
   * @throws TypeError when `fn` is not a function.
   * @throws ConcurrentModificationError when `fn` adds or removes mappings.
   *
   * @example
   * ```ts
   * prices.replaceAll((price) => price * 2)
   * ```
   */
  replaceAll(fn: (value: V, key: K, map: MapCollection<K, V>) => V): void {
    this.engine.replaceAll(fn)
  }

  /**
   * Returns the value of `key` when present; otherwise maps `key` to `value` and returns `value`,
   * as native `Map.prototype.getOrInsert` does.
   *
   * Time: as `set`.
   *
   * @param key - The key.
   * @param value - The value to insert when the key is absent.
   * @returns The mapped value.
   * @throws NullElementError when, in natural order, `key` is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, `key` cannot be compared with the stored keys.
   * @throws TypeError when the comparator returns an invalid result.
   * @throws ConcurrentModificationError when the comparator adds or removes mappings.
   *
   * @example
   * ```ts
   * groups.getOrInsert(1, []).push('a')
   * ```
   */
  getOrInsert(key: K, value: V): V {
    return this.engine.getOrInsert(key, value)
  }

  /**
   * Returns the value of `key` when present, without calling `fn`; otherwise calls `fn(key)`, maps
   * `key` to its result and returns it, as native `Map.prototype.getOrInsertComputed` does. If
   * `fn` set the key itself, that mapping's value is overwritten in place and its key object kept;
   * `fn` may change the map without an error.
   *
   * Time: as `set`, plus the call, plus one more search when `fn` added or removed mappings.
   *
   * @param key - The key.
   * @param fn - Computes the value to insert, called with `this` undefined.
   * @returns The mapped value.
   * @throws TypeError when `fn` is not a function (even when the key is present), or the
   *   comparator returns an invalid result.
   * @throws NullElementError when, in natural order, `key` is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, `key` cannot be compared with the stored keys.
   * @throws ConcurrentModificationError when the comparator adds or removes mappings.
   * @throws Error whatever `fn` throws; the call inserts and changes nothing, and changes `fn`
   *   made stay.
   *
   * @example
   * ```ts
   * cache.getOrInsertComputed(id, (id) => load(id))
   * ```
   */
  getOrInsertComputed(key: K, fn: (key: K) => V): V {
    return this.engine.getOrInsertComputed(key, fn)
  }

  /**
   * Maps `key` to `fn(currentValueOrUndefined, key, map)`, or removes the mapping when the result
   * is `undefined`, and returns the result. The key is checked before `fn` is called.
   *
   * Time: as `set`, plus the call.
   *
   * @param key - The key.
   * @param fn - Computes the new value.
   * @returns The result of `fn`.
   * @throws TypeError when `fn` is not a function, or the comparator returns an invalid result.
   * @throws NullElementError when, in natural order, `key` is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, `key` cannot be compared with the stored keys.
   * @throws ConcurrentModificationError when `fn` or the comparator adds or removes mappings; their
   *   changes stay and the call makes none of its own.
   * @throws Error whatever `fn` throws; the call inserts and changes nothing, and changes `fn`
   *   made stay.
   *
   * @example
   * ```ts
   * counts.compute(7, (n) => (n ?? 0) + 1)
   * ```
   */
  compute(
    key: K,
    fn: (value: V | undefined, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined {
    return this.engine.compute(key, fn)
  }

  /**
   * When `key` is present, maps it to `fn(value, key, map)`, or removes the mapping when the
   * result is `undefined`, and returns the result; otherwise returns `undefined` without calling
   * `fn`.
   *
   * Time: as `get`, plus the call.
   *
   * @param key - The key.
   * @param fn - Computes the new value.
   * @returns The result of `fn`, or `undefined`.
   * @throws TypeError when `fn` is not a function, or the comparator returns an invalid result.
   * @throws ConcurrentModificationError when `fn` or the comparator adds or removes mappings.
   * @throws Error whatever `fn` throws; the call inserts and changes nothing, and changes `fn`
   *   made stay.
   *
   * @example
   * ```ts
   * stock.computeIfPresent(3, (n) => (n > 1 ? n - 1 : undefined))
   * ```
   */
  computeIfPresent(
    key: K,
    fn: (value: V, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined {
    return this.engine.computeIfPresent(key, fn)
  }

  /**
   * Maps `key` to `value` when it is absent (even when `value` is `undefined`); otherwise to
   * `fn(old, value, key, map)`, removing the mapping when that result is `undefined`. Returns the
   * stored value, or `undefined` when the mapping was removed.
   *
   * Time: as `set`, plus the call.
   *
   * @param key - The key.
   * @param value - The value to store, or to combine with the present one.
   * @param fn - Combines the present value with `value`.
   * @returns The stored value, or `undefined`.
   * @throws TypeError when `fn` is not a function, or the comparator returns an invalid result.
   * @throws NullElementError when, in natural order, `key` is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, `key` cannot be compared with the stored keys.
   * @throws ConcurrentModificationError when `fn` or the comparator adds or removes mappings.
   * @throws Error whatever `fn` throws; the call inserts and changes nothing, and changes `fn`
   *   made stay.
   *
   * @example
   * ```ts
   * for (const day of days) visits.merge(day, 1, (n, one) => n + one)
   * ```
   */
  merge(
    key: K,
    value: V,
    fn: (old: V, value: V, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined {
    return this.engine.merge(key, value, fn)
  }

  /**
   * Removes every mapping. Open iterators fail on their next step.
   *
   * Time: O(1).
   *
   * @example
   * ```ts
   * map.clear()
   * map.size // 0
   * ```
   */
  clear(): void {
    this.engine.clear()
  }

  /**
   * Returns the entry of the least key, or `undefined` when the map is empty. The comparator is
   * not called.
   *
   * Time: O(log n).
   *
   * @returns A live entry, or `undefined`.
   *
   * @example
   * ```ts
   * new TreeMap([[2, 'b'], [1, 'a']]).firstEntry()?.key // 1
   * ```
   */
  firstEntry(): MapEntry<K, V> | undefined {
    return this.engine.firstEntry()
  }

  /**
   * Returns the entry of the greatest key, or `undefined` when the map is empty. The comparator is
   * not called.
   *
   * Time: O(log n).
   *
   * @returns A live entry, or `undefined`.
   *
   * @example
   * ```ts
   * new TreeMap([[2, 'b'], [1, 'a']]).lastEntry()?.value // 'b'
   * ```
   */
  lastEntry(): MapEntry<K, V> | undefined {
    return this.engine.lastEntry()
  }

  /**
   * Returns the entry of the greatest key less than `key`, or `undefined` when there is none.
   *
   * Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.
   *
   * @param key - The key to search from; it need not be present.
   * @returns A live entry, or `undefined`.
   * @throws NullElementError when, in natural order, `key` is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, `key` cannot be compared with the stored keys.
   * @throws TypeError when the comparator returns a non-number or `NaN`.
   * @throws ConcurrentModificationError when the comparator adds or removes mappings.
   *
   * @example
   * ```ts
   * new TreeMap([[1, 'a'], [3, 'c']]).lowerEntry(3)?.key // 1
   * ```
   */
  lowerEntry(key: K): MapEntry<K, V> | undefined {
    return this.engine.lowerEntry(key)
  }

  /**
   * Returns the entry of the greatest key less than or equal to `key`, or `undefined` when there
   * is none.
   *
   * Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.
   *
   * @param key - The key to search from; it need not be present.
   * @returns A live entry, or `undefined`.
   * @throws NullElementError when, in natural order, `key` is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, `key` cannot be compared with the stored keys.
   * @throws TypeError when the comparator returns a non-number or `NaN`.
   * @throws ConcurrentModificationError when the comparator adds or removes mappings.
   *
   * @example
   * ```ts
   * new TreeMap([[900, 'open'], [1300, 'lunch']]).floorEntry(1030)?.value // 'open'
   * ```
   */
  floorEntry(key: K): MapEntry<K, V> | undefined {
    return this.engine.floorEntry(key)
  }

  /**
   * Returns the entry of the least key greater than or equal to `key`, or `undefined` when there is
   * none.
   *
   * Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.
   *
   * @param key - The key to search from; it need not be present.
   * @returns A live entry, or `undefined`.
   * @throws NullElementError when, in natural order, `key` is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, `key` cannot be compared with the stored keys.
   * @throws TypeError when the comparator returns a non-number or `NaN`.
   * @throws ConcurrentModificationError when the comparator adds or removes mappings.
   *
   * @example
   * ```ts
   * new TreeMap([[1, 'a'], [3, 'c']]).ceilingEntry(2)?.key // 3
   * ```
   */
  ceilingEntry(key: K): MapEntry<K, V> | undefined {
    return this.engine.ceilingEntry(key)
  }

  /**
   * Returns the entry of the least key greater than `key`, or `undefined` when there is none.
   *
   * Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.
   *
   * @param key - The key to search from; it need not be present.
   * @returns A live entry, or `undefined`.
   * @throws NullElementError when, in natural order, `key` is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, `key` cannot be compared with the stored keys.
   * @throws TypeError when the comparator returns a non-number or `NaN`.
   * @throws ConcurrentModificationError when the comparator adds or removes mappings.
   *
   * @example
   * ```ts
   * new TreeMap([[1, 'a'], [3, 'c']]).higherEntry(1)?.key // 3
   * ```
   */
  higherEntry(key: K): MapEntry<K, V> | undefined {
    return this.engine.higherEntry(key)
  }

  /**
   * Removes the mapping of the least key and returns its entry, or returns `undefined` when the
   * map is empty. The entry still reads its value; `setValue` on it throws `IllegalStateError`
   * until the key is set again. The comparator is not called.
   *
   * Time: O(log n).
   *
   * @returns The entry of the removed mapping, or `undefined`.
   *
   * @example
   * ```ts
   * const next = queue.pollFirstEntry() // the earliest mapping, removed
   * ```
   */
  pollFirstEntry(): MapEntry<K, V> | undefined {
    return this.engine.pollFirstEntry()
  }

  /**
   * Removes the mapping of the greatest key and returns its entry, or returns `undefined` when the
   * map is empty. The comparator is not called.
   *
   * Time: O(log n).
   *
   * @returns The entry of the removed mapping, or `undefined`.
   *
   * @example
   * ```ts
   * new TreeMap([[1, 'a'], [2, 'b']]).pollLastEntry()?.value // 'b'
   * ```
   */
  pollLastEntry(): MapEntry<K, V> | undefined {
    return this.engine.pollLastEntry()
  }

  /**
   * Always throws: a sorted map places each mapping by its key, so a mapping cannot be put at an
   * end. Use `set`. Nothing is checked or changed, and the comparator is not called.
   *
   * Time: O(1).
   *
   * @param key - Ignored.
   * @param value - Ignored.
   * @returns Never returns.
   * @throws UnsupportedOperationError always.
   *
   * @example
   * ```ts
   * new TreeMap<number, string>().putFirst(1, 'a') // throws UnsupportedOperationError
   * ```
   */
  putFirst(key: K, value: V): this {
    return this.engine.putFirst(key, value)
  }

  /**
   * Always throws: a sorted map places each mapping by its key, so a mapping cannot be put at an
   * end. Use `set`. Nothing is checked or changed, and the comparator is not called.
   *
   * Time: O(1).
   *
   * @param key - Ignored.
   * @param value - Ignored.
   * @returns Never returns.
   * @throws UnsupportedOperationError always.
   *
   * @example
   * ```ts
   * new TreeMap<number, string>().putLast(1, 'a') // throws UnsupportedOperationError
   * ```
   */
  putLast(key: K, value: V): this {
    return this.engine.putLast(key, value)
  }

  /**
   * Returns a live view of the mappings whose keys run from `from` to `to`: `from` included and
   * `to` excluded unless the options say otherwise. Changes through the view reach this map;
   * setting a key outside the range through the view throws `IllegalArgumentError`, and looking
   * one up answers absent. The view's `size` counts its mappings.
   *
   * Time: O(log n) to create; the view's operations cost O(log n), its `size` O(k + log n) for
   * `k` mappings in range.
   *
   * @param from - The low end of the range.
   * @param to - The high end of the range.
   * @param options - `fromInclusive` (default `true`) and `toInclusive` (default `false`); read
   *   once; `undefined` or `null` for the defaults.
   * @returns The view, tagged `TreeSubMap`.
   * @throws TypeError when `options` is not an object, `undefined` or `null`, or a flag is neither
   *   `undefined` nor a boolean.
   * @throws IllegalArgumentError when `from` is after `to`.
   * @throws NullElementError when, in natural order, a bound is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, a bound cannot be compared with the keys.
   *
   * @example
   * ```ts
   * const map = new TreeMap([[1, 'a'], [2, 'b'], [3, 'c']])
   * map.subMap(1, 3).toJSON()                        // [[1, 'a'], [2, 'b']]
   * map.subMap(1, 3, { toInclusive: true }).size     // 3
   * ```
   */
  subMap(from: K, to: K, options?: SubSetOptions | null): SortedMap<K, V> {
    return this.engine.subMap(from, to, options)
  }

  /**
   * Returns a live view of the mappings whose keys are less than `to` (or equal, with
   * `inclusive: true`). Changes through the view reach this map.
   *
   * Time: O(log n) to create; as `subMap` for the view's operations.
   *
   * @param to - The high end of the range.
   * @param options - `inclusive` (default `false`); read once; `undefined` or `null` for the
   *   default.
   * @returns The view, tagged `TreeSubMap`.
   * @throws TypeError when `options` is not an object, `undefined` or `null`, or `inclusive` is
   *   neither `undefined` nor a boolean.
   * @throws NullElementError when, in natural order, `to` is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, `to` cannot be compared with the keys.
   *
   * @example
   * ```ts
   * new TreeMap([[1, 'a'], [2, 'b']]).headMap(2).toJSON() // [[1, 'a']]
   * ```
   */
  headMap(to: K, options?: BoundOptions | null): SortedMap<K, V> {
    return this.engine.headMap(to, options)
  }

  /**
   * Returns a live view of the mappings whose keys are greater than or equal to `from` (or greater
   * only, with `inclusive: false`). Changes through the view reach this map.
   *
   * Time: O(log n) to create; as `subMap` for the view's operations.
   *
   * @param from - The low end of the range.
   * @param options - `inclusive` (default `true`); read once; `undefined` or `null` for the
   *   default.
   * @returns The view, tagged `TreeSubMap`.
   * @throws TypeError when `options` is not an object, `undefined` or `null`, or `inclusive` is
   *   neither `undefined` nor a boolean.
   * @throws NullElementError when, in natural order, `from` is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, `from` cannot be compared with the keys.
   *
   * @example
   * ```ts
   * new TreeMap([[1, 'a'], [2, 'b']]).tailMap(2).toJSON() // [[2, 'b']]
   * ```
   */
  tailMap(from: K, options?: BoundOptions | null): SortedMap<K, V> {
    return this.engine.tailMap(from, options)
  }

  /**
   * Returns a live view of this map in descending key order: its `lowerEntry` is this map's
   * `higherEntry`, its first entry this map's last, and its ranges run from greater to lesser.
   * Reversing the view returns this map.
   *
   * Time: O(1).
   *
   * @returns The view, tagged `ReversedTreeMap`.
   *
   * @example
   * ```ts
   * const map = new TreeMap([[1, 'a'], [3, 'c']])
   * String(map.reversed())            // "ReversedTreeMap(2) {3 => 'c', 1 => 'a'}"
   * map.reversed().reversed() === map // true
   * ```
   */
  reversed(): SortedMap<K, V> {
    return this.engine.reversed()
  }

  /**
   * Returns a live view of the keys as a sorted set, in ascending order. It answers questions
   * about keys alone (`getFirst`, `floor`, `ceiling`, …); removing a key removes its mapping;
   * `add`, `addFirst` and `addLast` throw `UnsupportedOperationError`. Each call returns a new
   * view.
   *
   * Time: O(1).
   *
   * @returns A new view, tagged `TreeMapKeySet`.
   *
   * @example
   * ```ts
   * const map = new TreeMap([[1, 'a'], [3, 'c']])
   * map.keySet().floor(2)  // 1
   * map.keySet().getLast() // 3
   * ```
   */
  keySet(): SortedSet<K> {
    return this.engine.keySet()
  }

  /**
   * Returns a live view of the mappings as entries, in key order. An entry is a member when its
   * key is present with an equal value; removing it removes the mapping; `add`, `addFirst` and
   * `addLast` throw `UnsupportedOperationError`. Its `getFirst`/`getLast` return the entries of the
   * least and greatest keys, `removeFirst`/`removeLast` remove those mappings (throwing
   * `NoSuchElementError` when empty), and `reversed()` is the entry view of `reversed()`. Each call
   * returns a new view.
   *
   * Time: O(1); the view's ends O(log n).
   *
   * @returns A new view, tagged `TreeMapEntrySet`.
   *
   * @example
   * ```ts
   * for (const entry of map.entrySet()) if (entry.value < 0) entry.setValue(0)
   * ```
   */
  entrySet(): SequencedSet<MapEntry<K, V>> {
    return this.engine.entrySet()
  }

  /**
   * Returns a live view of the values in key order, compared with SameValueZero. `delete(v)`
   * removes the mapping of the least key with that value; `removeAll`, `retainAll` and `removeIf`
   * every matching mapping; `add`, `addFirst` and `addLast` throw `UnsupportedOperationError`.
   * Its `getFirst`/`getLast` return the values of the least and greatest keys,
   * `removeFirst`/`removeLast` remove those mappings (throwing `NoSuchElementError` when empty),
   * and `reversed()` is the value view of `reversed()`. The view equals only itself. Each call
   * returns a new view.
   *
   * Time: O(1); the view's ends O(log n).
   *
   * @returns A new view, tagged `TreeMapValues`.
   *
   * @example
   * ```ts
   * map.valueCollection().removeIf((v) => v === 0)
   * ```
   */
  valueCollection(): SequencedCollection<V> {
    return this.engine.valueCollection()
  }

  /**
   * Returns an iterator over the keys in ascending order.
   *
   * Time: O(log n) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
   * @throws ConcurrentModificationError (from `next()`) when mappings are added or removed after
   *   the iterator is created.
   *
   * @example
   * ```ts
   * [...new TreeMap([[2, 'b'], [1, 'a']]).keys()] // [1, 2]
   * ```
   */
  keys(): IterableIterator<K> {
    return this.engine.keys()
  }

  /**
   * Returns an iterator over the values in ascending key order.
   *
   * Time: O(log n) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
   * @throws ConcurrentModificationError (from `next()`) when mappings are added or removed after
   *   the iterator is created.
   *
   * @example
   * ```ts
   * [...new TreeMap([[2, 'b'], [1, 'a']]).values()] // ['a', 'b']
   * ```
   */
  values(): IterableIterator<V> {
    return this.engine.values()
  }

  /**
   * Returns an iterator over a new `[key, value]` array per mapping, in ascending key order.
   *
   * Time: O(log n) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
   * @throws ConcurrentModificationError (from `next()`) when mappings are added or removed after
   *   the iterator is created.
   *
   * @example
   * ```ts
   * [...new TreeMap([[1, 'a']]).entries()] // [[1, 'a']]
   * ```
   */
  entries(): IterableIterator<[K, V]> {
    return this.engine.entries()
  }

  /**
   * Calls `action(value, key, map)` for each mapping in ascending key order, with `this` set to
   * `thisArg`, as native `Map` does.
   *
   * Time: O(n) plus the calls.
   *
   * @param action - Called with each value, its key and the map.
   * @param thisArg - The `this` value for `action`.
   * @throws TypeError when `action` is not a function.
   * @throws ConcurrentModificationError when `action` adds or removes mappings.
   *
   * @example
   * ```ts
   * map.forEach((value, key) => console.log(key, value))
   * ```
   */
  forEach(action: (value: V, key: K, map: MapCollection<K, V>) => void, thisArg?: unknown): void {
    this.engine.forEach(action, thisArg)
  }

  /**
   * Returns an iterator over a new `[key, value]` array per mapping, in ascending key order, as
   * `entries()` does. `new Map(treeMap)` copies the map this way.
   *
   * Time: O(log n) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
   * @throws ConcurrentModificationError (from `next()`) when mappings are added or removed after
   *   the iterator is created.
   *
   * @example
   * ```ts
   * for (const [key, value] of map) console.log(key, value)
   * ```
   */
  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.engine.entries()
  }

  /**
   * Returns a new `TreeMap` with the same mappings and the same comparator, independent of this
   * one (keys and values themselves are not copied). No user function is called.
   *
   * Time: O(n).
   *
   * @returns The copy.
   *
   * @example
   * ```ts
   * const copy = map.copy()
   * copy.set(9, 'z') // map is unchanged
   * ```
   */
  copy(): TreeMap<K, V> {
    const copy = new TreeMap<K, V>(null, { comparator: this.engine.comparator() })
    copy.engine.copyFrom(this.engine)
    return copy
  }

  /**
   * Returns whether `other` is a map of the same size in which every key of this map is present
   * with a value equal under `equals`, and which has no key this map lacks — whatever the order,
   * and the same both ways round, so a `TreeMap` equals a `HashMap` with the same mappings. Native
   * `Map`, sets, lists and plain objects are never equal to it.
   *
   * Time: O(n log n), plus the lookups on `other` and the protocol methods.
   *
   * @param other - Any value.
   * @returns `true` when `other` is an equal map.
   * @throws ConcurrentModificationError when a value's `equals` changes the structure of `other`
   *   while it is compared (values are compared as `equals(otherValue, thisValue)`).
   *
   * @example
   * ```ts
   * new TreeMap([[1, 'a']]).equals(new HashMap([[1, 'a']])) // true
   * ```
   */
  equals(other: unknown): boolean {
    return this.engine.equals(other)
  }

  /** The value-equality protocol; delegates to `equals`. Time: as `equals`. */
  [equalsSymbol](other: unknown): boolean {
    return this.engine.equals(other)
  }

  /**
   * The value-equality protocol: an order-independent combination of the mappings' hashes through
   * `hash`. Equal maps get the same value when their comparators treat as equal only keys `hash`
   * hashes alike, as natural order does for primitives; then it is also the value of an equal
   * default `HashMap`. Values are unspecified. Time: O(n) plus the `hash` calls.
   */
  [hashCodeSymbol](hash: HashFunction): number {
    return this.engine[hashCodeSymbol](hash)
  }

  /**
   * Returns the class name, size and mappings in ascending key order, e.g.
   * `TreeMap(2) {1 => 'a', 2 => 'b'}`; a map that contains itself prints as `[Circular]`.
   *
   * Time: O(length of the output) for flat contents.
   *
   * @returns The text.
   *
   * @example
   * ```ts
   * String(new TreeMap([[2, 'b'], [1, 'a']])) // "TreeMap(2) {1 => 'a', 2 => 'b'}"
   * ```
   */
  toString(): string {
    return this.engine.toString()
  }

  /**
   * Returns a new array of `[key, value]` arrays in ascending key order, so `JSON.stringify`
   * writes the map as pairs.
   *
   * Time: O(n).
   *
   * @returns A new array.
   *
   * @example
   * ```ts
   * JSON.stringify(new TreeMap([[2, 'b'], [1, 'a']])) // '[[1,"a"],[2,"b"]]'
   * ```
   */
  toJSON(): Array<[K, V]> {
    return this.engine.toJSON()
  }

  /** Node's inspect hook: `TreeMap(1) { 1 => 'a' }` in `console.log`. Time: as `toString`. */
  [INSPECT](
    depth: number | null,
    options: object,
    inspect: (value: unknown, options: object) => string,
  ): string {
    return this.engine[INSPECT](depth, options, inspect)
  }
}
