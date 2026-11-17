/**
 * `LinkedHashMap`: a map in insertion or access order that can be read and changed at both ends and
 * bounded in size.
 *
 * @packageDocumentation
 */

import { IllegalArgumentError } from '../errors/errors'
import type { SequencedCollection } from '../interfaces/list'
import type { MapCollection, MapEntry } from '../interfaces/map'
import type { SequencedMap } from '../interfaces/sequenced-map'
import type { SequencedSet } from '../interfaces/sequenced-set'
import { brandedHasInstance, MAP_COLLECTION_BRAND, SEQUENCED_MAP_BRAND } from '../internal/brand'
import { describeValue, isIterable } from '../internal/checks'
import { readEquality } from '../internal/engines/hash-support'
import {
  LinkedHashMapEngine,
  type LinkedMapSettings,
} from '../internal/engines/linked-hash-map-engine'
import {
  type Equivalence,
  equalsSymbol,
  type HashFunction,
  hashCodeSymbol,
  type KeyOf,
} from '../internal/equality'
import { readPairs } from '../internal/map-input'
import { INSPECT } from '../internal/output'

const LINKED_HASH_MAP_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/LinkedHashMap',
)

/** The largest integer a `number` holds exactly. */
const MAX_SAFE_INTEGER = 9007199254740991

/**
 * Options for a `LinkedHashMap`. At most one of `key` and `equivalence` may be given; with neither,
 * keys compare with SameValueZero, as in native `Map`. With `accessOrder: true` and a `maxSize`,
 * the map is a least-recently-used cache.
 *
 * @example
 * ```ts
 * const lru: LinkedHashMapOptions<string, Response> = {
 *   accessOrder: true,
 *   maxSize: 100,
 *   onEvict: (response, url) => console.log('dropped', url),
 * }
 * ```
 */
export interface LinkedHashMapOptions<K, V> {
  /**
   * Derives the primitive key a key is found by; two keys are the same key when their derived keys
   * are SameValueZero-equal. Called once per key per operation, never again for a stored key.
   */
  key?: KeyOf<K> | undefined
  /**
   * Decides key equality by its `equals` and `hash`. `valueEquivalence` honours the
   * `equalsSymbol`/`hashCodeSymbol` protocol; `sameValueZeroEquivalence` is the default behaviour.
   */
  equivalence?: Equivalence<K> | undefined
  /**
   * When `true`, reading or writing a present key moves its mapping to the end, so the first
   * mapping is the least recently used. Default `false`: insertion order.
   */
  accessOrder?: boolean | undefined
  /**
   * The most mappings the map keeps: inserting a new key past it removes mappings from the front
   * (never the one just inserted). A positive safe integer; no bound when omitted.
   */
  maxSize?: number | undefined
  /**
   * Called as `onEvict(value, key, map)`, with `this` undefined, once per mapping removed by
   * `maxSize`, in eviction order, after the call that evicted it has finished its changes.
   */
  onEvict?: ((value: V, key: K, map: LinkedHashMap<K, V>) => void) | undefined
}

/** Reads and checks the options a `LinkedHashMap` adds to the key options, each property once. */
function readSettings<K, V>(options: unknown, where: string): LinkedMapSettings<K, V> {
  const equality = readEquality<K>(options, where)
  if (options === undefined || options === null) {
    return { equality, accessOrder: false, maxSize: undefined, onEvict: undefined }
  }
  const record = options as { accessOrder?: unknown; maxSize?: unknown; onEvict?: unknown }
  const accessOrder = record.accessOrder
  if (accessOrder !== undefined && typeof accessOrder !== 'boolean') {
    throw new TypeError(`${where}: accessOrder is not a boolean (${describeValue(accessOrder)})`)
  }
  const maxSize = record.maxSize
  if (maxSize !== undefined) {
    if (typeof maxSize !== 'number') {
      throw new TypeError(`${where}: maxSize is not a number (${describeValue(maxSize)})`)
    }
    if (!(maxSize > 0 && maxSize <= MAX_SAFE_INTEGER && maxSize % 1 === 0)) {
      throw new IllegalArgumentError(
        `${where}: maxSize must be a positive safe integer (${describeValue(maxSize)})`,
      )
    }
  }
  const onEvict = record.onEvict
  if (onEvict !== undefined && typeof onEvict !== 'function') {
    throw new TypeError(`${where}: onEvict is not a function (${describeValue(onEvict)})`)
  }
  return {
    equality,
    accessOrder: accessOrder === true,
    maxSize: maxSize as number | undefined,
    onEvict: onEvict as ((value: V, key: K, map: never) => void) | undefined,
  }
}

