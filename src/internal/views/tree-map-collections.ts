// The live views of a sorted map's keys, entries and values. Each works on the map's own tree, range
// and direction and shares its change counter, so changes show everywhere and open iterators of any
// of them fail fast. None can add: mappings are set on the map.

import { ConcurrentModificationError, NoSuchElementError } from '../../errors/errors'
import type { Comparator } from '../../functions/comparators'
import type { Cursor } from '../../interfaces/collection'
import type { SequencedCollection } from '../../interfaces/list'
import type { MapEntry } from '../../interfaces/map'
import type { SequencedSet } from '../../interfaces/sequenced-set'
import type { SortedSet } from '../../interfaces/sorted-set'
import { isBranded, MAP_ENTRY_BRAND, SEQUENCED_COLLECTION_BRAND } from '../brand'
import type { MapNode } from '../engines/map-tree'
import type { TreeNode } from '../engines/ordered-tree'
import { equals, type HashFunction } from '../equality'
import { AbstractCollection } from '../skeletons/abstract-collection'
import { AbstractSet } from '../skeletons/abstract-set'
import type { AbstractSortedMap } from '../skeletons/abstract-sorted-map'
import { AbstractSortedSet, type Bound } from '../skeletons/abstract-sorted-set'
import { unsupportedAdd } from './map-entry'

function mappedOf<K, V>(node: TreeNode<K>): V {
  return (node as MapNode<K, V>).mapped
}

/**
 * The node at the front (`back` false) or back of `map`, in its order, or `NoSuchElementError`
 * naming `<tag>.<method>` and what the view is called.
 */
function endNode<K, V>(
  map: AbstractSortedMap<K, V>,
  back: boolean,
  where: string,
  noun: string,
): TreeNode<K> {
  const expected = map.changes.structure
  const node = back ? map.nav.lastNode(where, expected) : map.nav.firstNode(where, expected)
  if (node === null) throw new NoSuchElementError(`${where}: the ${noun} is empty`)
  return node
}

/**
 * The live view of a sorted map's keys: a sorted set over the map's tree, range and direction.
 * Removing a key removes its mapping; adding throws. Its range and reversed views are the key
 * sets of the matching map views.
 *
 * @internal
 */
export class TreeMapKeySet<K, V> extends AbstractSortedSet<K> {
  private readonly map: AbstractSortedMap<K, V>
  /** The key set this one was made from by `reversed()`, which reversing it again returns. */
  private readonly source: TreeMapKeySet<K, V> | undefined

  constructor(map: AbstractSortedMap<K, V>, source?: TreeMapKeySet<K, V>) {
    super(map.tree, map.low, map.high, map.descending)
    this.map = map
    this.source = source
  }

  get [Symbol.toStringTag](): string {
    return 'TreeMapKeySet'
  }

  get owner(): SortedSet<K> {
    return this
  }

  comparator(): Comparator<K> | undefined {
    return this.map.comparator()
  }

  reversed(): SortedSet<K> {
    return this.source !== undefined ? this.source : new TreeMapKeySet(this.map.reverseView(), this)
  }

  protected openRange(low: Bound<K> | undefined, high: Bound<K> | undefined): SortedSet<K> {
    return this.map.openRange(low, high).keySet()
  }

  override add(_key: K): this {
    throw unsupportedAdd(this.className)
  }

  override addAll(elements: Iterable<K>): boolean {
    if (this.readAll(elements, 'addAll').length === 0) return false
    throw unsupportedAdd(this.className, 'addAll')
  }

  override addFirst(_key: K): this {
    throw unsupportedAdd(this.className, 'addFirst')
  }

  override addLast(_key: K): this {
    throw unsupportedAdd(this.className, 'addLast')
  }
}

/**
 * The live view of a sorted map's mappings as entries, in the map's order. A value is a member
 * when it is a map entry whose key is in range and present with a value equal under `equals`.
 *
 * @internal
 */
