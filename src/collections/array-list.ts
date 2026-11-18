/**
 * `ArrayList`: a growable list stored in an array.
 *
 * @packageDocumentation
 */

import type { Comparator } from '../functions/comparators'
import type { List, ListCursor } from '../interfaces/list'
import { brandedHasInstance, LIST_BRAND, SEQUENCED_COLLECTION_BRAND } from '../internal/brand'
import { describeValue, isIterable, requireFunction } from '../internal/checks'
import { ArrayListEngine } from '../internal/engines/array-list-engine'
import { equalsSymbol, type HashFunction, hashCodeSymbol } from '../internal/equality'
import { apply } from '../internal/intrinsics'
import { COLLECTION_BRAND, INSPECT } from '../internal/output'

const ARRAY_LIST_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/ArrayList',
)

function notIterable(where: string, value: unknown): TypeError {
  return new TypeError(`${where}: elements is not iterable (${describeValue(value)})`)
}

/**
 * A list stored in an array: indexed reads and writes in O(1), appends in amortised O(1), inserts
 * and removals in time proportional to the elements after the position. Elements may be anything,
 * `null` and `undefined` included.
 *
 * Unlike an array, an index out of range throws `IndexOutOfBoundsError` instead of reading
 * `undefined`; `delete(element)` removes by value; `subList` and `reversed` are live views; and
 * adding, removing or sorting while iterating throws `ConcurrentModificationError` (use a cursor
 * to change the list while iterating). `indexOf`, `has` and `delete` compare with SameValueZero, so `NaN`
 * is found; `equals` compares two lists element by element with `equals(a, b)`.
 *
 * The class is not designed to be subclassed.
 *
 * @example
 * ```ts
 * const list = new ArrayList([3, 1, 2])
 * list.add(4).insert(0, 0)       // [0, 3, 1, 2, 4]
 * list.sort()                    // [0, 1, 2, 3, 4]
 * list.subList(1, 3).clear()     // [0, 3, 4]
 * list.get(5)                    // throws IndexOutOfBoundsError
 * ```
 *
 * @sealed
 */
export class ArrayList<E> implements List<E> {
  private readonly engine: ArrayListEngine<E>

  /**
   * Creates a list holding the elements of `elements`, in order; empty when `elements` is
   * omitted, `undefined` or `null` (as `new Set(null)` is).
   *
   * Time: O(m) for `m` elements.
   *
   * @param elements - The initial elements.
   * @throws TypeError when `elements` is neither iterable nor `null`/`undefined`.
   *
   * @example
   * ```ts
   * new ArrayList<string>()       // ArrayList(0) []
   * new ArrayList('abc')          // ArrayList(3) ['a', 'b', 'c']
   * ```
   */
  constructor(elements?: Iterable<E> | null) {
    this.engine = new ArrayListEngine<E>(this)
    if (elements === undefined || elements === null) return
    if (!isIterable(elements)) throw notIterable('ArrayList', elements)
    const items = this.engine.items
    for (const element of elements) items.push(element)
  }

  /**
   * Returns a new list of the elements of `elements`, in order, like `Array.from` but for
   * iterables only.
   *
   * Time: O(m) for `m` elements.
   *
   * @param elements - The elements.
   * @returns A new list.
   * @throws TypeError when `elements` is not iterable (`null`, `undefined` and array-likes such
   *   as `{ length: 2 }` included).
   *
   * @example
   * ```ts
   * ArrayList.from(new Set([1, 2])) // ArrayList(2) [1, 2]
   * ```
   */
  static from<T>(elements: Iterable<T>): ArrayList<T>
  /**
   * Returns a new list of `mapFn(element, index)` for each element of `elements`, in order, with
   * `this` set to `thisArg`, as `Array.from` does.
   *
   * Time: O(m) plus the calls.
   *
   * @param elements - The elements.
   * @param mapFn - Called with each element and its index; its result is stored.
   * @param thisArg - The `this` value for `mapFn`.
   * @returns A new list.
   * @throws TypeError when `mapFn` is not a function (checked before `elements` is read), or
   *   `elements` is not iterable.
   *
   * @example
   * ```ts
   * ArrayList.from([1, 2, 3], (n) => n * 2) // ArrayList(3) [2, 4, 6]
   * ```
   */
  static from<T, U>(
    elements: Iterable<T>,
    mapFn: (element: T, index: number) => U,
    thisArg?: unknown,
  ): ArrayList<U>
  static from<T, U>(
    elements: Iterable<T>,
    mapFn?: (element: T, index: number) => U,
    thisArg?: unknown,
  ): ArrayList<T | U> {
    if (mapFn !== undefined) requireFunction(mapFn, 'ArrayList.from', 'mapFn')
    if (!isIterable(elements)) throw notIterable('ArrayList.from', elements)
    const list = new ArrayList<T | U>()
    const items = list.engine.items
    let index = 0
    for (const element of elements) {
      items.push(mapFn === undefined ? element : (apply(mapFn, thisArg, [element, index]) as U))
      index++
    }
    return list
  }

