/**
 * The queue and deque interfaces: collections processed one element at a time, and collections
 * changed at both ends.
 *
 * @packageDocumentation
 */

import type { Collection, ReadonlyCollection } from './collection'
import type { ReadonlySequencedCollection, SequencedCollection } from './list'

/**
 * The read-only view of a queue: a collection that hands out its elements one at a time, in an
 * order the implementation defines (first in, first out for a deque; priority order for a
 * priority queue).
 *
 * @example
 * ```ts
 * function next<E>(queue: ReadonlyQueue<E>): E | undefined {
 *   return queue.peek()
 * }
 * ```
 */
export interface ReadonlyQueue<E> extends ReadonlyCollection<E> {
  /**
   * Returns the element `poll()` would return next, without removing it, or `undefined` when the
   * queue is empty.
   *
   * Time: as the implementation documents.
   *
   * @returns The next element, or `undefined`.
   */
  peek(): E | undefined
}

/**
 * A queue: add elements with `add`, take them out one at a time with `poll`.
 *
 * @example
 * ```ts
 * function drain<E>(queue: Queue<E>, visit: (element: E) => void): void {
 *   while (!queue.isEmpty()) visit(queue.poll() as E)
 * }
 * ```
 */
export interface Queue<E> extends Collection<E>, ReadonlyQueue<E> {
  /**
   * Removes and returns the next element, or returns `undefined` when the queue is empty.
   *
   * Time: as the implementation documents.
   *
   * @returns The removed element, or `undefined`.
   */
  poll(): E | undefined
}

/**
 * The read-only view of a deque: a queue with two ends.
 *
 * @example
 * ```ts
 * function ends<E>(deque: ReadonlyDeque<E>): [E | undefined, E | undefined] {
 *   return [deque.peek(), deque.peekLast()]
 * }
 * ```
 */
export interface ReadonlyDeque<E> extends ReadonlyQueue<E>, ReadonlySequencedCollection<E> {
  /**
   * Returns the last element without removing it, or `undefined` when the deque is empty.
   *
   * Time: as the implementation documents.
   *
   * @returns The last element, or `undefined`.
   */
  peekLast(): E | undefined
  /**
   * Returns a live view of this deque in reverse order.
   *
   * Time: O(1).
   *
   * @returns The reversed view.
   */
  reversed(): ReadonlyDeque<E>
}

/**
 * A double-ended queue: add and remove at both ends. Used as a queue, `add` puts elements at the
 * end and `poll` takes them from the front (first in, first out); used as a stack, `push` and
 * `pop` work at the end, as they do on an array.
 *
 * @example
 * ```ts
 * function undo<E>(history: Deque<E>): E | undefined {
 *   return history.pop()
 * }
 * ```
 */
export interface Deque<E> extends Queue<E>, SequencedCollection<E>, ReadonlyDeque<E> {
  /**
   * Adds `element` at the end, as `addLast` does, and returns the deque. Unlike
   * `Array.prototype.push`, it returns the deque, not the new length.
   *
   * Time: as the implementation documents.
   *
   * @param element - The element to add.
   * @returns The deque.
   */
  push(element: E): this
  /**
   * Removes and returns the last element, or returns `undefined` when the deque is empty, as
   * `Array.prototype.pop` does. `removeLast()` is the form that throws.
   *
   * Time: as the implementation documents.
   *
   * @returns The removed element, or `undefined`.
   */
  pop(): E | undefined
  /**
   * Returns a live view of this deque in reverse order: its first element is this deque's last,
   * and changes through either show in both.
   *
   * Time: O(1).
   *
   * @returns The reversed view.
   */
  reversed(): Deque<E>
}
