// The skeleton of a sorted map and its views: everything is written once over a map tree, an
// optional range of it (low and high bounds, in ascending order) and a direction. The map itself is
// the whole tree in ascending order; a range view limits the range; a reversed view walks it the
// other way. Reading, equality, hashing and printing come from `AbstractMap`; every search of the
// tree — range membership, the ends, nearest nodes, range bounds — comes from a key set over the
// same tree, range and direction (`nav`), so the map and its key set search the same way.
//
// Every operation compares first and changes the tree only after every comparison; a method that
// can create a mapping checks, in order, its callback, a `null` key in natural order, the key's
// comparability and the view's range, then descends once.

import { ConcurrentModificationError, NullElementError } from '../../errors/errors'
import type { Comparator } from '../../functions/comparators'
import type { Collection, Cursor } from '../../interfaces/collection'
import type { MapCollection, MapEntry } from '../../interfaces/map'
import type { SetCollection } from '../../interfaces/set'
import type { SortedMap } from '../../interfaces/sorted-map'
import type { BoundOptions, SortedSet, SubSetOptions } from '../../interfaces/sorted-set'
import { MAP_COLLECTION_BRAND, SORTED_MAP_BRAND } from '../brand'
import { requireFunction } from '../checks'
import { MISSING } from '../engines/map-stores'
import type { MapNode, MapTree } from '../engines/map-tree'
import {
  type Place,
  predecessor,
  successor,
  TreeCursor,
  TreeIterator,
  type TreeNode,
} from '../engines/ordered-tree'
import { equalsSymbol, type HashFunction } from '../equality'
import { apply } from '../intrinsics'
import { readPairs } from '../map-input'
import { type EntrySource, MapEntryHandle } from '../views/map-entry'
import { TreeMapEntrySet, TreeMapKeySet, TreeMapValues } from '../views/tree-map-collections'
import { AbstractMap } from './abstract-map'
import type { Bound } from './abstract-sorted-set'

function identity<T>(node: T): T {
  return node
}

/**
 * In natural order, refuses a `null` or `undefined` key.
 *
 * @internal
 */
export function refuseNull(key: unknown, where: string): void {
  if (key === null || key === undefined) {
    throw new NullElementError(
      `${where}: ${key === null ? 'null' : 'undefined'} is not allowed as a key`,
    )
  }
}

/**
 * Base class of a sorted map and its views.
 *
 * Subclasses give the tag, the public owner, the comparator they report, the view in the opposite
 * order and how a new range view is made; the tree, the range and the direction are fixed at
 * construction.
 *
 * @internal
 */