export class TreeMapEntrySet<K, V>
  extends AbstractSet<MapEntry<K, V>>
  implements SequencedSet<MapEntry<K, V>>
{
  protected override readonly iterationMode = 'fail-fast' as const
  private readonly map: AbstractSortedMap<K, V>

  constructor(map: AbstractSortedMap<K, V>) {
    super(map.changes)
    this.map = map
  }

  get owner(): SequencedSet<MapEntry<K, V>> {
    return this
  }

  /** Marks every sequenced collection for `isSequencedCollection`, across loaded copies. */
  get [SEQUENCED_COLLECTION_BRAND](): true {
    return true
  }

  /** The entry view of the reversed map. */
  reversed(): SequencedSet<MapEntry<K, V>> {
    return new TreeMapEntrySet(this.map.reverseView())
  }

  getFirst(): MapEntry<K, V> {
    return this.map.entryAt(endNode(this.map, false, `${this.className}.getFirst`, 'set'))
  }

  getLast(): MapEntry<K, V> {
    return this.map.entryAt(endNode(this.map, true, `${this.className}.getLast`, 'set'))
  }

  removeFirst(): MapEntry<K, V> {
    return this.removeEnd(false, 'removeFirst')
  }

  removeLast(): MapEntry<K, V> {
    return this.removeEnd(true, 'removeLast')
  }

  /** Makes the entry first, so it reads the value the mapping had, then unlinks the node. */
  private removeEnd(back: boolean, method: string): MapEntry<K, V> {
    const node = endNode(this.map, back, `${this.className}.${method}`, 'set')
    const entry = this.map.entryAt(node)
    this.map.unlink(node)
    return entry
  }

  addFirst(_entry: MapEntry<K, V>): this {
    throw unsupportedAdd(this.className, 'addFirst')
  }

  addLast(_entry: MapEntry<K, V>): this {
    throw unsupportedAdd(this.className, 'addLast')
  }

  get [Symbol.toStringTag](): string {
    return 'TreeMapEntrySet'
  }

  get size(): number {
    return this.map.size
  }

  override isEmpty(): boolean {
    return this.map.isEmpty()
  }

  [Symbol.iterator](): IterableIterator<MapEntry<K, V>> {
    const map = this.map
    return map.nodeIterator(`${this.className}[Symbol.iterator]().next`, (node) =>
      map.entryAt(node),
    )
  }

  cursor(): Cursor<MapEntry<K, V>> {
    const map = this.map
    return map.nodeCursor(`${this.className}.cursor`, (node) => map.entryAt(node))
  }

  /** The node of the mapping `value` stands for, or `null` when it is not a member. */
  private locate(
    value: unknown,
    method: string,
    start: number = this.changes.structure,
  ): TreeNode<K> | null {
    if (!isBranded(value, MAP_ENTRY_BRAND)) return null
    const where = `${this.className}.${method}`
    const entry = value as MapEntry<K, V>
    const key = entry.key
    const expected = entry.value
    if (this.changes.structure !== start) {
      throw new ConcurrentModificationError(`${where}: the map was changed while reading an entry`)
    }
    const node = this.map.nav.lookup(key, where, start)
    if (node === null) return null
    const same = equals(mappedOf<K, V>(node), expected)
    if (this.changes.structure !== start) {
      throw new ConcurrentModificationError(`${where}: the map was changed while comparing values`)
    }
    return same ? node : null
  }

  protected hasMember(entry: MapEntry<K, V>, method: string): boolean {
    return this.locate(entry, method) !== null
  }

  add(_entry: MapEntry<K, V>): this {
    throw unsupportedAdd(this.className)
  }

  override addAll(elements: Iterable<MapEntry<K, V>>): boolean {
    if (this.readAll(elements, 'addAll').length === 0) return false
    throw unsupportedAdd(this.className, 'addAll')
  }

  override delete(entry: MapEntry<K, V>): boolean {
    const node = this.locate(entry, 'delete')
    if (node === null) return false
    this.map.unlink(node)
    return true
  }

  override clear(): void {
    this.map.clear()
  }

  override removeAll(entries: Iterable<MapEntry<K, V>>): boolean {
    return this.removeMatching('removeAll', entries, true)
  }

  override retainAll(entries: Iterable<MapEntry<K, V>>): boolean {
    return this.removeMatching('retainAll', entries, false)
  }

  /** Finds the mapping of every argument first (user code runs only here), then removes. */
  private removeMatching(
    method: string,
    entries: Iterable<MapEntry<K, V>>,
    remove: boolean,
  ): boolean {
    const items = this.readAll(entries, method)
    const matched = new Set<TreeNode<K>>()
    const start = this.changes.structure
    for (let i = 0; i < items.length; i++) {
      const node = this.locate(items[i], method, start)
      if (node !== null) matched.add(node)
    }
    const doomed: TreeNode<K>[] = []
    const all = this.map.nav.nodes(`${this.className}.${method}`, this.changes.structure)
    for (let i = 0; i < all.length; i++) {
      const node = all[i] as TreeNode<K>
      if (matched.has(node) === remove) doomed.push(node)
    }
    return this.map.removeNodes(doomed)
  }

  protected memberHashes(hash: HashFunction): number {
    return this.map.mappingHashes(hash)
  }
}

