/**
 * `HashSet`: a set that behaves like native `Set` and can compare members by value.
 *
 * @packageDocumentation
 */

import type { Cursor } from '../interfaces/collection'
import type { SetCollection } from '../interfaces/set'
import { brandedHasInstance, SET_COLLECTION_BRAND } from '../internal/brand'
import { describeValue, isIterable } from '../internal/checks'
import { HashSetEngine } from '../internal/engines/hash-set-engine'
import { readEquality } from '../internal/engines/hash-support'
import {
  type Equivalence,
  equalsSymbol,
  type HashFunction,
  hashCodeSymbol,
  type KeyOf,
} from '../internal/equality'
import { COLLECTION_BRAND, INSPECT } from '../internal/output'

const HASH_SET_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/HashSet',
)

/**
 * Options for a `HashSet`. At most one of `key` and `equivalence` may be given; with neither, members
 * compare with SameValueZero, as in native `Set`.
 *
 * @example
 * ```ts
 * const byId: HashSetOptions<{ id: number }> = { key: (user) => user.id }
 * const byValue: HashSetOptions<Point> = { equivalence: valueEquivalence }
 * ```
 */
export interface HashSetOptions<E> {
  /**
   * Derives the primitive key a member is found by; two values are the same member when their keys
   * are SameValueZero-equal. Called once per value per operation, never again for a stored member.
   */
  key?: KeyOf<E>
  /**
   * Decides membership by its `equals` and `hash`. `valueEquivalence` honours the
   * `equalsSymbol`/`hashCodeSymbol` protocol; `sameValueZeroEquivalence` is the default behaviour.
   */
  equivalence?: Equivalence<E>
}

function notIterable(where: string, value: unknown): TypeError {
  return new TypeError(`${where}: elements is not iterable (${describeValue(value)})`)
}

/**
 * A set that behaves like native `Set` — insertion order, SameValueZero membership (`NaN` is one
 * member, `-0` is stored as `0`), `add` returning the set, live iteration — and adds value
 * equality on request, structural `equals`, and the shared collection API (`removeIf`,
 * `removeAll`, `retainAll`, cursors, `toJSON`).
 *
 * Give a `key` function to treat values with the same derived key as one member, or an
 * `equivalence` (such as `valueEquivalence`) to decide membership by its `equals` and `hash`.
 * The original values are stored and returned, never the keys. `null` and `undefined` are allowed.
 *
 * Iteration is live, as with native `Set`: members deleted before they are reached are skipped,
 * members added during iteration are visited, and nothing throws `ConcurrentModificationError`.
 * Changing a member's key or hash while it is in the set leaves lookups for it unspecified; it can
 * still be removed by a cursor, `removeIf` or `clear`.
 *
 * Two sets are equal when they have the same size and each has every member of the other, in any
 * order. The class is not designed to be subclassed.
 *
 * @example
 * ```ts
 * const tags = new HashSet(['a', 'b'])
 * tags.add('a').add('c') // HashSet(3) {'a', 'b', 'c'}
 *
 * const users = new HashSet<{ id: number }>({ key: (user) => user.id })
 * users.add({ id: 1 }).add({ id: 1 })
 * users.size // 1
 * ```
 *
 * @sealed
 */
export class HashSet<E> implements SetCollection<E> {
  private engine: HashSetEngine<E>

  /**
   * Creates a set holding each distinct element of `elements` once, in first-seen order; empty
   * when `elements` is omitted, `undefined` or `null` (as `new Set(null)` is). A string is
   * iterable, so `new HashSet('ab')` holds `'a'` and `'b'`.
   *
   * Time: O(m) average for `m` elements, plus the `key` or `equivalence` calls.
   *
   * @param elements - The initial elements.
   * @param options - `key` or `equivalence`; `null` means none.
   * @throws TypeError when `elements` is neither iterable nor `null`/`undefined`, when `options`
   *   is not an object, when both `key` and `equivalence` are given, when `key` is not a function,
   *   or when `equivalence` lacks an `equals` or `hash` function.
   *
   * @example
   * ```ts
   * new HashSet([1, 2, 1]) // HashSet(2) {1, 2}
   * new HashSet(points, { equivalence: valueEquivalence })
   * ```
   */
  constructor(elements?: Iterable<E> | null, options?: HashSetOptions<E> | null)
  /**
   * Creates an empty set with the given options.
   *
   * Time: O(1).
   *
   * @param options - `key` or `equivalence`.
   * @throws TypeError when both `key` and `equivalence` are given, when `key` is not a function,
   *   or when `equivalence` lacks an `equals` or `hash` function.
   *
   * @example
   * ```ts
   * const byName = new HashSet<{ name: string }>({ key: (item) => item.name })
   * ```
   */
  constructor(options: HashSetOptions<E>)
  constructor(
    elementsOrOptions?: Iterable<E> | HashSetOptions<E> | null,
    options?: HashSetOptions<E> | null,
  ) {
    let elements: Iterable<E> | undefined
    let given: unknown = options
    const first: unknown = elementsOrOptions
    if (first === undefined || first === null) {
      // empty
    } else if (isIterable(first)) {
      elements = first as Iterable<E>
    } else if (typeof first === 'object' && (options === undefined || options === null)) {
      given = first
    } else {
      throw notIterable('HashSet', first)
    }
    this.engine = new HashSetEngine<E>(this, readEquality<E>(given, 'HashSet'))
    if (elements !== undefined) this.engine.addInitial(elements, 'HashSet')
  }