/**
 * A map that behaves like native `Map` and `HashMap` — insertion order, SameValueZero keys (`NaN`
 * is one key, `-0` is stored as `0`), `set` returning the map and keeping a present key where it
 * is, live iteration, keys compared by value on request — and can also be read and changed at both
 * ends: `firstEntry` and `lastEntry`, `pollFirstEntry` and `pollLastEntry`, `putFirst` and
 * `putLast`, which insert an absent key at that end or move the present mapping there, and a live
 * `reversed()` view. Each takes O(1) (average for those that look up or remove).
 *
 * With `accessOrder: true`, every read or write of a present key (`get`, `getOrDefault`, `set`,
 * `put`, `replace`, `getOrInsert`, `getOrInsertComputed`, `compute`, `computeIfPresent`, `merge`,
 * and `putAll`, the constructor and `from` for keys already present) moves its mapping to the end,
 * so the first mapping is the least recently used. `has`, iteration, the views, the ends, entries,
 * `replaceAll`, `equals`, hashing and printing never move anything. With `maxSize`, inserting a
 * new key past the bound removes mappings from the front, never the one just inserted, and
 * `onEvict(value, key, map)` is told about each after the call that evicted it; together they make
 * an LRU cache.
 *
 * Iteration is live, as with native `Map`: mappings deleted before they are reached are skipped,
 * mappings inserted at the end the loop is heading to are visited, those inserted at the end it
 * started from are not, and nothing throws `ConcurrentModificationError`. `putFirst` and `putLast`
 * act as a delete followed by an insertion at the new end. A move made by an access never makes an
 * open loop return a mapping twice — on a forward loop an unvisited mapping is visited once at its
 * new place, on a loop over `reversed()` it is skipped — so `for (const k of map.keys()) map.get(k)`
 * ends; such a forward loop keeps a record of the mappings it returned until it is dropped.
 *
 * Changing a key's derived key or hash while it is in the map leaves lookups for it unspecified;
 * the mapping can still be removed through the ends, a view's cursor, `removeIf`, `removeAll`,
 * `retainAll`, or `clear`. Two maps are equal when they have the same size and each maps every
 * key of the other to an equal value, in any order. A `LinkedHashMap` is not a `HashMap`
 * (`instanceof HashMap` is `false`); both are maps. The class is not designed to be subclassed.
 *
 * @example
 * ```ts
 * const cache = new LinkedHashMap<string, number>({ accessOrder: true, maxSize: 2 })
 * cache.set('a', 1).set('b', 2)
 * cache.get('a')      // 1; 'a' is now the most recently used
 * cache.set('c', 3)   // evicts 'b', the least recently used
 * const keys = [...cache.keys()] // ['a', 'c']
 *
 * const recent = new LinkedHashMap([['x', 1], ['y', 2]])
 * recent.putFirst('y', 3).toString() // "LinkedHashMap(2) {'y' => 3, 'x' => 1}"
 * ```
 *
 * @sealed
 */
export class LinkedHashMap<K, V> implements SequencedMap<K, V> {
  private engine: LinkedHashMapEngine<K, V>

