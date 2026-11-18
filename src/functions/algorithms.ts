/**
 * Algorithms over lists and iterables: search, insertion points, rearranging in place, and
 * inspection.
 *
 * @packageDocumentation
 */

import { ConcurrentModificationError, IllegalArgumentError } from '../errors/errors'
import type { List, ReadonlyList } from '../interfaces/list'
import { isBranded, LIST_BRAND } from '../internal/brand'
import { checkIndex, describeValue, isIterable } from '../internal/checks'
import { sameValueZero } from '../internal/equality'
import { random as defaultRandom } from '../internal/intrinsics'
import { compareNatural } from '../internal/natural-order'
import { COLLECTION_BRAND } from '../internal/output'
import type { Comparator } from './comparators'

/** Throws `TypeError` unless `value` is a list from this library. */
function requireList(value: unknown, where: string, what = 'list'): void {
  if (!isBranded(value, LIST_BRAND)) {
    throw new TypeError(
      `${where}: ${what} is not a list from this library (${describeValue(value)})`,
    )
  }
}

/** Throws `TypeError` unless `value` is iterable. */
function requireIterable(value: unknown, where: string, what: string): void {
  if (!isIterable(value)) {
    throw new TypeError(`${where}: ${what} is not iterable (${describeValue(value)})`)
  }
}

/** Throws `TypeError` unless `value` is a function or `undefined`. */
function requireOptionalFunction(value: unknown, where: string, what: string): void {
  if (value !== undefined && typeof value !== 'function') {
    throw new TypeError(`${where}: ${what} is not a function (${describeValue(value)})`)
  }
}

/** The result of a comparison as `-1`, `0` or `1`; `TypeError` for a non-number or `NaN`. */
function sign(result: unknown, where: string): -1 | 0 | 1 {
  if (typeof result !== 'number' || Number.isNaN(result)) {
    throw new TypeError(`${where}: comparator returned ${describeValue(result)}`)
  }
  return result < 0 ? -1 : result > 0 ? 1 : 0
}

/**
 * Returns a comparison that also checks, before looking at the result, that the list's
 * `revision` did not change during the call.
 */
function watchedComparison<E>(
  list: ReadonlyList<E>,
  comparator: Comparator<E> | undefined,
  where: string,
): (a: E, b: E) => -1 | 0 | 1 {
  return (a, b) => {
    const revision = list.revision
    let result: unknown
    const changed = () =>
      new ConcurrentModificationError(`${where}: the list was changed by the comparator`)
    if (comparator === undefined) {
      // Natural order may run a [compareSymbol] method and check its result itself; a change it
      // made to the list is still reported first.
      try {
        result = compareNatural(a, b, where)
      } catch (error) {
        if (list.revision !== revision) throw changed()
        throw error
      }
    } else {
      result = comparator(a, b)
    }
    if (list.revision !== revision) throw changed()
    return comparator === undefined ? (result as -1 | 0 | 1) : sign(result, where)
  }
}

/** The least index whose element does not compare less than `key`. */
function lowerBound<E>(list: ReadonlyList<E>, key: E, compare: (a: E, b: E) => -1 | 0 | 1): number {
  let low = 0
  let high = list.size
  while (low < high) {
    const mid = low + ((high - low) >>> 1)
    if (compare(list.get(mid), key) < 0) low = mid + 1
    else high = mid
  }
  return low
}

/**
 * Returns the index at which `key` would be inserted into `list`, sorted ascending by `comparator`
 * (natural order when omitted), to keep it sorted: the least index whose element does not compare
 * less than `key`, or `list.size` when every element does. The result on an unsorted list is
 * unspecified.
 *
 * Time: at most ⌈log₂(n + 1)⌉ comparator calls and as many `get` calls.
 *
 * @param list - A list sorted by `comparator`.
 * @param key - The value to place.
 * @param comparator - The order the list is sorted by; natural order when omitted.
 * @returns The insertion point, from `0` to `list.size`.
 * @throws TypeError when `list` is not a list from this library, `comparator` is not a function,
 *   or it returns a non-number or `NaN`.
 * @throws NullElementError when natural order meets `null` or `undefined`.
 * @throws ClassCastError when natural order meets values of different kinds.
 * @throws ConcurrentModificationError when the comparator changes the list.
 *
 * @example
 * ```ts
 * sortedIndex(new ArrayList([10, 20, 30]), 25) // 2
 * ```
 */
export function sortedIndex<E>(list: ReadonlyList<E>, key: E, comparator?: Comparator<E>): number {
  requireList(list, 'sortedIndex')
  requireOptionalFunction(comparator, 'sortedIndex', 'comparator')
  return lowerBound(list, key, watchedComparison(list, comparator, 'sortedIndex'))
}

