/**
 * Unmodifiable views: read-only windows onto collections their owner keeps changing.
 *
 * @packageDocumentation
 */

import type { ReadonlyCollection } from '../interfaces/collection'
import type { ReadonlyList, ReadonlySequencedCollection } from '../interfaces/list'
import type { ReadonlyMapCollection } from '../interfaces/map'
import type { ReadonlySequencedMap } from '../interfaces/sequenced-map'
import type { ReadonlySequencedSet } from '../interfaces/sequenced-set'
import type { ReadonlySetCollection } from '../interfaces/set'
import type { ReadonlySortedMap } from '../interfaces/sorted-map'
import type { ReadonlySortedSet } from '../interfaces/sorted-set'
import {
  isBranded,
  LIST_BRAND,
  MAP_COLLECTION_BRAND,
  SEQUENCED_COLLECTION_BRAND,
  SEQUENCED_MAP_BRAND,
  SET_COLLECTION_BRAND,
  SORTED_MAP_BRAND,
  SORTED_SET_BRAND,
} from '../internal/brand'
import { describeValue } from '../internal/checks'
import { COLLECTION_BRAND } from '../internal/output'
import {
  ReadOnlyCollection,
  ReadOnlySequencedCollection,
} from '../internal/views/read-only/read-only-collection'
import { ReadOnlyList } from '../internal/views/read-only/read-only-list'
import {
  ReadOnlyMap,
  ReadOnlySequencedMap,
  ReadOnlySortedMap,
} from '../internal/views/read-only/read-only-map'
import {
  ReadOnlySequencedSet,
  ReadOnlySet,
  ReadOnlySortedSet,
} from '../internal/views/read-only/read-only-set'
import { UNMODIFIABLE_TAGS } from '../internal/views/read-only/tags'

/** Throws `TypeError` unless `value` carries every brand in `brands`. */
function requireFamily(
  value: unknown,
  brands: readonly symbol[],
  where: string,
  what: string,
  family: string,
): void {
  for (const brand of brands) {
    if (!isBranded(value, brand)) {
      throw new TypeError(
        `${where}: ${what} is not ${family} from this library (${describeValue(value)})`,
      )
    }
  }
}

/**
 * Returns a read-only view of `collection`: reads, iteration and cursors go to the collection, so
 * the owner's changes show through, and every method that would change it throws
 * `UnsupportedOperationError`. The view compares by identity (`equals` is `true` only for itself),
 * because a collection of any family can be wrapped.
 *
 * Time: O(1); each operation costs what the collection's costs.
 *
 * @param collection - A collection from this library.
 * @returns An unmodifiable view, printed as `UnmodifiableCollection`.
 * @throws TypeError when `collection` is not a collection from this library.
 *
 * @example
 * ```ts
 * const queue = new ArrayDeque(['a'])
 * const view = unmodifiableCollection(queue)
 * queue.push('b')
 * view.size // 2
 * ```
 */
export function unmodifiableCollection<E>(
  collection: ReadonlyCollection<E>,
): ReadonlyCollection<E> {
  requireFamily(
    collection,
    [COLLECTION_BRAND],
    'unmodifiableCollection',
    'collection',
    'a collection',
  )
  return new ReadOnlyCollection(collection, UNMODIFIABLE_TAGS.collection)
}

/**
 * Returns a read-only view of a sequenced collection: as {@link unmodifiableCollection}, with the
 * ends (`getFirst`, `getLast`) and a reversed view. It compares by identity.
 *
 * Time: O(1); each operation costs what the collection's costs.
 *
 * @param collection - A sequenced collection from this library (a list, deque or sequenced set).
 * @returns An unmodifiable view, printed as `UnmodifiableSequencedCollection`.
 * @throws TypeError when `collection` is not a sequenced collection from this library.
 *
 * @example
 * ```ts
 * const deque = new ArrayDeque([1, 2, 3])
 * unmodifiableSequencedCollection(deque).getLast() // 3
 * ```
 */
