/**
 * `TreeSet`: a set kept in sorted order, with nearest-match queries and live range views.
 *
 * @packageDocumentation
 */

import type { Comparator } from '../functions/comparators'
import type { Cursor } from '../interfaces/collection'
import type { SetCollection } from '../interfaces/set'
import type { BoundOptions, SortedSet, SubSetOptions } from '../interfaces/sorted-set'
import {
  brandedHasInstance,
  SEQUENCED_COLLECTION_BRAND,
  SET_COLLECTION_BRAND,
  SORTED_SET_BRAND,
} from '../internal/brand'
import { describeValue, isIterable } from '../internal/checks'
import { TreeSetEngine } from '../internal/engines/tree-set-engine'
import { equalsSymbol, type HashFunction, hashCodeSymbol } from '../internal/equality'
import { COLLECTION_BRAND, INSPECT } from '../internal/output'

const TREE_SET_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/TreeSet',
)

/** Options for a `TreeSet`. */
export interface TreeSetOptions<E> {
  /**
   * The order of the set; two values are the same member when it returns `0` for them. Natural
   * order (numbers, strings, bigints, booleans, dates or `[compareSymbol]` objects) when omitted.
   */
  comparator?: Comparator<E> | undefined
}

function notIterable(where: string, value: unknown): TypeError {
  const hint = typeof value === 'function' ? '; pass the comparator as { comparator }' : ''
  return new TypeError(`${where}: elements is not iterable (${describeValue(value)})${hint}`)
}

/** Throws `TypeError` unless `options` is an object (not `null`, not a function). */
function requireOptions(options: unknown, where: string): void {
  if (options === null || typeof options !== 'object') {
    throw new TypeError(`${where}: options is not an object (${describeValue(options)})`)
  }
}

/** Reads `comparator` once from checked options; it must be `undefined` or a function. */
function readComparator<E>(options: object | undefined, where: string): Comparator<E> | undefined {
  if (options === undefined) return undefined
  const comparator: unknown = (options as { comparator?: unknown }).comparator
  if (comparator !== undefined && typeof comparator !== 'function') {
    throw new TypeError(`${where}: comparator is not a function (${describeValue(comparator)})`)
  }
  return comparator as Comparator<E> | undefined
}

/** Reads every element of `elements` into a new array. */
function readElements<E>(elements: Iterable<E>): E[] {
  const items: E[] = []
  for (const element of elements) items.push(element)
  return items
}

/**
 * A set kept in sorted order, stored as a balanced binary search tree: `add`, `has`, `delete`
 * and the nearest-match queries `lower`, `floor`, `ceiling` and `higher` cost O(log n). The order
 * is the natural order of the members, or the `comparator` option.
 *
 * Membership is decided by the order alone: two values are the same member when the comparator
 * returns `0` for them, whatever their identity. Iteration, `toArray`, `toJSON` and `toString`
 * visit the members in ascending order. `subSet`, `headSet` and `tailSet` return live views of a
 * range, and `reversed()` a live view in descending order; changes through any view reach the set.
 *
 * In natural order, `null` and `undefined` cannot be added, and `has` and `delete` answer `false`
 * for them and for values of another kind, as a native `Set` does; `-0` is stored as `0`. A
 * comparator that throws or returns `NaN` leaves the set as it was. A comparator that is not a
 * consistent total order may make lookups give wrong answers, but never loses members or loops.
 * Adding or removing members while iterating throws `ConcurrentModificationError`; use a cursor
 * to remove while iterating.
 *
 * Two sets are equal when they have the same size and each has every member of the other.
 * The class is not designed to be subclassed.
 *
 * @example
 * ```ts
 * const times = new TreeSet([1030, 900, 1415])
 * times.ceiling(1000) // 1030: the next slot at or after 10:00
 * times.headSet(1030).toArray() // [900]
 *
 * const byLength = new TreeSet<string>({ comparator: (a, b) => a.length - b.length })
 * byLength.add('bb').add('a').add('cc') // 'cc' is the same member as 'bb', so it is not added
 * byLength.toArray() // ['a', 'bb']
 * ```
 *
 * @sealed
 */
