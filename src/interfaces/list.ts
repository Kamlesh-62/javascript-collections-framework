/**
 * The sequenced and list interfaces: collections with a first and last element, and collections
 * indexed from 0.
 *
 * @packageDocumentation
 */

import type { Comparator } from '../functions/comparators'
import type { Collection, Cursor, ReadonlyCollection } from './collection'

/**
 * The read-only view of a collection with a defined order and a first and last element.
 *
 * @example
 * ```ts
 * function ends<E>(items: ReadonlySequencedCollection<E>): [E, E] {
 *   return [items.getFirst(), items.getLast()]
 * }
 * ```
 */
export interface ReadonlySequencedCollection<E> extends ReadonlyCollection<E> {
  /**
   * Returns the first element.
   *
   * Time: as the implementation documents.
   *
   * @returns The first element.
   * @throws NoSuchElementError when the collection is empty.
   */
  getFirst(): E
  /**
   * Returns the last element.
   *
   * Time: as the implementation documents.
   *
   * @returns The last element.
   * @throws NoSuchElementError when the collection is empty.
   */
  getLast(): E
  /**
   * Returns a live view of this collection in reverse order: changes to either show in the other.
   *
   * Time: O(1).
   *
   * @returns The reversed view.
   */
  reversed(): ReadonlySequencedCollection<E>
}

/**
 * A collection with a defined order that can be changed at both ends.
 *
 * @example
 * ```ts
 * function rotate<E>(items: SequencedCollection<E>): void {
 *   if (!items.isEmpty()) items.addLast(items.removeFirst())
 * }
 * ```
 */
export interface SequencedCollection<E> extends Collection<E>, ReadonlySequencedCollection<E> {
  /**
   * Adds `element` at the front and returns the collection.
   *
   * Time: as the implementation documents.
   *
   * @param element - The element to add.
   * @returns The collection.
   */
  addFirst(element: E): this
  /**
   * Adds `element` at the end and returns the collection.
   *
   * Time: as the implementation documents.
   *
   * @param element - The element to add.
   * @returns The collection.
   */
  addLast(element: E): this
  /**
   * Removes and returns the first element.
   *
   * Time: as the implementation documents.
   *
   * @returns The removed element.
   * @throws NoSuchElementError when the collection is empty.
   */
  removeFirst(): E
  /**
   * Removes and returns the last element.
   *
   * Time: as the implementation documents.
   *
   * @returns The removed element.
   * @throws NoSuchElementError when the collection is empty.
   */
  removeLast(): E
  /**
   * Returns a live view of this collection in reverse order; changes through the view reach this
   * collection at the mirrored position.
   *
   * Time: O(1).
   *
   * @returns The reversed view.
   */
  reversed(): SequencedCollection<E>
}

/**
 * A cursor over a list that moves both ways and edits at its position. It sits between two
 * elements: `next()` returns the element after it, `previous()` the element before it.
 *
 * @example
 * ```ts
 * const cursor = list.listCursor()
 * while (cursor.hasNext()) {
 *   const n = cursor.next()
 *   if (n < 0) cursor.remove()
 *   else if (n === 0) cursor.insert(-1)
 *   else cursor.set(n * 2)
 * }
 * ```
 */
export interface ListCursor<E> extends Cursor<E> {
  /** Returns whether `previous()` has an element to return. Never throws. Time: O(1). */
  hasPrevious(): boolean
  /**
   * Returns the element before the cursor and moves the cursor back past it.
   *
   * Time: O(1).
   *
   * @returns The previous element.
   * @throws NoSuchElementError when the cursor is at the start.
   * @throws ConcurrentModificationError when the list was changed other than through this cursor.
   */
  previous(): E
  /**
   * Returns the index of the element `next()` would return, or `size` at the end. Never throws.
   * Time: O(1).
   */
  nextIndex(): number
  /**
   * Returns the index of the element `previous()` would return, or `-1` at the start. Never
   * throws. Time: O(1).
   */
  previousIndex(): number
  /**
   * Replaces the element the last `next()` or `previous()` returned. Open iterators and other
   * cursors stay valid.
   *
   * Time: O(1).
   *
   * @param element - The new element.
   * @throws IllegalStateError when there was no `next()`/`previous()`, or an `insert` or
   *   `remove` since.
   * @throws UnsupportedOperationError when the list cannot be changed.
   * @throws ConcurrentModificationError when the list was changed other than through this cursor.
   */
  set(element: E): void
  /**
   * Inserts `element` just before the cursor: a following `next()` is unaffected and a following
   * `previous()` returns `element`.
   *
   * Time: as the list's `insert` at this position.
   *
   * @param element - The element to insert.
   * @throws UnsupportedOperationError when the list cannot be changed.
   * @throws ConcurrentModificationError when the list was changed other than through this cursor.
   */
  insert(element: E): void
}

