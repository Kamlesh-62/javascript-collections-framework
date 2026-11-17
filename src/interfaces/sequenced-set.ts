/**
 * The sequenced-set interfaces: sets with a defined order and a first and last member.
 *
 * @packageDocumentation
 */

import type { ReadonlySequencedCollection, SequencedCollection } from './list'
import type { ReadonlySetCollection, SetCollection } from './set'

/**
 * The read-only view of a set with a defined order and a first and last member, readable from
 * either end.
 *
 * @example
 * ```ts
 * function newest<E>(history: ReadonlySequencedSet<E>): E | undefined {
 *   return history.isEmpty() ? undefined : history.getLast()
 * }
 * ```
 */
export interface ReadonlySequencedSet<E>
  extends ReadonlySetCollection<E>,
    ReadonlySequencedCollection<E> {
  /**
   * Returns a live view of this set in the opposite order: changes to either show in the other.
   *
   * Time: O(1).
   *
   * @returns The reversed view.
   */
  reversed(): ReadonlySequencedSet<E>
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
}

/**
 * A set with a defined order that can be changed at both ends. `addFirst` and `addLast` insert an
 * absent member at that end or move the present member equal to the argument there (keeping the
 * stored member), or throw `UnsupportedOperationError` where the set orders its members itself.
 * Whether iteration is live or fail-fast is stated by each implementation.
 *
 * @example
 * ```ts
 * function touch<E>(recent: SequencedSet<E>, item: E, limit: number): void {
 *   recent.addLast(item)
 *   while (recent.size > limit) recent.removeFirst()
 * }
 * ```
 */
export interface SequencedSet<E>
  extends SetCollection<E>,
    SequencedCollection<E>,
    ReadonlySequencedSet<E> {
  /**
   * Inserts `element` at the front, or moves the member equal to it to the front, and returns the
   * set.
   *
   * Time: as the implementation documents.
   *
   * @param element - The element to insert or move.
   * @returns The set.
   * @throws UnsupportedOperationError where the set orders its members itself.
   */
  addFirst(element: E): this
  /**
   * Inserts `element` at the end, or moves the member equal to it to the end, and returns the set.
   *
   * Time: as the implementation documents.
   *
   * @param element - The element to insert or move.
   * @returns The set.
   * @throws UnsupportedOperationError where the set orders its members itself.
   */
  addLast(element: E): this
  /**
   * Returns a live view of this set in the opposite order; changes through the view reach this
   * set at the mirrored end.
   *
   * Time: O(1).
   *
   * @returns The reversed view.
   */
  reversed(): SequencedSet<E>
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
}