export class TreeSet<E> implements SortedSet<E> {
  private readonly engine: TreeSetEngine<E>

  /**
   * Creates a set in natural order holding the distinct elements of `elements`; empty when
   * `elements` is omitted, `undefined` or `null`.
   *
   * Time: O(m) with at most m − 1 comparisons (one when m is 1 in natural
   *   order) for `m` elements in strictly ascending order;
   * O(m log m) otherwise.
   *
   * @param elements - The initial elements; of several equal ones the first is kept. The
   *   comparator of a `TreeSet` given here is not used; pass it as an option, or call `copy()`.
   * @throws TypeError when `elements` is neither iterable nor `null`/`undefined`.
   * @throws NullElementError when an element is `null` or `undefined`.
   * @throws ClassCastError when the elements cannot be compared in natural order.
   *
   * @example
   * ```ts
   * new TreeSet([3, 1, 2, 1]) // TreeSet(3) {1, 2, 3}
   * ```
   */
  constructor(elements?: Iterable<E> | null)
  /**
   * Creates an empty set with the given options.
   *
   * Time: O(1).
   *
   * @param options - The options; `comparator` is read once.
   * @throws TypeError when `comparator` is neither `undefined` nor a function.
   *
   * @example
   * ```ts
   * new TreeSet<string>({ comparator: (a, b) => b.localeCompare(a) })
   * ```
   */
  constructor(options: TreeSetOptions<E>)
  /**
   * Creates a set holding the distinct elements of `elements` (empty when `undefined` or `null`),
   * ordered by `options.comparator`, or by natural order when it is omitted.
   *
   * Time: O(m) with at most m − 1 comparisons (one when m is 1 in natural
   *   order) for `m` elements in strictly ascending order;
   * O(m log m) otherwise.
   *
   * @param elements - The initial elements; of several equal ones the first is kept.
   * @param options - The options; `comparator` is read once.
   * @throws TypeError when `elements` is neither iterable nor `null`/`undefined`, when `options`
   *   is not an object, or when `comparator` is neither `undefined` nor a function, or returns a
   *   non-number or `NaN`.
   * @throws NullElementError when, in natural order, an element is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, the elements cannot be compared.
   *
   * @example
   * ```ts
   * new TreeSet([1, 3, 2], { comparator: (a, b) => b - a }) // TreeSet(3) {3, 2, 1}
   * ```
   */
  constructor(elements: Iterable<E> | null | undefined, options?: TreeSetOptions<E>)
  constructor(
    elementsOrOptions?: Iterable<E> | TreeSetOptions<E> | null,
    options?: TreeSetOptions<E>,
  ) {
    let elements: Iterable<E> | undefined
    let settings: object | undefined
    const first: unknown = elementsOrOptions
    if (options === undefined) {
      if (first === undefined || first === null) {
        // An empty set in natural order.
      } else if (isIterable(first)) {
        elements = first as Iterable<E>
      } else if (typeof first === 'object') {
        settings = first
      } else {
        throw notIterable('TreeSet', first)
      }
    } else {
      if (first !== undefined && first !== null) {
        if (!isIterable(first)) throw notIterable('TreeSet', first)
        elements = first as Iterable<E>
      }
      requireOptions(options, 'TreeSet')
      settings = options
    }
    this.engine = new TreeSetEngine<E>(this, readComparator<E>(settings, 'TreeSet'))
    if (elements !== undefined) this.engine.build(readElements(elements), 'TreeSet')
  }