export abstract class AbstractSortedMap<K, V>
  extends AbstractMap<K, V>
  implements SortedMap<K, V>, EntrySource<K, V>
{
  /** The tree, shared by a map and all its views. */
  readonly tree: MapTree<K, V>
  /** The low end of the range in ascending order, or `undefined` for none. */
  readonly low: Bound<K> | undefined
  /** The high end of the range in ascending order, or `undefined` for none. */
  readonly high: Bound<K> | undefined
  /** Whether this map walks the range from the greatest key down. */
  readonly descending: boolean
  /** The key set over the same tree, range and direction, which every search goes through. */
  readonly nav: TreeMapKeySet<K, V>

  constructor(
    tree: MapTree<K, V>,
    low: Bound<K> | undefined,
    high: Bound<K> | undefined,
    descending: boolean,
  ) {
    super(tree.changes)
    this.tree = tree
    this.low = low
    this.high = high
    this.descending = descending
    this.nav = new TreeMapKeySet(this)
  }

  abstract comparator(): Comparator<K> | undefined
  abstract override get owner(): SortedMap<K, V>
  /** The view in the opposite order: a new reversed view, or the view a reversed view reverses. */
  abstract reverseView(): AbstractSortedMap<K, V>
  /** Returns a new view of the ascending range from `low` to `high`, in this map's direction. */
  abstract openRange(low: Bound<K> | undefined, high: Bound<K> | undefined): AbstractSortedMap<K, V>

  /** Marks every map for `isMapCollection`, across loaded copies. */
  get [MAP_COLLECTION_BRAND](): true {
    return true
  }

  /** Marks every sorted map for `isSortedMap`, across loaded copies. */
  get [SORTED_MAP_BRAND](): true {
    return true
  }

  // ── Nodes ──

  /** The node after `node` in this map's direction, or `null`. */
  private step(node: TreeNode<K>): TreeNode<K> | null {
    return this.descending ? predecessor(node) : successor(node)
  }

  /** A fail-fast iterator over the nodes in range, in this map's direction, projected. */
  nodeIterator<T>(where: string, project: (node: TreeNode<K>) => T): IterableIterator<T> {
    const expected = this.changes.structure
    return new TreeIterator(
      this.nav.firstNode(where, expected),
      this.nav.stopNode(where, expected),
      this.descending,
      this.changes,
      where,
      project,
    )
  }

  /** A fail-fast cursor over the nodes in range, in this map's direction, projected. */
  nodeCursor<T>(where: string, project: (node: TreeNode<K>) => T): Cursor<T> {
    const expected = this.changes.structure
    return new TreeCursor(
      this.tree,
      this.nav.firstNode(where, expected),
      this.nav.stopNode(where, expected),
      this.descending,
      where,
      project,
    )
  }

  handles(where: string): Iterator<unknown> {
    return this.nodeIterator(where, identity)
  }

  keyAt(handle: unknown): K {
    return (handle as TreeNode<K>).value
  }

  valueAt(handle: unknown): V {
    return (handle as MapNode<K, V>).mapped
  }

  keyHash(handle: unknown, hash: HashFunction): number {
    return hash((handle as TreeNode<K>).value)
  }

  /** The node of `key` in range, or `MISSING`; absent when natural order cannot compare it. */
  find(key: K, where: string): unknown {
    const node = this.nav.lookup(key, where, this.changes.structure)
    return node === null ? MISSING : node
  }

  /**
   * The node an entry stood for: itself while stored (no comparisons), otherwise the node of an
   * equal key anywhere in the map, or `MISSING`.
   */
  relocate(handle: unknown, key: K, _probe: unknown, where: string): unknown {
    const node = handle as TreeNode<K>
    if (this.tree.stored(node)) return node
    const found = this.tree.find(key, where, this.changes.structure, true)
    return found === null ? MISSING : found
  }

  /** Writes `value` to a stored node, records the change and returns the value it replaced. */
  overwrite(handle: unknown, value: V): V {
    const node = handle as MapNode<K, V>
    const old = node.mapped
    node.mapped = value
    this.changes.replaced()
    return old
  }

  /** Unlinks a stored node, records the change and returns its value. */
  unlink(node: TreeNode<K>): V {
    this.tree.remove(node)
    this.changes.structural()
    return (node as MapNode<K, V>).mapped
  }

  /** Unlinks every node of `doomed` and records one change when there was any. */
  removeNodes(doomed: readonly TreeNode<K>[]): boolean {
    if (doomed.length === 0) return false
    for (let i = 0; i < doomed.length; i++) this.tree.remove(doomed[i] as TreeNode<K>)
    this.changes.structural()
    return true
  }

  /** A new entry for a stored node. */
  entryAt(node: TreeNode<K>): MapEntry<K, V> {
    return new MapEntryHandle<K, V>(this, node, undefined, (node as MapNode<K, V>).mapped)
  }

  private entryOf(node: TreeNode<K> | null): MapEntry<K, V> | undefined {
    return node === null ? undefined : this.entryAt(node)
  }

  // ── Keys ──

  /** In natural order: refuses `null`/`undefined` and turns `-0` into `0`. */
  private prepareKey(key: K, where: string): K {
    if (this.tree.order !== undefined) return key
    refuseNull(key, where)
    return (key as unknown) === 0 ? (0 as K) : key
  }

  /** In natural order, `-0` as `0`; nothing refused (for lookups that answer absent). */
  private lookupKey(key: K): K {
    return this.tree.order === undefined && (key as unknown) === 0 ? (0 as K) : key
  }

  /**
   * Finds where a new mapping of the prepared `key` goes: on a range view, the key's
   * comparability (natural order) and the range first; then one descent.
   */
  private locateNew(key: K, where: string): Place<K> {
    const expected = this.changes.structure
    if (this.nav.ranged) {
      if (this.tree.order === undefined) this.tree.checkNatural(key, where, expected)
      this.nav.requireInRange(key, where, expected)
    }
    return this.tree.locate(key, where, expected)
  }

  private linkNew(key: K, value: V, place: Place<K>): void {
    this.tree.link(this.tree.newNode(key, value), place)
    this.changes.structural()
  }

  /** Throws when a callback of `where` added or removed mappings since `start`. */
  private checkCallback(start: number, where: string): void {
    if (this.changes.structure !== start) {
      throw new ConcurrentModificationError(`${where}: the map was changed by the callback`)
    }
  }

  // ── Reading ──

  get size(): number {
    if (!this.nav.ranged) return this.tree.count
    const where = this.at('size')
    const expected = this.changes.structure
    const stop = this.nav.stopNode(where, expected)
    let count = 0
    for (let node = this.nav.firstNode(where, expected); node !== null && node !== stop; count++) {
      node = this.step(node)
    }
    return count
  }

  override isEmpty(): boolean {
    if (!this.nav.ranged) return this.tree.count === 0
    return this.nav.lowestNode(this.at('isEmpty'), this.changes.structure) === null
  }

  [equalsSymbol](other: unknown): boolean {
    return this.equals(other)
  }

  // ── Writing ──

  /** Maps `key` to `value`; returns the previous value, or `MISSING` when the key was absent. */
  store(key: K, value: V, where: string): unknown {
    const prepared = this.prepareKey(key, where)
    const place = this.locateNew(prepared, where)
    if (place.node !== null) return this.overwrite(place.node, value)
    this.linkNew(prepared, value, place)
    return MISSING
  }

  set(key: K, value: V): this {
    this.store(key, value, this.at('set'))
    return this
  }

  put(key: K, value: V): V | undefined {
    const old = this.store(key, value, this.at('put'))
    return old === MISSING ? undefined : (old as V)
  }

  putAll(entries: Iterable<readonly [K, V] | MapEntry<K, V>>): void {
    const where = this.at('putAll')
    const pairs = readPairs<K, V>(entries, where)
    const tree = this.tree
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i] as [K, V]
      pair[0] = this.prepareKey(pair[0], where)
    }
    const expected = this.changes.structure
    if (tree.order === undefined && pairs.length > 0) {
      // Every key against one common key: a stored one, or the first key itself.
      const common = tree.root === null ? (pairs[0] as [K, V])[0] : tree.root.value
      for (let i = 0; i < pairs.length; i++) {
        tree.compare((pairs[i] as [K, V])[0], common, where, expected)
      }
    }
    if (this.nav.ranged) {
      for (let i = 0; i < pairs.length; i++) {
        this.nav.requireInRange((pairs[i] as [K, V])[0], where, expected)
      }
    }
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i] as [K, V]
      this.store(pair[0], pair[1], where)
    }
  }

  delete(key: K): boolean {
    const node = this.find(key, this.at('delete'))
    if (node === MISSING) return false
    this.unlink(node as TreeNode<K>)
    return true
  }

  remove(key: K): V | undefined {
    const node = this.find(key, this.at('remove'))
    return node === MISSING ? undefined : this.unlink(node as TreeNode<K>)
  }

  replace(key: K, value: V): V | undefined {
    const node = this.find(key, this.at('replace'))
    return node === MISSING ? undefined : this.overwrite(node, value)
  }

  replaceAll(fn: (value: V, key: K, map: MapCollection<K, V>) => V): void {
    const where = this.at('replaceAll')
    requireFunction(fn, where, 'fn')
    const owner = this.owner
    const start = this.changes.structure
    const stop = this.nav.stopNode(where, start)
    for (
      let node = this.nav.firstNode(where, start);
      node !== null && node !== stop;
      node = this.step(node)
    ) {
      const result = apply(fn, undefined, [(node as MapNode<K, V>).mapped, node.value, owner]) as V
      this.checkCallback(start, where)
      this.overwrite(node, result)
    }
  }

  getOrInsert(key: K, value: V): V {
    const where = this.at('getOrInsert')
    const prepared = this.prepareKey(key, where)
    const place = this.locateNew(prepared, where)
    if (place.node !== null) return (place.node as MapNode<K, V>).mapped
    this.linkNew(prepared, value, place)
    return value
  }

  getOrInsertComputed(key: K, fn: (key: K) => V): V {
    const where = this.at('getOrInsertComputed')
    requireFunction(fn, where, 'fn')
    const prepared = this.prepareKey(key, where)
    const start = this.changes.structure
    let place = this.locateNew(prepared, where)
    if (place.node !== null) return (place.node as MapNode<K, V>).mapped
    const value = apply(fn, undefined, [prepared]) as V
    if (this.changes.structure !== start) {
      // The callback added or removed mappings: look again.
      place = this.tree.locate(prepared, where, this.changes.structure)
      if (place.node !== null) {
        this.overwrite(place.node, value)
        return value
      }
    }
    this.linkNew(prepared, value, place)
    return value
  }

  compute(
    key: K,
    fn: (value: V | undefined, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined {
    const where = this.at('compute')
    requireFunction(fn, where, 'fn')
    const prepared = this.prepareKey(key, where)
    const place = this.locateNew(prepared, where)
    const node = place.node
    const start = this.changes.structure
    const old = node === null ? undefined : (node as MapNode<K, V>).mapped
    const result = apply(fn, undefined, [old, prepared, this.owner]) as V | undefined
    this.checkCallback(start, where)
    if (result === undefined) {
      if (node !== null) this.unlink(node)
    } else if (node !== null) {
      this.overwrite(node, result)
    } else {
      this.linkNew(prepared, result, place)
    }
    return result
  }

  computeIfPresent(
    key: K,
    fn: (value: V, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined {
    const where = this.at('computeIfPresent')
    requireFunction(fn, where, 'fn')
    const lookup = this.lookupKey(key)
    const node = this.find(lookup, where)
    if (node === MISSING) return undefined
    const start = this.changes.structure
    const result = apply(fn, undefined, [(node as MapNode<K, V>).mapped, lookup, this.owner]) as
      | V
      | undefined
    this.checkCallback(start, where)
    if (result === undefined) this.unlink(node as TreeNode<K>)
    else this.overwrite(node, result)
    return result
  }

  merge(
    key: K,
    value: V,
    fn: (old: V, value: V, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined {
    const where = this.at('merge')
    requireFunction(fn, where, 'fn')
    const prepared = this.prepareKey(key, where)
    const place = this.locateNew(prepared, where)
    const node = place.node
    if (node === null) {
      this.linkNew(prepared, value, place)
      return value
    }
    const start = this.changes.structure
    const result = apply(fn, undefined, [
      (node as MapNode<K, V>).mapped,
      value,
      prepared,
      this.owner,
    ]) as V | undefined
    this.checkCallback(start, where)
    if (result === undefined) this.unlink(node)
    else this.overwrite(node, result)
    return result
  }

  clear(): void {
    if (!this.nav.ranged) {
      if (this.tree.count === 0) return
      this.tree.clear()
      this.changes.structural()
      return
    }
    this.removeNodes(this.nav.nodes(this.at('clear'), this.changes.structure))
  }

  // ── Ends and nearest entries ──

  firstEntry(): MapEntry<K, V> | undefined {
    return this.entryOf(this.nav.firstNode(this.at('firstEntry'), this.changes.structure))
  }

  lastEntry(): MapEntry<K, V> | undefined {
    return this.entryOf(this.nav.lastNode(this.at('lastEntry'), this.changes.structure))
  }

  lowerEntry(key: K): MapEntry<K, V> | undefined {
    return this.nearestEntry(key, true, false, 'lowerEntry')
  }

  floorEntry(key: K): MapEntry<K, V> | undefined {
    return this.nearestEntry(key, true, true, 'floorEntry')
  }

  ceilingEntry(key: K): MapEntry<K, V> | undefined {
    return this.nearestEntry(key, false, true, 'ceilingEntry')
  }

  higherEntry(key: K): MapEntry<K, V> | undefined {
    return this.nearestEntry(key, false, false, 'higherEntry')
  }

  private nearestEntry(
    key: K,
    before: boolean,
    inclusive: boolean,
    method: string,
  ): MapEntry<K, V> | undefined {
    const where = this.at(method)
    if (this.tree.order === undefined) refuseNull(key, where)
    return this.entryOf(this.nav.nearestNode(key, before, inclusive, where))
  }

  pollFirstEntry(): MapEntry<K, V> | undefined {
    return this.poll(this.nav.firstNode(this.at('pollFirstEntry'), this.changes.structure))
  }

  pollLastEntry(): MapEntry<K, V> | undefined {
    return this.poll(this.nav.lastNode(this.at('pollLastEntry'), this.changes.structure))
  }

  /** Makes the entry first, so it reads the value the mapping had, then unlinks the node. */
  private poll(node: TreeNode<K> | null): MapEntry<K, V> | undefined {
    if (node === null) return undefined
    const entry = this.entryAt(node)
    this.unlink(node)
    return entry
  }

  // ── Views ──

  subMap(from: K, to: K, options?: SubSetOptions | null): SortedMap<K, V> {
    const range = this.nav.subRange(from, to, options, this.at('subMap'))
    return this.openRange(range[0], range[1])
  }

  headMap(to: K, options?: BoundOptions | null): SortedMap<K, V> {
    const range = this.nav.headRange(to, options, this.at('headMap'))
    return this.openRange(range[0], range[1])
  }

  tailMap(from: K, options?: BoundOptions | null): SortedMap<K, V> {
    const range = this.nav.tailRange(from, options, this.at('tailMap'))
    return this.openRange(range[0], range[1])
  }

  reversed(): SortedMap<K, V> {
    return this.reverseView().owner
  }

  keySet(): SortedSet<K> {
    return new TreeMapKeySet(this)
  }

  entrySet(): SetCollection<MapEntry<K, V>> {
    return new TreeMapEntrySet(this)
  }

  valueCollection(): Collection<V> {
    return new TreeMapValues(this)
  }
}