export function unmodifiableSequencedCollection<E>(
  collection: ReadonlySequencedCollection<E>,
): ReadonlySequencedCollection<E> {
  requireFamily(
    collection,
    [COLLECTION_BRAND, SEQUENCED_COLLECTION_BRAND],
    'unmodifiableSequencedCollection',
    'collection',
    'a sequenced collection',
  )
  return new ReadOnlySequencedCollection(collection, UNMODIFIABLE_TAGS.sequencedCollection)
}

/**
 * Returns a read-only view of `list`: indexes, `subList`, `reversed()` and cursors read the list,
 * so the owner's changes show through, and every change — on the view, its sub-lists and reversed
 * views, and its cursors — throws `UnsupportedOperationError` before its arguments are checked.
 * The view equals, and hashes like, the list.
 *
 * Time: O(1); each operation costs what the list's costs.
 *
 * @param list - A list from this library.
 * @returns An unmodifiable view, printed as `UnmodifiableList`.
 * @throws TypeError when `list` is not a list from this library.
 *
 * @example
 * ```ts
 * const items = new ArrayList(['a'])
 * const view = unmodifiableList(items)
 * items.add('b')
 * view.get(1) // 'b'
 * ```
 */
export function unmodifiableList<E>(list: ReadonlyList<E>): ReadonlyList<E> {
  requireFamily(list, [LIST_BRAND], 'unmodifiableList', 'list', 'a list')
  return new ReadOnlyList(list, UNMODIFIABLE_TAGS)
}

/**
 * Returns a read-only view of `set`: membership, iteration and cursors go to the set, so the
 * owner's changes show through, and every method that would change it throws
 * `UnsupportedOperationError`. The view equals, and hashes like, the set.
 *
 * Time: O(1); each operation costs what the set's costs.
 *
 * @param set - A set from this library.
 * @returns An unmodifiable view, printed as `UnmodifiableSet`.
 * @throws TypeError when `set` is not a set from this library.
 *
 * @example
 * ```ts
 * const tags = new HashSet(['a'])
 * unmodifiableSet(tags).has('a') // true
 * ```
 */
export function unmodifiableSet<E>(set: ReadonlySetCollection<E>): ReadonlySetCollection<E> {
  requireFamily(set, [SET_COLLECTION_BRAND], 'unmodifiableSet', 'set', 'a set')
  return new ReadOnlySet(set, UNMODIFIABLE_TAGS.set)
}

/**
 * Returns a read-only view of a sequenced set: as {@link unmodifiableSet}, with the ends and a
 * reversed view.
 *
 * Time: O(1); each operation costs what the set's costs.
 *
 * @param set - A sequenced set from this library (a `LinkedHashSet`, a sorted set, …).
 * @returns An unmodifiable view, printed as `UnmodifiableSequencedSet`.
 * @throws TypeError when `set` is not a sequenced set from this library.
 *
 * @example
 * ```ts
 * unmodifiableSequencedSet(new LinkedHashSet(['a', 'b'])).getLast() // 'b'
 * ```
 */
export function unmodifiableSequencedSet<E>(set: ReadonlySequencedSet<E>): ReadonlySequencedSet<E> {
  requireFamily(
    set,
    [SET_COLLECTION_BRAND, SEQUENCED_COLLECTION_BRAND],
    'unmodifiableSequencedSet',
    'set',
    'a sequenced set',
  )
  return new ReadOnlySequencedSet(set, UNMODIFIABLE_TAGS.sequencedSet)
}

/**
 * Returns a read-only view of a sorted set: as {@link unmodifiableSet}, with navigation
 * (`floor`, `ceiling`, …), the comparator, and range and reversed views that are unmodifiable too.
 *
 * Time: O(1); each operation costs what the set's costs.
 *
 * @param set - A sorted set from this library.
 * @returns An unmodifiable view, printed as `UnmodifiableSortedSet`.
 * @throws TypeError when `set` is not a sorted set from this library.
 *
 * @example
 * ```ts
 * unmodifiableSortedSet(new TreeSet([10, 20, 30])).floor(25) // 20
 * ```
 */