  /**
   * Returns a new set of the distinct elements of `elements`, ordered by `options.comparator`, or
   * by natural order when it is omitted. The comparator of a `TreeSet` given as `elements` is not
   * used.
   *
   * Time: O(m) with at most m − 1 comparisons (one when m is 1 in natural
   *   order) for `m` elements in strictly ascending order;
   * O(m log m) otherwise.
   *
   * @param elements - The elements; of several equal ones the first is kept.
   * @param options - The options; `comparator` is read once.
   * @returns A new set.
   * @throws TypeError when `elements` is not iterable (`null` and `undefined` included), when
   *   `options` is given and is not an object, or when `comparator` is neither `undefined` nor a
   *   function, or returns a non-number or `NaN`.
   * @throws NullElementError when, in natural order, an element is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, the elements cannot be compared.
   *
   * @example
   * ```ts
   * TreeSet.from(new Set(['b', 'a'])).getFirst() // 'a'
   * ```
   */
  static from<T>(elements: Iterable<T>, options?: TreeSetOptions<T>): TreeSet<T> {
    if (options !== undefined) requireOptions(options, 'TreeSet.from')
    const comparator = readComparator<T>(options, 'TreeSet.from')
    if (!isIterable(elements)) throw notIterable('TreeSet.from', elements)
    const set = new TreeSet<T>(null, { comparator })
    set.engine.build(readElements(elements), 'TreeSet.from')
    return set
  }

  /**
   * Returns whether `value` is a `TreeSet`, including one created by another copy of the library
   * with the same major version. Its range and reversed views are not.
   *
   * Time: O(1).
   *
   * @param value - The value on the left of `instanceof`.
   * @returns `true` when `value` is a `TreeSet`.
   *
   * @example
   * ```ts
   * new TreeSet() instanceof TreeSet // true
   * ```
   */
  static [Symbol.hasInstance](value: unknown): boolean {
    // biome-ignore lint/complexity/noThisInStatic: `this` is the class on the right of `instanceof`
    return brandedHasInstance(this, TreeSet, TREE_SET_BRAND, value)
  }

  /**
   * Marks instances of this class so `instanceof` recognises them across copies of the package.
   * Its key is not exported, so the getter is not called directly. Time: O(1).
   */
  get [TREE_SET_BRAND](): true {
    return true
  }

  /**
   * Marks sorted sets so `isSortedSet` recognises them across copies of the package. Its key is
   * not exported, so the getter is not called directly. Time: O(1).
   */
  get [SORTED_SET_BRAND](): true {
    return true
  }

  /**
   * Marks sets so `isSetCollection` recognises them across copies of the package. Its key is not
   * exported, so the getter is not called directly. Time: O(1).
   */
  get [SET_COLLECTION_BRAND](): true {
    return true
  }

  /**
   * Marks sequenced collections so `isSequencedCollection` recognises them across copies of the
   * package. Its key is not exported, so the getter is not called directly. Time: O(1).
   */
  get [SEQUENCED_COLLECTION_BRAND](): true {
    return true
  }

  /**
   * Marks collections so `isCollection` recognises them across copies of the package. Its key is
   * not exported, so the getter is not called directly. Time: O(1).
   */
  get [COLLECTION_BRAND](): true {
    return true
  }

  /** The number of members. Time: O(1). */
  get size(): number {
    return this.engine.size
  }

  /**
   * A number that changes on every change to the members and never on a read or on a call that
   * changes nothing. Its exact values are unspecified; views share it. Time: O(1).
   */
  get revision(): number {
    return this.engine.revision
  }

  /** `'TreeSet'`, for `Object.prototype.toString`. Time: O(1). */
  get [Symbol.toStringTag](): string {
    return 'TreeSet'
  }

  /**
   * Returns the comparator given at construction, or `undefined` when the set uses natural order.
   *
   * Time: O(1).
   *
   * @returns The comparator, or `undefined`.
   *
   * @example
   * ```ts
   * const byLength = (a: string, b: string) => a.length - b.length
   * new TreeSet({ comparator: byLength }).comparator() === byLength // true
   * new TreeSet().comparator() // undefined
   * ```
   */
  comparator(): Comparator<E> | undefined {
    return this.engine.comparator()
  }

  /**
   * Returns whether the set has no members.
   *
   * Time: O(1).
   *
   * @returns `size === 0`.
   *
   * @example
   * ```ts
   * new TreeSet().isEmpty() // true
   * ```
   */
  isEmpty(): boolean {
    return this.engine.isEmpty()
  }