/**
 * The read-only view of a list: ordered, indexed from 0, duplicates allowed.
 *
 * @example
 * ```ts
 * function middle<E>(list: ReadonlyList<E>): E {
 *   return list.get(list.size >> 1)
 * }
 * ```
 */
export interface ReadonlyList<E> extends ReadonlySequencedCollection<E> {
  /**
   * Returns the element at `index`.
   *
   * Time: as the implementation documents.
   *
   * @param index - An integer with `0 <= index < size`.
   * @returns The element.
   * @throws IndexOutOfBoundsError when `index` is not an integer in range.
   */
  get(index: number): E
  /**
   * Returns the lowest index whose element is equal to `element` under SameValueZero (so `NaN`
   * is found), or `-1`.
   *
   * Time: O(n).
   *
   * @param element - The value to look for.
   * @returns The index, or `-1`.
   */
  indexOf(element: E): number
  /**
   * Returns the highest index whose element is equal to `element` under SameValueZero, or `-1`.
   *
   * Time: O(n).
   *
   * @param element - The value to look for.
   * @returns The index, or `-1`.
   */
  lastIndexOf(element: E): number
  /**
   * Returns a cursor positioned before `index` (0 when omitted).
   *
   * Time: O(1).
   *
   * @param index - An integer with `0 <= index <= size`.
   * @returns A new cursor.
   * @throws IndexOutOfBoundsError when `index` is not an integer in range.
   */
  listCursor(index?: number): ListCursor<E>
  /**
   * Returns a live view of the elements from `from` (inclusive) to `to` (exclusive). Once the
   * list's structure changes other than through the view, the view throws
   * `ConcurrentModificationError`.
   *
   * Time: O(1).
   *
   * @param from - Start of the range, inclusive.
   * @param to - End of the range, exclusive.
   * @returns The view.
   * @throws IndexOutOfBoundsError when `from < 0`, `to > size` or a bound is not an integer.
   * @throws IllegalArgumentError when `from > to`.
   */
  subList(from: number, to: number): ReadonlyList<E>
  /**
   * Returns a live view of this list in reverse order: index `i` of the view is index
   * `size - 1 - i` of this list.
   *
   * Time: O(1).
   *
   * @returns The reversed view.
   */
  reversed(): ReadonlyList<E>
  /**
   * Calls `action(element, index, list)` for each element in index order, with `this` set to
   * `thisArg`, as `Array.prototype.forEach` does.
   *
   * Time: O(n) plus the calls.
   *
   * @param action - Called with each element, its index and the list.
   * @param thisArg - The `this` value for `action`.
   * @throws TypeError when `action` is not a function.
   * @throws ConcurrentModificationError when `action` adds or removes elements.
   */
  forEach(
    action: (element: E, index: number, list: ReadonlyList<E>) => void,
    thisArg?: unknown,
  ): void
}

/**
 * A list that can be changed: ordered, indexed from 0, duplicates allowed.
 *
 * `add` appends; `insert` puts an element at a position. `delete(element)` removes by value;
 * `removeAt(index)` by position.
 *
 * @example
 * ```ts
 * function moveToFront<E>(list: List<E>, element: E): void {
 *   if (list.delete(element)) list.addFirst(element)
 * }
 * ```
 */
