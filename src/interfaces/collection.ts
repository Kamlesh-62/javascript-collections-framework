/**
 * The collection interfaces: what every collection can do, whatever its implementation.
 *
 * @packageDocumentation
 */

import type { equalsSymbol, HashFunction, hashCodeSymbol } from '../internal/equality'

/**
 * Walks a collection one element at a time and can remove the element it just returned.
 *
 * Unlike a JavaScript iterator, `next()` returns the element itself; a cursor is not iterable, so
 * `for…of` over it is an error. Use it to filter a collection in place in one pass.
 *
 * @example
 * ```ts
 * const cursor = collection.cursor()
 * while (cursor.hasNext()) {
 *   if (cursor.next() < 0) cursor.remove()
 * }
 * ```
 */
export interface Cursor<E> {
  /** Returns whether `next()` has an element to return. Never throws. Time: O(1). */
  hasNext(): boolean
  /**
   * Returns the next element.
   *
   * Time: O(1).
   *
   * @returns The next element.
   * @throws NoSuchElementError when no element remains.
   * @throws ConcurrentModificationError when a fail-fast collection was changed other than through
   *   this cursor.
   */
  next(): E
  /**
   * Removes the element the last `next()` returned.
   *
   * Time: as the implementation documents.
   *
   * @throws IllegalStateError when called before `next()`, or twice without a `next()` between.
   * @throws UnsupportedOperationError when the collection cannot be changed (a read-only view).
   * @throws ConcurrentModificationError when a fail-fast collection was changed other than through
   *   this cursor.
   */
  remove(): void
}

/**
 * The read-only view of a collection: every question a collection answers.
 *
 * Code typed as `ReadonlyCollection<E>` works with any implementation. Membership and removal use
 * the names native `Set` uses (`has`, `delete`). Hash collections iterate live, like native `Set`;
 * collections with no native counterpart throw `ConcurrentModificationError` when changed during
 * iteration. Each method's cost is documented by the implementation.
 *
 * @example
 * ```ts
 * function total(numbers: ReadonlyCollection<number>): number {
 *   let sum = 0
 *   for (const n of numbers) sum += n
 *   return sum
 * }
 * ```
 */
export interface ReadonlyCollection<E> extends Iterable<E> {
  /** The number of elements. Time: O(1). */
  readonly size: number
  /**
   * A number that changes on every change to the contents — adding, removing or replacing an
   * element — and never on a read. Watch it to detect changes; its exact values are unspecified.
   * Time: O(1).
   */
  readonly revision: number
  /**
   * Returns whether the collection has no elements.
   *
   * Time: O(1).
   *
   * @returns `size === 0`.
   */
  isEmpty(): boolean
  /**
   * Returns whether some element is equal to `element` under the collection's equality
   * (SameValueZero unless the collection says otherwise). Time: as the implementation documents.
   *
   * @param element - The value to look for.
   * @returns `true` when an equal element is present.
   */
  has(element: E): boolean
  /**
   * Returns a new array of the elements in iteration order; changing it does not change the
   * collection.
   *
   * Time: O(n).
   *
   * @returns A new array.
   */
  toArray(): E[]
  /**
   * Calls `action` once per element in iteration order, with `this` set to `thisArg`.
   *
   * Time: O(n) plus the calls.
   *
   * @param action - Called with each element.
   * @param thisArg - The `this` value for `action`.
   * @throws TypeError when `action` is not a function.
   * @throws ConcurrentModificationError when `action` adds or removes elements of a fail-fast
   *   collection.
   */
  forEach(action: (element: E) => void, thisArg?: unknown): void
  /**
   * Returns a cursor positioned before the first element.
   *
   * Time: O(1).
   *
   * @returns A new cursor.
   */
  cursor(): Cursor<E>
  /**
   * Returns an iterator over the elements in iteration order.
   *
   * Time: O(1) to create; each step amortised O(1) unless the implementation documents otherwise.
   *
   * @returns A new iterator.
   * @throws ConcurrentModificationError (from `next()`) when elements of a fail-fast collection
   *   are added or removed after the iterator is created, including through a cursor.
   */
  [Symbol.iterator](): IterableIterator<E>
  /**
   * Returns whether `other` is equal to this collection, as the collection's family defines;
   * otherwise only the collection itself. Time: as the implementation documents.
   *
   * @param other - Any value.
   * @returns `true` when equal.
   */
  equals(other: unknown): boolean
  /** The value-equality protocol; delegates to `equals`. Time: as `equals`. */
  [equalsSymbol](other: unknown): boolean
  /**
   * The value-equality protocol: a hash consistent with `equals`, computed with `hash`.
   * Time: as the implementation documents.
   */
  [hashCodeSymbol](hash: HashFunction): number
  /**
   * Returns the class name, size and elements, e.g. `ArrayList(3) [1, 2, 'a']`.
   *
   * Time: O(length of the output) for flat contents; each level of nested arrays or collections
   * copies its text once more.
   *
   * @returns The text.
   */
  toString(): string
  /**
   * Returns a new array of the elements, so `JSON.stringify` writes the collection as an array.
   *
   * Time: O(n).
   *
   * @returns A new array.
   */
  toJSON(): E[]
}