  /**
   * Adds `element` unless a member compares equal to it (that member is kept), and returns the
   * set, so calls chain. On an error nothing is added.
   *
   * Time: O(log n), with at most 2⌈log2(n + 1)⌉ + 2 comparisons.
   *
   * @param element - The element to add (in natural order, `-0` is stored as `0`).
   * @returns The set.
   * @throws NullElementError when, in natural order, `element` is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, `element` cannot be compared with the members.
   * @throws TypeError when the comparator returns a non-number or `NaN`.
   * @throws ConcurrentModificationError when the comparator adds or removes members; the set
   *   keeps those changes and adds nothing itself.
   *
   * @example
   * ```ts
   * new TreeSet<number>().add(2).add(1).add(2) // TreeSet(2) {1, 2}
   * ```
   */
  add(element: E): this {
    this.engine.add(element)
    return this
  }

  /**
   * Returns whether a member compares equal to `element`. In natural order, `null`, `undefined`
   * and values that cannot be compared with the members give `false`.
   *
   * Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.
   *
   * @param element - The value to look for.
   * @returns `true` when present.
   * @throws TypeError when the comparator or a `[compareSymbol]` method returns a non-number or
   *   `NaN`.
   * @throws ConcurrentModificationError when the comparator adds or removes members.
   *
   * @example
   * ```ts
   * new TreeSet([1, 2]).has(2)   // true
   * new TreeSet([1, 2]).has('2') // false
   * ```
   */
  has(element: E): boolean {
    return this.engine.has(element)
  }

  /**
   * Removes the member that compares equal to `element`. In natural order, `null`, `undefined` and
   * values that cannot be compared with the members remove nothing.
   *
   * Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.
   *
   * @param element - The value to remove.
   * @returns `true` when a member was removed.
   * @throws TypeError when the comparator or a `[compareSymbol]` method returns a non-number or
   *   `NaN`.
   * @throws ConcurrentModificationError when the comparator adds or removes members; the set
   *   removes nothing itself.
   *
   * @example
   * ```ts
   * new TreeSet([1, 2]).delete(1) // true
   * ```
   */
  delete(element: E): boolean {
    return this.engine.delete(element)
  }

  /**
   * Adds every element of `elements`, in order, after reading them all and, in natural order,
   * checking that none is `null` or `undefined` (if one is, nothing is added). If a comparison
   * fails part-way, the elements added before it stay.
   *
   * Time: O(m log(n + m)) for `m` elements.
   *
   * @param elements - The elements to add.
   * @returns `true` when any element was added.
   * @throws TypeError when `elements` is not iterable, or the comparator returns a non-number or
   *   `NaN`.
   * @throws NullElementError when, in natural order, an element is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, an element cannot be compared.
   * @throws ConcurrentModificationError when the comparator adds or removes members.
   *
   * @example
   * ```ts
   * new TreeSet([1]).addAll([1, 2]) // true
   * ```
   */
  addAll(elements: Iterable<E>): boolean {
    return this.engine.addAll(elements)
  }

  /**
   * Removes every member that compares equal to an element of `elements`. The elements are read
   * and each is looked up first; an error while looking up removes nothing.
   *
   * Time: O((n + m) log n) for `m` elements.
   *
   * @param elements - The elements to remove.
   * @returns `true` when any member was removed.
   * @throws TypeError when `elements` is not iterable, or the comparator returns a non-number or
   *   `NaN`.
   * @throws ConcurrentModificationError when the comparator adds or removes members.
   *
   * @example
   * ```ts
   * new TreeSet([1, 2, 3]).removeAll([2, 9]) // true; TreeSet(2) {1, 3}
   * ```
   */
  removeAll(elements: Iterable<E>): boolean {
    return this.engine.removeAll(elements)
  }

  /**
   * Removes every member that compares equal to no element of `elements`, as `removeAll` decides.
   *
   * Time: O((n + m) log n) for `m` elements.
   *
   * @param elements - The elements to keep.
   * @returns `true` when any member was removed.
   * @throws TypeError when `elements` is not iterable, or the comparator returns a non-number or
   *   `NaN`.
   * @throws ConcurrentModificationError when the comparator adds or removes members.
   *
   * @example
   * ```ts
   * new TreeSet([1, 2, 3]).retainAll([2]) // true; TreeSet(1) {2}
   * ```
   */
  retainAll(elements: Iterable<E>): boolean {
    return this.engine.retainAll(elements)
  }

