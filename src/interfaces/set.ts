/**
 * The set interfaces: collections that hold each member once.
 *
 * @packageDocumentation
 */

import type { Collection, ReadonlyCollection } from './collection'

/**
 * The read-only view of a set: a collection with no two equal members, readable the way native
 * `Set` is (`size`, `has`, `keys`, `values`, `entries`, `forEach`), so native set methods and
 * `new Set(set)` accept it.
 *
 * Two sets are equal when they have the same size and each has every member of the other,
 * whatever their insertion order.
 *
 * @example
 * ```ts
 * function overlap<E>(a: ReadonlySetCollection<E>, b: ReadonlySetCollection<E>): E[] {
 *   return a.toArray().filter((element) => b.has(element))
 * }
 * ```
 */
export interface ReadonlySetCollection<E> extends ReadonlyCollection<E> {
  /**
   * Returns an iterator over the members, as `values()` does (native `Set` has both).
   *
   * Time: O(1) to create; O(1) per step.
   *
   * @returns A new iterator.
   */
  keys(): IterableIterator<E>
  /**
   * Returns an iterator over the members.
   *
   * Time: O(1) to create; O(1) per step.
   *
   * @returns A new iterator.
   */
  values(): IterableIterator<E>
  /**
   * Returns an iterator over `[member, member]` pairs, as native `Set` does.
   *
   * Time: O(1) to create; O(1) per step.
   *
   * @returns A new iterator.
   */
  entries(): IterableIterator<[E, E]>
  /**
   * Calls `action(member, member, set)` for each member, with `this` set to `thisArg`, as native
   * `Set` does.
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
 * A set: a collection with no two equal members. `add` keeps the member already present when an
 * equal one is added.
 *
 * @example
 * ```ts
 * function addEach<E>(set: SetCollection<E>, elements: E[]): number {
 *   const before = set.size
 *   set.addAll(elements)
 *   return set.size - before
 * }
 * ```
 */
export interface SetCollection<E> extends Collection<E>, ReadonlySetCollection<E> {
  /**
   * Calls `action(member, member, set)` for each member, with `this` set to `thisArg`, as native
   * `Set` does.
   *
   * Time: O(n) plus the calls.
   *
   * @param action - Called with each member twice and the set.
   * @param thisArg - The `this` value for `action`.
   * @throws TypeError when `action` is not a function.
   */
  forEach(action: (element: E, same: E, set: SetCollection<E>) => void, thisArg?: unknown): void
}