export interface List<E> extends SequencedCollection<E>, ReadonlyList<E> {
  /**
   * Replaces the element at `index` and returns the old one. `revision` changes; open iterators
   * stay valid.
   *
   * Time: as the implementation documents.
   *
   * @param index - An integer with `0 <= index < size`.
   * @param element - The new element.
   * @returns The element that was at `index`.
   * @throws IndexOutOfBoundsError when `index` is not an integer in range.
   */
  set(index: number, element: E): E
  /**
   * Inserts `element` at `index`, shifting later elements up by one, and returns the list.
   *
   * Time: as the implementation documents.
   *
   * @param index - An integer with `0 <= index <= size`.
   * @param element - The element to insert.
   * @returns The list.
   * @throws IndexOutOfBoundsError when `index` is not an integer in range.
   */
  insert(index: number, element: E): this
  /**
   * Inserts every element of `elements` at `index`, in order, after reading them all.
   *
   * Time: as the implementation documents.
   *
   * @param index - An integer with `0 <= index <= size`.
   * @param elements - The elements to insert.
   * @returns `true` when any element was inserted.
   * @throws IndexOutOfBoundsError when `index` is not an integer in range (checked first).
   * @throws TypeError when `elements` is not iterable.
   * @throws ConcurrentModificationError when reading `elements` changed the list.
   */
  insertAll(index: number, elements: Iterable<E>): boolean
  /**
   * Removes and returns the element at `index`, shifting later elements down by one.
   *
   * Time: as the implementation documents.
   *
   * @param index - An integer with `0 <= index < size`.
   * @returns The removed element.
   * @throws IndexOutOfBoundsError when `index` is not an integer in range.
   */
  removeAt(index: number): E
  /**
   * Replaces each element with `op(element, index, list)`, in index order. If `op` throws, the
   * elements before it are already replaced and the rest are unchanged. Open iterators stay valid.
   *
   * Time: O(n) plus the calls.
   *
   * @param op - Returns the replacement for each element.
   * @throws TypeError when `op` is not a function.
   * @throws ConcurrentModificationError when `op` adds or removes elements.
   */
  replaceAll(op: (element: E, index: number, list: List<E>) => E): void
  /**
   * Calls `predicate(element, index, list)` on every element (indexes before any removal), then
   * removes those for which it returned a truthy value; an error from `predicate` removes nothing.
   *
   * Time: O(n) plus the calls.
   *
   * @param predicate - Called with each element, its index and the list.
   * @returns `true` when any element was removed.
   * @throws TypeError when `predicate` is not a function.
   * @throws ConcurrentModificationError when `predicate` adds or removes elements.
   */
  removeIf(predicate: (element: E, index: number, list: List<E>) => unknown): boolean
  /**
   * Sorts the list in place, keeping equal elements in their order (stable), and returns it.
   * Without a comparator, natural order is used. `null` and `undefined` reach the comparator like
   * any other element. If the comparator throws or returns something other than a number, the
   * list is left as it was.
   *
   * Time: O(n log n); at most `n·⌈log₂ n⌉` comparator calls.
   *
   * @param comparator - The order; natural order when omitted.
   * @returns The list.
   * @throws TypeError when `comparator` is neither a function nor `undefined`, or returns `NaN`
   *   or a non-number.
   * @throws ClassCastError when natural order cannot compare two elements.
   * @throws NullElementError when natural order meets `null` or `undefined`.
   * @throws ConcurrentModificationError when the comparator adds or removes elements.
   */
  sort(comparator?: Comparator<E>): this
  /**
   * Returns a live view of the elements from `from` (inclusive) to `to` (exclusive); changes
   * through the view reach this list. Once this list's structure changes other than through the
   * view, the view throws `ConcurrentModificationError`.
   *
   * Time: O(1).
   *
   * @param from - Start of the range, inclusive.
   * @param to - End of the range, exclusive.
   * @returns The view.
   * @throws IndexOutOfBoundsError when `from < 0`, `to > size` or a bound is not an integer.
   * @throws IllegalArgumentError when `from > to`.
   */
  subList(from: number, to: number): List<E>
  /**
   * Returns a live view of this list in reverse order; changes through the view reach this list
   * at the mirrored position.
   *
   * Time: O(1).
   *
   * @returns The reversed view.
   */
  reversed(): List<E>
  /**
   * Calls `action(element, index, list)` for each element in index order, with `this` set to
   * `thisArg`, as `Array.prototype.forEach` does.
   *
   * Time: O(n) plus the calls.
   *
   * @param action - Called with each element, its index and the list.
   * @param thisArg - The `this` value for `action`.
   * @throws TypeError when `action` is not a function.
   * @throws ConcurrentModificationError when `action` adds or removes elements.
   */
  forEach(action: (element: E, index: number, list: List<E>) => void, thisArg?: unknown): void
}