/**
 * Returns the first index of `list`, sorted ascending by `comparator` (natural order when omitted),
 * whose element compares equal to `key`, or `-1` when none does. The result on an unsorted list is
 * unspecified.
 *
 * Time: at most ⌈log₂(n + 1)⌉ + 1 comparator calls and as many `get` calls.
 *
 * @param list - A list sorted by `comparator`.
 * @param key - The value to find.
 * @param comparator - The order the list is sorted by; natural order when omitted.
 * @returns The first matching index, or `-1`.
 * @throws TypeError when `list` is not a list from this library, `comparator` is not a function,
 *   or it returns a non-number or `NaN`.
 * @throws NullElementError when natural order meets `null` or `undefined`.
 * @throws ClassCastError when natural order meets values of different kinds.
 * @throws ConcurrentModificationError when the comparator changes the list.
 *
 * @example
 * ```ts
 * binarySearch(asList([1, 3, 3, 7]), 3) // 1
 * binarySearch(asList([1, 3, 3, 7]), 4) // -1
 * ```
 */
export function binarySearch<E>(list: ReadonlyList<E>, key: E, comparator?: Comparator<E>): number {
  requireList(list, 'binarySearch')
  requireOptionalFunction(comparator, 'binarySearch', 'comparator')
  const compare = watchedComparison(list, comparator, 'binarySearch')
  const index = lowerBound(list, key, compare)
  return index < list.size && compare(list.get(index), key) === 0 ? index : -1
}

/** Whether `target` occurs in `source` starting at `start`. */
function runAt(
  source: ReadonlyList<unknown>,
  target: ReadonlyList<unknown>,
  start: number,
): boolean {
  const length = target.size
  for (let k = 0; k < length; k++) {
    if (!sameValueZero(source.get(start + k), target.get(k))) return false
  }
  return true
}

/**
 * Returns the first index at which `target` occurs in `source` as a contiguous run, comparing
 * elements with SameValueZero, or `-1` when it does not occur. An empty target occurs at `0`.
 *
 * Time: O(n·m) for sizes `n` and `m`.
 *
 * @param source - The list to search.
 * @param target - The run to find.
 * @returns The first index of the run, or `-1`.
 * @throws TypeError when either argument is not a list from this library.
 *
 * @example
 * ```ts
 * indexOfSubList(asList([1, 2, 3, 2, 3]), asList([2, 3])) // 1
 * ```
 */
export function indexOfSubList(
  source: ReadonlyList<unknown>,
  target: ReadonlyList<unknown>,
): number {
  requireList(source, 'indexOfSubList', 'source')
  requireList(target, 'indexOfSubList', 'target')
  const last = source.size - target.size
  for (let start = 0; start <= last; start++) if (runAt(source, target, start)) return start
  return -1
}

/**
 * Returns the last index at which `target` occurs in `source` as a contiguous run, comparing
 * elements with SameValueZero, or `-1` when it does not occur. An empty target occurs at
 * `source.size`.
 *
 * Time: O(n·m) for sizes `n` and `m`.
 *
 * @param source - The list to search.
 * @param target - The run to find.
 * @returns The last index of the run, or `-1`.
 * @throws TypeError when either argument is not a list from this library.
 *
 * @example
 * ```ts
 * lastIndexOfSubList(asList([1, 2, 3, 2, 3]), asList([2, 3])) // 3
 * ```
 */
export function lastIndexOfSubList(
  source: ReadonlyList<unknown>,
  target: ReadonlyList<unknown>,
): number {
  requireList(source, 'lastIndexOfSubList', 'source')
  requireList(target, 'lastIndexOfSubList', 'target')
  for (let start = source.size - target.size; start >= 0; start--) {
    if (runAt(source, target, start)) return start
  }
  return -1
}

/** Reverses `[from, to)` of `list` in place through `get` and `set`. */
function reverseRange(list: List<unknown>, from: number, to: number): void {
  for (let i = from, j = to - 1; i < j; i++, j--) {
    const a = list.get(i)
    list.set(i, list.get(j))
    list.set(j, a)
  }
}

/**
 * Reverses the order of the elements of `list` in place. Elements are written with `set`, so open
 * iterators and cursors stay valid and see the new order.
 *
 * Time: O(n).
 *
 * @param list - The list to reverse.
 * @throws TypeError when `list` is not a list from this library.
 *
 * @example
 * ```ts
 * const list = new ArrayList([1, 2, 3])
 * reverse(list) // list is now [3, 2, 1]
 * ```
 */
export function reverse(list: List<unknown>): void {
  requireList(list, 'reverse')
  reverseRange(list, 0, list.size)
}

