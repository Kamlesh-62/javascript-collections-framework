// The live views of a sorted set: a range view shows the members between two bounds; a reversed
// view shows a set or a range view in the opposite order. Both work on the set's own tree and share
// its change counter, so changes show everywhere and open iterators of any of them fail fast.

import type { Comparator } from '../../functions/comparators'
import type { SortedSet } from '../../interfaces/sorted-set'
import { type OrderedTree, reversing } from '../engines/ordered-tree'
import { AbstractSortedSet, type Bound } from '../skeletons/abstract-sorted-set'

/**
 * A live view of the members of a sorted set between two bounds, in ascending order.
 *
 * @internal
 */
export class SubSetView<E> extends AbstractSortedSet<E> {
  constructor(tree: OrderedTree<E>, low: Bound<E> | undefined, high: Bound<E> | undefined) {
    super(tree, low, high, false)
  }

  get [Symbol.toStringTag](): string {
    return 'TreeSubSet'
  }

  get owner(): SortedSet<E> {
    return this
  }

  comparator(): Comparator<E> | undefined {
    return this.tree.order
  }

  reversed(): SortedSet<E> {
    return new ReversedView(this)
  }

  protected openRange(low: Bound<E> | undefined, high: Bound<E> | undefined): SortedSet<E> {
    return new SubSetView(this.tree, low, high)
  }
}

/**
 * A live view of an ascending sorted set or range view in descending order. Reversing it returns
 * the set or view it reverses; a range taken from it is the reversed view of the ascending range.
 *
 * @internal
 */
export class ReversedView<E> extends AbstractSortedSet<E> {
  private readonly source: AbstractSortedSet<E>
  private reversing: Comparator<E> | undefined

  /** @param source - The ascending set or range view to reverse. */
  constructor(source: AbstractSortedSet<E>) {
    super(source.tree, source.low, source.high, true)
    this.source = source
  }

  get [Symbol.toStringTag](): string {
    return 'ReversedTreeSet'
  }

  get owner(): SortedSet<E> {
    return this
  }

  /** A function that orders in reverse, the same one on every call to this view. */
  comparator(): Comparator<E> {
    if (this.reversing === undefined) this.reversing = reversing(this.tree.order)
    return this.reversing
  }

  reversed(): SortedSet<E> {
    return this.source.owner
  }

  protected openRange(low: Bound<E> | undefined, high: Bound<E> | undefined): SortedSet<E> {
    return new ReversedView(new SubSetView(this.tree, low, high))
  }
}
