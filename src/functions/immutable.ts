/**
 * Immutable lists, sets and maps.
 *
 * @packageDocumentation
 */

import { ArrayList } from '../collections/array-list'
import { HashMap, type HashMapOptions } from '../collections/hash-map'
import { HashSet, type HashSetOptions } from '../collections/hash-set'
import type { ReadonlyList } from '../interfaces/list'
import type { MapEntry, ReadonlyMapCollection } from '../interfaces/map'
import type { ReadonlySetCollection } from '../interfaces/set'
import { describeValue, isIterable } from '../internal/checks'
import { readEquality } from '../internal/engines/hash-support'
import { readPairs } from '../internal/map-input'
import { ReadOnlyList } from '../internal/views/read-only/read-only-list'
import { ReadOnlyMap } from '../internal/views/read-only/read-only-map'
import { ReadOnlySet } from '../internal/views/read-only/read-only-set'
import { IMMUTABLE_TAGS } from '../internal/views/read-only/tags'

/** The list a factory returns; its views are plain read-only lists. */
class ImmutableList<E> extends ReadOnlyList<E> {
  constructor(source: ArrayList<E>) {
    super(source, IMMUTABLE_TAGS)
  }
}

/** The set a factory returns, remembering the `key` or `equivalence` it was built with. */
class ImmutableSet<E> extends ReadOnlySet<E> {
  readonly equality: unknown

  constructor(source: HashSet<E>, equality: unknown) {
    super(source, 'ImmutableSet')
    this.equality = equality
  }
}

/** The map a factory returns, remembering the `key` or `equivalence` it was built with. */
class ImmutableMap<K, V> extends ReadOnlyMap<K, V> {
  readonly equality: unknown

  constructor(source: HashMap<K, V>, equality: unknown) {
    super(source, IMMUTABLE_TAGS)
    this.equality = equality
  }
}

function notIterable(where: string, what: string, value: unknown): TypeError {
  return new TypeError(`${where}: ${what} is not iterable (${describeValue(value)})`)
}

/** The `key` function or `equivalence` object given, after the options are checked. */
function equalityOf(options: unknown, where: string): unknown {
  readEquality(options, where)
  if (options === undefined || options === null) return undefined
  const record = options as { key?: unknown; equivalence?: unknown }
  return record.key !== undefined ? record.key : record.equivalence
}

/**
 * Returns an immutable list of `elements`, in argument order, duplicates kept. `null` and
 * `undefined` are stored. Every method that would change the list, its views or its cursors
 * throws `UnsupportedOperationError`.
 *
 * For many elements, use {@link copyOfList}: spreading a large array into a call fails at the
 * call site.
 *
 * Time: O(n) for `n` elements.
 *
 * @param elements - The elements.
 * @returns An immutable list.
 *
 * @example
 * ```ts
 * const days = listOf('mon', 'tue', 'tue')
 * days.get(1) // 'tue'
 * String(days) // "ImmutableList(3) ['mon', 'tue', 'tue']"
 * ```
 */
export function listOf<E>(...elements: E[]): ReadonlyList<E> {
  return new ImmutableList(new ArrayList<E>(elements))
}

/**
 * Returns an immutable list of the elements of `elements`, in iteration order. The source is read
 * once; later changes to it do not show through. Given a list this function or {@link listOf}
 * returned, it may return that list.
 *
 * Time: O(n) for `n` elements.
 *
 * @param elements - The elements.
 * @returns An immutable list.
 * @throws TypeError when `elements` is not iterable (`null` and `undefined` included).
 *
 * @example
 * ```ts
 * copyOfList(new Set([3, 1, 2])) // ImmutableList(3) [3, 1, 2]
 * copyOfList(Array(3).fill(0))   // ImmutableList(3) [0, 0, 0]
 * ```
 */
export function copyOfList<E>(elements: Iterable<E>): ReadonlyList<E> {
  if (elements instanceof ImmutableList) return elements
  if (!isIterable(elements)) throw notIterable('copyOfList', 'elements', elements)
  return new ImmutableList(new ArrayList<E>(elements))
}

/**
 * Returns an immutable set of `elements` in first-seen order, as `new Set` builds it: equal
 * elements are kept once (SameValueZero, so `-0` is stored as `0` and `NaN` is one member), and
 * `null` and `undefined` are stored. Every method that would change the set, its cursors or
 * views throws `UnsupportedOperationError`.
 *
 * Time: O(n) average for `n` elements.
 *
 * @param elements - The elements.
 * @returns An immutable set.
 *
 * @example
 * ```ts
 * const flags = setOf('a', 'b', 'a')
 * flags.has('b') // true
 * String(flags)  // "ImmutableSet(2) {'a', 'b'}"
 * ```
 */