  /**
   * Returns whether `value` is an `ArrayList`, including one created by another copy of the
   * library with the same major version. Views (`subList`, `reversed`) are not `ArrayList`s.
   *
   * Time: O(1).
   *
   * @param value - The value on the left of `instanceof`.
   * @returns `true` when `value` is an `ArrayList`.
   *
   * @example
   * ```ts
   * new ArrayList() instanceof ArrayList // true
   * ```
   */
  static [Symbol.hasInstance](value: unknown): boolean {
    // biome-ignore lint/complexity/noThisInStatic: `this` is the class on the right of `instanceof`
    return brandedHasInstance(this, ArrayList, ARRAY_LIST_BRAND, value)
  }

  /**
   * Marks instances of this class so `instanceof` recognises them across copies of the package.
   * Its key is not exported, so the getter is not called directly. Time: O(1).
   */
  get [ARRAY_LIST_BRAND](): true {
    return true
  }

  /**
   * Marks lists so `isList` recognises them across copies of the package. Its key is not
   * exported, so the getter is not called directly. Time: O(1).
   */
  get [LIST_BRAND](): true {
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

  /** The number of elements. Time: O(1). */
  get size(): number {
    return this.engine.size
  }

  /**
   * A number that changes on every change to the contents — adding, removing, replacing or
   * sorting elements — and never on a read. Its exact values are unspecified. Time: O(1).
   */
  get revision(): number {
    return this.engine.revision
  }

  /** `'ArrayList'`, for `Object.prototype.toString`. Time: O(1). */
  get [Symbol.toStringTag](): string {
    return 'ArrayList'
  }

  /**
   * Returns whether the list has no elements.
   *
   * Time: O(1).
   *
   * @returns `size === 0`.
   *
   * @example
   * ```ts
   * new ArrayList().isEmpty() // true
   * ```
   */
  isEmpty(): boolean {
    return this.engine.isEmpty()
  }

  /**
   * Returns the element at `index`.
   *
   * Time: O(1).
   *
   * @param index - An integer with `0 <= index < size`.
   * @returns The element.
   * @throws IndexOutOfBoundsError when `index` is not an integer in range.
   *
   * @example
   * ```ts
   * new ArrayList(['a', 'b']).get(1) // 'b'
   * ```
   */
  get(index: number): E {
    return this.engine.get(index)
  }

  /**
   * Returns the first element.
   *
   * Time: O(1).
   *
   * @returns The element at index 0.
   * @throws NoSuchElementError when the list is empty.
   *
   * @example
   * ```ts
   * new ArrayList([1, 2]).getFirst() // 1
   * ```
   */
  getFirst(): E {
    return this.engine.getFirst()
  }

  /**
   * Returns the last element.
   *
   * Time: O(1).
   *
   * @returns The element at index `size - 1`.
   * @throws NoSuchElementError when the list is empty.
   *
   * @example
   * ```ts
   * new ArrayList([1, 2]).getLast() // 2
   * ```
   */
  getLast(): E {
    return this.engine.getLast()
  }

  /**
   * Returns the lowest index whose element is equal to `element` under SameValueZero, or `-1`.
   * Unlike `Array.prototype.indexOf`, `NaN` is found.
   *
   * Time: O(n).
   *
   * @param element - The value to look for.
   * @returns The index, or `-1`.
   *
   * @example
   * ```ts
   * new ArrayList([1, Number.NaN, 1]).indexOf(Number.NaN) // 1
   * ```
   */
  indexOf(element: E): number {
    return this.engine.indexOf(element)
  }

  /**
   * Returns the highest index whose element is equal to `element` under SameValueZero, or `-1`.
   *
   * Time: O(n).
   *
   * @param element - The value to look for.
   * @returns The index, or `-1`.
   *
   * @example
   * ```ts
   * new ArrayList([1, 2, 1]).lastIndexOf(1) // 2
   * ```
   */
  lastIndexOf(element: E): number {
    return this.engine.lastIndexOf(element)
  }

  /**
   * Returns whether some element is equal to `element` under SameValueZero.
   *
   * Time: O(n).
   *
   * @param element - The value to look for.
   * @returns `true` when present.
   *
   * @example
   * ```ts
   * new ArrayList([null]).has(null) // true
   * ```
   */
  has(element: E): boolean {
    return this.engine.has(element)
  }

  /**
   * Returns a new array of the elements, in order.
   *
   * Time: O(n).
   *
   * @returns A new array.
   *
   * @example
   * ```ts
   * new ArrayList([1, 2]).toArray() // [1, 2]
   * ```
   */
  toArray(): E[] {
    return this.engine.toArray()
  }

  /**
   * Appends `element` and returns the list, so calls chain.
   *
   * Time: amortised O(1).
   *
   * @param element - The element to append.
   * @returns The list.
   *
   * @example
   * ```ts
   * new ArrayList<number>().add(1).add(2) // ArrayList(2) [1, 2]
   * ```
   */
  add(element: E): this {
    this.engine.add(element)
    return this
  }

  /**
   * Inserts `element` at the front and returns the list.
   *
   * Time: O(n).
   *
   * @param element - The element to insert.
   * @returns The list.
   *
   * @example
   * ```ts
   * new ArrayList([2]).addFirst(1) // ArrayList(2) [1, 2]
   * ```
   */
  addFirst(element: E): this {
    this.engine.addFirst(element)
    return this
  }

  /**
   * Appends `element` and returns the list; the same as `add`.
   *
   * Time: amortised O(1).
   *
   * @param element - The element to append.
   * @returns The list.
   *
   * @example
   * ```ts
   * new ArrayList([1]).addLast(2) // ArrayList(2) [1, 2]
   * ```
   */
  addLast(element: E): this {
    this.engine.addLast(element)
    return this
  }

  /**
   * Inserts `element` at `index`, shifting later elements up by one, and returns the list.
   *
   * Time: O(size − index).
   *
   * @param index - An integer with `0 <= index <= size`.
   * @param element - The element to insert.
   * @returns The list.
   * @throws IndexOutOfBoundsError when `index` is not an integer in range.
   *
   * @example
   * ```ts
   * new ArrayList(['a', 'c']).insert(1, 'b') // ArrayList(3) ['a', 'b', 'c']
   * ```
   */
  insert(index: number, element: E): this {
    this.engine.insert(index, element)
    return this
  }

  /**
   * Inserts every element of `elements` at `index`, in order, after reading them all; a list may
   * insert itself.
   *
   * Time: O(size + m) for `m` elements.
   *
   * @param index - An integer with `0 <= index <= size`.
   * @param elements - The elements to insert.
   * @returns `true` when any element was inserted.
   * @throws IndexOutOfBoundsError when `index` is not an integer in range (checked first).
   * @throws TypeError when `elements` is not iterable.
   * @throws ConcurrentModificationError when reading `elements` changed the list.
   *
   * @example
   * ```ts
   * new ArrayList([1, 4]).insertAll(1, [2, 3]) // true; [1, 2, 3, 4]
   * ```
   */
  insertAll(index: number, elements: Iterable<E>): boolean {
    return this.engine.insertAll(index, elements)
  }

  /**
   * Appends every element of `elements`, in order, after reading them all.
   *
   * Time: O(m) amortised for `m` elements.
   *
   * @param elements - The elements to append.
   * @returns `true` when any element was added.
   * @throws TypeError when `elements` is not iterable.
   *
   * @example
   * ```ts
   * new ArrayList([1]).addAll([2, 3]) // true; [1, 2, 3]
   * ```
   */
  addAll(elements: Iterable<E>): boolean {
    return this.engine.addAll(elements)
  }

  /**
   * Replaces the element at `index` and returns the old one. `revision` changes; open iterators
   * stay valid.
   *
   * Time: O(1).
   *
   * @param index - An integer with `0 <= index < size`.
   * @param element - The new element.
   * @returns The element that was at `index`.
   * @throws IndexOutOfBoundsError when `index` is not an integer in range.
   *
   * @example
   * ```ts
   * new ArrayList(['a', 'b']).set(0, 'z') // 'a'; ['z', 'b']
   * ```
   */
  set(index: number, element: E): E {
    return this.engine.set(index, element)
  }

  /**
   * Removes and returns the element at `index`, shifting later elements down by one.
   *
   * Time: O(size − index).
   *
   * @param index - An integer with `0 <= index < size`.
   * @returns The removed element.
   * @throws IndexOutOfBoundsError when `index` is not an integer in range.
   *
   * @example
   * ```ts
   * new ArrayList([10, 20, 30]).removeAt(1) // 20; [10, 30]
   * ```
   */
  removeAt(index: number): E {
    return this.engine.removeAt(index)
  }

  /**
   * Removes the first element equal to `element` under SameValueZero. To remove by position, use
   * `removeAt`: on a list of numbers, `delete(1)` removes the value `1`, not index 1.
   *
   * Time: O(n).
   *
   * @param element - The value to remove.
   * @returns `true` when an element was removed.
   *
   * @example
   * ```ts
   * new ArrayList([3, 1, 3]).delete(3) // true; [1, 3]
   * ```
   */
  delete(element: E): boolean {
    return this.engine.delete(element)
  }

  /**
   * Removes and returns the first element.
   *
   * Time: O(n).
   *
   * @returns The removed element.
   * @throws NoSuchElementError when the list is empty.
   *
   * @example
   * ```ts
   * new ArrayList([1, 2]).removeFirst() // 1
   * ```
   */
  removeFirst(): E {
    return this.engine.removeFirst()
  }

  /**
   * Removes and returns the last element.
   *
   * Time: O(1).
   *
   * @returns The removed element.
   * @throws NoSuchElementError when the list is empty.
   *
   * @example
   * ```ts
   * new ArrayList([1, 2]).removeLast() // 2
   * ```
   */
  removeLast(): E {
    return this.engine.removeLast()
  }

  /**
   * Removes every element equal to one in `elements` (SameValueZero). Decides first, so an error
   * while deciding removes nothing.
   *
   * Time: O(n + m) for `m` elements.
   *
   * @param elements - The elements to remove.
   * @returns `true` when any element was removed.
   * @throws TypeError when `elements` is not iterable.
   *
   * @example
   * ```ts
   * new ArrayList([1, 2, 1, 3]).removeAll([1]) // true; [2, 3]
   * ```
   */
  removeAll(elements: Iterable<E>): boolean {
    return this.engine.removeAll(elements)
  }

  /**
   * Removes every element not equal to one in `elements` (SameValueZero). Decides first, so an
   * error while deciding removes nothing.
   *
   * Time: O(n + m) for `m` elements.
   *
   * @param elements - The elements to keep.
   * @returns `true` when any element was removed.
   * @throws TypeError when `elements` is not iterable.
   *
   * @example
   * ```ts
   * new ArrayList([1, 2, 3]).retainAll([2]) // true; [2]
   * ```
   */
  retainAll(elements: Iterable<E>): boolean {
    return this.engine.retainAll(elements)
  }

  /**
   * Calls `predicate(element, index, list)` on every element (indexes before any removal), then
   * removes those for which it returned a truthy value, as `Array.prototype.filter` reads its
   * callback. An error from `predicate` removes nothing.
   *
   * Time: O(n) plus the calls.
   *
   * @param predicate - Called with each element, its index and the list.
   * @returns `true` when any element was removed.
   * @throws TypeError when `predicate` is not a function.
   * @throws ConcurrentModificationError when `predicate` adds or removes elements.
   *
   * @example
   * ```ts
   * new ArrayList([1, -2, 3]).removeIf((n) => n < 0) // true; [1, 3]
   * ```
   */
  removeIf(predicate: (element: E, index: number, list: List<E>) => unknown): boolean {
    return this.engine.removeIf(predicate)
  }

  /**
   * Removes every element.
   *
   * Time: O(n).
   *
   * @example
   * ```ts
   * list.clear() // list.size === 0
   * ```
   */
  clear(): void {
    this.engine.clear()
  }

  /**
   * Replaces each element with `op(element, index, list)`, in index order. If `op` throws, the
   * elements before it are already replaced and the rest are unchanged. Open iterators stay valid.
   *
   * Time: O(n) plus the calls.
   *
   * @param op - Returns the replacement for each element.
   * @throws TypeError when `op` is not a function.
   * @throws ConcurrentModificationError when `op` adds or removes elements; the result of that
   *   call is not stored.
   *
   * @example
   * ```ts
   * new ArrayList([1, 2]).replaceAll((n) => n * 10) // [10, 20]
   * ```
   */
  replaceAll(op: (element: E, index: number, list: List<E>) => E): void {
    this.engine.replaceAll(op)
  }

  /**
   * Sorts the list in place, keeping equal elements in their order (stable), and returns it.
   * Without a comparator, natural order is used (numbers by value, strings by code unit, …).
   * Unlike `Array.prototype.sort`, `null` and `undefined` reach the comparator like any other
   * element (natural order rejects them: sort with `nullsLast(naturalOrder())` to put them last),
   * and a comparator result that is not a number throws. If anything throws, the list is left as
   * it was.
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
   *
   * @example
   * ```ts
   * new ArrayList(['b', 'a']).sort()                     // ['a', 'b']
   * new ArrayList([1, 2, 3]).sort(reverseOrder())        // [3, 2, 1]
   * new ArrayList([2, null, 1]).sort(nullsLast(naturalOrder<number>())) // [1, 2, null]
   * ```
   */
  sort(comparator?: Comparator<E>): this {
    this.engine.sort(comparator)
    return this
  }

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
   *
   * @example
   * ```ts
   * new ArrayList(['a', 'b']).forEach((s, i) => console.log(i, s))
   * ```
   */
  forEach(action: (element: E, index: number, list: List<E>) => void, thisArg?: unknown): void {
    this.engine.forEach(action, thisArg)
  }

  /**
   * Returns an iterator over the elements in index order.
   *
   * Time: O(1) to create; O(1) per step.
   *
   * @returns A new iterator.
   * @throws ConcurrentModificationError (from `next()`) when the list is changed structurally
   *   (elements added or removed, or a sort) after the iterator is created, including through a
   *   cursor.
   *
   * @example
   * ```ts
   * for (const element of new ArrayList([1, 2])) console.log(element)
   * ```
   */
  [Symbol.iterator](): IterableIterator<E> {
    return this.engine[Symbol.iterator]()
  }

  /**
   * Returns a cursor positioned before the first element; the same as `listCursor()`.
   *
   * Time: O(1).
   *
   * @returns A new cursor.
   *
   * @example
   * ```ts
   * const cursor = list.cursor()
   * while (cursor.hasNext()) if (cursor.next() < 0) cursor.remove()
   * ```
   */
  cursor(): ListCursor<E> {
    return this.engine.cursor()
  }

  /**
   * Returns a cursor positioned before `index` (0 when omitted) that moves both ways and can
   * replace, insert and remove at its position.
   *
   * Time: O(1).
   *
   * @param index - An integer with `0 <= index <= size`.
   * @returns A new cursor.
   * @throws IndexOutOfBoundsError when `index` is not an integer in range.
   *
   * @example
   * ```ts
   * const cursor = list.listCursor(list.size)
   * while (cursor.hasPrevious()) console.log(cursor.previous())
   * ```
   */
  listCursor(index?: number): ListCursor<E> {
    return this.engine.listCursor(index)
  }

  /**
   * Returns a live view of the elements from `from` (inclusive) to `to` (exclusive). Changes
   * through the view reach this list. Once this list is changed structurally (elements added or
   * removed, or a sort) other than through the view, the view throws
   * `ConcurrentModificationError`.
   *
   * Time: O(1); each operation on the view costs what it costs on this list at the mapped index;
   * a change of size also updates each enclosing sub-list, one step per level of nesting.
   *
   * @param from - Start of the range, inclusive.
   * @param to - End of the range, exclusive.
   * @returns The view.
   * @throws IndexOutOfBoundsError when `from < 0`, `to > size` or a bound is not an integer.
   * @throws IllegalArgumentError when `from > to`.
   *
   * @example
   * ```ts
   * const list = new ArrayList([0, 1, 2, 3, 4])
   * list.subList(1, 4).clear() // list is [0, 4]
   * ```
   */
  subList(from: number, to: number): List<E> {
    return this.engine.subList(from, to)
  }

  /**
   * Returns a live view of this list in reverse order: index `i` of the view is index
   * `size - 1 - i` of this list. `reversed().reversed()` returns this list.
   *
   * Time: O(1); each operation on the view costs what it costs on this list at the mirrored index.
   *
   * @returns The reversed view.
   *
   * @example
   * ```ts
   * const list = new ArrayList([1, 2, 3])
   * list.reversed().getFirst() // 3
   * list.reversed().addFirst(4) // list is [1, 2, 3, 4]
   * ```
   */
  reversed(): List<E> {
    return this.engine.reversed()
  }

  /**
   * Returns a new `ArrayList` with the same elements, independent of this one (the elements
   * themselves are not copied).
   *
   * Time: O(n).
   *
   * @returns The copy.
   *
   * @example
   * ```ts
   * const copy = list.copy()
   * copy.add(1) // list is unchanged
   * ```
   */
  copy(): ArrayList<E> {
    return new ArrayList(this.engine.items)
  }

  /**
   * Returns whether `other` is a list (any implementation or view, from any copy of the package)
   * with the same size whose elements are equal in order under `equals(a, b)`.
   *
   * Time: O(n) plus element comparisons.
   *
   * @param other - Any value.
   * @returns `true` when equal.
   *
   * @example
   * ```ts
   * new ArrayList([1, 2]).equals(new ArrayList([1, 2])) // true
   * new ArrayList([1, 2]).equals([1, 2])                // false: an array is not a list
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
   * The value-equality protocol: equal lists give equal hashes. The value is unspecified.
   * Time: O(n) plus element hashes.
   */
  [hashCodeSymbol](hash: HashFunction): number {
    return this.engine[hashCodeSymbol](hash)
  }

  /**
   * Returns the class name, size and elements, e.g. `ArrayList(3) [1, 2, 'a']`.
   *
   * Time: O(length of the output) for flat contents.
   *
   * @returns The text.
   *
   * @example
   * ```ts
   * String(new ArrayList([1, 'a'])) // "ArrayList(2) [1, 'a']"
   * ```
   */
  toString(): string {
    return this.engine.toString()
  }

  /**
   * Returns a new array of the elements, so `JSON.stringify` writes the list as an array.
   *
   * Time: O(n).
   *
   * @returns A new array.
   *
   * @example
   * ```ts
   * JSON.stringify(new ArrayList([1, 2])) // '[1,2]'
   * ```
   */
  toJSON(): E[] {
    return this.engine.toJSON()
  }

  /**
   * Node's inspect hook: `ArrayList(2) [ 1, 2 ]` in `console.log`. Time: as `toString`.
   */
  [INSPECT](
    depth: number | null,
    options: object,
    inspect: (value: unknown, options: object) => string,
  ): string {
    return this.engine[INSPECT](depth, options, inspect)
  }
}
