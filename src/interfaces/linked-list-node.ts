/**
 * The handle type of `LinkedList`.
 *
 * @packageDocumentation
 */

/**
 * A handle to one element of a `LinkedList`: the list's methods take it to insert or remove next
 * to that element in O(1). Each element has exactly one handle for as long as it is in the list,
 * whichever method added it. Once the element is removed, the handle's `next` and `previous` are
 * `undefined`, its `value` can still be read, and the list's methods refuse it.
 *
 * A handle prints only its value (`LinkedListNode { value: 1 }`) and shows nothing to
 * `JSON.stringify` or `Object.keys`.
 *
 * @example
 * ```ts
 * const list = new LinkedList<string>()
 * const b = list.addLastNode('b')
 * list.insertBefore(b, 'a')
 * b.previous?.value // 'a'
 * ```
 */
export interface LinkedListNode<E> {
  /**
   * The element. Setting it replaces the element in place, changes the list's `revision` and does
   * not disturb open iterators, which return the new value if they have not reached it yet.
   *
   * Time: O(1).
   *
   * @throws IllegalStateError (when set) when the element has been removed from its list.
   */
  value: E
  /**
   * The handle of the next element, or `undefined` for the last element or a removed one. Always
   * reflects the list as it is now; reading it never throws. Time: O(1).
   */
  readonly next: LinkedListNode<E> | undefined
  /**
   * The handle of the previous element, or `undefined` for the first element or a removed one.
   * Always reflects the list as it is now; reading it never throws. Time: O(1).
   */
  readonly previous: LinkedListNode<E> | undefined
}