export function unmodifiableSortedSet<E>(set: ReadonlySortedSet<E>): ReadonlySortedSet<E> {
  requireFamily(set, [SORTED_SET_BRAND], 'unmodifiableSortedSet', 'set', 'a sorted set')
  return new ReadOnlySortedSet(set, UNMODIFIABLE_TAGS.sortedSet)
}

/**
 * Returns a read-only view of `map`: lookups, iteration and the key, entry and value views read
 * the map, so the owner's changes show through, and every method that would change it, its views
 * or its entries throws `UnsupportedOperationError`. Entries read the map's entries live. The view
 * equals, and hashes like, the map. On an access-ordered `LinkedHashMap`, `get` through the view is
 * an access, as on the map.
 *
 * Time: O(1); each operation costs what the map's costs.
 *
 * @param map - A map from this library.
 * @returns An unmodifiable view, printed as `UnmodifiableMap`.
 * @throws TypeError when `map` is not a map from this library.
 *
 * @example
 * ```ts
 * const prices = new HashMap([['tea', 3]])
 * const view = unmodifiableMap(prices)
 * prices.set('tea', 4)
 * view.get('tea') // 4
 * ```
 */
export function unmodifiableMap<K, V>(
  map: ReadonlyMapCollection<K, V>,
): ReadonlyMapCollection<K, V> {
  requireFamily(map, [MAP_COLLECTION_BRAND], 'unmodifiableMap', 'map', 'a map')
  return new ReadOnlyMap(map, UNMODIFIABLE_TAGS)
}

/**
 * Returns a read-only view of a sequenced map: as {@link unmodifiableMap}, with the first and last
 * entries, a reversed view, and sequenced key, entry and value views.
 *
 * Time: O(1); each operation costs what the map's costs.
 *
 * @param map - A sequenced map from this library (a `LinkedHashMap`, a sorted map, …).
 * @returns An unmodifiable view, printed as `UnmodifiableSequencedMap`.
 * @throws TypeError when `map` is not a sequenced map from this library.
 *
 * @example
 * ```ts
 * unmodifiableSequencedMap(new LinkedHashMap([['a', 1]])).firstEntry()?.key // 'a'
 * ```
 */
export function unmodifiableSequencedMap<K, V>(
  map: ReadonlySequencedMap<K, V>,
): ReadonlySequencedMap<K, V> {
  requireFamily(
    map,
    [MAP_COLLECTION_BRAND, SEQUENCED_MAP_BRAND],
    'unmodifiableSequencedMap',
    'map',
    'a sequenced map',
  )
  return new ReadOnlySequencedMap(map, UNMODIFIABLE_TAGS)
}

/**
 * Returns a read-only view of a sorted map: as {@link unmodifiableSequencedMap}, with nearest-entry
 * navigation (`floorEntry`, `ceilingEntry`, …), the comparator, range views and a sorted key set,
 * all unmodifiable too.
 *
 * Time: O(1); each operation costs what the map's costs.
 *
 * @param map - A sorted map from this library.
 * @returns An unmodifiable view, printed as `UnmodifiableSortedMap`.
 * @throws TypeError when `map` is not a sorted map from this library.
 *
 * @example
 * ```ts
 * const levels = new TreeMap([[10, 'low'], [50, 'high']])
 * unmodifiableSortedMap(levels).floorEntry(30)?.value // 'low'
 * ```
 */
export function unmodifiableSortedMap<K, V>(map: ReadonlySortedMap<K, V>): ReadonlySortedMap<K, V> {
  requireFamily(map, [SORTED_MAP_BRAND], 'unmodifiableSortedMap', 'map', 'a sorted map')
  return new ReadOnlySortedMap(map, UNMODIFIABLE_TAGS)
}
