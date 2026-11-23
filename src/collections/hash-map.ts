/**
 * `HashMap`: a map that behaves like native `Map` and can compare keys by value.
 *
 * @packageDocumentation
 */

import type { Collection } from '../interfaces/collection'
import type { MapCollection, MapEntry } from '../interfaces/map'
import type { SetCollection } from '../interfaces/set'
import { brandedHasInstance, MAP_COLLECTION_BRAND } from '../internal/brand'
import { describeValue, isIterable } from '../internal/checks'
import { HashMapEngine } from '../internal/engines/hash-map-engine'
import { readEquality } from '../internal/engines/hash-support'
import { MISSING } from '../internal/engines/map-stores'
import {
  type Equivalence,
  equalsSymbol,
  type HashFunction,
  hashCodeSymbol,
  type KeyOf,
} from '../internal/equality'
import { readPairs } from '../internal/map-input'
import { INSPECT } from '../internal/output'

const HASH_MAP_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/HashMap',
)

/**
 * Options for a `HashMap`, about its keys. At most one of `key` and `equivalence` may be given;
 * with neither, keys compare with SameValueZero, as in native `Map`.
 *
 * @example
 * ```ts
 * const byId: HashMapOptions<{ id: number }> = { key: (user) => user.id }
 * const byValue: HashMapOptions<Point> = { equivalence: valueEquivalence }
 * ```
 */
export interface HashMapOptions<K> {
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
}

/**
 * A map that behaves like native `Map` — insertion order, SameValueZero keys (`NaN` is one key,
 * `-0` is stored as `0`), `set` returning the map, live iteration — and adds keys compared by value
 * on request, structural `equals`, read-modify-write helpers (`getOrDefault`, `compute`, `merge`,
 * `replaceAll`) and live `keySet()`, `entrySet()` and `valueCollection()` views.
 *
 * Give a `key` function to treat keys with the same derived key as one key, or an `equivalence`
 * (such as `valueEquivalence`) to decide key equality by its `equals` and `hash`. The original key
 * objects are stored and returned. `null` and `undefined` are allowed as keys and values.
 *
 * Iteration is live, as with native `Map`: mappings deleted before they are reached are skipped,
 * mappings added during iteration are visited, and nothing throws `ConcurrentModificationError`.
 * Writing a value is not a structural change. Changing a key's derived key or hash while it is in
 * the map leaves lookups for it unspecified; the mapping can still be removed through a view's
 * cursor, `removeIf`, `removeAll`, `retainAll`, or `clear`.
 *
 * Two maps are equal when they have the same size and each maps every key of the other to an
 * equal value, in any order. Construction input must be `[key, value]` arrays of length 2 or map
 * entries. The class is not designed to be subclassed.
 *
 * @example
 * ```ts
 * const ages = new HashMap([['ann', 31]])
 * ages.set('bob', 27).get('bob') // 27
 *
 * const counts = new HashMap<string, number>()
 * for (const word of ['a', 'b', 'a']) counts.merge(word, 1, (n, one) => n + one)
 * counts.toString() // "HashMap(2) {'a' => 2, 'b' => 1}"
 * ```
 *
 * @sealed
 */
export class HashMap<K, V> implements MapCollection<K, V> {
  private engine: HashMapEngine<K, V>