  /**
   * Removes every member for which `predicate` returns a truthy value. Every member is decided
   * first; if `predicate` throws, or adds or removes members, nothing is removed.
   *
   * Time: O(n log n) plus the calls.
   *
   * @param predicate - Called with each member, in order.
   * @returns `true` when any member was removed.
   * @throws TypeError when `predicate` is not a function.
   * @throws ConcurrentModificationError when `predicate` adds or removes members.
   *
   * @example
   * ```ts
   * new TreeSet([1, 2, 3, 4]).removeIf((n) => n % 2 === 0) // true; TreeSet(2) {1, 3}
   * ```
   */
  removeIf(predicate: (element: E) => unknown): boolean {
    return this.engine.removeIf(predicate)
  }

  /**
   * Removes every member.
   *
   * Time: O(1).
   *
   * @example
   * ```ts
   * set.clear() // set.size === 0
   * ```
   */
  clear(): void {
    this.engine.clear()
  }

  /**
   * Returns the least member. The comparator is not called.
   *
   * Time: O(log n).
   *
   * @returns The least member.
   * @throws NoSuchElementError when the set is empty.
   *
   * @example
   * ```ts
   * new TreeSet([2, 1]).getFirst() // 1
   * ```
   */
  getFirst(): E {
    return this.engine.getFirst()
  }

  /**
   * Returns the greatest member. The comparator is not called.
   *
   * Time: O(log n).
   *
   * @returns The greatest member.
   * @throws NoSuchElementError when the set is empty.
   *
   * @example
   * ```ts
   * new TreeSet([2, 1]).getLast() // 2
   * ```
   */
  getLast(): E {
    return this.engine.getLast()
  }

  /**
   * Removes and returns the least member. The comparator is not called.
   *
   * Time: O(log n).
   *
   * @returns The removed member.
   * @throws NoSuchElementError when the set is empty.
   *
   * @example
   * ```ts
   * new TreeSet([2, 1]).removeFirst() // 1
   * ```
   */
  removeFirst(): E {
    return this.engine.removeFirst()
  }

  /**
   * Removes and returns the greatest member. The comparator is not called.
   *
   * Time: O(log n).
   *
   * @returns The removed member.
   * @throws NoSuchElementError when the set is empty.
   *
   * @example
   * ```ts
   * new TreeSet([2, 1]).removeLast() // 2
   * ```
   */
  removeLast(): E {
    return this.engine.removeLast()
  }

  /**
   * Always throws: a sorted set places each member by its order. Use `add`.
   *
   * Time: O(1).
   *
   * @param element - Ignored.
   * @returns Never returns.
   * @throws UnsupportedOperationError always.
   *
   * @example
   * ```ts
   * new TreeSet([2]).addFirst(1) // throws UnsupportedOperationError
   * ```
   */
  addFirst(element: E): this {
    this.engine.addFirst(element)
    return this
  }

  /**
   * Always throws: a sorted set places each member by its order. Use `add`.
   *
   * Time: O(1).
   *
   * @param element - Ignored.
   * @returns Never returns.
   * @throws UnsupportedOperationError always.
   *
   * @example
   * ```ts
   * new TreeSet([2]).addLast(3) // throws UnsupportedOperationError
   * ```
   */
  addLast(element: E): this {
    this.engine.addLast(element)
    return this
  }

  /**
   * Removes and returns the least member, or returns `undefined` when the set is empty. The
   * comparator is not called.
   *
   * Time: O(log n).
   *
   * @returns The removed member, or `undefined`.
   *
   * @example
   * ```ts
   * new TreeSet([2, 1]).pollFirst() // 1
   * new TreeSet().pollFirst()       // undefined
   * ```
   */
  pollFirst(): E | undefined {
    return this.engine.pollFirst()
  }

  /**
   * Removes and returns the greatest member, or returns `undefined` when the set is empty. The
   * comparator is not called.
   *
   * Time: O(log n).
   *
   * @returns The removed member, or `undefined`.
   *
   * @example
   * ```ts
   * new TreeSet([2, 1]).pollLast() // 2
   * ```
   */
  pollLast(): E | undefined {
    return this.engine.pollLast()
  }

