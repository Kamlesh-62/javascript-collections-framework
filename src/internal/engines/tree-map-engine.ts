// The engine behind `TreeMap`: the whole map tree, in ascending order. The public class holds one
// engine and delegates to it, so nothing here reaches the published types.
//
// `get`, `getOrDefault`, `has`, `delete` and `store` take the tree's plain descent when it applies
// (natural order, a non-empty tree, the key and the stored keys all numbers or all strings): no
// user code runs and nothing can fail, so no label is made and no structure check is needed.
// Every other key, and every view, takes the general path of `AbstractSortedMap`.

import type { Comparator } from '../../functions/comparators'
import type { SortedMap } from '../../interfaces/sorted-map'
import { ChangeCounter } from '../revision'
import { AbstractSortedMap, refuseNull } from '../skeletons/abstract-sorted-map'
import type { Bound } from '../skeletons/abstract-sorted-set'
import { ReversedTreeMap, TreeSubMap } from '../views/tree-map-views'
import { MISSING } from './map-stores'
import { type MapNode, MapTree } from './map-tree'

/**
 * A sorted map over a red-black tree.
 *
 * @internal
 */
export class TreeMapEngine<K, V> extends AbstractSortedMap<K, V> {
  private readonly facade: SortedMap<K, V>

  /**
   * @param facade - The public map, for identity and callbacks.
   * @param order - The comparator, or `undefined` for natural order.
   */
  constructor(facade: SortedMap<K, V>, order: Comparator<K> | undefined) {
    super(new MapTree<K, V>(order, new ChangeCounter()), undefined, undefined, false)
    this.facade = facade
  }

  get [Symbol.toStringTag](): string {
    return 'TreeMap'
  }

  get owner(): SortedMap<K, V> {
    return this.facade
  }

  comparator(): Comparator<K> | undefined {
    return this.tree.order
  }

  override get(key: K): V | undefined {
    const tree = this.tree
    if (!tree.plain(key)) return super.get(key)
    const node = tree.findPlain(key)
    return node === null ? undefined : (node as MapNode<K, V>).mapped
  }

  override getOrDefault<D>(key: K, fallback: D): V | D {
    const tree = this.tree
    if (!tree.plain(key)) return super.getOrDefault(key, fallback)
    const node = tree.findPlain(key)
    return node === null ? fallback : (node as MapNode<K, V>).mapped
  }

  override has(key: K): boolean {
    const tree = this.tree
    if (!tree.plain(key)) return super.has(key)
    return tree.findPlain(key) !== null
  }

  override delete(key: K): boolean {
    const tree = this.tree
    if (!tree.plain(key)) return super.delete(key)
    const node = tree.findPlain(key)
    if (node === null) return false
    this.unlink(node)
    return true
  }

  override store(key: K, value: V, where: string): unknown {
    const tree = this.tree
    if (!tree.plain(key)) return super.store(key, value, where)
    const node = tree.locatePlain(key)
    if (node !== null) return this.overwrite(node, value)
    tree.linkPlain(tree.newNode((key as unknown) === 0 ? (0 as K) : key, value))
    this.changes.structural()
    return MISSING
  }

  reverseView(): AbstractSortedMap<K, V> {
    return new ReversedTreeMap(this)
  }

  openRange(low: Bound<K> | undefined, high: Bound<K> | undefined): AbstractSortedMap<K, V> {
    return new TreeSubMap(this.tree, low, high)
  }

  /**
   * Fills a new, empty map with `pairs` (already checked): in natural order every key is checked
   * for `null`/`undefined` and `-0` becomes `0` first; the longest strictly ascending prefix
   * (checked with one comparison per neighbouring pair) is built directly; the rest is set one by
   * one, so of several equal keys the first key object is kept with the last value.
   */
  build(pairs: Array<[K, V]>, where: string): void {
    const tree = this.tree
    const natural = tree.order === undefined
    const keys: K[] = []
    const values: V[] = []
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i] as [K, V]
      let key = pair[0]
      if (natural) {
        refuseNull(key, where)
        if ((key as unknown) === 0) key = 0 as K
      }
      keys.push(key)
      values.push(pair[1])
    }
    const expected = this.changes.structure
    if (keys.length === 1 && natural) {
      const only = keys[0] as K
      tree.compare(only, only, where, expected)
    }
    let sorted = 1
    while (
      sorted < keys.length &&
      tree.compare(keys[sorted - 1] as K, keys[sorted] as K, where, expected) < 0
    ) {
      sorted++
    }
    if (sorted >= keys.length) tree.buildPairs(keys, values)
    else tree.buildPairs(keys.slice(0, sorted), values.slice(0, sorted))
    for (let i = sorted; i < keys.length; i++) {
      const place = tree.locate(keys[i] as K, where, expected)
      if (place.node === null) tree.link(tree.newNode(keys[i] as K, values[i] as V), place)
      else (place.node as MapNode<K, V>).mapped = values[i] as V
    }
    if (tree.count > 0) this.changes.structural()
  }

  /** Fills a new, empty map with a copy of `source`'s tree. No comparisons. */
  copyFrom(source: TreeMapEngine<K, V>): void {
    this.tree.copyPairs(source.tree)
    if (this.tree.count > 0) this.changes.structural()
  }
}