  /**
   * Creates a map holding each mapping of `entries` in order, later pairs replacing earlier ones
   * for equal keys; empty when `entries` is omitted, `undefined` or `null`. Every item is checked
   * before anything is stored.
   *
   * Time: O(m) average for `m` items, plus the `key` or `equivalence` calls.
   *
   * @param entries - `[key, value]` arrays, map entries, a native `Map` or another map.
   * @param options - `key` or `equivalence`; `null` means none.
   * @throws TypeError when `entries` is neither iterable nor `null`/`undefined`, when an item is
   *   not an array of length 2 or a map entry, when `options` is not an object, when both `key`
   *   and `equivalence` are given, when `key` is not a function, or when `equivalence` lacks an
   *   `equals` or `hash` function.
   *
   * @example
   * ```ts
   * new HashMap([['a', 1], ['b', 2]]) // HashMap(2) {'a' => 1, 'b' => 2}
   * new HashMap(new Map([[1, 'one']]))
   * ```
   */
  constructor(
    entries?: Iterable<readonly [K, V] | MapEntry<K, V>> | null,
    options?: HashMapOptions<K> | null,
  )
  /**
   * Creates an empty map with the given options. An object that is not iterable is read as the
   * options, so `new HashMap({ a: 1 })` is an empty map (the unknown property `a` is ignored).
   *
   * Time: O(1).
   *
   * @param options - `key` or `equivalence`.
   * @throws TypeError when both `key` and `equivalence` are given, when `key` is not a function,
   *   or when `equivalence` lacks an `equals` or `hash` function.
   *
   * @example
   * ```ts
   * const byName = new HashMap<{ name: string }, number>({ key: (item) => item.name })
   * ```
   */
  constructor(options: HashMapOptions<K>)
  constructor(
    entriesOrOptions?: Iterable<readonly [K, V] | MapEntry<K, V>> | HashMapOptions<K> | null,
    options?: HashMapOptions<K> | null,
  ) {
    let pairs: Array<[K, V]> | undefined
    let given: unknown = options
    const first: unknown = entriesOrOptions
    if (first === undefined || first === null) {
      // empty
    } else if (isIterable(first)) {
      pairs = readPairs<K, V>(first, 'HashMap')
    } else if (typeof first === 'object' && (options === undefined || options === null)) {
      given = first
    } else {
      throw new TypeError(`HashMap: entries is not iterable (${describeValue(first)})`)
    }
    this.engine = new HashMapEngine<K, V>(this, readEquality<K>(given, 'HashMap'))
    if (pairs !== undefined) {
      for (const pair of pairs) this.engine.setValue(pair[0], pair[1], 'HashMap')
    }
  }

  /**
   * Returns a new map of the mappings of `entries`, in order, later pairs replacing earlier ones,
   * with the given options. Every item is checked before anything is stored.
   *
   * Time: O(m) average for `m` items, plus the `key` or `equivalence` calls.
   *
   * @param entries - `[key, value]` arrays, map entries, a native `Map` or another map.
   * @param options - `key` or `equivalence`; `null` means none.
   * @returns A new map.
   * @throws TypeError when `entries` is not iterable (`null` and `undefined` included), an item is
   *   not a pair or an entry, or the options are invalid (as for the constructor).
   *
   * @example
   * ```ts
   * HashMap.from(Object.entries({ a: 1, b: 2 })) // HashMap(2) {'a' => 1, 'b' => 2}
   * ```
   */
  static from<K, V>(
    entries: Iterable<readonly [K, V] | MapEntry<K, V>>,
    options?: HashMapOptions<K> | null,
  ): HashMap<K, V> {
    const pairs = readPairs<K, V>(entries, 'HashMap.from')
    const map = new HashMap<K, V>()
    map.engine = new HashMapEngine<K, V>(map, readEquality<K>(options, 'HashMap.from'))
    for (const pair of pairs) map.engine.setValue(pair[0], pair[1], 'HashMap.from')
    return map
  }

  /**
   * Returns whether `value` is a `HashMap`, including one created by another copy of the library
   * with the same major version.
   *
   * Time: O(1).
   *
   * @param value - The value on the left of `instanceof`.
   * @returns `true` when `value` is a `HashMap`.
   *
   * @example
   * ```ts
   * new HashMap() instanceof HashMap // true
   * ```
   */
  static [Symbol.hasInstance](value: unknown): boolean {
    // biome-ignore lint/complexity/noThisInStatic: `this` is the class on the right of `instanceof`
    return brandedHasInstance(this, HashMap, HASH_MAP_BRAND, value)
  }

  /**
   * Marks instances of this class so `instanceof` recognises them across copies of the package.
   * Its key is not exported, so the getter is not called directly. Time: O(1).
   */
  get [HASH_MAP_BRAND](): true {
    return true
  }

