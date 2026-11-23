/**
 * `LinkedHashSet`: a set in insertion order that can be read and changed at both ends.
 *
 * @packageDocumentation
 */

import type { Cursor } from '../interfaces/collection'
import type { SequencedSet } from '../interfaces/sequenced-set'
import type { SetCollection } from '../interfaces/set'
import {
  brandedHasInstance,
  SEQUENCED_COLLECTION_BRAND,
  SET_COLLECTION_BRAND,
} from '../internal/brand'
import { describeValue, isIterable } from '../internal/checks'
import { readEquality, readSetArguments } from '../internal/engines/hash-support'
import { LinkedHashSetEngine } from '../internal/engines/linked-hash-set-engine'
import {
  type Equivalence,
  equalsSymbol,
  type HashFunction,
  hashCodeSymbol,
  type KeyOf,
} from '../internal/equality'
import { COLLECTION_BRAND, INSPECT } from '../internal/output'

const LINKED_HASH_SET_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/LinkedHashSet',
)

/**
 * Options for a `LinkedHashSet`. At most one of `key` and `equivalence` may be given; with neither,
 * members compare with SameValueZero, as in native `Set`.
 *
 * @example
 * ```ts
 * const byId: LinkedHashSetOptions<{ id: number }> = { key: (user) => user.id }
 * const byValue: LinkedHashSetOptions<Point> = { equivalence: valueEquivalence }
 * ```
 */
export interface LinkedHashSetOptions<E> {
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

/**
 * A set in insertion order that behaves like native `Set` — SameValueZero membership (`NaN` is one
 * member, `-0` is stored as `0`), `add` returning the set and keeping a present member where it is,
 * live iteration — and can also be read and changed at both ends: `getFirst`, `getLast`,
 * `removeFirst` and `removeLast`, `addFirst` and `addLast`, which insert an absent member at that
 * end or move the present one there, and a live `reversed()` view. Each takes O(1) amortised
 * (average for those that look up or remove).
 *
 * A set without the `key` or `equivalence` option keeps its members in a native `Set` until the
 * first call that needs linked order: `addFirst`, `addLast` of a member, `getLast`, `removeLast`,
 * or any call through `reversed()`. That call costs O(n), once; this is why the ends, `addFirst`
 * and `addLast` are amortised.
 *
 * The `key` and `equivalence` options work as they do for `HashSet`; the original values are
 * stored and returned, never the keys. `null` and `undefined` are allowed.
 *
 * Iteration is live, as with native `Set`: members deleted before they are reached are skipped,
 * members inserted at the end the loop is heading to are visited, members inserted at the end it
 * started from are not, and nothing throws `ConcurrentModificationError`. A move acts as a delete
 * followed by an insertion at the new end, so `for (const x of set) set.addLast(x)` never ends,
 * exactly as `for (const x of set) { set.delete(x); set.add(x) }` never ends on a native `Set`.
 * An open iterator or cursor keeps the members removed since its last step reachable until it
 * advances or is dropped; release iterators that are no longer needed.
 *
 * Members are found by their `key` result or `hash` when they are stored. If that changes while
 * a member is in the set, lookups, `addFirst`, `addLast` and `delete` give unspecified results for
 * it; `removeFirst`, `removeLast`, a cursor's `remove`, `removeIf` and `clear` still remove it.
 *
 * Two sets are equal when they have the same size and each has every member of the other, in any
 * order. A `LinkedHashSet` is not a `HashSet` (`instanceof HashSet` is `false`); both are sets.
 * The class is not designed to be subclassed.
 *
 * @example
 * ```ts
 * const recent = new LinkedHashSet(['a', 'b', 'c'])
 * recent.addLast('a')   // LinkedHashSet(3) {'b', 'c', 'a'}
 * recent.removeFirst()  // 'b'
 * [...recent.reversed()] // ['a', 'c']
 * ```
 *
 * @sealed
 */
export class LinkedHashSet<E> implements SequencedSet<E> {
  private engine: LinkedHashSetEngine<E>

