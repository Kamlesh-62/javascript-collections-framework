/**
 * The sorted-set interfaces: sets kept in the order of a comparator, with nearest-match queries
 * and live range views.
 *
 * @packageDocumentation
 */

import type { Comparator } from '../functions/comparators'
import type { Cursor } from './collection'
import type { ReadonlySequencedSet, SequencedSet } from './sequenced-set'
import type { ReadonlySetCollection, SetCollection } from './set'

/**
 * The inclusive flags of `subSet`.
 *
 * @example
 * ```ts
 * set.subSet(1, 5, { fromInclusive: false, toInclusive: true }) // members in (1, 5]
 * ```
 */
export interface SubSetOptions {
  /** Whether `from` itself is in range. Default `true`. */
  fromInclusive?: boolean | undefined
  /** Whether `to` itself is in range. Default `false`. */
  toInclusive?: boolean | undefined
}

/**
 * The inclusive flag of `headSet` and `tailSet`.
 *
 * @example
 * ```ts
 * set.headSet(5, { inclusive: true }) // members up to and including 5
 * ```
 */
export interface BoundOptions {
  /** Whether the bound itself is in range. Default `false` for `headSet`, `true` for `tailSet`. */
  inclusive?: boolean | undefined
}

/**
 * The read-only view of a sorted set: a set whose members are kept in the order of its comparator,
 * with the ends, nearest-match queries and live range views. Two members are the same member when
 * the comparator returns `0` for them.
 *
 * "Before" and "after" follow the set's own order, which is descending on a reversed view.
 *
 * @example
 * ```ts
 * function nextSlot(slots: ReadonlySortedSet<number>, at: number): number | undefined {
 *   return slots.ceiling(at)
 * }
 * ```
 */
export interface ReadonlySortedSet<E> extends ReadonlySequencedSet<E> {
  /**
   * The number of members. Time: O(1) on a set; O(k + log n) on a range view holding k of the
   * set's n members, which counts the members in range.
   */
  readonly size: number
  /**
   * Returns whether there are no members.
   *
   * Time: O(1) on a set; O(log n) on a range view, which looks for one member in range.
   *
   * @returns `size === 0`.
   */
  isEmpty(): boolean
  /**
   * Returns an iterator over the members in this set's order.
   *
   * Time: O(log n) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
   * @throws ConcurrentModificationError (from `next()`) when members are added or removed after
   *   the iterator is created, other than through its own cursor.
   */
  [Symbol.iterator](): IterableIterator<E>
  /**
   * Returns a cursor positioned before the first member.
   *
   * Time: O(log n) to create; O(1) amortised per step.
   *
   * @returns A new cursor.
   */
  cursor(): Cursor<E>
  /**
   * Returns an iterator over the members, as `values()` does.
   *
   * Time: O(log n) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
   */
  keys(): IterableIterator<E>
  /**
   * Returns an iterator over the members in this set's order.
   *
   * Time: O(log n) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
   */
  values(): IterableIterator<E>
  /**
   * Returns an iterator over `[member, member]` pairs in this set's order.
   *
   * Time: O(log n) to create; O(1) amortised per step.
   *
   * @returns A new iterator.
   */
  entries(): IterableIterator<[E, E]>
  /**
   * Calls `action(member, member, set)` for each member in order, with `this` set to `thisArg`.
   *
   * Time: O(n) plus the calls.
   *
   * @param action - Called with each member twice and the set.
   * @param thisArg - The `this` value for `action`.
   * @throws TypeError when `action` is not a function.
   */
  forEach(
    action: (element: E, same: E, set: ReadonlySetCollection<E>) => void,
    thisArg?: unknown,
  ): void
  /**
   * Returns the comparator that orders the set, or `undefined` for natural order; a reversed view
   * returns a function that orders in reverse.
   *
   * Time: O(1).
   *
   * @returns The comparator, or `undefined`.
   */
  comparator(): Comparator<E> | undefined
  /**
   * Returns the greatest member before `element`, or `undefined` when there is none.
   *
   * Time: O(log n).
   *
   * @param element - The value to search from; it need not be a member.
   * @returns The member, or `undefined`.
   */
  lower(element: E): E | undefined
  /**
   * Returns the greatest member equal to or before `element`, or `undefined` when there is none.
   *
   * Time: O(log n).
   *
   * @param element - The value to search from; it need not be a member.
   * @returns The member, or `undefined`.
   */
  floor(element: E): E | undefined
  /**
   * Returns the least member equal to or after `element`, or `undefined` when there is none.
   *
   * Time: O(log n).
   *
   * @param element - The value to search from; it need not be a member.
   * @returns The member, or `undefined`.
   */
  ceiling(element: E): E | undefined
  /**
   * Returns the least member after `element`, or `undefined` when there is none.
   *
   * Time: O(log n).
   *
   * @param element - The value to search from; it need not be a member.
   * @returns The member, or `undefined`.
   */
  higher(element: E): E | undefined
  /**
   * Returns a live view of the members from `from` (inclusive by default) to `to` (exclusive by
   * default).
   *
   * Time: O(log n).
   *
   * @param from - The low end, in this set's order.
   * @param to - The high end, in this set's order.
   * @param options - The inclusive flags.
   * @returns The view.
   */
  subSet(from: E, to: E, options?: SubSetOptions | null): ReadonlySortedSet<E>
  /**
   * Returns a live view of the members before `to` (exclusive by default).
   *
   * Time: O(log n).
   *
   * @param to - The high end, in this set's order.
   * @param options - The inclusive flag.
   * @returns The view.
   */
  headSet(to: E, options?: BoundOptions | null): ReadonlySortedSet<E>
  /**
   * Returns a live view of the members from `from` on (inclusive by default).
   *
   * Time: O(log n).
   *
   * @param from - The low end, in this set's order.
   * @param options - The inclusive flag.
   * @returns The view.
   */
  tailSet(from: E, options?: BoundOptions | null): ReadonlySortedSet<E>
  /**
   * Returns a live view of this set in the opposite order.
   *
   * Time: O(1).
   *
   * @returns The reversed view.
   */
  reversed(): ReadonlySortedSet<E>
}

