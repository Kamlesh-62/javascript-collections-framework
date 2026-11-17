// The engine behind `TreeSet`: the whole ordered tree, in ascending order. The public class holds
// one engine and delegates to it, so nothing here reaches the published types.

import type { Comparator } from '../../functions/comparators'
import type { SortedSet } from '../../interfaces/sorted-set'
import { requireElement } from '../checks'
import { ChangeCounter } from '../revision'
import { AbstractSortedSet, type Bound } from '../skeletons/abstract-sorted-set'
import { ReversedView, SubSetView } from '../views/tree-set-views'
import { OrderedTree } from './ordered-tree'

/**
 * A sorted set over a red-black tree.
 *
 * @internal
 */
export class TreeSetEngine<E> extends AbstractSortedSet<E> {
  private readonly facade: SortedSet<E>

  /**
   * @param facade - The public set, for identity and callbacks.
   * @param order - The comparator, or `undefined` for natural order.
   */
  constructor(facade: SortedSet<E>, order: Comparator<E> | undefined) {
    super(new OrderedTree<E>(order, new ChangeCounter()), undefined, undefined, false)
    this.facade = facade
  }

  get [Symbol.toStringTag](): string {
    return 'TreeSet'
  }

  get owner(): SortedSet<E> {
    return this.facade
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

  /**
   * Fills a new, empty set with `items`: in strictly ascending order (checked with one comparison
   * per neighbouring pair) the tree is built directly; otherwise each element is added in turn,
   * so the first of several equal elements is kept.
   */
  build(items: E[], where: string): void {
    const tree = this.tree
    const natural = tree.order === undefined
    if (natural) {
      for (let i = 0; i < items.length; i++) {
        requireElement(items[i], where)
        if ((items[i] as unknown) === 0) items[i] = 0 as E
      }
    }
    const expected = this.changes.structure
    let sorted = 1
    if (items.length === 1 && natural) {
      const only = items[0] as E
      tree.compare(only, only, where, expected)
    }
    while (
      sorted < items.length &&
      tree.compare(items[sorted - 1] as E, items[sorted] as E, where, expected) < 0
    ) {
      sorted++
    }
    tree.buildSorted(sorted >= items.length ? items : items.slice(0, sorted))
    for (let i = sorted; i < items.length; i++) tree.insert(items[i] as E, where, expected)
    if (tree.count > 0) this.changes.structural()
  }

  /** Fills a new, empty set with a copy of `source`'s tree. No comparisons. */
  copyFrom(source: TreeSetEngine<E>): void {
    this.tree.copyFrom(source.tree)
    if (this.tree.count > 0) this.changes.structural()
  }
}