/**
 * The live view of a sorted map's values, in the map's order, compared with SameValueZero.
 * Removing a value removes the first mapping with that value. It equals only itself.
 *
 * @internal
 */
export class TreeMapValues<K, V> extends AbstractCollection<V> implements SequencedCollection<V> {
  protected readonly iterationMode = 'fail-fast' as const
  private readonly map: AbstractSortedMap<K, V>

  constructor(map: AbstractSortedMap<K, V>) {
    super(map.changes)
    this.map = map
  }

  /** Marks every sequenced collection for `isSequencedCollection`, across loaded copies. */
  get [SEQUENCED_COLLECTION_BRAND](): true {
    return true
  }

  /** The value view of the reversed map. */
  reversed(): SequencedCollection<V> {
    return new TreeMapValues(this.map.reverseView())
  }

  getFirst(): V {
    return mappedOf<K, V>(endNode(this.map, false, `${this.className}.getFirst`, 'collection'))
  }

  getLast(): V {
    return mappedOf<K, V>(endNode(this.map, true, `${this.className}.getLast`, 'collection'))
  }

  removeFirst(): V {
    return this.map.unlink(endNode(this.map, false, `${this.className}.removeFirst`, 'collection'))
  }

  removeLast(): V {
    return this.map.unlink(endNode(this.map, true, `${this.className}.removeLast`, 'collection'))
  }

  addFirst(_value: V): this {
    throw unsupportedAdd(this.className, 'addFirst')
  }

  addLast(_value: V): this {
    throw unsupportedAdd(this.className, 'addLast')
  }

  get [Symbol.toStringTag](): string {
    return 'TreeMapValues'
  }

  get size(): number {
    return this.map.size
  }

  override isEmpty(): boolean {
    return this.map.isEmpty()
  }

  [Symbol.iterator](): IterableIterator<V> {
    return this.map.nodeIterator(`${this.className}[Symbol.iterator]().next`, mappedOf<K, V>)
  }

  cursor(): Cursor<V> {
    return this.map.nodeCursor(`${this.className}.cursor`, mappedOf<K, V>)
  }

  add(_value: V): this {
    throw unsupportedAdd(this.className)
  }

  override addAll(elements: Iterable<V>): boolean {
    if (this.readAll(elements, 'addAll').length === 0) return false
    throw unsupportedAdd(this.className, 'addAll')
  }

  override clear(): void {
    this.map.clear()
  }
}
