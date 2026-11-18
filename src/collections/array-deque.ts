/**
 * `ArrayDeque`: a double-ended queue stored in a circular array.
 *
 * @packageDocumentation
 */

import type { Cursor } from '../interfaces/collection'
import type { Deque } from '../interfaces/queue'
import {
  brandedHasInstance,
  DEQUE_BRAND,
  QUEUE_BRAND,
  SEQUENCED_COLLECTION_BRAND,
} from '../internal/brand'
import { describeValue, isIterable, requireFunction } from '../internal/checks'
import { ArrayDequeEngine } from '../internal/engines/array-deque-engine'
import { equalsSymbol, type HashFunction, hashCodeSymbol } from '../internal/equality'
import { apply } from '../internal/intrinsics'
import { COLLECTION_BRAND, INSPECT } from '../internal/output'

const ARRAY_DEQUE_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/ArrayDeque',
)

function notIterable(where: string, value: unknown): TypeError {
  return new TypeError(`${where}: elements is not iterable (${describeValue(value)})`)
}

/**
 * A double-ended queue stored in a circular array: adding at either end is amortised O(1) and
 * removing is O(1), so
 * it serves as a first-in-first-out queue (`add` + `poll`), as a stack (`push` + `pop`, at the
 * end, as on an array) or as a buffer worked from both ends.
 *
 * `null` and `undefined` are not allowed as elements, so `poll()`, `peek()` and `pop()` returning
 * `undefined` always means the deque is empty. Two deques are equal only when they are the same
 * object; compare `toArray()` results to compare contents. Adding or removing while iterating
 * throws `ConcurrentModificationError`; use a cursor to remove while iterating.
 *
 * The class is not designed to be subclassed.
 *
 * @example
 * ```ts
 * const queue = new ArrayDeque<string>()
 * queue.add('a').add('b')
 * queue.poll() // 'a'
 *
 * const stack = new ArrayDeque([1, 2])
 * stack.push(3)
 * stack.pop() // 3
 * ```
 *
 * @sealed
 */
export class ArrayDeque<E> implements Deque<E> {
  private readonly engine: ArrayDequeEngine<E>

  /**
   * Creates a deque holding the elements of `elements`, in order (the first is the front); empty
   * when `elements` is omitted, `undefined` or `null` (as `new Set(null)` is).
   *
   * Time: O(m) for `m` elements.
   *
   * @param elements - The initial elements.
   * @throws TypeError when `elements` is neither iterable nor `null`/`undefined`.
   * @throws NullElementError when an element is `null` or `undefined`.
   * @throws IllegalStateError when the elements would not fit (over 2^30 in total).
   *
   * @example
   * ```ts
   * new ArrayDeque(['a', 'b']) // ArrayDeque(2) ['a', 'b']
   * ```
   */
  constructor(elements?: Iterable<E> | null) {
    this.engine = new ArrayDequeEngine<E>(this)
    if (elements === undefined || elements === null) return
    if (!isIterable(elements)) throw notIterable('ArrayDeque', elements)
    const items: E[] = []
    for (const element of elements) items.push(element)
    this.engine.appendAll(items, 'ArrayDeque')
  }