  /**
   * Returns a new set of the distinct elements of `elements`, in first-seen order, with the given
   * options.
   *
   * Time: O(m) average for `m` elements, plus the `key` or `equivalence` calls.
   *
   * @param elements - The elements.
   * @param options - `key` or `equivalence`; `null` means none.
   * @returns A new set.
   * @throws TypeError when `elements` is not iterable (`null` and `undefined` included), or the
   *   options are invalid (as for the constructor).
   *
   * @example
   * ```ts
   * HashSet.from(['a', 'A'], { key: (s) => s.toLowerCase() }) // HashSet(1) {'a'}
   * ```
   */
  static from<T>(elements: Iterable<T>, options?: HashSetOptions<T> | null): HashSet<T> {
    if (!isIterable(elements)) throw notIterable('HashSet.from', elements)
    const set = new HashSet<T>()
    set.engine = new HashSetEngine<T>(set, readEquality<T>(options, 'HashSet.from'))
    set.engine.addInitial(elements, 'HashSet.from')
    return set
  }

  /**
   * Returns whether `value` is a `HashSet`, including one created by another copy of the library
   * with the same major version.
   *
   * Time: O(1).
   *
   * @param value - The value on the left of `instanceof`.
   * @returns `true` when `value` is a `HashSet`.
   *
   * @example
   * ```ts
   * new HashSet() instanceof HashSet // true
   * ```
   */
  static [Symbol.hasInstance](value: unknown): boolean {
    // biome-ignore lint/complexity/noThisInStatic: `this` is the class on the right of `instanceof`
    return brandedHasInstance(this, HashSet, HASH_SET_BRAND, value)
  }

