/**
 * `LinkedList`: a double-ended queue stored as a doubly linked list, with node handles.
 *
 * @packageDocumentation
 */

import type { Cursor } from '../interfaces/collection'
import type { LinkedListNode } from '../interfaces/linked-list-node'
import type { Deque } from '../interfaces/queue'
import {
  brandedHasInstance,
  DEQUE_BRAND,
  QUEUE_BRAND,
  SEQUENCED_COLLECTION_BRAND,
} from '../internal/brand'
import { describeValue, isIterable, requireFunction } from '../internal/checks'
import { LinkedListEngine } from '../internal/engines/linked-list-engine'
import { equalsSymbol, type HashFunction, hashCodeSymbol } from '../internal/equality'
import { apply } from '../internal/intrinsics'
import { COLLECTION_BRAND, INSPECT } from '../internal/output'

const LINKED_LIST_BRAND: unique symbol = /*#__PURE__*/ Symbol.for(
  'javascript-collections-framework/1/LinkedList',
)

function notIterable(where: string, value: unknown): TypeError {
  return new TypeError(`${where}: elements is not iterable (${describeValue(value)})`)
}

/**
 * A double-ended queue stored as a doubly linked list, whose node handles allow O(1) insertion and
 * removal next to a known element: moving an entry to the front of a cache, inserting next to a
 * cursor, unlinking a cancelled task. It works wherever a `Deque` is expected: `add` + `poll` as a
 * queue, `push` + `pop` at the end as a stack.
 *
 * `addFirstNode`, `addLastNode`, `insertBefore` and `insertAfter` return a handle
 * (`LinkedListNode`); `removeNode`, `insertBefore` and `insertAfter` take one. Each element has one
 * handle for as long as it is in the list. There is no index access; use `ArrayList` for that.
 *
 * `null` and `undefined` are stored, as in an array, so `poll()`, `peek()` and `pop()` can return a
 * stored `undefined`: read `isEmpty()` (or use `removeFirst`, `getFirst` and the other throwing
 * forms) to tell "empty" apart. Two lists are equal only when they are the same object; compare
 * `toArray()` results to compare contents. Adding or removing while iterating throws
 * `ConcurrentModificationError`; walking by handles never does.
 *
 * The class is not designed to be subclassed.
 *
 * @example
 * ```ts
 * const list = new LinkedList<string>()
 * const b = list.addLastNode('b')
 * list.insertBefore(b, 'a')
 * list.removeNode(b) // 'b'
 * list.toArray() // ['a']
 * ```
 *
 * @sealed
 */
export class LinkedList<E> implements Deque<E> {
  private readonly engine: LinkedListEngine<E>

  /**
   * Creates a list holding the elements of `elements`, in order (the first is the front); empty
   * when `elements` is omitted, `undefined` or `null` (as `new Set(null)` is). `null` and
   * `undefined` elements are stored.
   *
   * Time: O(m) for `m` elements.
   *
   * @param elements - The initial elements.
   * @throws TypeError when `elements` is neither iterable nor `null`/`undefined`.
   *
   * @example
   * ```ts
   * new LinkedList(['a', 'b']) // LinkedList(2) ['a', 'b']
   * ```
   */
  constructor(elements?: Iterable<E> | null) {
    this.engine = new LinkedListEngine<E>(this)
    if (elements === undefined || elements === null) return
    if (!isIterable(elements)) throw notIterable('LinkedList', elements)
    const items: E[] = []
    for (const element of elements) items.push(element)
    this.engine.appendAll(items, 'LinkedList')
  }

  /**
   * Returns a new list of the elements of `elements`, in order, like `Array.from` but for
   * iterables only.
   *
   * Time: O(m) for `m` elements.
   *
   * @param elements - The elements.
   * @returns A new list.
   * @throws TypeError when `elements` is not iterable (`null`, `undefined` and array-likes
   *   included).
   *
   * @example
   * ```ts
   * LinkedList.from(new Set([1, 2])) // LinkedList(2) [1, 2]
   * ```
   */
  static from<T>(elements: Iterable<T>): LinkedList<T>
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
   * @throws TypeError when `mapFn` is not a function (checked first) or `elements` is not
   *   iterable.
   *
   * @example
   * ```ts
   * LinkedList.from([1, 2], (n) => n * 10) // LinkedList(2) [10, 20]
   * ```
   */
  static from<T, U>(
    elements: Iterable<T>,
    mapFn: (element: T, index: number) => U,
    thisArg?: unknown,
  ): LinkedList<U>
  static from<T, U>(
    elements: Iterable<T>,
    mapFn?: (element: T, index: number) => U,
    thisArg?: unknown,
  ): LinkedList<T | U> {
    if (mapFn !== undefined) requireFunction(mapFn, 'LinkedList.from', 'mapFn')
    if (!isIterable(elements)) throw notIterable('LinkedList.from', elements)
    const items: Array<T | U> = []
    let index = 0
    for (const element of elements) {
      items.push(mapFn === undefined ? element : (apply(mapFn, thisArg, [element, index]) as U))
      index++
    }
    const list = new LinkedList<T | U>()
    list.engine.appendAll(items, 'LinkedList.from')
    return list
  }