  /**
   * Returns a new deque of the elements of `elements`, in order, like `Array.from` but for
   * iterables only.
   *
   * Time: O(m) for `m` elements.
   *
   * @param elements - The elements.
   * @returns A new deque.
   * @throws TypeError when `elements` is not iterable (`null`, `undefined` and array-likes
   *   included).
   * @throws NullElementError when an element is `null` or `undefined`.
   * @throws IllegalStateError when the elements would not fit (over 2^30 in total).
   *
   * @example
   * ```ts
   * ArrayDeque.from(new Set([1, 2])) // ArrayDeque(2) [1, 2]
   * ```
   */
  static from<T>(elements: Iterable<T>): ArrayDeque<T>
  /**
   * Returns a new deque of `mapFn(element, index)` for each element of `elements`, in order, with
   * `this` set to `thisArg`, as `Array.from` does.
   *
   * Time: O(m) plus the calls.
   *
   * @param elements - The elements.
   * @param mapFn - Called with each element and its index; its result is stored.
   * @param thisArg - The `this` value for `mapFn`.
   * @returns A new deque.
   * @throws TypeError when `mapFn` is not a function (checked first) or `elements` is not
   *   iterable.
   * @throws NullElementError when `mapFn` returns `null` or `undefined`.
   * @throws IllegalStateError when the elements would not fit (over 2^30 in total).
   *
   * @example
   * ```ts
   * ArrayDeque.from([1, 2], (n) => n * 10) // ArrayDeque(2) [10, 20]
   * ```
   */
  static from<T, U>(
    elements: Iterable<T>,
    mapFn: (element: T, index: number) => U,
    thisArg?: unknown,
  ): ArrayDeque<U>
  static from<T, U>(
    elements: Iterable<T>,
    mapFn?: (element: T, index: number) => U,
    thisArg?: unknown,
  ): ArrayDeque<T | U> {
    if (mapFn !== undefined) requireFunction(mapFn, 'ArrayDeque.from', 'mapFn')
    if (!isIterable(elements)) throw notIterable('ArrayDeque.from', elements)
    const items: Array<T | U> = []
    let index = 0
    for (const element of elements) {
      items.push(mapFn === undefined ? element : (apply(mapFn, thisArg, [element, index]) as U))
      index++
    }
    const deque = new ArrayDeque<T | U>()
    deque.engine.appendAll(items, 'ArrayDeque.from')
    return deque
  }

  /**
   * Returns whether `value` is an `ArrayDeque`, including one created by another copy of the
   * library with the same major version. A reversed view is not an `ArrayDeque`.
   *
   * Time: O(1).
   *
   * @param value - The value on the left of `instanceof`.
   * @returns `true` when `value` is an `ArrayDeque`.
   *
   * @example
   * ```ts
   * new ArrayDeque() instanceof ArrayDeque // true
   * ```
   */
  static [Symbol.hasInstance](value: unknown): boolean {
    // biome-ignore lint/complexity/noThisInStatic: `this` is the class on the right of `instanceof`
    return brandedHasInstance(this, ArrayDeque, ARRAY_DEQUE_BRAND, value)
  }

  /**
   * Marks instances of this class so `instanceof` recognises them across copies of the package.
   * Its key is not exported, so the getter is not called directly. Time: O(1).
   */
  get [ARRAY_DEQUE_BRAND](): true {
    return true
  }

  /**
   * Marks deques so `isDeque` recognises them across copies of the package. Its key is not
   * exported, so the getter is not called directly. Time: O(1).
   */
  get [DEQUE_BRAND](): true {
    return true
  }