/**
 * Moves the element at index `i` of `list` to index `(i + distance)` mod `size`, in place; a
 * negative distance rotates left. Any safe integer is accepted. Elements are written with `set`,
 * so open iterators and cursors stay valid.
 *
 * Time: O(n).
 *
 * @param list - The list to rotate.
 * @param distance - How far to move each element to the right.
 * @throws TypeError when `list` is not a list from this library or `distance` is not a number.
 * @throws IllegalArgumentError when `distance` is `NaN`, infinite, fractional or not a safe
 *   integer.
 *
 * @example
 * ```ts
 * const list = new ArrayList([1, 2, 3, 4])
 * rotate(list, 1) // list is now [4, 1, 2, 3]
 * ```
 */
export function rotate(list: List<unknown>, distance: number): void {
  requireList(list, 'rotate')
  if (typeof distance !== 'number') {
    throw new TypeError(`rotate: distance is not a number (${describeValue(distance)})`)
  }
  if (!Number.isSafeInteger(distance)) {
    throw new IllegalArgumentError(
      `rotate: distance ${describeValue(distance)} is not a safe integer`,
    )
  }
  const size = list.size
  if (size <= 1) return
  const shift = ((distance % size) + size) % size
  if (shift === 0) return
  reverseRange(list, 0, size)
  reverseRange(list, 0, shift)
  reverseRange(list, shift, size)
}

/**
 * Puts the elements of `list` in a random order, in place, using the Fisher–Yates method: every
 * permutation is equally likely when `random` is uniform. `random` is called `size − 1` times and
 * must return a number in `[0, 1)`; pass a seeded generator for a repeatable order. The default,
 * `Math.random`, is not cryptographically secure. Elements are written with `set`, so open
 * iterators and cursors stay valid.
 *
 * Time: O(n).
 *
 * @param list - The list to shuffle.
 * @param random - Returns numbers in `[0, 1)`; `Math.random` when omitted.
 * @throws TypeError when `list` is not a list from this library, `random` is not a function, or it
 *   returns a non-number.
 * @throws IllegalArgumentError when `random` returns `NaN` or a value outside `[0, 1)`; the swaps
 *   made before stay.
 * @throws ConcurrentModificationError when `random` changes the list.
 *
 * @example
 * ```ts
 * const deck = new ArrayList(['a', 'b', 'c'])
 * shuffle(deck)
 * ```
 */
export function shuffle(list: List<unknown>, random?: () => number): void {
  requireList(list, 'shuffle')
  requireOptionalFunction(random, 'shuffle', 'random')
  const next = random === undefined ? defaultRandom : random
  for (let i = list.size - 1; i >= 1; i--) {
    const revision = list.revision
    const value: unknown = next()
    if (list.revision !== revision) {
      throw new ConcurrentModificationError('shuffle: the list was changed by random')
    }
    if (typeof value !== 'number') {
      throw new TypeError(`shuffle: random returned ${describeValue(value)}`)
    }
    if (!(value >= 0 && value < 1)) {
      throw new IllegalArgumentError(
        `shuffle: random returned ${describeValue(value)}, not in [0, 1)`,
      )
    }
    let j = Math.floor(value * (i + 1))
    if (j > i) j = i
    const a = list.get(i)
    list.set(i, list.get(j))
    list.set(j, a)
  }
}

/**
 * Exchanges the elements at `i` and `j` of `list`; nothing is written when `i === j`.
 *
 * Time: O(1) plus two `get` and two `set` calls.
 *
 * @param list - The list.
 * @param i - One index.
 * @param j - The other index.
 * @throws TypeError when `list` is not a list from this library.
 * @throws IndexOutOfBoundsError when either index is out of bounds; the list is unchanged.
 *
 * @example
 * ```ts
 * const list = new ArrayList(['a', 'b', 'c'])
 * swap(list, 0, 2) // list is now ['c', 'b', 'a']
 * ```
 */
export function swap(list: List<unknown>, i: number, j: number): void {
  requireList(list, 'swap')
  const size = list.size
  checkIndex(i, size, 'swap')
  checkIndex(j, size, 'swap')
  if (i === j) return
  const a = list.get(i)
  list.set(i, list.get(j))
  list.set(j, a)
}

/**
 * Sets every element of `list` to `element`, keeping its size.
 *
 * Time: O(n).
 *
 * @param list - The list.
 * @param element - The value for every position.
 * @throws TypeError when `list` is not a list from this library.
 *
 * @example
 * ```ts
 * const list = new ArrayList([1, 2, 3])
 * fill(list, 0) // list is now [0, 0, 0]
 * ```
 */
export function fill<E>(list: List<E>, element: E): void {
  requireList(list, 'fill')
  const size = list.size
  for (let i = 0; i < size; i++) list.set(i, element)
}