  /**
   * Returns the greatest member less than `element`, or `undefined` when there is none.
   *
   * Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.
   *
   * @param element - The value to search from; it need not be a member.
   * @returns The member, or `undefined`.
   * @throws NullElementError when, in natural order, `element` is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, `element` cannot be compared with the members.
   * @throws TypeError when the comparator returns a non-number or `NaN`.
   * @throws ConcurrentModificationError when the comparator adds or removes members.
   *
   * @example
   * ```ts
   * new TreeSet([1, 3, 5]).lower(3) // 1
   * ```
   */
  lower(element: E): E | undefined {
    return this.engine.lower(element)
  }

  /**
   * Returns the greatest member less than or equal to `element`, or `undefined` when there is none.
   *
   * Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.
   *
   * @param element - The value to search from; it need not be a member.
   * @returns The member, or `undefined`.
   * @throws NullElementError when, in natural order, `element` is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, `element` cannot be compared with the members.
   * @throws TypeError when the comparator returns a non-number or `NaN`.
   * @throws ConcurrentModificationError when the comparator adds or removes members.
   *
   * @example
   * ```ts
   * new TreeSet([1, 3, 5]).floor(4) // 3
   * ```
   */
  floor(element: E): E | undefined {
    return this.engine.floor(element)
  }

  /**
   * Returns the least member greater than or equal to `element`, or `undefined` when there is none.
   *
   * Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.
   *
   * @param element - The value to search from; it need not be a member.
   * @returns The member, or `undefined`.
   * @throws NullElementError when, in natural order, `element` is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, `element` cannot be compared with the members.
   * @throws TypeError when the comparator returns a non-number or `NaN`.
   * @throws ConcurrentModificationError when the comparator adds or removes members.
   *
   * @example
   * ```ts
   * new TreeSet([1, 3, 5]).ceiling(4) // 5
   * ```
   */
  ceiling(element: E): E | undefined {
    return this.engine.ceiling(element)
  }

  /**
   * Returns the least member greater than `element`, or `undefined` when there is none.
   *
   * Time: O(log n), with at most 2⌈log2(n + 1)⌉ comparisons.
   *
   * @param element - The value to search from; it need not be a member.
   * @returns The member, or `undefined`.
   * @throws NullElementError when, in natural order, `element` is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, `element` cannot be compared with the members.
   * @throws TypeError when the comparator returns a non-number or `NaN`.
   * @throws ConcurrentModificationError when the comparator adds or removes members.
   *
   * @example
   * ```ts
   * new TreeSet([1, 3, 5]).higher(3) // 5
   * ```
   */
  higher(element: E): E | undefined {
    return this.engine.higher(element)
  }

  /**
   * Returns a live view of the members from `from` to `to`: `from` included and `to` excluded
   * unless the options say otherwise. Changes through the view reach this set; adding a value
   * outside the range through the view throws `IllegalArgumentError`. The view's `size` counts
   * its members.
   *
   * Time: O(log n) to create; the view's operations cost O(log n), its `size` O(k + log n) for
   * `k` members in range.
   *
   * @param from - The low end of the range.
   * @param to - The high end of the range.
   * @param options - `fromInclusive` (default `true`) and `toInclusive` (default `false`); read
   *   once; `undefined` or `null` for the defaults.
   * @returns The view, tagged `TreeSubSet`.
   * @throws TypeError when `options` is not an object, `undefined` or `null`, or a flag is neither
   *   `undefined` nor a boolean.
   * @throws IllegalArgumentError when `from` is after `to`.
   * @throws NullElementError when, in natural order, a bound is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, a bound cannot be compared with the members.
   *
   * @example
   * ```ts
   * const set = new TreeSet([1, 2, 3, 4, 5])
   * set.subSet(2, 4).toArray()                        // [2, 3]
   * set.subSet(2, 4, { toInclusive: true }).toArray() // [2, 3, 4]
   * ```
   */
  subSet(from: E, to: E, options?: SubSetOptions | null): SortedSet<E> {
    return this.engine.subSet(from, to, options)
  }