/**
 * A collection that can be changed.
 *
 * `add` returns the collection, as native `Set.prototype.add` does, so calls chain. The bulk
 * methods read their argument before changing anything.
 *
 * @example
 * ```ts
 * function keepPositive(numbers: Collection<number>): void {
 *   numbers.removeIf((n) => n <= 0)
 * }
 * ```
 */
export interface Collection<E> extends ReadonlyCollection<E> {
  /**
   * Adds `element` and returns the collection, so calls chain. A collection that refuses
   * duplicates is left unchanged. Time: as the implementation documents.
   *
   * @param element - The element to add.
   * @returns The collection.
   */
  add(element: E): this
  /**
   * Removes one element equal to `element` (the first, where order is defined). Time: as the implementation documents.
   *
   * @param element - The value to remove.
   * @returns `true` when an element was removed.
   */
  delete(element: E): boolean
  /**
   * Adds every element of `elements`, in order, after reading them all. If an error is thrown
   * part-way, the elements added before it stay.
   *
   * Time: O(m) plus m additions.
   *
   * @param elements - The elements to add.
   * @returns `true` when any element was added.
   * @throws TypeError when `elements` is not iterable.
   */
  addAll(elements: Iterable<E>): boolean
  /**
   * Removes every element equal to one in `elements`. Decides first, so an error while deciding
   * removes nothing. Time: as the implementation documents.
   *
   * @param elements - The elements to remove.
   * @returns `true` when any element was removed.
   * @throws TypeError when `elements` is not iterable.
   * @throws ConcurrentModificationError when your code adds or removes elements while it decides.
   */
  removeAll(elements: Iterable<E>): boolean
  /**
   * Removes every element not equal to one in `elements`. Decides first, so an error while
   * deciding removes nothing. Time: as the implementation documents.
   *
   * @param elements - The elements to keep.
   * @returns `true` when any element was removed.
   * @throws TypeError when `elements` is not iterable.
   * @throws ConcurrentModificationError when your code adds or removes elements while it decides.
   */
  retainAll(elements: Iterable<E>): boolean
  /**
   * Calls `predicate` on every element, then removes those for which it returned a truthy
   * value; an error from `predicate` removes nothing. Time: as the implementation documents.
   *
   * @param predicate - Called with each element.
   * @returns `true` when any element was removed.
   * @throws TypeError when `predicate` is not a function.
   * @throws ConcurrentModificationError when `predicate` adds or removes elements.
   */
  removeIf(predicate: (element: E) => unknown): boolean
  /**
   * Removes every element. Time: as the implementation documents.
   */
  clear(): void
}