export function setOf<E>(...elements: E[]): ReadonlySetCollection<E> {
  return new ImmutableSet(new HashSet<E>(elements), undefined)
}

/**
 * Returns an immutable set of the distinct elements of `elements`, in first-seen order, deciding
 * sameness by `options` as a `HashSet` does: SameValueZero by default, a derived `key`, or an
 * `equivalence`. The whole source is read before any `key`, `equals` or `hash` call, so a callback
 * that changes the source does not affect the result. Given a set this function or
 * {@link setOf} returned with the same `key` or `equivalence` (or none on both), it may return
 * that set.
 *
 * Time: O(n) average for `n` elements, plus the `key` or `equivalence` calls.
 *
 * @param elements - The elements.
 * @param options - `key` or `equivalence`; `null` or `undefined` means none.
 * @returns An immutable set.
 * @throws TypeError when `elements` is not iterable (`null` and `undefined` included) or the
 *   options are invalid (both given, a `key` that is not a function, an `equivalence` without
 *   `equals` and `hash` functions, or options that are not an object).
 *
 * @example
 * ```ts
 * copyOfSet(['Ann', 'ann', 'Bo'], { key: (name) => name.toLowerCase() })
 * // ImmutableSet(2) {'Ann', 'Bo'}
 * ```
 */
export function copyOfSet<E>(
  elements: Iterable<E>,
  options?: HashSetOptions<E> | null,
): ReadonlySetCollection<E> {
  if (!isIterable(elements)) throw notIterable('copyOfSet', 'elements', elements)
  const equality = equalityOf(options, 'copyOfSet')
  if (elements instanceof ImmutableSet && elements.equality === equality) return elements
  const items: E[] = []
  for (const element of elements) items.push(element)
  return new ImmutableSet(new HashSet<E>(items, options), equality)
}

/**
 * Returns an immutable map of `entries`, as `new Map` builds it: keys iterate in first-seen
 * order, and a repeated key keeps its first position and first key object and takes its last
 * value. Keys are compared with SameValueZero (`-0` is stored as `0`, `NaN` is one key); `null` and
 * `undefined` are stored as keys and values. Every method that would change the map, its views or
 * its entries throws `UnsupportedOperationError`.
 *
 * For many entries, use {@link copyOfMap}: spreading a large array into a call fails at the call
 * site.
 *
 * Time: O(n) average for `n` entries.
 *
 * @param entries - `[key, value]` arrays or map entries.
 * @returns An immutable map.
 * @throws TypeError when an item is neither an array of length 2 nor a map entry.
 *
 * @example
 * ```ts
 * const limits = mapOf(['small', 10], ['large', 100])
 * limits.get('large') // 100
 * String(limits)      // "ImmutableMap(2) {'small' => 10, 'large' => 100}"
 * ```
 */
export function mapOf<K, V>(
  ...entries: Array<readonly [K, V] | MapEntry<K, V>>
): ReadonlyMapCollection<K, V> {
  const pairs = readPairs<K, V>(entries, 'mapOf')
  return new ImmutableMap(new HashMap<K, V>(pairs), undefined)
}

/**
 * Returns an immutable map of the mappings of `entries` — a library map, a native `Map`, or an
 * iterable of `[key, value]` arrays or map entries — built as {@link mapOf} builds it, deciding
 * key sameness by `options` as a `HashMap` does. Every item is read and checked before any `key`,
 * `equals` or `hash` call. Given a map this function or {@link mapOf} returned with the same `key`
 * or `equivalence` (or none on both), it may return that map.
 *
 * Time: O(n) average for `n` items, plus the `key` or `equivalence` calls.
 *
 * @param entries - The mappings.
 * @param options - `key` or `equivalence`; `null` or `undefined` means none.
 * @returns An immutable map.
 * @throws TypeError when `entries` is not iterable (`null` and `undefined` included), an item is
 *   neither an array of length 2 nor a map entry, or the options are invalid (as for
 *   {@link copyOfSet}).
 *
 * @example
 * ```ts
 * const settings = copyOfMap(new Map([['theme', 'dark']]))
 * settings.get('theme') // 'dark'
 * ```
 */
export function copyOfMap<K, V>(
  entries: Iterable<readonly [K, V] | MapEntry<K, V>>,
  options?: HashMapOptions<K> | null,
): ReadonlyMapCollection<K, V> {
  if (!isIterable(entries)) throw notIterable('copyOfMap', 'entries', entries)
  const equality = equalityOf(options, 'copyOfMap')
  if (entries instanceof ImmutableMap && entries.equality === equality) {
    return entries as ReadonlyMapCollection<K, V>
  }
  const pairs = readPairs<K, V>(entries, 'copyOfMap')
  return new ImmutableMap(new HashMap<K, V>(pairs, options), equality)
}