  /**
   * Returns a live view of the members less than `to` (or equal, with `inclusive: true`). Changes
   * through the view reach this set.
   *
   * Time: O(log n) to create; as `subSet` for the view's operations.
   *
   * @param to - The high end of the range.
   * @param options - `inclusive` (default `false`); read once; `undefined` or `null` for the
   *   default.
   * @returns The view, tagged `TreeSubSet`.
   * @throws TypeError when `options` is not an object, `undefined` or `null`, or `inclusive` is
   *   neither `undefined` nor a boolean.
   * @throws NullElementError when, in natural order, `to` is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, `to` cannot be compared with the members.
   *
   * @example
   * ```ts
   * new TreeSet([1, 2, 3]).headSet(3).toArray() // [1, 2]
   * ```
   */
  headSet(to: E, options?: BoundOptions | null): SortedSet<E> {
    return this.engine.headSet(to, options)
  }

  /**
   * Returns a live view of the members greater than or equal to `from` (or greater only, with
   * `inclusive: false`). Changes through the view reach this set.
   *
   * Time: O(log n) to create; as `subSet` for the view's operations.
   *
   * @param from - The low end of the range.
   * @param options - `inclusive` (default `true`); read once; `undefined` or `null` for the
   *   default.
   * @returns The view, tagged `TreeSubSet`.
   * @throws TypeError when `options` is not an object, `undefined` or `null`, or `inclusive` is
   *   neither `undefined` nor a boolean.
   * @throws NullElementError when, in natural order, `from` is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, `from` cannot be compared with the members.
   *
   * @example
   * ```ts
   * new TreeSet([1, 2, 3]).tailSet(2).toArray() // [2, 3]
   * ```
   */
  tailSet(from: E, options?: BoundOptions | null): SortedSet<E> {
    return this.engine.tailSet(from, options)
  }

  /**
   * Returns a live view of this set in descending order: its `lower` is this set's `higher`, its
   * first member this set's last, and its ranges run from greater to lesser. Reversing the view
   * returns this set.
   *
   * Time: O(1).
   *
   * @returns The view, tagged `ReversedTreeSet`.
   *
   * @example
   * ```ts
   * const set = new TreeSet([1, 2, 3])
   * set.reversed().toArray()         // [3, 2, 1]
   * set.reversed().reversed() === set // true
   * ```
   */
  reversed(): SortedSet<E> {
    return this.engine.reversed()
  }

  /**
   * Returns an iterator over the members in ascending order, as `values()` does.
   *
   * Time: O(log n) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
   * @throws ConcurrentModificationError (from `next()`) when members are added or removed after
   *   the iterator is created, other than through a cursor of its own.
   *
   * @example
   * ```ts
   * [...new TreeSet(['b', 'a']).keys()] // ['a', 'b']
   * ```
   */
  keys(): IterableIterator<E> {
    return this.engine.keys()
  }

  /**
   * Returns an iterator over the members in ascending order.
   *
   * Time: O(log n) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
   * @throws ConcurrentModificationError (from `next()`) when members are added or removed after
   *   the iterator is created.
   *
   * @example
   * ```ts
   * [...new TreeSet(['b', 'a']).values()] // ['a', 'b']
   * ```
   */
  values(): IterableIterator<E> {
    return this.engine.values()
  }

  /**
   * Returns an iterator over `[member, member]` pairs in ascending order, as native `Set` does.
   *
   * Time: O(log n) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
   * @throws ConcurrentModificationError (from `next()`) when members are added or removed after
   *   the iterator is created.
   *
   * @example
   * ```ts
   * [...new TreeSet(['a']).entries()] // [['a', 'a']]
   * ```
   */
  entries(): IterableIterator<[E, E]> {
    return this.engine.entries()
  }

  /**
   * Calls `action(member, member, set)` for each member in ascending order, with `this` set to
   * `thisArg`, as native `Set` does.
   *
   * Time: O(n) plus the calls.
   *
   * @param action - Called with each member twice and the set.
   * @param thisArg - The `this` value for `action`.
   * @throws TypeError when `action` is not a function.
   * @throws ConcurrentModificationError when `action` adds or removes members.
   *
   * @example
   * ```ts
   * new TreeSet(['b', 'a']).forEach((tag) => console.log(tag)) // a, then b
   * ```
   */
  forEach(action: (element: E, same: E, set: SetCollection<E>) => void, thisArg?: unknown): void {
    this.engine.forEach(action, thisArg)
  }

