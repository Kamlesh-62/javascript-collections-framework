/**
 * `PriorityQueue`: a queue that always hands out its least element next, stored as a binary heap.
 *
 * @packageDocumentation
 */

import type { Comparator } from '../functions/comparators'
import type { Cursor } from '../interfaces/collection'
import type { Queue } from '../interfaces/queue'
import { brandedHasInstance, QUEUE_BRAND } from '../internal/brand'
import { describeValue, isIterable } from '../internal/checks'
import { BinaryHeapEngine } from '../internal/engines/binary-heap-engine'
import { equalsSymbol, type HashFunction, hashCodeSymbol } from '../internal/equality'
import { COLLECTION_BRAND, INSPECT } from '../internal/output'

const PRIORITY_QUEUE_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/PriorityQueue',
)

/** Options for a `PriorityQueue`. */
export interface PriorityQueueOptions<E> {
  /**
   * The order of the queue: `poll()` returns an element for which no other element compares less.
   * Natural order (numbers, strings, bigints, booleans, dates or `[compareSymbol]` objects) when
   * omitted.
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
 * A queue that always hands out its least element next, stored as a binary heap: `add` and `poll`
 * cost O(log n) and `peek` O(1). The order is the natural order of the elements, or the
 * `comparator` option.
 *
 * Iteration, `toArray`, `toJSON` and `toString` visit the elements in heap order, which is not
 * sorted; take them out with `poll` in a loop for sorted output. Which of several equal elements
 * is polled first is unspecified. `null` and `undefined` are not allowed as elements, so `poll()`
 * and `peek()` returning `undefined` always means the queue is empty. A comparator that throws or
 * returns `NaN` leaves the queue as it was. Two queues are equal only when they are the same
 * object. Adding or removing while iterating throws `ConcurrentModificationError`; use a cursor to
 * remove while iterating.
 *
 * The class is not designed to be subclassed.
 *
 * @example
 * ```ts
 * const tasks = new PriorityQueue<{ name: string; priority: number }>({
 *   comparator: (a, b) => a.priority - b.priority,
 * })
 * tasks.add({ name: 'deploy', priority: 2 }).add({ name: 'fix', priority: 1 })
 * tasks.poll() // { name: 'fix', priority: 1 }
 *
 * const numbers = new PriorityQueue([5, 1, 3])
 * const sorted: number[] = []
 * while (!numbers.isEmpty()) sorted.push(numbers.poll()!) // [1, 3, 5]
 * ```
 *
 * @sealed
 */
export class PriorityQueue<E> implements Queue<E> {
  private readonly engine: BinaryHeapEngine<E>