/**
 * A set kept in the order of a comparator, with the ends, nearest-match queries, removal from
 * either end and live range views. Two members are the same member when the comparator returns
 * `0` for them. `addFirst` and `addLast` throw `UnsupportedOperationError`: the order decides
 * where a member goes.
 *
 * @example
 * ```ts
 * function takeUpTo<E>(set: SortedSet<E>, limit: E): E[] {
 *   const taken = set.headSet(limit, { inclusive: true }).toArray()
 *   set.headSet(limit, { inclusive: true }).clear()
 *   return taken
 * }
 * ```
 */
export interface SortedSet<E> extends SequencedSet<E>, ReadonlySortedSet<E> {
  /**
   * Calls `action(member, member, set)` for each member in order, with `this` set to `thisArg`.
   *
   * Time: O(n) plus the calls.
   *
   * @param action - Called with each member twice and the set.
   * @param thisArg - The `this` value for `action`.
   * @throws TypeError when `action` is not a function.
   */
  forEach(action: (element: E, same: E, set: SetCollection<E>) => void, thisArg?: unknown): void
  /**
   * Removes and returns the first member, or returns `undefined` when the set is empty.
   *
   * Time: O(log n).
   *
   * @returns The removed member, or `undefined`.
   */
  pollFirst(): E | undefined
  /**
   * Removes and returns the last member, or returns `undefined` when the set is empty.
   *
   * Time: O(log n).
   *
   * @returns The removed member, or `undefined`.
   */
  pollLast(): E | undefined
  /**
   * Returns a live view of the members from `from` (inclusive by default) to `to` (exclusive by
   * default); changes through the view reach this set.
   *
   * Time: O(log n).
   *
   * @param from - The low end, in this set's order.
   * @param to - The high end, in this set's order.
   * @param options - The inclusive flags.
   * @returns The view.
   */
  subSet(from: E, to: E, options?: SubSetOptions | null): SortedSet<E>
  /**
   * Returns a live view of the members before `to` (exclusive by default); changes through the
   * view reach this set.
   *
   * Time: O(log n).
   *
   * @param to - The high end, in this set's order.
   * @param options - The inclusive flag.
   * @returns The view.
   */
  headSet(to: E, options?: BoundOptions | null): SortedSet<E>
  /**
   * Returns a live view of the members from `from` on (inclusive by default); changes through the
   * view reach this set.
   *
   * Time: O(log n).
   *
   * @param from - The low end, in this set's order.
   * @param options - The inclusive flag.
   * @returns The view.
   */
  tailSet(from: E, options?: BoundOptions | null): SortedSet<E>
  /**
   * Returns a live view of this set in the opposite order; changes through the view reach this
   * set.
   *
   * Time: O(1).
   *
   * @returns The reversed view.
   */
  reversed(): SortedSet<E>
}