  /**
   * Returns an iterator over the members in ascending order.
   *
   * Time: O(log n) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
   * @throws ConcurrentModificationError (from `next()`) when members are added or removed after
   *   the iterator is created, including through a cursor.
   *
   * @example
   * ```ts
   * for (const n of new TreeSet([2, 1])) console.log(n) // 1, then 2
   * ```
   */
  [Symbol.iterator](): IterableIterator<E> {
    return this.engine[Symbol.iterator]()
  }

  /**
   * Returns a cursor over the members in ascending order; `remove()` removes the member `next()`
   * returned without calling the comparator. For descending order, use `reversed().cursor()`.
   *
   * Time: O(log n) to create; `next` O(1) amortised; `remove` O(log n).
   *
   * @returns A new cursor.
   *
   * @example
   * ```ts
   * const cursor = set.cursor()
   * while (cursor.hasNext()) if (cursor.next() < 0) cursor.remove()
   * ```
   */
  cursor(): Cursor<E> {
    return this.engine.cursor()
  }

  /**
   * Returns a new array of the members in ascending order.
   *
   * Time: O(n).
   *
   * @returns A new array.
   *
   * @example
   * ```ts
   * new TreeSet([2, 1]).toArray() // [1, 2]
   * ```
   */
  toArray(): E[] {
    return this.engine.toArray()
  }

  /**
   * Returns a new `TreeSet` with the same members and the same comparator, independent of this
   * one (the members themselves are not copied). The comparator is not called.
   *
   * Time: O(n).
   *
   * @returns The copy.
   *
   * @example
   * ```ts
   * const copy = set.copy()
   * copy.add(9) // set is unchanged
   * ```
   */
  copy(): TreeSet<E> {
    const copy = new TreeSet<E>(null, { comparator: this.engine.comparator() })
    copy.engine.copyFrom(this.engine)
    return copy
  }

  /**
   * Returns whether `other` is a set of the same size in which every member of this set is
   * present, and which has every member of this set — so a `TreeSet` equals a `HashSet` with the
   * same members, and the answer is the same both ways round. Lists, queues, arrays and native
   * `Set` are never equal to it.
   *
   * Time: O(n log n), plus the `has` calls on `other`.
   *
   * @param other - Any value.
   * @returns `true` when `other` is an equal set.
   *
   * @example
   * ```ts
   * new TreeSet([1, 2]).equals(new HashSet([2, 1])) // true
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
   * The value-equality protocol: an order-independent combination of the members' hashes through
   * `hash`. Equal sets get the same value when their comparators treat as equal only values `hash`
   * hashes alike, as natural order does for primitives. Values are unspecified.
   * Time: O(n) plus the `hash` calls.
   */
  [hashCodeSymbol](hash: HashFunction): number {
    return this.engine[hashCodeSymbol](hash)
  }

  /**
   * Returns the class name, size and members in ascending order, e.g. `TreeSet(2) {1, 2}`.
   *
   * Time: O(length of the output) for flat contents.
   *
   * @returns The text.
   *
   * @example
   * ```ts
   * String(new TreeSet([2, 1])) // 'TreeSet(2) {1, 2}'
   * ```
   */
  toString(): string {
    return this.engine.toString()
  }

  /**
   * Returns a new array of the members in ascending order, so `JSON.stringify` writes the set as
   * an array.
   *
   * Time: O(n).
   *
   * @returns A new array.
   *
   * @example
   * ```ts
   * JSON.stringify(new TreeSet([2, 1])) // '[1,2]'
   * ```
   */
  toJSON(): E[] {
    return this.engine.toJSON()
  }

  /** Node's inspect hook: `TreeSet(2) { 1, 2 }` in `console.log`. Time: as `toString`. */
  [INSPECT](
    depth: number | null,
    options: object,
    inspect: (value: unknown, options: object) => string,
  ): string {
    return this.engine[INSPECT](depth, options, inspect)
  }
}