  /**
   * Creates a queue in natural order holding the elements of `elements`; empty when `elements` is
   * omitted, `undefined` or `null`.
   *
   * Time: O(m) for `m` elements, with at most 2m comparisons.
   *
   * @param elements - The initial elements. The comparator of a `PriorityQueue` given here is not
   *   used; pass it as an option, or call `copy()`.
   * @throws TypeError when `elements` is neither iterable nor `null`/`undefined`.
   * @throws NullElementError when an element is `null` or `undefined`.
   * @throws ClassCastError when the elements cannot be compared in natural order.
   *
   * @example
   * ```ts
   * new PriorityQueue([3, 1, 2]).peek() // 1
   * ```
   */
  constructor(elements?: Iterable<E> | null)
  /**
   * Creates an empty queue with the given options.
   *
   * Time: O(1).
   *
   * @param options - The options; `comparator` is read once.
   * @throws TypeError when `comparator` is neither `undefined` nor a function.
   *
   * @example
   * ```ts
   * new PriorityQueue<string>({ comparator: (a, b) => b.length - a.length })
   * ```
   */
  constructor(options: PriorityQueueOptions<E>)
  /**
   * Creates a queue holding the elements of `elements` (empty when `undefined` or `null`), ordered
   * by `options.comparator`, or by natural order when it is omitted.
   *
   * Time: O(m) for `m` elements, with at most 2m comparisons.
   *
   * @param elements - The initial elements.
   * @param options - The options; `comparator` is read once.
   * @throws TypeError when `elements` is neither iterable nor `null`/`undefined`, when `options`
   *   is not an object, or when `comparator` is neither `undefined` nor a function.
   * @throws NullElementError when an element is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, the elements cannot be compared.
   *
   * @example
   * ```ts
   * new PriorityQueue([1, 3, 2], { comparator: (a, b) => b - a }).peek() // 3
   * ```
   */
  constructor(elements: Iterable<E> | null | undefined, options?: PriorityQueueOptions<E>)
  constructor(
    elementsOrOptions?: Iterable<E> | PriorityQueueOptions<E> | null,
    options?: PriorityQueueOptions<E>,
  ) {
    let elements: Iterable<E> | undefined
    let settings: object | undefined
    const first: unknown = elementsOrOptions
    if (options === undefined) {
      if (first === undefined || first === null) {
        // An empty queue in natural order.
      } else if (isIterable(first)) {
        elements = first as Iterable<E>
      } else if (typeof first === 'object') {
        settings = first
      } else {
        throw notIterable('PriorityQueue', first)
      }
    } else {
      if (first !== undefined && first !== null) {
        if (!isIterable(first)) throw notIterable('PriorityQueue', first)
        elements = first as Iterable<E>
      }
      requireOptions(options, 'PriorityQueue')
      settings = options
    }
    this.engine = new BinaryHeapEngine<E>(this, readComparator<E>(settings, 'PriorityQueue'))
    if (elements !== undefined) this.engine.build(readElements(elements), 'PriorityQueue')
  }

  /**
   * Returns a new queue of the elements of `elements`, ordered by `options.comparator`, or by
   * natural order when it is omitted. The comparator of a `PriorityQueue` given as `elements` is
   * not used.
   *
   * Time: O(m) for `m` elements, with at most 2m comparisons.
   *
   * @param elements - The elements.
   * @param options - The options; `comparator` is read once.
   * @returns A new queue.
   * @throws TypeError when `elements` is not iterable (`null` and `undefined` included), when
   *   `options` is given and is not an object, or when `comparator` is neither `undefined` nor a
   *   function.
   * @throws NullElementError when an element is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, the elements cannot be compared.
   *
   * @example
   * ```ts
   * PriorityQueue.from(new Set(['b', 'a'])).poll() // 'a'
   * ```
   */
  static from<T>(elements: Iterable<T>, options?: PriorityQueueOptions<T>): PriorityQueue<T> {
    if (options !== undefined) requireOptions(options, 'PriorityQueue.from')
    const comparator = readComparator<T>(options, 'PriorityQueue.from')
    if (!isIterable(elements)) throw notIterable('PriorityQueue.from', elements)
    const queue = new PriorityQueue<T>(null, { comparator })
    queue.engine.build(readElements(elements), 'PriorityQueue.from')
    return queue
  }

  /**
   * Returns whether `value` is a `PriorityQueue`, including one created by another copy of the
   * library with the same major version.
   *
   * Time: O(1).
   *
   * @param value - The value on the left of `instanceof`.
   * @returns `true` when `value` is a `PriorityQueue`.
   *
   * @example
   * ```ts
   * new PriorityQueue() instanceof PriorityQueue // true
   * ```
   */
  static [Symbol.hasInstance](value: unknown): boolean {
    // biome-ignore lint/complexity/noThisInStatic: `this` is the class on the right of `instanceof`
    return brandedHasInstance(this, PriorityQueue, PRIORITY_QUEUE_BRAND, value)
  }