  /**
   * Creates a set holding each distinct element of `elements` once, in first-seen order; empty
   * when `elements` is omitted, `undefined` or `null`. Options are never taken from a source set.
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
   * new LinkedHashSet([3, 1, 3]) // LinkedHashSet(2) {3, 1}
   * new LinkedHashSet(points, { equivalence: valueEquivalence })
   * ```
   */
  constructor(elements?: Iterable<E> | null, options?: LinkedHashSetOptions<E> | null)
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
   * const byName = new LinkedHashSet<{ name: string }>({ key: (item) => item.name })
   * ```
   */
  constructor(options: LinkedHashSetOptions<E>)
  constructor(
    elementsOrOptions?: Iterable<E> | LinkedHashSetOptions<E> | null,
    options?: LinkedHashSetOptions<E> | null,
  ) {
    const { elements, equality } = readSetArguments<E>(elementsOrOptions, options, 'LinkedHashSet')
    this.engine = new LinkedHashSetEngine<E>(this, equality)
    if (elements !== undefined) this.engine.addInitial(elements, 'LinkedHashSet')
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
   * LinkedHashSet.from('banana') // LinkedHashSet(3) {'b', 'a', 'n'}
   * ```
   */
  static from<T>(
    elements: Iterable<T>,
    options?: LinkedHashSetOptions<T> | null,
  ): LinkedHashSet<T> {
    if (!isIterable(elements)) {
      throw new TypeError(
        `LinkedHashSet.from: elements is not iterable (${describeValue(elements)})`,
      )
    }
    const set = new LinkedHashSet<T>()
    set.engine = new LinkedHashSetEngine<T>(set, readEquality<T>(options, 'LinkedHashSet.from'))
    set.engine.addInitial(elements, 'LinkedHashSet.from')
    return set
  }

  /**
   * Returns whether `value` is a `LinkedHashSet`, including one created by another copy of the
   * library with the same major version. A reversed view is not one.
   *
   * Time: O(1).
   *
   * @param value - The value on the left of `instanceof`.
   * @returns `true` when `value` is a `LinkedHashSet`.
   *
   * @example
   * ```ts
   * new LinkedHashSet() instanceof LinkedHashSet // true
   * ```
   */
  static [Symbol.hasInstance](value: unknown): boolean {
    // biome-ignore lint/complexity/noThisInStatic: `this` is the class on the right of `instanceof`
    return brandedHasInstance(this, LinkedHashSet, LINKED_HASH_SET_BRAND, value)
  }