  /**
   * Creates a map holding each mapping of `entries`, set one by one in order with the options'
   * access moves and evictions; empty when `entries` is omitted, `undefined` or `null`. Every item
   * and option is checked before anything is stored; options are never taken from `entries`.
   *
   * Time: O(m) average for `m` items, plus the `key` or `equivalence` calls.
   *
   * @param entries - `[key, value]` arrays, map entries, a native `Map` or another map.
   * @param options - `key` or `equivalence`, `accessOrder`, `maxSize`, `onEvict`; `null` means
   *   none.
   * @throws TypeError when `entries` is neither iterable nor `null`/`undefined`, an item is not an
   *   array of length 2 or a map entry, `options` is not an object, both `key` and `equivalence`
   *   are given, `key` is not a function, `equivalence` lacks an `equals` or `hash` function,
   *   `accessOrder` is not a boolean, `maxSize` is not a number or `onEvict` is not a function.
   * @throws IllegalArgumentError when `maxSize` is not a positive safe integer.
   * @throws Error whatever `onEvict` throws, after every mapping is set.
   *
   * @example
   * ```ts
   * new LinkedHashMap([['a', 1], ['b', 2]]) // LinkedHashMap(2) {'a' => 1, 'b' => 2}
   * new LinkedHashMap([['a', 1], ['b', 2], ['c', 3]], { maxSize: 2 }) // {'b' => 2, 'c' => 3}
   * ```
   */
  constructor(
    entries?: Iterable<readonly [K, V] | MapEntry<K, V>> | null,
    options?: LinkedHashMapOptions<K, V> | null,
  )
  /**
   * Creates an empty map with the given options. An object that is not iterable is read as the
   * options.
   *
   * Time: O(1).
   *
   * @param options - `key` or `equivalence`, `accessOrder`, `maxSize`, `onEvict`.
   * @throws TypeError when an option has the wrong type, as for the constructor with entries.
   * @throws IllegalArgumentError when `maxSize` is not a positive safe integer.
   *
   * @example
   * ```ts
   * const lru = new LinkedHashMap<string, string>({ accessOrder: true, maxSize: 100 })
   * ```
   */
  constructor(options: LinkedHashMapOptions<K, V>)
  constructor(
    entriesOrOptions?:
      | Iterable<readonly [K, V] | MapEntry<K, V>>
      | LinkedHashMapOptions<K, V>
      | null,
    options?: LinkedHashMapOptions<K, V> | null,
  ) {
    let pairs: Array<[K, V]> | undefined
    let given: unknown = options
    const first: unknown = entriesOrOptions
    if (first === undefined || first === null) {
      // empty
    } else if (isIterable(first)) {
      pairs = readPairs<K, V>(first, 'LinkedHashMap')
    } else if (typeof first === 'object' && (options === undefined || options === null)) {
      given = first
    } else {
      throw new TypeError(`LinkedHashMap: entries is not iterable (${describeValue(first)})`)
    }
    this.engine = new LinkedHashMapEngine<K, V>(this, readSettings<K, V>(given, 'LinkedHashMap'))
    if (pairs !== undefined) this.engine.build(pairs, 'LinkedHashMap')
  }

  /**
   * Returns a new map of the mappings of `entries`, set one by one in order with the options'
   * access moves and evictions. Every item and option is checked before anything is stored.
   *
   * Time: O(m) average for `m` items, plus the `key` or `equivalence` calls.
   *
   * @param entries - `[key, value]` arrays, map entries, a native `Map` or another map.
   * @param options - As for the constructor; `null` means none.
   * @returns A new map.
   * @throws TypeError when `entries` is not iterable (`null` and `undefined` included), an item is
   *   not a pair or an entry, or an option has the wrong type.
   * @throws IllegalArgumentError when `maxSize` is not a positive safe integer.
   * @throws Error whatever `onEvict` throws, after every mapping is set.
   *
   * @example
   * ```ts
   * LinkedHashMap.from(Object.entries({ a: 1, b: 2 })) // LinkedHashMap(2) {'a' => 1, 'b' => 2}
   * ```
   */
  static from<K, V>(
    entries: Iterable<readonly [K, V] | MapEntry<K, V>>,
    options?: LinkedHashMapOptions<K, V> | null,
  ): LinkedHashMap<K, V> {
    const pairs = readPairs<K, V>(entries, 'LinkedHashMap.from')
    const settings = readSettings<K, V>(options, 'LinkedHashMap.from')
    const map = new LinkedHashMap<K, V>()
    map.engine = new LinkedHashMapEngine<K, V>(map, settings)
    map.engine.build(pairs, 'LinkedHashMap.from')
    return map
  }

  /**
   * Returns whether `value` is a `LinkedHashMap`, including one created by another copy of the
   * library with the same major version. Its reversed view is not one.
   *
   * Time: O(1).
   *
   * @param value - The value on the left of `instanceof`.
   * @returns `true` when `value` is a `LinkedHashMap`.
   *
   * @example
   * ```ts
   * new LinkedHashMap() instanceof LinkedHashMap // true
   * ```
   */
  static [Symbol.hasInstance](value: unknown): boolean {
    // biome-ignore lint/complexity/noThisInStatic: `this` is the class on the right of `instanceof`
    return brandedHasInstance(this, LinkedHashMap, LINKED_HASH_MAP_BRAND, value)
  }