  /**
   * Marks queues so `isQueue` recognises them across copies of the package. Its key is not
   * exported, so the getter is not called directly. Time: O(1).
   */
  get [QUEUE_BRAND](): true {
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
   * A number that changes on every change to the contents and never on a read. Its exact values
   * are unspecified. Time: O(1).
   */
  get revision(): number {
    return this.engine.revision
  }

  /** `'ArrayDeque'`, for `Object.prototype.toString`. Time: O(1). */
  get [Symbol.toStringTag](): string {
    return 'ArrayDeque'
  }

  /**
   * Returns whether the deque has no elements.
   *
   * Time: O(1).
   *
   * @returns `size === 0`.
   *
   * @example
   * ```ts
   * new ArrayDeque().isEmpty() // true
   * ```
   */
  isEmpty(): boolean {
    return this.engine.isEmpty()
  }

  /**
   * Adds `element` at the end and returns the deque, so calls chain.
   *
   * Time: amortised O(1).
   *
   * @param element - The element to add.
   * @returns The deque.
   * @throws NullElementError when `element` is `null` or `undefined`.
   * @throws IllegalStateError when the deque already holds the most elements it can.
   *
   * @example
   * ```ts
   * new ArrayDeque<number>().add(1).add(2) // ArrayDeque(2) [1, 2]
   * ```
   */
  add(element: E): this {
    this.engine.add(element)
    return this
  }

  /**
   * Adds `element` at the end, as `add` does, and returns the deque. Unlike
   * `Array.prototype.push`, it returns the deque, not the new length.
   *
   * Time: amortised O(1).
   *
   * @param element - The element to add.
   * @returns The deque.
   * @throws NullElementError when `element` is `null` or `undefined`.
   * @throws IllegalStateError when the deque already holds the most elements it can.
   *
   * @example
   * ```ts
   * new ArrayDeque([1]).push(2) // ArrayDeque(2) [1, 2]
   * ```
   */
  push(element: E): this {
    this.engine.push(element)
    return this
  }

  /**
   * Adds `element` at the end and returns the deque; the same as `add`.
   *
   * Time: amortised O(1).
   *
   * @param element - The element to add.
   * @returns The deque.
   * @throws NullElementError when `element` is `null` or `undefined`.
   * @throws IllegalStateError when the deque already holds the most elements it can.
   *
   * @example
   * ```ts
   * new ArrayDeque([1]).addLast(2) // ArrayDeque(2) [1, 2]
   * ```
   */
  addLast(element: E): this {
    this.engine.addLast(element)
    return this
  }

  /**
   * Adds `element` at the front and returns the deque.
   *
   * Time: amortised O(1).
   *
   * @param element - The element to add.
   * @returns The deque.
   * @throws NullElementError when `element` is `null` or `undefined`.
   * @throws IllegalStateError when the deque already holds the most elements it can.
   *
   * @example
   * ```ts
   * new ArrayDeque([2]).addFirst(1) // ArrayDeque(2) [1, 2]
   * ```
   */
  addFirst(element: E): this {
    this.engine.addFirst(element)
    return this
  }

  /**
   * Adds every element of `elements` at the end, in order, after reading and checking them all:
   * if any is `null` or `undefined`, nothing is added.
   *
   * Time: amortised O(m) for `m` elements.
   *
   * @param elements - The elements to add.
   * @returns `true` when any element was added.
   * @throws TypeError when `elements` is not iterable.
   * @throws NullElementError when an element is `null` or `undefined`.
   * @throws IllegalStateError when the elements would not fit (over 2^30 in total).
   *
   * @example
   * ```ts
   * new ArrayDeque([1]).addAll([2, 3]) // true; [1, 2, 3]
   * ```
   */
  addAll(elements: Iterable<E>): boolean {
    return this.engine.addAll(elements)
  }

  /**
   * Removes and returns the first element, or returns `undefined` when the deque is empty.
   *
   * Time: O(1).
   *
   * @returns The removed element, or `undefined`.
   *
   * @example
   * ```ts
   * new ArrayDeque(['a', 'b']).poll() // 'a'
   * ```
   */
  poll(): E | undefined {
    return this.engine.poll()
  }

  /**
   * Removes and returns the last element, or returns `undefined` when the deque is empty, as
   * `Array.prototype.pop` does.
   *
   * Time: O(1).
   *
   * @returns The removed element, or `undefined`.
   *
   * @example
   * ```ts
   * new ArrayDeque([1, 2]).pop() // 2
   * ```
   */
  pop(): E | undefined {
    return this.engine.pop()
  }

  /**
   * Removes and returns the first element.
   *
   * Time: O(1).
   *
   * @returns The removed element.
   * @throws NoSuchElementError when the deque is empty.
   *
   * @example
   * ```ts
   * new ArrayDeque([1, 2]).removeFirst() // 1
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
   * @throws NoSuchElementError when the deque is empty.
   *
   * @example
   * ```ts
   * new ArrayDeque([1, 2]).removeLast() // 2
   * ```
   */
  removeLast(): E {
    return this.engine.removeLast()
  }

  /**
   * Returns the first element without removing it, or `undefined` when the deque is empty.
   *
   * Time: O(1).
   *
   * @returns The first element, or `undefined`.
   *
   * @example
   * ```ts
   * new ArrayDeque([1, 2]).peek() // 1
   * ```
   */
  peek(): E | undefined {
    return this.engine.peek()
  }

  /**
   * Returns the last element without removing it, or `undefined` when the deque is empty.
   *
   * Time: O(1).
   *
   * @returns The last element, or `undefined`.
   *
   * @example
   * ```ts
   * new ArrayDeque([1, 2]).peekLast() // 2
   * ```
   */
  peekLast(): E | undefined {
    return this.engine.peekLast()
  }

  /**
   * Returns the first element.
   *
   * Time: O(1).
   *
   * @returns The first element.
   * @throws NoSuchElementError when the deque is empty.
   *
   * @example
   * ```ts
   * new ArrayDeque([1, 2]).getFirst() // 1
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
   * @returns The last element.
   * @throws NoSuchElementError when the deque is empty.
   *
   * @example
   * ```ts
   * new ArrayDeque([1, 2]).getLast() // 2
   * ```
   */
  getLast(): E {
    return this.engine.getLast()
  }

  /**
   * Returns whether some element is equal to `element` under SameValueZero; always `false` for
   * `null` and `undefined`.
   *
   * Time: O(n).
   *
   * @param element - The value to look for.
   * @returns `true` when present.
   *
   * @example
   * ```ts
   * new ArrayDeque([1, 2]).has(2) // true
   * ```
   */
  has(element: E): boolean {
    return this.engine.has(element)
  }

  /**
   * Removes the first element equal to `element` under SameValueZero, searching from the front.
   * `reversed().delete(element)` removes the last one instead.
   *
   * Time: O(n).
   *
   * @param element - The value to remove.
   * @returns `true` when an element was removed.
   *
   * @example
   * ```ts
   * new ArrayDeque([1, 2, 1]).delete(1) // true; [2, 1]
   * ```
   */
  delete(element: E): boolean {
    return this.engine.delete(element)
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
   * new ArrayDeque([1, 2, 1]).removeAll([1]) // true; [2]
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
   * new ArrayDeque([1, 2, 3]).retainAll([2]) // true; [2]
   * ```
   */
  retainAll(elements: Iterable<E>): boolean {
    return this.engine.retainAll(elements)
  }

  /**
   * Calls `predicate(element)` on every element, then removes those for which it returned a truthy
   * value; an error from `predicate` removes nothing.
   *
   * Time: O(n) plus the calls.
   *
   * @param predicate - Called with each element.
   * @returns `true` when any element was removed.
   * @throws TypeError when `predicate` is not a function.
   * @throws ConcurrentModificationError when `predicate` adds or removes elements.
   *
   * @example
   * ```ts
   * new ArrayDeque([1, -2, 3]).removeIf((n) => n < 0) // true; [1, 3]
   * ```
   */
  removeIf(predicate: (element: E) => unknown): boolean {
    return this.engine.removeIf(predicate)
  }

  /**
   * Removes every element.
   *
   * Time: O(n).
   *
   * @example
   * ```ts
   * deque.clear() // deque.size === 0
   * ```
   */
  clear(): void {
    this.engine.clear()
  }

  /**
   * Returns a new array of the elements, from first to last.
   *
   * Time: O(n).
   *
   * @returns A new array.
   *
   * @example
   * ```ts
   * new ArrayDeque([1, 2]).toArray() // [1, 2]
   * ```
   */
  toArray(): E[] {
    return this.engine.toArray()
  }

  /**
   * Calls `action(element)` for each element from first to last, with `this` set to `thisArg`.
   *
   * Time: O(n) plus the calls.
   *
   * @param action - Called with each element.
   * @param thisArg - The `this` value for `action`.
   * @throws TypeError when `action` is not a function.
   * @throws ConcurrentModificationError when `action` adds or removes elements.
   *
   * @example
   * ```ts
   * new ArrayDeque(['a', 'b']).forEach((s) => console.log(s))
   * ```
   */
  forEach(action: (element: E) => void, thisArg?: unknown): void {
    this.engine.forEach(action, thisArg)
  }

  /**
   * Returns an iterator over the elements from first to last.
   *
   * Time: O(1) to create; O(1) per step.
   *
   * @returns A new iterator.
   * @throws ConcurrentModificationError (from `next()`) when elements are added or removed after
   *   the iterator is created, including through a cursor.
   *
   * @example
   * ```ts
   * for (const element of new ArrayDeque([1, 2])) console.log(element)
   * ```
   */
  [Symbol.iterator](): IterableIterator<E> {
    return this.engine[Symbol.iterator]()
  }

  /**
   * Returns a cursor positioned before the first element; `remove()` removes the element `next()`
   * returned. `reversed().cursor()` walks from the last element to the first.
   *
   * Time: O(1) to create; `next` O(1); `remove` O(n).
   *
   * @returns A new cursor.
   *
   * @example
   * ```ts
   * const cursor = deque.cursor()
   * while (cursor.hasNext()) if (cursor.next() < 0) cursor.remove()
   * ```
   */
  cursor(): Cursor<E> {
    return this.engine.cursor()
  }

  /**
   * Returns a live view of this deque in reverse order: its first element is this deque's last,
   * and changes through either show in both (the view's `push` adds at this deque's front, its
   * `poll` is this deque's `pop`). `reversed().reversed()` returns this deque.
   *
   * Time: O(1); each operation on the view costs what its mirror costs.
   *
   * @returns The reversed view.
   *
   * @example
   * ```ts
   * const deque = new ArrayDeque([1, 2, 3])
   * deque.reversed().peek()   // 3
   * deque.reversed().delete(1) // removes the last 1
   * ```
   */
  reversed(): Deque<E> {
    return this.engine.reversed()
  }

  /**
   * Returns a new `ArrayDeque` with the same elements in the same order, independent of this one
   * (the elements themselves are not copied).
   *
   * Time: O(n).
   *
   * @returns The copy.
   *
   * @example
   * ```ts
   * const copy = deque.copy()
   * copy.poll() // deque is unchanged
   * ```
   */
  copy(): ArrayDeque<E> {
    return new ArrayDeque(this.engine.toArray())
  }

  /**
   * Returns whether `other` is this deque. Deques compare by identity; compare `toArray()` to
   * compare contents. Called through a `Proxy` of the deque, it is `true` for that proxy too; the deque itself
   * does not know its proxies, so `deque.equals(proxy)` is `false`.
   *
   * Time: O(1).
   *
   * @param other - Any value.
   * @returns `true` when `other` is this deque.
   *
   * @example
   * ```ts
   * new ArrayDeque([1]).equals(new ArrayDeque([1])) // false
   * ```
   */
  equals(other: unknown): boolean {
    return other === this || this.engine.equals(other)
  }

  /** The value-equality protocol; delegates to `equals` (identity). Time: O(1). */
  [equalsSymbol](other: unknown): boolean {
    return other === this || this.engine.equals(other)
  }

  /** The value-equality protocol: an identity hash, unspecified in value. Time: O(1). */
  [hashCodeSymbol](hash: HashFunction): number {
    return this.engine[hashCodeSymbol](hash)
  }

  /**
   * Returns the class name, size and elements, e.g. `ArrayDeque(2) [1, 'a']`.
   *
   * Time: O(length of the output) for flat contents.
   *
   * @returns The text.
   *
   * @example
   * ```ts
   * String(new ArrayDeque([1, 'a'])) // "ArrayDeque(2) [1, 'a']"
   * ```
   */
  toString(): string {
    return this.engine.toString()
  }

  /**
   * Returns a new array of the elements, so `JSON.stringify` writes the deque as an array.
   *
   * Time: O(n).
   *
   * @returns A new array.
   *
   * @example
   * ```ts
   * JSON.stringify(new ArrayDeque([1, 2])) // '[1,2]'
   * ```
   */
  toJSON(): E[] {
    return this.engine.toJSON()
  }

  /** Node's inspect hook: `ArrayDeque(2) [ 1, 2 ]` in `console.log`. Time: as `toString`. */
  [INSPECT](
    depth: number | null,
    options: object,
    inspect: (value: unknown, options: object) => string,
  ): string {
    return this.engine[INSPECT](depth, options, inspect)
  }
}