  /**
   * Marks instances of this class so `instanceof` recognises them across copies of the package.
   * Its key is not exported, so the getter is not called directly. Time: O(1).
   */
  get [HASH_SET_BRAND](): true {
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
   * changes nothing. Its exact values are unspecified. Time: O(1).
   */
  get revision(): number {
    return this.engine.revision
  }

  /** `'HashSet'`, for `Object.prototype.toString`. Time: O(1). */
  get [Symbol.toStringTag](): string {
    return 'HashSet'
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
   * new HashSet().isEmpty() // true
   * ```
   */
  isEmpty(): boolean {
    return this.engine.isEmpty()
  }

  /**
   * Adds `element` unless a member equals it, and returns the set, so calls chain. A member already
   * present keeps its value and its place in the order.
   *
   * Time: O(1) average, plus one `key` or `hash` call and the `equals` calls.
   *
   * @param element - The element to add (`-0` is stored as `0`).
   * @returns The set.
   * @throws TypeError when `key` returns an object or a function, `equivalence.equals` returns a
   *   non-boolean or `equivalence.hash` a non-finite number.
   * @throws ConcurrentModificationError when a `key`, `equals` or `hash` function adds or removes
   *   members; the set keeps those changes and adds nothing itself.
   *
   * @example
   * ```ts
   * new HashSet<number>().add(1).add(1).add(2) // HashSet(2) {1, 2}
   * ```
   */
  add(element: E): this {
    this.engine.add(element)
    return this
  }

  /**
   * Returns whether a member equals `element`.
   *
   * Time: O(1) average, plus one `key` or `hash` call and the `equals` calls.
   *
   * @param element - The value to look for.
   * @returns `true` when a member equals it.
   * @throws TypeError when `key`, `equals` or `hash` returns an invalid result (as for `add`).
   * @throws ConcurrentModificationError when a `key`, `equals` or `hash` function adds or removes
   *   members.
   *
   * @example
   * ```ts
   * new HashSet([Number.NaN]).has(Number.NaN) // true
   * ```
   */
  has(element: E): boolean {
    return this.engine.has(element)
  }

  /**
   * Removes the member equal to `element`.
   *
   * Time: O(1) average, plus one `key` or `hash` call and the `equals` calls.
   *
   * @param element - The value to remove.
   * @returns `true` when a member was removed.
   * @throws TypeError when `key`, `equals` or `hash` returns an invalid result (as for `add`).
   * @throws ConcurrentModificationError when a `key`, `equals` or `hash` function adds or removes
   *   members; the set removes nothing itself.
   *
   * @example
   * ```ts
   * new HashSet([1, 2]).delete(1) // true
   * ```
   */
  delete(element: E): boolean {
    return this.engine.delete(element)
  }

  /**
   * Adds every element of `elements`, in order, after reading them all. Elements added before an
   * error stay.
   *
   * Time: O(m) average for `m` elements, plus the calls.
   *
   * @param elements - The elements to add.
   * @returns `true` when any element was added.
   * @throws TypeError when `elements` is not iterable, or a function returns an invalid result.
   * @throws ConcurrentModificationError when a `key`, `equals` or `hash` function adds or removes
   *   members.
   *
   * @example
   * ```ts
   * new HashSet([1]).addAll([1, 2]) // true
   * ```
   */
  addAll(elements: Iterable<E>): boolean {
    return this.engine.addAll(elements)
  }

  /**
   * Removes every member equal, under this set's equality, to an element of `elements`. The
   * elements are read first and looked up through a temporary index built with this set's `key`
   * or `equivalence`; an error while deciding removes nothing.
   *
   * Time: O(n + m) average, plus one `key` or `hash` call per element and the `equals` calls.
   *
   * @param elements - The elements to remove.
   * @returns `true` when any member was removed.
   * @throws TypeError when `elements` is not iterable, or a function returns an invalid result.
   * @throws ConcurrentModificationError when a `key`, `equals` or `hash` function adds or removes
   *   members.
   *
   * @example
   * ```ts
   * new HashSet([1, 2, 3]).removeAll([2, 9]) // true; HashSet(2) {1, 3}
   * ```
   */
  removeAll(elements: Iterable<E>): boolean {
    return this.engine.removeAll(elements)
  }

  /**
   * Removes every member not equal, under this set's equality, to an element of `elements`, as
   * `removeAll` decides.
   *
   * Time: O(n + m) average, plus one `key` or `hash` call per element and the `equals` calls.
   *
   * @param elements - The elements to keep.
   * @returns `true` when any member was removed.
   * @throws TypeError when `elements` is not iterable, or a function returns an invalid result.
   * @throws ConcurrentModificationError when a `key`, `equals` or `hash` function adds or removes
   *   members.
   *
   * @example
   * ```ts
   * new HashSet([1, 2, 3]).retainAll([2]) // true; HashSet(1) {2}
   * ```
   */
  retainAll(elements: Iterable<E>): boolean {
    return this.engine.retainAll(elements)
  }

  /**
   * Removes every member for which `predicate` returns a truthy value. Every member is decided
   * first; if `predicate` throws, or adds or removes members, nothing is removed.
   *
   * Time: O(n) plus the calls.
   *
   * @param predicate - Called with each member.
   * @returns `true` when any member was removed.
   * @throws TypeError when `predicate` is not a function.
   * @throws ConcurrentModificationError when `predicate` adds or removes members.
   *
   * @example
   * ```ts
   * new HashSet([1, 2, 3, 4]).removeIf((n) => n % 2 === 0) // true; HashSet(2) {1, 3}
   * ```
   */
  removeIf(predicate: (element: E) => unknown): boolean {
    return this.engine.removeIf(predicate)
  }

  /**
   * Removes every member. An open iteration ends, and members added afterwards are visited, as
   * with native `Set`.
   *
   * Time: O(1) with an `equivalence`; one native `clear` otherwise (at most O(n)).
   *
   * @example
   * ```ts
   * const set = new HashSet([1, 2])
   * set.clear()
   * set.size // 0
   * ```
   */
  clear(): void {
    this.engine.clear()
  }

  /**
   * Returns an iterator over the members in insertion order, as `values()` does.
   *
   * Time: O(1) to create; O(1) per step.
   *
   * @returns A new live iterator.
   *
   * @example
   * ```ts
   * [...new HashSet(['a', 'b']).keys()] // ['a', 'b']
   * ```
   */
  keys(): IterableIterator<E> {
    return this.engine.keys()
  }

  /**
   * Returns an iterator over the members in insertion order.
   *
   * Time: O(1) to create; O(1) per step.
   *
   * @returns A new live iterator.
   *
   * @example
   * ```ts
   * [...new HashSet(['a', 'b']).values()] // ['a', 'b']
   * ```
   */
  values(): IterableIterator<E> {
    return this.engine.values()
  }

  /**
   * Returns an iterator over `[member, member]` pairs in insertion order, as native `Set` does.
   *
   * Time: O(1) to create; O(1) per step.
   *
   * @returns A new live iterator.
   *
   * @example
   * ```ts
   * [...new HashSet(['a']).entries()] // [['a', 'a']]
   * ```
   */
  entries(): IterableIterator<[E, E]> {
    return this.engine.entries()
  }

  /**
   * Calls `action(member, member, set)` for each member in insertion order, with `this` set to
   * `thisArg`, as native `Set` does. Members deleted before they are reached are skipped; members
   * added during the loop are visited.
   *
   * Time: O(n) plus the calls.
   *
   * @param action - Called with each member twice and the set.
   * @param thisArg - The `this` value for `action`.
   * @throws TypeError when `action` is not a function.
   *
   * @example
   * ```ts
   * new HashSet(['a', 'b']).forEach((tag) => console.log(tag))
   * ```
   */
  forEach(action: (element: E, same: E, set: SetCollection<E>) => void, thisArg?: unknown): void {
    this.engine.forEach(action, thisArg)
  }

  /**
   * Returns an iterator over the members in insertion order. It is live, as a native `Set`
   * iterator is: deleted members not yet reached are skipped, added members are visited, and
   * `clear()` ends it.
   *
   * Time: O(1) to create; O(1) per step.
   *
   * @returns A new live iterator.
   *
   * @example
   * ```ts
   * for (const tag of new HashSet(['a', 'b'])) console.log(tag)
   * ```
   */
  [Symbol.iterator](): IterableIterator<E> {
    return this.engine[Symbol.iterator]()
  }

  /**
   * Returns a live cursor in insertion order; `remove()` removes the member `next()` returned,
   * without calling `key`, `equals` or `hash` while that member is still stored. A member
   * `hasNext()` has reached is returned even if it was deleted meanwhile.
   *
   * Time: O(1) to create; `next` O(1); `remove` O(1) average.
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
   * Returns a new array of the members in insertion order.
   *
   * Time: O(n).
   *
   * @returns A new array.
   *
   * @example
   * ```ts
   * new HashSet([2, 1, 2]).toArray() // [2, 1]
   * ```
   */
  toArray(): E[] {
    return this.engine.toArray()
  }

  /**
   * Returns a new `HashSet` with the same members, order and `key` or `equivalence`, independent
   * of this one. Stored keys and hashes are copied; no user function is called.
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
  copy(): HashSet<E> {
    const set = new HashSet<E>()
    set.engine = this.engine.copy(set)
    return set
  }

  /**
   * Returns whether `other` is a set of the same size in which every member of this set is
   * present, and which has every member of this set — whatever the insertion order, and the same
   * both ways round. Lists, queues, maps, arrays and native `Set` are never equal to it.
   *
   * Time: O(n) average, plus the `has` calls on both sets.
   *
   * @param other - Any value.
   * @returns `true` when `other` is an equal set.
   *
   * @example
   * ```ts
   * new HashSet([1, 2]).equals(new HashSet([2, 1])) // true
   * new HashSet([1, 2]).equals(new Set([1, 2]))     // false
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
   * The value-equality protocol: an order-independent combination of the members' hashes, the
   * same for equal sets that use the same `key` function, the same `equivalence`, or neither.
   * Values are unspecified. Time: O(n) plus the `hash` calls.
   */
  [hashCodeSymbol](hash: HashFunction): number {
    return this.engine[hashCodeSymbol](hash)
  }

  /**
   * Returns the class name, size and members in insertion order, e.g. `HashSet(2) {1, 'a'}`.
   *
   * Time: O(length of the output) for flat contents.
   *
   * @returns The text.
   *
   * @example
   * ```ts
   * String(new HashSet([1, 'a'])) // "HashSet(2) {1, 'a'}"
   * ```
   */
  toString(): string {
    return this.engine.toString()
  }

  /**
   * Returns a new array of the members in insertion order, so `JSON.stringify` writes the set as an
   * array (a native `Set` is written as `{}`).
   *
   * Time: O(n).
   *
   * @returns A new array.
   *
   * @example
   * ```ts
   * JSON.stringify(new HashSet([1, 2])) // '[1,2]'
   * ```
   */
  toJSON(): E[] {
    return this.engine.toJSON()
  }

  /** Node's inspect hook: `HashSet(2) { 1, 2 }` in `console.log`. Time: as `toString`. */
  [INSPECT](
    depth: number | null,
    options: object,
    inspect: (value: unknown, options: object) => string,
  ): string {
    return this.engine[INSPECT](depth, options, inspect)
  }
}