  /**
   * Marks instances of this class so `instanceof` recognises them across copies of the package.
   * Its key is not exported, so the getter is not called directly. Time: O(1).
   */
  get [LINKED_HASH_SET_BRAND](): true {
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
   * A number that changes on every insertion, removal or move and never on a read or on a call
   * that changes nothing. Its exact values are unspecified. Time: O(1).
   */
  get revision(): number {
    return this.engine.revision
  }

  /** `'LinkedHashSet'`, for `Object.prototype.toString`. Time: O(1). */
  get [Symbol.toStringTag](): string {
    return 'LinkedHashSet'
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
   * new LinkedHashSet().isEmpty() // true
   * ```
   */
  isEmpty(): boolean {
    return this.engine.isEmpty()
  }

  /**
   * Adds `element` at the end unless a member equals it, and returns the set, so calls chain. A
   * member already present keeps its value and its place in the order.
   *
   * Time: O(1) average, plus one `key` or `hash` call and the `equals` calls.
   *
   * @param element - The element to add (`-0` is stored as `0`).
   * @returns The set.
   * @throws TypeError when `key` returns an object or a function, `equivalence.equals` returns a
   *   non-boolean or `equivalence.hash` a non-finite number.
   * @throws ConcurrentModificationError when a `key`, `equals` or `hash` function inserts, removes
   *   or moves members; the set keeps those changes and adds nothing itself.
   *
   * @example
   * ```ts
   * new LinkedHashSet([1, 2]).add(1).add(3) // LinkedHashSet(3) {1, 2, 3}
   * ```
   */
  add(element: E): this {
    this.engine.add(element)
    return this
  }

  /**
   * Inserts `element` at the front, or moves the member equal to it to the front (the stored
   * member is kept, not replaced by `element`), and returns the set. Nothing changes when that
   * member is already first.
   *
   * Time: O(1) amortised average, plus one `key` or `hash` call and the `equals` calls (the first
   * call that needs linked order costs O(n), once).
   *
   * @param element - The element to insert or move (`-0` is stored as `0`).
   * @returns The set.
   * @throws TypeError when `key`, `equals` or `hash` returns an invalid result (as for `add`).
   * @throws ConcurrentModificationError when a `key`, `equals` or `hash` function inserts, removes
   *   or moves members; the set inserts and moves nothing itself.
   *
   * @example
   * ```ts
   * new LinkedHashSet([1, 2, 3]).addFirst(3) // LinkedHashSet(3) {3, 1, 2}
   * ```
   */
  addFirst(element: E): this {
    this.engine.addFirst(element)
    return this
  }

  /**
   * Inserts `element` at the end, or moves the member equal to it to the end (the stored member is
   * kept, not replaced by `element`), and returns the set. Nothing changes when that member is
   * already last.
   *
   * Time: O(1) amortised average, plus one `key` or `hash` call and the `equals` calls (the first
   * call that needs linked order costs O(n), once).
   *
   * @param element - The element to insert or move (`-0` is stored as `0`).
   * @returns The set.
   * @throws TypeError when `key`, `equals` or `hash` returns an invalid result (as for `add`).
   * @throws ConcurrentModificationError when a `key`, `equals` or `hash` function inserts, removes
   *   or moves members; the set inserts and moves nothing itself.
   *
   * @example
   * ```ts
   * new LinkedHashSet([1, 2, 3]).addLast(1) // LinkedHashSet(3) {2, 3, 1}
   * ```
   */
  addLast(element: E): this {
    this.engine.addLast(element)
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
   * @throws ConcurrentModificationError when a `key`, `equals` or `hash` function inserts, removes
   *   or moves members.
   *
   * @example
   * ```ts
   * new LinkedHashSet([Number.NaN]).has(Number.NaN) // true
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
   * @throws ConcurrentModificationError when a `key`, `equals` or `hash` function inserts, removes
   *   or moves members; the set removes nothing itself.
   *
   * @example
   * ```ts
   * new LinkedHashSet([1, 2]).delete(1) // true
   * ```
   */
  delete(element: E): boolean {
    return this.engine.delete(element)
  }

  /**
   * Returns the first member.
   *
   * Time: O(1) amortised. Calls no `key`, `equals` or `hash` function.
   *
   * @returns The first member.
   * @throws NoSuchElementError when the set is empty.
   *
   * @example
   * ```ts
   * new LinkedHashSet(['a', 'b']).getFirst() // 'a'
   * ```
   */
  getFirst(): E {
    return this.engine.getFirst()
  }

  /**
   * Returns the last member.
   *
   * Time: O(1) amortised (the first call that needs linked order costs O(n), once). Calls no
   * `key`, `equals` or `hash` function.
   *
   * @returns The last member.
   * @throws NoSuchElementError when the set is empty.
   *
   * @example
   * ```ts
   * new LinkedHashSet(['a', 'b']).getLast() // 'b'
   * ```
   */
  getLast(): E {
    return this.engine.getLast()
  }

  /**
   * Removes and returns the first member.
   *
   * Time: O(1) amortised average. Calls no `key`, `equals` or `hash` function.
   *
   * @returns The removed member.
   * @throws NoSuchElementError when the set is empty; nothing changes.
   *
   * @example
   * ```ts
   * new LinkedHashSet(['a', 'b']).removeFirst() // 'a'
   * ```
   */
  removeFirst(): E {
    return this.engine.removeFirst()
  }

  /**
   * Removes and returns the last member.
   *
   * Time: O(1) amortised average (the first call that needs linked order costs O(n), once). Calls
   * no `key`, `equals` or `hash` function.
   *
   * @returns The removed member.
   * @throws NoSuchElementError when the set is empty; nothing changes.
   *
   * @example
   * ```ts
   * new LinkedHashSet(['a', 'b']).removeLast() // 'b'
   * ```
   */
  removeLast(): E {
    return this.engine.removeLast()
  }

  /**
   * Returns a live view of this set in the opposite order. Changes through either show in both;
   * the view's `getFirst`, `removeFirst` and `addFirst` act on this set's last member or end, and
   * its `add` inserts an absent member at the view's end, which is this set's front. Reversing the
   * view returns this set.
   *
   * Time: O(1). Every call through the view needs linked order: the first such call on the set
   * costs O(n), once, and the view's operations cost what the set's cost, amortised.
   *
   * @returns The reversed view, printed as `ReversedLinkedHashSet`.
   *
   * @example
   * ```ts
   * const set = new LinkedHashSet([1, 2, 3])
   * const newestFirst = set.reversed() // ReversedLinkedHashSet(3) {3, 2, 1}
   * newestFirst.add(0)                 // set is now {0, 1, 2, 3}
   * ```
   */
  reversed(): SequencedSet<E> {
    return this.engine.reversed()
  }

  /**
   * Adds every element of `elements` at the end, in order, after reading them all; members already
   * present stay where they are. Elements added before an error stay.
   *
   * Time: O(m) average for `m` elements, plus the calls.
   *
   * @param elements - The elements to add.
   * @returns `true` when any element was added.
   * @throws TypeError when `elements` is not iterable, or a function returns an invalid result.
   * @throws ConcurrentModificationError when a `key`, `equals` or `hash` function inserts, removes
   *   or moves members.
   *
   * @example
   * ```ts
   * new LinkedHashSet([1]).addAll([1, 2]) // true
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
   * @throws ConcurrentModificationError when a `key`, `equals` or `hash` function inserts, removes
   *   or moves members.
   *
   * @example
   * ```ts
   * new LinkedHashSet([1, 2, 3]).removeAll([2, 9]) // true; LinkedHashSet(2) {1, 3}
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
   * @throws ConcurrentModificationError when a `key`, `equals` or `hash` function inserts, removes
   *   or moves members.
   *
   * @example
   * ```ts
   * new LinkedHashSet([1, 2, 3]).retainAll([2]) // true; LinkedHashSet(1) {2}
   * ```
   */
  retainAll(elements: Iterable<E>): boolean {
    return this.engine.retainAll(elements)
  }

  /**
   * Removes every member for which `predicate` returns a truthy value. Every member is decided
   * first, in order; if `predicate` throws, or inserts, removes or moves members, nothing is
   * removed.
   *
   * Time: O(n) plus the calls.
   *
   * @param predicate - Called with each member.
   * @returns `true` when any member was removed.
   * @throws TypeError when `predicate` is not a function.
   * @throws ConcurrentModificationError when `predicate` inserts, removes or moves members.
   *
   * @example
   * ```ts
   * new LinkedHashSet([1, 2, 3, 4]).removeIf((n) => n % 2 === 0) // true; LinkedHashSet(2) {1, 3}
   * ```
   */
  removeIf(predicate: (element: E) => unknown): boolean {
    return this.engine.removeIf(predicate)
  }

  /**
   * Removes every member. An open iteration starts over before the first member, so members added
   * at the end afterwards are visited, as with native `Set`.
   *
   * Time: O(1) with an `equivalence`; one native `clear` otherwise (at most O(n)).
   *
   * @example
   * ```ts
   * const set = new LinkedHashSet([1, 2])
   * set.clear()
   * set.size // 0
   * ```
   */
  clear(): void {
    this.engine.clear()
  }

  /**
   * Returns an iterator over the members in order, as `values()` does.
   *
   * Time: O(1) to create; O(1) per step, amortised over the steps and the changes made while it
   * is open.
   *
   * @returns A new live iterator.
   *
   * @example
   * ```ts
   * [...new LinkedHashSet(['a', 'b']).keys()] // ['a', 'b']
   * ```
   */
  keys(): IterableIterator<E> {
    return this.engine.keys()
  }

  /**
   * Returns an iterator over the members in order.
   *
   * Time: O(1) to create; O(1) per step, amortised over the steps and the changes made while it
   * is open.
   *
   * @returns A new live iterator.
   *
   * @example
   * ```ts
   * [...new LinkedHashSet(['a', 'b']).values()] // ['a', 'b']
   * ```
   */
  values(): IterableIterator<E> {
    return this.engine.values()
  }

  /**
   * Returns an iterator over `[member, member]` pairs in order, as native `Set` does.
   *
   * Time: O(1) to create; O(1) per step, amortised over the steps and the changes made while it
   * is open.
   *
   * @returns A new live iterator.
   *
   * @example
   * ```ts
   * [...new LinkedHashSet(['a']).entries()] // [['a', 'a']]
   * ```
   */
  entries(): IterableIterator<[E, E]> {
    return this.engine.entries()
  }

  /**
   * Calls `action(member, member, set)` for each member in order, with `this` set to `thisArg`, as
   * native `Set` does. The loop is live, as `[Symbol.iterator]` describes.
   *
   * Time: O(n) plus the calls.
   *
   * @param action - Called with each member twice and the set.
   * @param thisArg - The `this` value for `action`.
   * @throws TypeError when `action` is not a function.
   *
   * @example
   * ```ts
   * new LinkedHashSet(['a', 'b']).forEach((tag) => console.log(tag))
   * ```
   */
  forEach(action: (element: E, same: E, set: SetCollection<E>) => void, thisArg?: unknown): void {
    this.engine.forEach(action, thisArg)
  }

  /**
   * Returns an iterator over the members in order. It is live, as a native `Set` iterator is:
   * members deleted before they are reached are skipped, members inserted at the end are visited,
   * members inserted at the front are not, and a moved member counts as deleted and inserted at its
   * new end. After `clear()` it continues with members added later; once done it stays done.
   *
   * Time: O(1) to create; O(1) per step, amortised over the steps and the changes made while it
   * is open.
   *
   * @returns A new live iterator.
   *
   * @example
   * ```ts
   * for (const tag of new LinkedHashSet(['a', 'b'])) console.log(tag)
   * ```
   */
  [Symbol.iterator](): IterableIterator<E> {
    return this.engine[Symbol.iterator]()
  }

  /**
   * Returns a live cursor in order; `remove()` removes the member `next()` returned, from wherever
   * it now stands, without calling `key`, `equals` or `hash` while that member is still stored. A
   * member `hasNext()` has reached is returned even if it was deleted or moved meanwhile.
   *
   * Time: O(1) to create; `next` O(1) amortised over the steps and the changes made while it is
   * open; `remove` O(1) average.
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
   * Returns a new array of the members in order.
   *
   * Time: O(n).
   *
   * @returns A new array.
   *
   * @example
   * ```ts
   * new LinkedHashSet([2, 1, 2]).toArray() // [2, 1]
   * ```
   */
  toArray(): E[] {
    return this.engine.toArray()
  }

  /**
   * Returns a new `LinkedHashSet` with the same members, order and `key` or `equivalence`,
   * independent of this one. Stored keys and hashes are copied; no user function is called.
   *
   * Time: O(n).
   *
   * @returns The copy.
   *
   * @example
   * ```ts
   * const copy = set.copy()
   * copy.addFirst(9) // set is unchanged
   * ```
   */
  copy(): LinkedHashSet<E> {
    const set = new LinkedHashSet<E>()
    set.engine = this.engine.copy(set)
    return set
  }

  /**
   * Returns whether `other` is a set of the same size which has every member of this set and whose
   * every member this set has — whatever the order, and the same both ways round. Lists, queues,
   * maps, arrays and native `Set` are never equal to it.
   *
   * Time: O(n) average, plus the `has` calls on both sets.
   *
   * @param other - Any value.
   * @returns `true` when `other` is an equal set.
   *
   * @example
   * ```ts
   * new LinkedHashSet([1, 2]).equals(new HashSet([2, 1])) // true
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
   * same as an equal `HashSet`'s with the same `key` function, the same `equivalence`, or
   * neither. Values are unspecified. Time: O(n) plus the `hash` calls.
   */
  [hashCodeSymbol](hash: HashFunction): number {
    return this.engine[hashCodeSymbol](hash)
  }

  /**
   * Returns the class name, size and members in order, e.g. `LinkedHashSet(2) {1, 'a'}`.
   *
   * Time: O(length of the output) for flat contents.
   *
   * @returns The text.
   *
   * @example
   * ```ts
   * String(new LinkedHashSet([1, 'a'])) // "LinkedHashSet(2) {1, 'a'}"
   * ```
   */
  toString(): string {
    return this.engine.toString()
  }

  /**
   * Returns a new array of the members in order, so `JSON.stringify` writes the set as an array.
   *
   * Time: O(n).
   *
   * @returns A new array.
   *
   * @example
   * ```ts
   * JSON.stringify(new LinkedHashSet([2, 1])) // '[2,1]'
   * ```
   */
  toJSON(): E[] {
    return this.engine.toJSON()
  }

  /** Node's inspect hook: `LinkedHashSet(2) { 1, 2 }` in `console.log`. Time: as `toString`. */
  [INSPECT](
    depth: number | null,
    options: object,
    inspect: (value: unknown, options: object) => string,
  ): string {
    return this.engine[INSPECT](depth, options, inspect)
  }
}