  /**
   * Marks instances of this class so `instanceof` recognises them across copies of the package.
   * Its key is not exported, so the getter is not called directly. Time: O(1).
   */
  get [PRIORITY_QUEUE_BRAND](): true {
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

  /** `'PriorityQueue'`, for `Object.prototype.toString`. Time: O(1). */
  get [Symbol.toStringTag](): string {
    return 'PriorityQueue'
  }

  /**
   * Returns the comparator given at construction, or `undefined` when the queue uses natural
   * order.
   *
   * Time: O(1).
   *
   * @returns The comparator, or `undefined`.
   *
   * @example
   * ```ts
   * const byLength = (a: string, b: string) => a.length - b.length
   * new PriorityQueue({ comparator: byLength }).comparator() === byLength // true
   * new PriorityQueue().comparator() // undefined
   * ```
   */
  comparator(): Comparator<E> | undefined {
    return this.engine.comparator
  }

  /**
   * Returns whether the queue has no elements.
   *
   * Time: O(1).
   *
   * @returns `size === 0`.
   *
   * @example
   * ```ts
   * new PriorityQueue().isEmpty() // true
   * ```
   */
  isEmpty(): boolean {
    return this.engine.isEmpty()
  }

  /**
   * Adds `element` and returns the queue, so calls chain. On an error nothing is added.
   *
   * Time: O(log n), with at most ⌊log2 n⌋ + 1 comparisons, where n is the size after the add.
   *
   * @param element - The element to add.
   * @returns The queue.
   * @throws NullElementError when `element` is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, `element` cannot be compared with the elements.
   * @throws TypeError when the comparator returns a non-number or `NaN`.
   * @throws ConcurrentModificationError when the comparator adds or removes elements of this
   *   queue.
   *
   * @example
   * ```ts
   * new PriorityQueue<number>().add(2).add(1).peek() // 1
   * ```
   */
  add(element: E): this {
    this.engine.add(element)
    return this
  }

  /**
   * Adds every element of `elements`, one at a time, after reading them all and checking that none
   * is `null` or `undefined` (if one is, nothing is added). If a comparison fails part-way, the
   * elements added before it stay.
   *
   * Time: O(m log(n + m)) for `m` elements.
   *
   * @param elements - The elements to add.
   * @returns `true` when any element was added.
   * @throws TypeError when `elements` is not iterable, or the comparator returns a non-number or
   *   `NaN`.
   * @throws NullElementError when an element is `null` or `undefined`.
   * @throws ClassCastError when, in natural order, an element cannot be compared.
   * @throws ConcurrentModificationError when the comparator adds or removes elements of this
   *   queue.
   *
   * @example
   * ```ts
   * new PriorityQueue([5]).addAll([3, 4]) // true; peek() is 3
   * ```
   */
  addAll(elements: Iterable<E>): boolean {
    return this.engine.addAll(elements)
  }

  /**
   * Removes and returns the least element, or returns `undefined` when the queue is empty. On an
   * error nothing is removed.
   *
   * Time: O(log n), with at most 2⌊log2 n⌋ comparisons.
   *
   * @returns The removed element, or `undefined`.
   * @throws TypeError when the comparator returns a non-number or `NaN`.
   * @throws ConcurrentModificationError when the comparator adds or removes elements of this
   *   queue.
   *
   * @example
   * ```ts
   * new PriorityQueue([2, 1]).poll() // 1
   * ```
   */
  poll(): E | undefined {
    return this.engine.poll()
  }

  /**
   * Returns the least element, the one `poll()` returns next, without removing it, or `undefined`
   * when the queue is empty. The comparator is not called.
   *
   * Time: O(1).
   *
   * @returns The least element, or `undefined`.
   *
   * @example
   * ```ts
   * new PriorityQueue([2, 1]).peek() // 1
   * ```
   */
  peek(): E | undefined {
    return this.engine.peek()
  }

  /**
   * Returns whether some element is equal to `element` under SameValueZero (not under the
   * comparator); always `false` for `null` and `undefined`.
   *
   * Time: O(n).
   *
   * @param element - The value to look for.
   * @returns `true` when present.
   *
   * @example
   * ```ts
   * new PriorityQueue([1, 2]).has(2) // true
   * ```
   */
  has(element: E): boolean {
    return this.engine.has(element)
  }

  /**
   * Removes one element equal to `element` under SameValueZero (not under the comparator: two
   * elements that compare as equal are still different elements). On an error nothing is removed.
   *
   * Time: O(n) to find it, then at most 2⌊log2 n⌋ + 1 comparisons.
   *
   * @param element - The value to remove.
   * @returns `true` when an element was removed.
   * @throws TypeError when the comparator returns a non-number or `NaN`.
   * @throws ConcurrentModificationError when the comparator adds or removes elements of this
   *   queue.
   *
   * @example
   * ```ts
   * new PriorityQueue([1, 2, 3]).delete(2) // true
   * ```
   */
  delete(element: E): boolean {
    return this.engine.delete(element)
  }

  /**
   * Removes every element equal to one in `elements` (SameValueZero). Decides first, then rebuilds
   * the heap from the remaining elements; an error while deciding or rebuilding removes nothing.
   *
   * Time: O(n + m) for `m` elements, plus at most 2n comparisons; O(n) extra memory.
   *
   * @param elements - The elements to remove.
   * @returns `true` when any element was removed.
   * @throws TypeError when `elements` is not iterable, or the comparator returns a non-number or
   *   `NaN`.
   * @throws ConcurrentModificationError when the comparator adds or removes elements of this
   *   queue.
   *
   * @example
   * ```ts
   * new PriorityQueue([1, 2, 1]).removeAll([1]) // true; only 2 is left
   * ```
   */
  removeAll(elements: Iterable<E>): boolean {
    return this.engine.removeAll(elements)
  }

  /**
   * Removes every element not equal to one in `elements` (SameValueZero). Decides first, then
   * rebuilds the heap from the remaining elements; an error while deciding or rebuilding removes
   * nothing.
   *
   * Time: O(n + m) for `m` elements, plus at most 2n comparisons; O(n) extra memory.
   *
   * @param elements - The elements to keep.
   * @returns `true` when any element was removed.
   * @throws TypeError when `elements` is not iterable, or the comparator returns a non-number or
   *   `NaN`.
   * @throws ConcurrentModificationError when the comparator adds or removes elements of this
   *   queue.
   *
   * @example
   * ```ts
   * new PriorityQueue([1, 2, 3]).retainAll([2]) // true; only 2 is left
   * ```
   */
  retainAll(elements: Iterable<E>): boolean {
    return this.engine.retainAll(elements)
  }

  /**
   * Calls `predicate(element)` on every element, then removes those for which it returned a truthy
   * value and rebuilds the heap; an error from `predicate` or the comparator removes nothing.
   *
   * Time: O(n) plus the calls, plus at most 2n comparisons; O(n) extra memory.
   *
   * @param predicate - Called with each element.
   * @returns `true` when any element was removed.
   * @throws TypeError when `predicate` is not a function, or the comparator returns a non-number
   *   or `NaN`.
   * @throws ConcurrentModificationError when `predicate` or the comparator adds or removes
   *   elements.
   *
   * @example
   * ```ts
   * new PriorityQueue([1, -2, 3]).removeIf((n) => n < 0) // true
   * ```
   */
  removeIf(predicate: (element: E) => unknown): boolean {
    return this.engine.removeIf(predicate)
  }

  /**
   * Removes every element.
   *
   * Time: O(1).
   *
   * @example
   * ```ts
   * queue.clear() // queue.size === 0
   * ```
   */
  clear(): void {
    this.engine.clear()
  }

  /**
   * Returns a new array of the elements in heap order, which is not sorted.
   *
   * Time: O(n).
   *
   * @returns A new array.
   *
   * @example
   * ```ts
   * new PriorityQueue([2, 1]).toArray() // [1, 2]: both elements, in an unspecified order
   * ```
   */
  toArray(): E[] {
    return this.engine.toArray()
  }

  /**
   * Calls `action(element)` for each element in heap order, which is not sorted, with `this` set to
   * `thisArg`.
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
   * new PriorityQueue(['b', 'a']).forEach((s) => console.log(s))
   * ```
   */
  forEach(action: (element: E) => void, thisArg?: unknown): void {
    this.engine.forEach(action, thisArg)
  }

  /**
   * Returns an iterator over the elements in heap order, which is not sorted.
   *
   * Time: O(1) to create; O(1) per step.
   *
   * @returns A new iterator.
   * @throws ConcurrentModificationError (from `next()`) when elements are added or removed after
   *   the iterator is created, including through a cursor.
   *
   * @example
   * ```ts
   * for (const element of new PriorityQueue([2, 1])) console.log(element)
   * ```
   */
  [Symbol.iterator](): IterableIterator<E> {
    return this.engine[Symbol.iterator]()
  }

  /**
   * Returns a cursor over the elements in heap order; `remove()` removes the element `next()`
   * returned, and the cursor still visits every other element exactly once.
   *
   * Time: O(1) to create; `next` O(1); `remove` O(log n), or O(n) for an element the removal of
   * another moved behind the cursor.
   *
   * @returns A new cursor.
   *
   * @example
   * ```ts
   * const cursor = queue.cursor()
   * while (cursor.hasNext()) if (cursor.next() < 0) cursor.remove()
   * ```
   */
  cursor(): Cursor<E> {
    return this.engine.cursor()
  }

  /**
   * Returns a new `PriorityQueue` with the same elements and the same comparator, independent of
   * this one (the elements themselves are not copied). The comparator is not called.
   *
   * Time: O(n).
   *
   * @returns The copy.
   *
   * @example
   * ```ts
   * const copy = queue.copy()
   * copy.poll() // queue is unchanged
   * ```
   */
  copy(): PriorityQueue<E> {
    const comparator = this.engine.comparator
    const copy = new PriorityQueue<E>(null, { comparator })
    copy.engine.copyFrom(this.engine)
    return copy
  }

  /**
   * Returns whether `other` is this queue. Queues compare by identity.
   *
   * Time: O(1).
   *
   * @param other - Any value.
   * @returns `true` when `other` is this queue.
   *
   * @example
   * ```ts
   * new PriorityQueue([1]).equals(new PriorityQueue([1])) // false
   * ```
   */
  equals(other: unknown): boolean {
    return this.engine.equals(other)
  }

  /** The value-equality protocol; delegates to `equals` (identity). Time: O(1). */
  [equalsSymbol](other: unknown): boolean {
    return this.engine.equals(other)
  }

  /** The value-equality protocol: an identity hash, unspecified in value. Time: O(1). */
  [hashCodeSymbol](hash: HashFunction): number {
    return this.engine[hashCodeSymbol](hash)
  }

  /**
   * Returns the class name, size and elements in heap order, e.g. `PriorityQueue(3) [1, 3, 2]`.
   *
   * Time: O(length of the output) for flat contents.
   *
   * @returns The text.
   *
   * @example
   * ```ts
   * String(new PriorityQueue([1])) // 'PriorityQueue(1) [1]'
   * ```
   */
  toString(): string {
    return this.engine.toString()
  }

  /**
   * Returns a new array of the elements in heap order, so `JSON.stringify` writes the queue as an
   * array.
   *
   * Time: O(n).
   *
   * @returns A new array.
   *
   * @example
   * ```ts
   * JSON.stringify(new PriorityQueue([1])) // '[1]'
   * ```
   */
  toJSON(): E[] {
    return this.engine.toJSON()
  }

  /** Node's inspect hook: `PriorityQueue(2) [ 1, 2 ]` in `console.log`. Time: as `toString`. */
  [INSPECT](
    depth: number | null,
    options: object,
    inspect: (value: unknown, options: object) => string,
  ): string {
    return this.engine[INSPECT](depth, options, inspect)
  }
}