/** The extreme element of `elements`: `sense` −1 for the least, 1 for the greatest. */
function extreme<E>(
  elements: Iterable<E>,
  comparator: Comparator<E> | undefined,
  sense: -1 | 1,
  where: string,
): E | undefined {
  requireIterable(elements, where, 'elements')
  requireOptionalFunction(comparator, where, 'comparator')
  let best: E | undefined
  let first = true
  for (const element of elements) {
    if (first) {
      best = element
      first = false
      continue
    }
    const result =
      comparator === undefined
        ? compareNatural(element, best, where)
        : sign(comparator(element, best as E), where)
    if (result === sense) best = element
  }
  return best
}

/**
 * Returns the least element of `elements` by `comparator` (natural order when omitted), the first
 * one found among equals, or `undefined` when there is none. A single element is returned without a
 * comparison. Because `undefined` also means "empty", an input holding only `undefined` cannot be
 * told from an empty one; check `size` first when that matters.
 *
 * Time: O(n), exactly n − 1 comparator calls.
 *
 * @param elements - Any iterable.
 * @param comparator - The order; natural order when omitted.
 * @returns The least element, or `undefined`.
 * @throws TypeError when `elements` is not iterable, `comparator` is not a function, or it returns
 *   a non-number or `NaN`.
 * @throws NullElementError when natural order meets `null` or `undefined`.
 * @throws ClassCastError when natural order meets values of different kinds.
 *
 * @example
 * ```ts
 * min(new HashSet([3, 1, 2])) // 1
 * min([]) // undefined
 * ```
 */
export function min<E>(elements: Iterable<E>, comparator?: Comparator<E>): E | undefined {
  return extreme(elements, comparator, -1, 'min')
}

/**
 * Returns the greatest element of `elements` by `comparator` (natural order when omitted), the
 * first one found among equals, or `undefined` when there is none. A single element is returned
 * without a comparison.
 *
 * Time: O(n), exactly n − 1 comparator calls.
 *
 * @param elements - Any iterable.
 * @param comparator - The order; natural order when omitted.
 * @returns The greatest element, or `undefined`.
 * @throws TypeError when `elements` is not iterable, `comparator` is not a function, or it returns
 *   a non-number or `NaN`.
 * @throws NullElementError when natural order meets `null` or `undefined`.
 * @throws ClassCastError when natural order meets values of different kinds.
 *
 * @example
 * ```ts
 * max(['pear', 'apple'], (a, b) => a.length - b.length) // 'apple'
 * ```
 */
export function max<E>(elements: Iterable<E>, comparator?: Comparator<E>): E | undefined {
  return extreme(elements, comparator, 1, 'max')
}

/**
 * Returns how many elements of `elements` are SameValueZero-equal to `element`. A set's own `key`,
 * `equivalence` or comparator is not used, so `frequency(set, x)` can be `0` while `set.has(x)` is
 * `true`.
 *
 * Time: O(n).
 *
 * @param elements - Any iterable.
 * @param element - The value to count.
 * @returns The count.
 * @throws TypeError when `elements` is not iterable.
 *
 * @example
 * ```ts
 * frequency(['a', 'b', 'a'], 'a') // 2
 * ```
 */
export function frequency(elements: Iterable<unknown>, element: unknown): number {
  requireIterable(elements, 'frequency', 'elements')
  let count = 0
  for (const candidate of elements) if (sameValueZero(candidate, element)) count++
  return count
}

/**
 * Returns `true` when `a` and `b` have no element in common. When `b` is a collection from this
 * library, each element of `a` is looked up with `b.has`, so `b`'s `key`, `equivalence` or
 * comparator applies; otherwise, when `a` is one, each element of `b` is looked up with `a.has`;
 * otherwise elements are compared with SameValueZero. With collections that compare differently,
 * the answer can depend on the order of the arguments. Maps are iterated as their entries; pass
 * `map.keys()` to compare keys.
 *
 * Time: O(n + m) expected with hash lookups, O(n log m) with a sorted collection, O(n·m) with a
 * list.
 *
 * @param a - Any iterable.
 * @param b - Any iterable.
 * @returns Whether no element is in both.
 * @throws TypeError when either argument is not iterable.
 *
 * @example
 * ```ts
 * disjoint([1, 2], new HashSet([3, 4])) // true
 * ```
 */
export function disjoint(a: Iterable<unknown>, b: Iterable<unknown>): boolean {
  requireIterable(a, 'disjoint', 'a')
  requireIterable(b, 'disjoint', 'b')
  let probe: Iterable<unknown>
  let lookup: { has(value: unknown): boolean }
  if (isBranded(b, COLLECTION_BRAND)) {
    probe = a
    lookup = b as unknown as { has(value: unknown): boolean }
  } else if (isBranded(a, COLLECTION_BRAND)) {
    probe = b
    lookup = a as unknown as { has(value: unknown): boolean }
  } else {
    probe = a
    lookup = new Set<unknown>(b)
  }
  for (const element of probe) if (lookup.has(element)) return false
  return true
}
