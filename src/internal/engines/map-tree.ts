// The ordered tree behind `TreeMap`: the tree of `TreeSet` with a value in every node. Nodes are
// keyed by `value` (the key), so every search of the ordered tree applies unchanged.
//
// An entry, a cursor or a stop node can hold a node after its mapping leaves the map, so the tree
// keeps an epoch: a node is stored exactly while its epoch equals the tree's. Removing a node marks
// it with -1; clearing the tree moves the tree to the next epoch without visiting any node. A node
// is never linked again once removed (setting the key again makes a new node).

import type { Comparator } from '../../functions/comparators'
import type { ChangeCounter } from '../revision'
import { OrderedTree, TreeNode } from './ordered-tree'

/**
 * A node of a map's tree: `value` is the key, `mapped` its value.
 *
 * @internal
 */
export class MapNode<K, V> extends TreeNode<K> {
  mapped: V
  /** The epoch of the tree when the node was linked, or -1 once it is removed. */
  epoch: number

  constructor(key: K, mapped: V, epoch: number) {
    super(key)
    this.mapped = mapped
    this.epoch = epoch
  }
}

/**
 * The red-black tree of a map, with an epoch that tells stored nodes from removed ones in O(1).
 *
 * @internal
 */
export class MapTree<K, V> extends OrderedTree<K> {
  /** The current epoch: nodes linked since the last `clear` carry it. */
  epoch = 0

  constructor(order: Comparator<K> | undefined, changes: ChangeCounter) {
    super(order, changes, 'map')
  }

  /** Whether `node` is still in the tree. O(1), no comparisons. */
  stored(node: TreeNode<K>): boolean {
    return (node as MapNode<K, V>).epoch === this.epoch
  }

  /** A new node for `key` and `value`, of the current epoch, not yet linked. */
  newNode(key: K, value: V): MapNode<K, V> {
    return new MapNode(key, value, this.epoch)
  }

  override remove(node: TreeNode<K>): void {
    super.remove(node)
    ;(node as MapNode<K, V>).epoch = -1
  }

  override clear(): void {
    super.clear()
    this.epoch++
  }

  /**
   * Fills an empty tree with `keys`, in strictly ascending order, mapped to `values` at the same
   * positions, as a balanced tree. No comparisons.
   */
  buildPairs(keys: readonly K[], values: readonly V[]): void {
    this.buildSorted(keys, (i) => this.newNode(keys[i] as K, values[i] as V))
  }

  /** Fills an empty tree with a node-for-node copy of `source`'s keys and values. No comparisons. */
  copyPairs(source: MapTree<K, V>): void {
    this.copyFrom(source, (node) => this.newNode(node.value, (node as MapNode<K, V>).mapped))
  }
}