  /**
   * Returns whether `value` is a `LinkedList`, including one created by another copy of the
   * library with the same major version. A reversed view is not a `LinkedList`.
   *
   * Time: O(1).
   *
   * @param value - The value on the left of `instanceof`.
   * @returns `true` when `value` is a `LinkedList`.
   *
   * @example
   * ```ts
   * new LinkedList() instanceof LinkedList // true
   * ```
   */
  static [Symbol.hasInstance](value: unknown): boolean {
    // biome-ignore lint/complexity/noThisInStatic: `this` is the class on the right of `instanceof`
    return brandedHasInstance(this, LinkedList, LINKED_LIST_BRAND, value)
  }

  /**
   * Marks instances of this class so `instanceof` recognises them across copies of the package.
   * Its key is not exported, so the getter is not called directly. Time: O(1).
   */
  get [LINKED_LIST_BRAND](): true {
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

  /** `'LinkedList'`, for `Object.prototype.toString`. Time: O(1). */
  get [Symbol.toStringTag](): string {
    return 'LinkedList'
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
   * new LinkedList().isEmpty() // true
   * ```
   */
  isEmpty(): boolean {
    return this.engine.isEmpty()
  }

  /**
   * Adds `element` at the end and returns the list, so calls chain.
   *
   * Time: O(1).
   *
   * @param element - The element to add.
   * @returns The list.
   *
   * @example
   * ```ts
   * new LinkedList<number>().add(1).add(2) // LinkedList(2) [1, 2]
   * ```
   */
  add(element: E): this {
    this.engine.add(element)
    return this
  }

  /**
   * Adds `element` at the end, as `add` does, and returns the list. Unlike
   * `Array.prototype.push`, it returns the list, not the new length.
   *
   * Time: O(1).
   *
   * @param element - The element to add.
   * @returns The list.
   *
   * @example
   * ```ts
   * new LinkedList([1]).push(2) // LinkedList(2) [1, 2]
   * ```
   */
  push(element: E): this {
    this.engine.push(element)
    return this
  }

  /**
   * Adds `element` at the end and returns the list; the same as `add`.
   *
   * Time: O(1).
   *
   * @param element - The element to add.
   * @returns The list.
   *
   * @example
   * ```ts
   * new LinkedList([1]).addLast(2) // LinkedList(2) [1, 2]
   * ```
   */
  addLast(element: E): this {
    this.engine.addLast(element)
    return this
  }

  /**
   * Adds `element` at the front and returns the list.
   *
   * Time: O(1).
   *
   * @param element - The element to add.
   * @returns The list.
   *
   * @example
   * ```ts
   * new LinkedList([2]).addFirst(1) // LinkedList(2) [1, 2]
   * ```
   */
  addFirst(element: E): this {
    this.engine.addFirst(element)
    return this
  }

  /**
   * Adds every element of `elements` at the end, in order, after reading them all (so a list can
   * add itself).
   *
   * Time: O(m) for `m` elements.
   *
   * @param elements - The elements to add.
   * @returns `true` when any element was added.
   * @throws TypeError when `elements` is not iterable.
   *
   * @example
   * ```ts
   * new LinkedList([1]).addAll([2, 3]) // true; [1, 2, 3]
   * ```
   */
  addAll(elements: Iterable<E>): boolean {
    return this.engine.addAll(elements)
  }

  /**
   * Removes and returns the first element, or returns `undefined` when the list is empty. A stored
   * `undefined` is returned as well: check `isEmpty()` first to tell them apart.
   *
   * Time: O(1).
   *
   * @returns The removed element, or `undefined`.
   *
   * @example
   * ```ts
   * new LinkedList(['a', 'b']).poll() // 'a'
   * ```
   */
  poll(): E | undefined {
    return this.engine.poll()
  }

  /**
   * Removes and returns the last element (a stored `undefined` included), or returns `undefined`
   * when the list is empty, as `Array.prototype.pop` does.
   *
   * Time: O(1).
   *
   * @returns The removed element, or `undefined`.
   *
   * @example
   * ```ts
   * new LinkedList([1, 2]).pop() // 2
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
   * @throws NoSuchElementError when the list is empty.
   *
   * @example
   * ```ts
   * new LinkedList([1, 2]).removeFirst() // 1
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
   * new LinkedList([1, 2]).removeLast() // 2
   * ```
   */
  removeLast(): E {
    return this.engine.removeLast()
  }

  /**
   * Returns the first element without removing it, or `undefined` when the list is empty (or the
   * first element is `undefined`; `isEmpty()` tells them apart).
   *
   * Time: O(1).
   *
   * @returns The first element, or `undefined`.
   *
   * @example
   * ```ts
   * new LinkedList([1, 2]).peek() // 1
   * ```
   */
  peek(): E | undefined {
    return this.engine.peek()
  }

  /**
   * Returns the last element without removing it, or `undefined` when the list is empty (or the
   * last element is `undefined`; `isEmpty()` tells them apart).
   *
   * Time: O(1).
   *
   * @returns The last element, or `undefined`.
   *
   * @example
   * ```ts
   * new LinkedList([1, 2]).peekLast() // 2
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
   * @throws NoSuchElementError when the list is empty.
   *
   * @example
   * ```ts
   * new LinkedList([1, 2]).getFirst() // 1
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
   * @throws NoSuchElementError when the list is empty.
   *
   * @example
   * ```ts
   * new LinkedList([1, 2]).getLast() // 2
   * ```
   */
  getLast(): E {
    return this.engine.getLast()
  }

  /**
   * Returns whether some element is equal to `element` under SameValueZero (`null` and
   * `undefined` included).
   *
   * Time: O(n).
   *
   * @param element - The value to look for.
   * @returns `true` when present.
   *
   * @example
   * ```ts
   * new LinkedList([1, 2]).has(2) // true
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
   * new LinkedList([1, 2, 1]).delete(1) // true; [2, 1]
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
   * new LinkedList([1, 2, 1]).removeAll([1]) // true; [2]
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
   * new LinkedList([1, 2, 3]).retainAll([2]) // true; [2]
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
   * new LinkedList([1, -2, 3]).removeIf((n) => n < 0) // true; [1, 3]
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
   * list.clear() // list.size === 0
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
   * new LinkedList([1, 2]).toArray() // [1, 2]
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
   * new LinkedList(['a', 'b']).forEach((s) => console.log(s))
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
   * for (const element of new LinkedList([1, 2])) console.log(element)
   * ```
   */
  [Symbol.iterator](): IterableIterator<E> {
    return this.engine[Symbol.iterator]()
  }

  /**
   * Returns a cursor positioned before the first element; `remove()` removes the element `next()`
   * returned. `reversed().cursor()` walks from the last element to the first.
   *
   * Time: O(1) to create; `next` and `remove` O(1).
   *
   * @returns A new cursor.
   *
   * @example
   * ```ts
   * const cursor = list.cursor()
   * while (cursor.hasNext()) if (cursor.next() < 0) cursor.remove()
   * ```
   */
  cursor(): Cursor<E> {
    return this.engine.cursor()
  }

  /**
   * Adds `element` at the front, as `addFirst` does, and returns its handle.
   *
   * Time: O(1).
   *
   * @param element - The element to add.
   * @returns The new element's handle.
   *
   * @example
   * ```ts
   * const node = list.addFirstNode('a')
   * list.firstNode() === node // true
   * ```
   */
  addFirstNode(element: E): LinkedListNode<E> {
    return this.engine.addFirstNode(element)
  }

  /**
   * Adds `element` at the end, as `addLast` does, and returns its handle.
   *
   * Time: O(1).
   *
   * @param element - The element to add.
   * @returns The new element's handle.
   *
   * @example
   * ```ts
   * const node = list.addLastNode('z')
   * list.lastNode() === node // true
   * ```
   */
  addLastNode(element: E): LinkedListNode<E> {
    return this.engine.addLastNode(element)
  }

  /**
   * Inserts `element` immediately before the element of `node` and returns the new handle.
   *
   * Time: O(1).
   *
   * @param node - A handle of an element of this list.
   * @param element - The element to insert.
   * @returns The new element's handle.
   * @throws IllegalArgumentError when `node` is not a handle of an element now in this list
   *   (removed, from another list, or not a handle); nothing changes.
   *
   * @example
   * ```ts
   * const c = list.addLastNode('c')
   * list.insertBefore(c, 'b') // [..., 'b', 'c']
   * ```
   */
  insertBefore(node: LinkedListNode<E>, element: E): LinkedListNode<E> {
    return this.engine.insertBefore(node, element)
  }

  /**
   * Inserts `element` immediately after the element of `node` and returns the new handle.
   *
   * Time: O(1).
   *
   * @param node - A handle of an element of this list.
   * @param element - The element to insert.
   * @returns The new element's handle.
   * @throws IllegalArgumentError when `node` is not a handle of an element now in this list
   *   (removed, from another list, or not a handle); nothing changes.
   *
   * @example
   * ```ts
   * const a = list.addFirstNode('a')
   * list.insertAfter(a, 'b') // ['a', 'b', ...]
   * ```
   */
  insertAfter(node: LinkedListNode<E>, element: E): LinkedListNode<E> {
    return this.engine.insertAfter(node, element)
  }

  /**
   * Removes the element of `node` and returns it. Afterwards the handle's `next` and `previous`
   * are `undefined` and its `value` can still be read.
   *
   * Time: O(1).
   *
   * @param node - A handle of an element of this list.
   * @returns The removed element.
   * @throws IllegalArgumentError when `node` is not a handle of an element now in this list
   *   (removed, from another list, or not a handle); nothing changes.
   *
   * @example
   * ```ts
   * // Move an entry to the front.
   * list.addFirstNode(list.removeNode(node))
   * ```
   */
  removeNode(node: LinkedListNode<E>): E {
    return this.engine.removeNode(node)
  }

  /**
   * Returns the handle of the first element, or `undefined` when the list is empty.
   *
   * Time: O(1).
   *
   * @returns The first handle, or `undefined`.
   *
   * @example
   * ```ts
   * // Remove while walking: read `next` before removing.
   * for (let node = list.firstNode(); node !== undefined; ) {
   *   const next = node.next
   *   if (node.value < 0) list.removeNode(node)
   *   node = next
   * }
   * ```
   */
  firstNode(): LinkedListNode<E> | undefined {
    return this.engine.firstNode()
  }

  /**
   * Returns the handle of the last element, or `undefined` when the list is empty.
   *
   * Time: O(1).
   *
   * @returns The last handle, or `undefined`.
   *
   * @example
   * ```ts
   * for (let node = list.lastNode(); node !== undefined; node = node.previous) console.log(node.value)
   * ```
   */
  lastNode(): LinkedListNode<E> | undefined {
    return this.engine.lastNode()
  }

  /**
   * Returns a live view of this list in reverse order: its first element is this list's last,
   * and changes through either show in both (the view's `push` adds at this list's front, its
   * `poll` is this list's `pop`). `reversed().reversed()` returns this list.
   *
   * Time: O(1); each operation on the view costs what its mirror costs.
   *
   * @returns The reversed view.
   *
   * @example
   * ```ts
   * const list = new LinkedList([1, 2, 3])
   * list.reversed().peek()   // 3
   * list.reversed().delete(1) // removes the last 1
   * ```
   */
  reversed(): Deque<E> {
    return this.engine.reversed()
  }

  /**
   * Returns a new `LinkedList` with the same elements in the same order, independent of this one
   * (the elements themselves are not copied).
   *
   * Time: O(n).
   *
   * @returns The copy.
   *
   * @example
   * ```ts
   * const copy = list.copy()
   * copy.poll() // list is unchanged
   * ```
   */
  copy(): LinkedList<E> {
    return new LinkedList(this.engine.toArray())
  }

  /**
   * Returns whether `other` is this list. Lists compare by identity; compare `toArray()` to
   * compare contents. Called through a `Proxy` of the list, it is `true` for that proxy too; the list itself
   * does not know its proxies, so `list.equals(proxy)` is `false`.
   *
   * Time: O(1).
   *
   * @param other - Any value.
   * @returns `true` when `other` is this list.
   *
   * @example
   * ```ts
   * new LinkedList([1]).equals(new LinkedList([1])) // false
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
   * Returns the class name, size and elements, e.g. `LinkedList(2) [1, 'a']`.
   *
   * Time: O(length of the output) for flat contents.
   *
   * @returns The text.
   *
   * @example
   * ```ts
   * String(new LinkedList([1, 'a'])) // "LinkedList(2) [1, 'a']"
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
   * JSON.stringify(new LinkedList([1, 2])) // '[1,2]'
   * ```
   */
  toJSON(): E[] {
    return this.engine.toJSON()
  }

  /** Node's inspect hook: `LinkedList(2) [ 1, 2 ]` in `console.log`. Time: as `toString`. */
  [INSPECT](
    depth: number | null,
    options: object,
    inspect: (value: unknown, options: object) => string,
  ): string {
    return this.engine[INSPECT](depth, options, inspect)
  }
}