  /**
   * Marks instances of this class so `instanceof` recognises them across copies of the package.
   * Its key is not exported, so the getter is not called directly. Time: O(1).
   */
  get [LINKED_HASH_MAP_BRAND](): true {
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
   * A number that changes when a mapping is added, removed or moved or a value is written (even
   * the same value) — in access order also when a read moves a mapping — and never on a call that
   * changes nothing. Its exact values are unspecified. Time: O(1).
   */
  get revision(): number {
    return this.engine.revision
  }

  /** `'LinkedHashMap'`, for `Object.prototype.toString`. Time: O(1). */
  get [Symbol.toStringTag](): string {
    return 'LinkedHashMap'
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
   * new LinkedHashMap().isEmpty() // true
   * ```
   */
  isEmpty(): boolean {
    return this.engine.isEmpty()
  }

  /**
   * Returns the value mapped to a key equal to `key`, or `undefined` when there is none. In access
   * order, a present mapping moves to the end.
   *
   * Time: O(1) average, plus one `key` or `hash` call and the `equals` calls.
   *
   * @param key - The key to look up (`-0` is read as `0`).
   * @returns The value, or `undefined`.
   * @throws TypeError when a `key`, `equals` or `hash` function returns an invalid result.
   * @throws ConcurrentModificationError when such a function adds or removes mappings.
   *
   * @example
   * ```ts
   * new LinkedHashMap([['a', 1]]).get('a') // 1
   * ```
   */
  get(key: K): V | undefined {
    return this.engine.get(key)
  }

  /**
   * Returns the value mapped to `key` when the key is present (even when that value is
   * `undefined`), and `fallback` otherwise. In access order, a present mapping moves to the end.
   *
   * Time: as `get`.
   *
   * @param key - The key to look up.
   * @param fallback - The value to return when the key is absent.
   * @returns The mapped value, or `fallback`.
   * @throws TypeError when a `key`, `equals` or `hash` function returns an invalid result.
   * @throws ConcurrentModificationError when such a function adds or removes mappings.
   *
   * @example
   * ```ts
   * new LinkedHashMap([['a', 1]]).getOrDefault('b', 0) // 0
   * ```
   */
  getOrDefault<D>(key: K, fallback: D): V | D {
    return this.engine.getOrDefault(key, fallback)
  }

  /**
   * Returns whether a key equal to `key` is present. Never moves a mapping.
   *
   * Time: as `get`.
   *
   * @param key - The key to look for.
   * @returns `true` when the key is present.
   * @throws TypeError when a `key`, `equals` or `hash` function returns an invalid result.
   * @throws ConcurrentModificationError when such a function adds or removes mappings.
   *
   * @example
   * ```ts
   * new LinkedHashMap([[Number.NaN, 1]]).has(Number.NaN) // true
   * ```
   */
  has(key: K): boolean {
    return this.engine.has(key)
  }

  /**
   * Returns whether some value is SameValueZero-equal to `value`. Never moves a mapping.
   *
   * Time: O(n).
   *
   * @param value - The value to look for.
   * @returns `true` when a mapping has that value.
   *
   * @example
   * ```ts
   * new LinkedHashMap([['a', 1]]).containsValue(1) // true
   * ```
   */
  containsValue(value: V): boolean {
    return this.engine.containsValue(value)
  }

  /**
   * Maps `key` to `value` and returns the map, so calls chain. A new key goes to the end; a
   * present key keeps its stored key object and its position (in access order it moves to the
   * end) and only the value is replaced. With `maxSize`, a new key can evict from the front.
   *
   * Time: O(1) average, plus one `key` or `hash` call and the `equals` calls.
   *
   * @param key - The key (`-0` is stored as `0`).
   * @param value - The value.
   * @returns The map.
   * @throws TypeError when a `key`, `equals` or `hash` function returns an invalid result.
   * @throws ConcurrentModificationError when such a function adds or removes mappings; the map
   *   keeps those changes and stores nothing itself.
   * @throws Error whatever `onEvict` throws, after the mapping is set.
   *
   * @example
   * ```ts
   * new LinkedHashMap<string, number>().set('a', 1).set('b', 2) // LinkedHashMap(2) {'a' => 1, 'b' => 2}
   * ```
   */
  set(key: K, value: V): this {
    this.engine.set(key, value)
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
   * @throws TypeError when a `key`, `equals` or `hash` function returns an invalid result.
   * @throws ConcurrentModificationError when such a function adds or removes mappings.
   * @throws Error whatever `onEvict` throws, after the mapping is set.
   *
   * @example
   * ```ts
   * new LinkedHashMap([['a', 1]]).put('a', 2) // 1
   * ```
   */
  put(key: K, value: V): V | undefined {
    return this.engine.put(key, value)
  }

  /**
   * Sets every mapping of `entries` in order, each as one `set` with its access move and eviction.
   * The whole argument is read and checked first, so `map.putAll(map)` is safe; evictions are
   * reported to `onEvict` once, after the last pair.
   *
   * Time: O(m) average for `m` items, plus the calls.
   *
   * @param entries - `[key, value]` arrays, map entries, a native `Map` or a map.
   * @throws TypeError when `entries` is not iterable, an item is not an array of length 2 or a map
   *   entry, or a `key`, `equals` or `hash` function returns an invalid result.
   * @throws ConcurrentModificationError when such a function adds or removes mappings.
   * @throws Error whatever `onEvict` throws, after the mappings are set.
   *
   * @example
   * ```ts
   * map.putAll(new Map([['a', 1], ['b', 2]]))
   * ```
   */
  putAll(entries: Iterable<readonly [K, V] | MapEntry<K, V>>): void {
    this.engine.putAll(entries)
  }

  /**
   * Maps `key` to `value` at the front: inserts the mapping there when the key is absent, or moves
   * the present mapping there (keeping its stored key) and writes its value. Not an access. With
   * `maxSize`, a new key can evict from the front, never itself.
   *
   * Time: as `set`.
   *
   * @param key - The key.
   * @param value - The value.
   * @returns The map.
   * @throws TypeError when a `key`, `equals` or `hash` function returns an invalid result.
   * @throws ConcurrentModificationError when such a function adds or removes mappings; nothing is
   *   inserted or moved.
   * @throws Error whatever `onEvict` throws, after the mapping is placed.
   *
   * @example
   * ```ts
   * new LinkedHashMap([['a', 1], ['b', 2]]).putFirst('b', 3) // LinkedHashMap(2) {'b' => 3, 'a' => 1}
   * ```
   */
  putFirst(key: K, value: V): this {
    this.engine.putFirst(key, value)
    return this
  }

  /**
   * Maps `key` to `value` at the end: inserts the mapping there when the key is absent, or moves
   * the present mapping there (keeping its stored key) and writes its value. Not an access.
   *
   * Time: as `set`.
   *
   * @param key - The key.
   * @param value - The value.
   * @returns The map.
   * @throws TypeError when a `key`, `equals` or `hash` function returns an invalid result.
   * @throws ConcurrentModificationError when such a function adds or removes mappings; nothing is
   *   inserted or moved.
   * @throws Error whatever `onEvict` throws, after the mapping is placed.
   *
   * @example
   * ```ts
   * new LinkedHashMap([['a', 1], ['b', 2]]).putLast('a', 3) // LinkedHashMap(2) {'b' => 2, 'a' => 3}
   * ```
   */
  putLast(key: K, value: V): this {
    this.engine.putLast(key, value)
    return this
  }

  /**
   * Removes the mapping of `key` and returns whether there was one. `onEvict` is not called.
   *
   * Time: as `set`.
   *
   * @param key - The key.
   * @returns `true` when a mapping was removed.
   * @throws TypeError when a `key`, `equals` or `hash` function returns an invalid result.
   * @throws ConcurrentModificationError when such a function adds or removes mappings.
   *
   * @example
   * ```ts
   * new LinkedHashMap([['a', 1]]).delete('a') // true
   * ```
   */
  delete(key: K): boolean {
    return this.engine.delete(key)
  }

  /**
   * Removes the mapping of `key` and returns its value, or `undefined` when there was none.
   *
   * Time: as `set`.
   *
   * @param key - The key.
   * @returns The removed value, or `undefined`.
   * @throws TypeError when a `key`, `equals` or `hash` function returns an invalid result.
   * @throws ConcurrentModificationError when such a function adds or removes mappings.
   *
   * @example
   * ```ts
   * new LinkedHashMap([['a', 1]]).remove('a') // 1
   * ```
   */
  remove(key: K): V | undefined {
    return this.engine.remove(key)
  }

  /**
   * Replaces the value of `key` only when the key is present (in access order, moving it to the
   * end), and returns the previous value, or `undefined`.
   *
   * Time: as `set`.
   *
   * @param key - The key.
   * @param value - The new value.
   * @returns The previous value, or `undefined`.
   * @throws TypeError when a `key`, `equals` or `hash` function returns an invalid result.
   * @throws ConcurrentModificationError when such a function adds or removes mappings.
   *
   * @example
   * ```ts
   * new LinkedHashMap([['a', 1]]).replace('b', 2) // undefined; nothing is added
   * ```
   */
  replace(key: K, value: V): V | undefined {
    return this.engine.replace(key, value)
  }

  /**
   * Replaces each value with `fn(value, key, map)`, in order. Never moves a mapping. Values
   * replaced before an error stay.
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
   * Returns the value of `key` when present (in access order, moving it to the end); otherwise maps
   * `key` to `value` at the end and returns `value`, as native `Map.prototype.getOrInsert` does.
   *
   * Time: as `set`.
   *
   * @param key - The key.
   * @param value - The value to insert when the key is absent.
   * @returns The mapped value.
   * @throws TypeError when a `key`, `equals` or `hash` function returns an invalid result.
   * @throws ConcurrentModificationError when such a function adds or removes mappings.
   * @throws Error whatever `onEvict` throws, after the mapping is set.
   *
   * @example
   * ```ts
   * groups.getOrInsert('a', []).push(1)
   * ```
   */
  getOrInsert(key: K, value: V): V {
    return this.engine.getOrInsert(key, value)
  }

  /**
   * Returns the value of `key` when present (in access order, moving it to the end), without
   * calling `fn`; otherwise calls `fn(key)`, maps `key` to its result and returns it. If `fn`
   * inserted the key itself, that mapping's value is overwritten in place, as an access.
   *
   * Time: as `set`, plus the call.
   *
   * @param key - The key.
   * @param fn - Computes the value to insert, called with `this` undefined.
   * @returns The mapped value.
   * @throws TypeError when `fn` is not a function (even when the key is present), or a `key`,
   *   `equals` or `hash` function returns an invalid result.
   * @throws ConcurrentModificationError when a `key`, `equals` or `hash` function adds or removes
   *   mappings.
   * @throws Error whatever `onEvict` throws, after the mapping is set.
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
   * is `undefined`, and returns the result. Writing a present key is an access.
   *
   * Time: as `set`, plus the call.
   *
   * @param key - The key.
   * @param fn - Computes the new value.
   * @returns The result of `fn`.
   * @throws TypeError when `fn` is not a function, or a `key`, `equals` or `hash` function returns
   *   an invalid result.
   * @throws ConcurrentModificationError when `fn` adds or removes mappings; its changes stay and
   *   the call makes none of its own.
   * @throws Error whatever `onEvict` throws, after the call's changes.
   *
   * @example
   * ```ts
   * counts.compute('a', (n) => (n ?? 0) + 1)
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
   * `fn`. Writing the value is an access.
   *
   * Time: as `set`, plus the call.
   *
   * @param key - The key.
   * @param fn - Computes the new value.
   * @returns The result of `fn`, or `undefined`.
   * @throws TypeError when `fn` is not a function, or a `key`, `equals` or `hash` function returns
   *   an invalid result.
   * @throws ConcurrentModificationError when `fn` adds or removes mappings.
   *
   * @example
   * ```ts
   * stock.computeIfPresent('apple', (n) => (n > 1 ? n - 1 : undefined))
   * ```
   */
  computeIfPresent(
    key: K,
    fn: (value: V, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined {
    return this.engine.computeIfPresent(key, fn)
  }

  /**
   * Maps `key` to `value` at the end when it is absent; otherwise to `fn(old, value, key, map)`,
   * removing the mapping when that result is `undefined`. Returns the stored value, or `undefined`
   * when the mapping was removed. Writing a present key is an access.
   *
   * Time: as `set`, plus the call.
   *
   * @param key - The key.
   * @param value - The value to store, or to combine with the present one.
   * @param fn - Combines the present value with `value`.
   * @returns The stored value, or `undefined`.
   * @throws TypeError when `fn` is not a function, or a `key`, `equals` or `hash` function returns
   *   an invalid result.
   * @throws ConcurrentModificationError when `fn` adds or removes mappings.
   * @throws Error whatever `onEvict` throws, after the mapping is set.
   *
   * @example
   * ```ts
   * for (const word of words) counts.merge(word, 1, (n, one) => n + one)
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
   * Removes every mapping. `onEvict` is not called. An open iteration starts over before the first
   * mapping added afterwards.
   *
   * Time: O(1) with an `equivalence`; one native `clear` otherwise (at most O(n)).
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
   * Returns the entry of the first mapping, or `undefined` when the map is empty. Never moves a
   * mapping and calls no user function. The entry is live: it reads the map's current value of
   * its key.
   *
   * Time: O(1).
   *
   * @returns A live entry, or `undefined`.
   *
   * @example
   * ```ts
   * new LinkedHashMap([['a', 1], ['b', 2]]).firstEntry()?.key // 'a'
   * ```
   */
  firstEntry(): MapEntry<K, V> | undefined {
    return this.engine.firstEntry()
  }

  /**
   * Returns the entry of the last mapping, or `undefined` when the map is empty. Never moves a
   * mapping and calls no user function.
   *
   * Time: O(1).
   *
   * @returns A live entry, or `undefined`.
   *
   * @example
   * ```ts
   * new LinkedHashMap([['a', 1], ['b', 2]]).lastEntry()?.value // 2
   * ```
   */
  lastEntry(): MapEntry<K, V> | undefined {
    return this.engine.lastEntry()
  }

  /**
   * Removes the first mapping and returns its entry, or returns `undefined` when the map is empty.
   * The entry still reads its value; `setValue` on it throws `IllegalStateError` until the key is
   * set again. No user function is called and `onEvict` is not.
   *
   * Time: O(1) average.
   *
   * @returns The entry of the removed mapping, or `undefined`.
   *
   * @example
   * ```ts
   * const oldest = cache.pollFirstEntry()
   * ```
   */
  pollFirstEntry(): MapEntry<K, V> | undefined {
    return this.engine.pollFirstEntry()
  }

  /**
   * Removes the last mapping and returns its entry, or returns `undefined` when the map is empty.
   * No user function is called and `onEvict` is not.
   *
   * Time: O(1) average.
   *
   * @returns The entry of the removed mapping, or `undefined`.
   *
   * @example
   * ```ts
   * new LinkedHashMap([['a', 1], ['b', 2]]).pollLastEntry()?.key // 'b'
   * ```
   */
  pollLastEntry(): MapEntry<K, V> | undefined {
    return this.engine.pollLastEntry()
  }

  /**
   * Returns a live view of this map in the opposite order, tagged `ReversedLinkedHashMap`. Changes
   * through either show in both; its ends are this map's ends swapped, and a key it inserts goes to
   * its end, this map's front. Access moves and evictions act on this map as usual. Reversing the
   * view returns this map.
   *
   * Time: O(1).
   *
   * @returns The reversed view.
   *
   * @example
   * ```ts
   * const newestFirst = map.reversed()
   * for (const [key] of newestFirst) console.log(key)
   * ```
   */
  reversed(): SequencedMap<K, V> {
    return this.engine.reversed()
  }

  /**
   * Returns a live view of the keys in this map's order, under its key equality, with this map's
   * ends. Removing a key removes its mapping; `add`, `addFirst` and `addLast` throw
   * `UnsupportedOperationError`. Each call returns a new view.
   *
   * Time: O(1).
   *
   * @returns A new view, tagged `LinkedHashMapKeySet`.
   *
   * @example
   * ```ts
   * map.keySet().getLast() // the key of the last mapping
   * ```
   */
  keySet(): SequencedSet<K> {
    return this.engine.keySet()
  }

  /**
   * Returns a live view of the mappings as entries, in this map's order, with this map's ends. An
   * entry is a member when its key is present with an equal value; removing it removes the
   * mapping; adding throws `UnsupportedOperationError`. Each call returns a new view.
   *
   * Time: O(1).
   *
   * @returns A new view, tagged `LinkedHashMapEntrySet`.
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
   * Returns a live view of the values in this map's order, compared with SameValueZero, with this
   * map's ends. `delete(v)` removes the first mapping with that value; `removeAll`, `retainAll`
   * and `removeIf` every matching mapping; adding throws `UnsupportedOperationError`. The view
   * equals only itself. Each call returns a new view.
   *
   * Time: O(1).
   *
   * @returns A new view, tagged `LinkedHashMapValues`.
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
   * Returns a live iterator over the keys in order.
   *
   * Time: O(1) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
   *
   * @example
   * ```ts
   * [...new LinkedHashMap([['a', 1]]).keys()] // ['a']
   * ```
   */
  keys(): IterableIterator<K> {
    return this.engine.keys()
  }

  /**
   * Returns a live iterator over the values in order.
   *
   * Time: O(1) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
   *
   * @example
   * ```ts
   * [...new LinkedHashMap([['a', 1]]).values()] // [1]
   * ```
   */
  values(): IterableIterator<V> {
    return this.engine.values()
  }

  /**
   * Returns a live iterator over a new `[key, value]` array per mapping, in order.
   *
   * Time: O(1) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
   *
   * @example
   * ```ts
   * [...new LinkedHashMap([['a', 1]]).entries()] // [['a', 1]]
   * ```
   */
  entries(): IterableIterator<[K, V]> {
    return this.engine.entries()
  }

  /**
   * Calls `action(value, key, map)` for each mapping in order, with `this` set to `thisArg`, as
   * native `Map` does. Mappings deleted before they are reached are skipped; mappings added at the
   * end during the loop are visited.
   *
   * Time: O(n) plus the calls.
   *
   * @param action - Called with each value, its key and the map.
   * @param thisArg - The `this` value for `action`.
   * @throws TypeError when `action` is not a function.
   * @throws Error whatever `onEvict` throws for mappings evicted by `action`, after the loop.
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
   * Returns a live iterator over a new `[key, value]` array per mapping, in order, as `entries()`
   * does. `new Map(linkedHashMap)` copies the map this way.
   *
   * Time: O(1) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
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
   * Returns a new `LinkedHashMap` with the same mappings, order and options — `key` or
   * `equivalence`, `accessOrder`, `maxSize` and the same `onEvict` function — independent of this
   * one. Stored keys and hashes are copied; no user function is called.
   *
   * Time: O(n).
   *
   * @returns The copy.
   *
   * @example
   * ```ts
   * const copy = map.copy()
   * copy.set('z', 0) // map is unchanged
   * ```
   */
  copy(): LinkedHashMap<K, V> {
    const map = new LinkedHashMap<K, V>()
    map.engine = this.engine.copy(map)
    return map
  }

  /**
   * Returns whether `other` is a map of the same size in which every key of this map is present
   * with a value equal under `equals`, and which has no key this map lacks — whatever the order,
   * and the same both ways round. Never moves a mapping of either map.
   *
   * Time: O(n) average, plus the lookups on both maps and the protocol methods.
   *
   * @param other - Any value.
   * @returns `true` when `other` is an equal map.
   * @throws ConcurrentModificationError when a value's `equals` changes the structure of `other`
   *   while it is compared (values are compared as `equals(otherValue, thisValue)`).
   *
   * @example
   * ```ts
   * new LinkedHashMap([['a', 1], ['b', 2]]).equals(new HashMap([['b', 2], ['a', 1]])) // true
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
   * The value-equality protocol: an order-independent combination of the mappings' hashes, the
   * same as an equal `HashMap` with the same `key` function, the same `equivalence`, or neither.
   * Values are unspecified. Time: O(n) plus the `hash` calls.
   */
  [hashCodeSymbol](hash: HashFunction): number {
    return this.engine[hashCodeSymbol](hash)
  }

  /**
   * Returns the class name, size and mappings in order, e.g.
   * `LinkedHashMap(2) {'a' => 1, 'b' => 2}`; a map that contains itself prints as `[Circular]`.
   *
   * Time: O(length of the output) for flat contents.
   *
   * @returns The text.
   *
   * @example
   * ```ts
   * String(new LinkedHashMap([['a', 1]])) // "LinkedHashMap(1) {'a' => 1}"
   * ```
   */
  toString(): string {
    return this.engine.toString()
  }

  /**
   * Returns a new array of `[key, value]` arrays in order, so `JSON.stringify` writes the map as
   * pairs.
   *
   * Time: O(n).
   *
   * @returns A new array.
   *
   * @example
   * ```ts
   * JSON.stringify(new LinkedHashMap([['a', 1]])) // '[["a",1]]'
   * ```
   */
  toJSON(): Array<[K, V]> {
    return this.engine.toJSON()
  }

  /** Node's inspect hook: `LinkedHashMap(1) { 'a' => 1 }` in `console.log`. Time: as `toString`. */
  [INSPECT](
    depth: number | null,
    options: object,
    inspect: (value: unknown, options: object) => string,
  ): string {
    return this.engine[INSPECT](depth, options, inspect)
  }
}