  /**
   * Marks maps so `isMapCollection` recognises them across copies of the package. Its key is not
   * exported, so the getter is not called directly. Time: O(1).
   */
  get [MAP_COLLECTION_BRAND](): true {
    return true
  }

  /** The number of mappings. Time: O(1). */
  get size(): number {
    return this.engine.size
  }

  /**
   * A number that changes when a mapping is added or removed or a value is written (even the same
   * value), and never on a read or on a call that changes nothing. Its exact values are
   * unspecified. Time: O(1).
   */
  get revision(): number {
    return this.engine.revision
  }

  /** `'HashMap'`, for `Object.prototype.toString`. Time: O(1). */
  get [Symbol.toStringTag](): string {
    return 'HashMap'
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
   * new HashMap().isEmpty() // true
   * ```
   */
  isEmpty(): boolean {
    return this.engine.isEmpty()
  }

  /**
   * Returns the value mapped to a key equal to `key`, or `undefined` when there is none. Use `has`
   * or `getOrDefault` to tell a stored `undefined` from absence.
   *
   * Time: O(1) average, plus one `key` or `hash` call and the `equals` calls.
   *
   * @param key - The key to look up (`-0` is read as `0`).
   * @returns The value, or `undefined`.
   * @throws TypeError when `key` returns an object or a function, `equivalence.equals` returns a
   *   non-boolean or `equivalence.hash` a non-finite number.
   * @throws ConcurrentModificationError when a `key`, `equals` or `hash` function adds or removes
   *   mappings.
   *
   * @example
   * ```ts
   * new HashMap([['a', 1]]).get('a') // 1
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
   * @throws TypeError when a `key`, `equals` or `hash` function returns an invalid result.
   * @throws ConcurrentModificationError when such a function adds or removes mappings.
   *
   * @example
   * ```ts
   * new HashMap([['a', 1]]).getOrDefault('b', 0) // 0
   * ```
   */
  getOrDefault<D>(key: K, fallback: D): V | D {
    return this.engine.getOrDefault(key, fallback)
  }

  /**
   * Returns whether a key equal to `key` is present.
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
   * new HashMap([[Number.NaN, 1]]).has(Number.NaN) // true
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
   * new HashMap([['a', 1]]).containsValue(1) // true
   * ```
   */
  containsValue(value: V): boolean {
    return this.engine.containsValue(value)
  }

  /**
   * Maps `key` to `value` and returns the map, so calls chain. When an equal key is present, its
   * stored key object and position are kept and only the value is replaced.
   *
   * Time: O(1) average, plus one `key` or `hash` call and the `equals` calls.
   *
   * @param key - The key (`-0` is stored as `0`).
   * @param value - The value.
   * @returns The map.
   * @throws TypeError when a `key`, `equals` or `hash` function returns an invalid result.
   * @throws ConcurrentModificationError when such a function adds or removes mappings; the map
   *   keeps those changes and stores nothing itself.
   *
   * @example
   * ```ts
   * new HashMap<string, number>().set('a', 1).set('b', 2) // HashMap(2) {'a' => 1, 'b' => 2}
   * ```
   */
  set(key: K, value: V): this {
    this.engine.setKey(key, value, 'HashMap.set')
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
   *
   * @example
   * ```ts
   * new HashMap([['a', 1]]).put('a', 2) // 1
   * ```
   */
  put(key: K, value: V): V | undefined {
    return this.engine.put(key, value)
  }

  /**
   * Sets every mapping of `entries` in order, later ones replacing earlier ones for equal keys. The
   * whole argument is read and checked first, so `map.putAll(map)` is safe; mappings set before a
   * `key` or `hash` error stay.
   *
   * Time: O(m) average for `m` items, plus the calls.
   *
   * @param entries - `[key, value]` arrays, map entries, a native `Map` or a map.
   * @throws TypeError when `entries` is not iterable, an item is not an array of length 2 or a map
   *   entry, or a `key`, `equals` or `hash` function returns an invalid result.
   * @throws ConcurrentModificationError when such a function adds or removes mappings.
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
   * Removes the mapping of `key` and returns whether there was one.
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
   * new HashMap([['a', 1]]).delete('a') // true
   * ```
   */
  delete(key: K): boolean {
    return this.engine.deleteKey(key, 'HashMap.delete')
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
   * new HashMap([['a', 1]]).remove('a') // 1
   * ```
   */
  remove(key: K): V | undefined {
    const removed = this.engine.removeKey(key, 'HashMap.remove')
    return removed === MISSING ? undefined : (removed as V)
  }

  /**
   * Replaces the value of `key` only when the key is present, and returns the previous value, or
   * `undefined`.
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
   * new HashMap([['a', 1]]).replace('b', 2) // undefined; nothing is added
   * ```
   */
  replace(key: K, value: V): V | undefined {
    return this.engine.replace(key, value)
  }

  /**
   * Replaces each value with `fn(value, key, map)`, in iteration order. Values replaced before an
   * error stay.
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
   * @throws TypeError when a `key`, `equals` or `hash` function returns an invalid result.
   * @throws ConcurrentModificationError when such a function adds or removes mappings.
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
   * Returns the value of `key` when present, without calling `fn`; otherwise calls `fn(key)`, maps
   * `key` to its result and returns it, as native `Map.prototype.getOrInsertComputed` does. If
   * `fn` inserted the key itself, that mapping's value is overwritten in place; `fn` may change
   * the map without an error.
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
   * is `undefined`, and returns the result. A stored `undefined` reaches `fn` as `undefined`, just
   * as absence does; use `has` to tell them apart.
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
   * @throws Error whatever `fn` throws; the call inserts and changes nothing, and changes `fn`
   *   made stay.
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
   * `fn`.
   *
   * Time: as `set`, plus the call.
   *
   * @param key - The key.
   * @param fn - Computes the new value.
   * @returns The result of `fn`, or `undefined`.
   * @throws TypeError when `fn` is not a function, or a `key`, `equals` or `hash` function returns
   *   an invalid result.
   * @throws ConcurrentModificationError when `fn` adds or removes mappings.
   * @throws Error whatever `fn` throws; the call inserts and changes nothing, and changes `fn`
   *   made stay.
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
   * @throws TypeError when `fn` is not a function, or a `key`, `equals` or `hash` function returns
   *   an invalid result.
   * @throws ConcurrentModificationError when `fn` adds or removes mappings.
   * @throws Error whatever `fn` throws; the call inserts and changes nothing, and changes `fn`
   *   made stay.
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
   * Removes every mapping. An open iteration ends, and mappings added afterwards are visited, as
   * with native `Map`.
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
   * Returns a live view of the keys, under this map's key equality. Removing a key removes its
   * mapping; `add` throws `UnsupportedOperationError`. Each call returns a new view.
   *
   * Time: O(1).
   *
   * @returns A new view.
   *
   * @example
   * ```ts
   * map.keySet().retainAll(['a', 'b']) // keeps only the mappings of 'a' and 'b'
   * ```
   */
  keySet(): SetCollection<K> {
    return this.engine.keySet()
  }

  /**
   * Returns a live view of the mappings as entries. An entry is a member when its key is present
   * with an equal value; removing it removes the mapping; `add` throws
   * `UnsupportedOperationError`. Each call returns a new view.
   *
   * Time: O(1).
   *
   * @returns A new view.
   *
   * @example
   * ```ts
   * for (const entry of map.entrySet()) if (entry.value < 0) entry.setValue(0)
   * ```
   */
  entrySet(): SetCollection<MapEntry<K, V>> {
    return this.engine.entrySet()
  }

  /**
   * Returns a live view of the values, compared with SameValueZero. `delete(v)` removes the first
   * mapping with that value; `removeAll`, `retainAll` and `removeIf` every matching mapping; `add`
   * throws `UnsupportedOperationError`. The view equals only itself. Each call returns a new view.
   *
   * Time: O(1).
   *
   * @returns A new view.
   *
   * @example
   * ```ts
   * map.valueCollection().removeIf((v) => v === 0)
   * ```
   */
  valueCollection(): Collection<V> {
    return this.engine.valueCollection()
  }

  /**
   * Returns a live iterator over the keys in insertion order.
   *
   * Time: O(1) to create; O(1) per step.
   *
   * @returns A new iterator.
   *
   * @example
   * ```ts
   * [...new HashMap([['a', 1]]).keys()] // ['a']
   * ```
   */
  keys(): IterableIterator<K> {
    return this.engine.keys()
  }

  /**
   * Returns a live iterator over the values in insertion order.
   *
   * Time: O(1) to create; O(1) per step.
   *
   * @returns A new iterator.
   *
   * @example
   * ```ts
   * [...new HashMap([['a', 1]]).values()] // [1]
   * ```
   */
  values(): IterableIterator<V> {
    return this.engine.values()
  }

  /**
   * Returns a live iterator over a new `[key, value]` array per mapping, in insertion order.
   *
   * Time: O(1) to create; O(1) per step.
   *
   * @returns A new iterator.
   *
   * @example
   * ```ts
   * [...new HashMap([['a', 1]]).entries()] // [['a', 1]]
   * ```
   */
  entries(): IterableIterator<[K, V]> {
    return this.engine.entries()
  }

  /**
   * Calls `action(value, key, map)` for each mapping in insertion order, with `this` set to
   * `thisArg`, as native `Map` does. Mappings deleted before they are reached are skipped;
   * mappings added during the loop are visited.
   *
   * Time: O(n) plus the calls.
   *
   * @param action - Called with each value, its key and the map.
   * @param thisArg - The `this` value for `action`.
   * @throws TypeError when `action` is not a function.
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
   * Returns a live iterator over a new `[key, value]` array per mapping, in insertion order, as
   * `entries()` does: deleted mappings not yet reached are skipped, added ones are visited, and
   * `clear()` ends it. `new Map(hashMap)` copies the map this way.
   *
   * Time: O(1) to create; O(1) per step.
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
   * Returns a new `HashMap` with the same mappings, order and `key` or `equivalence`, independent
   * of this one. Stored keys and hashes are copied; no user function is called.
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
  copy(): HashMap<K, V> {
    const map = new HashMap<K, V>()
    map.engine = this.engine.copy(map)
    return map
  }

  /**
   * Returns whether `other` is a map of the same size in which every key of this map is present
   * with a value equal under `equals`, and which has no key this map lacks — whatever the order,
   * and the same both ways round. Native `Map`, sets, lists and plain objects are never equal to
   * it.
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
   * new HashMap([['a', 1], ['b', 2]]).equals(new HashMap([['b', 2], ['a', 1]])) // true
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
   * same for equal maps that use the same `key` function, the same `equivalence`, or neither.
   * Values are unspecified. Time: O(n) plus the `hash` calls.
   */
  [hashCodeSymbol](hash: HashFunction): number {
    return this.engine[hashCodeSymbol](hash)
  }

  /**
   * Returns the class name, size and mappings in insertion order, e.g.
   * `HashMap(2) {'a' => 1, 'b' => 2}`; a map that contains itself prints as `[Circular]`.
   *
   * Time: O(length of the output) for flat contents.
   *
   * @returns The text.
   *
   * @example
   * ```ts
   * String(new HashMap([['a', 1]])) // "HashMap(1) {'a' => 1}"
   * ```
   */
  toString(): string {
    return this.engine.toString()
  }

  /**
   * Returns a new array of `[key, value]` arrays in insertion order, so `JSON.stringify` writes
   * the map as pairs (a native `Map` is written as `{}`).
   *
   * Time: O(n).
   *
   * @returns A new array.
   *
   * @example
   * ```ts
   * JSON.stringify(new HashMap([['a', 1]])) // '[["a",1]]'
   * ```
   */
  toJSON(): Array<[K, V]> {
    return this.engine.toJSON()
  }

  /** Node's inspect hook: `HashMap(1) { 'a' => 1 }` in `console.log`. Time: as `toString`. */
  [INSPECT](
    depth: number | null,
    options: object,
    inspect: (value: unknown, options: object) => string,
  ): string {
    return this.engine[INSPECT](depth, options, inspect)
  }
}
