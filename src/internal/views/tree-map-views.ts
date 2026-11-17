// The live views of a sorted map: a range view shows the mappings whose keys lie between two
// bounds; a reversed view shows a map or a range view in the opposite order. Both work on the map's
// own tree and share its change counter, so changes show everywhere and open iterators of any of
// them fail fast.

import type { Comparator } from '../../functions/comparators'
import type { SortedMap } from '../../interfaces/sorted-map'
import type { MapTree } from '../engines/map-tree'
import { reversing } from '../engines/ordered-tree'
import { AbstractSortedMap } from '../skeletons/abstract-sorted-map'
import type { Bound } from '../skeletons/abstract-sorted-set'

/**
 * A live view of the mappings of a sorted map whose keys lie between two bounds, in ascending
 * order.
 *
 * @internal
 */
export class TreeSubMap<K, V> extends AbstractSortedMap<K, V> {
  constructor(tree: MapTree<K, V>, low: Bound<K> | undefined, high: Bound<K> | undefined) {
    super(tree, low, high, false)
  }

  get [Symbol.toStringTag](): string {
    return 'TreeSubMap'
  }

  get owner(): SortedMap<K, V> {
    return this
  }

  comparator(): Comparator<K> | undefined {
    return this.tree.order
  }

  reverseView(): AbstractSortedMap<K, V> {
    return new ReversedTreeMap(this)
  }

  openRange(low: Bound<K> | undefined, high: Bound<K> | undefined): AbstractSortedMap<K, V> {
    return new TreeSubMap(this.tree, low, high)
  }
}

/**
 * A live view of an ascending sorted map or range view in descending order. Reversing it returns
 * the map or view it reverses; a range taken from it is the reversed view of the ascending range.
 *
 * @internal
 */
export class ReversedTreeMap<K, V> extends AbstractSortedMap<K, V> {
  private readonly source: AbstractSortedMap<K, V>
  private reversing: Comparator<K> | undefined

  /** @param source - The ascending map or range view to reverse. */
  constructor(source: AbstractSortedMap<K, V>) {
    super(source.tree, source.low, source.high, true)
    this.source = source
  }

  get [Symbol.toStringTag](): string {
    return 'ReversedTreeMap'
  }

  get owner(): SortedMap<K, V> {
    return this
  }

  /** A function that orders keys in reverse, the same one on every call to this view. */
  comparator(): Comparator<K> {
    if (this.reversing === undefined) this.reversing = reversing(this.tree.order)
    return this.reversing
  }

  reverseView(): AbstractSortedMap<K, V> {
    return this.source
  }

  openRange(low: Bound<K> | undefined, high: Bound<K> | undefined): AbstractSortedMap<K, V> {
    return new ReversedTreeMap(new TreeSubMap(this.tree, low, high))
  }
}
