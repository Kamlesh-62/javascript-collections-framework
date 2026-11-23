// The live views of a linked hash map or its reversed view — its keys, its entries and its values,
// in the order of the map they came from, with that map's ends. Each view works on the map's table
// and shares its change counter, so changes show everywhere and iteration is live; every call that
// can run user code counts as a call on the map. None can add.
//
// A view keeps the map it came from as `source` and reaches it through `map`, which first moves a
// map in the native layout to linked records. `size`, `isEmpty`, `has` and `revision` use `source`
// directly, so they keep the native layout.

import type { Cursor } from '../../interfaces/collection'
import type { SequencedCollection } from '../../interfaces/list'
import type { MapEntry } from '../../interfaces/map'
import type { SequencedSet } from '../../interfaces/sequenced-set'
import { SEQUENCED_COLLECTION_BRAND } from '../brand'
import { normalise } from '../engines/hash-support'
import type { LinkedRecord } from '../engines/linked-hash-table'
import { MISSING } from '../engines/map-stores'
import { type HashFunction, sameValueZero } from '../equality'
import { MappedLiveIterator } from '../iteration'
import { AbstractCollection } from '../skeletons/abstract-collection'
import type { AbstractLinkedMap } from '../skeletons/abstract-linked-map'
import { AbstractSet } from '../skeletons/abstract-set'
import { unsupportedAdd } from './map-entry'

function keyOf<K, V>(record: LinkedRecord<K, V>): K {
  return record.key
}

function valueOfRecord<K, V>(record: LinkedRecord<K, V>): V {
  return record.value
}

/**
 * The live view of a linked hash map's keys, under the map's key equality.
 *
 * @internal
 */
export class LinkedHashMapKeySet<K, V> extends AbstractSet<K> implements SequencedSet<K> {
  private readonly source: AbstractLinkedMap<K, V>

  constructor(map: AbstractLinkedMap<K, V>) {
    super(map.changes)
    this.source = map
  }

  /** The map, in linked records. */
  private get map(): AbstractLinkedMap<K, V> {
    return this.source.promote()
  }

  get owner(): SequencedSet<K> {
    return this
  }

  get [Symbol.toStringTag](): string {
    return 'LinkedHashMapKeySet'
  }

  /** Marks every sequenced collection for `isSequencedCollection`, across loaded copies. */
  get [SEQUENCED_COLLECTION_BRAND](): true {
    return true
  }

  get size(): number {
    return this.source.size
  }

  [Symbol.iterator](): IterableIterator<K> {
    return this.map.keys()
  }

  /** The key view of the reversed map. */
  reversed(): SequencedSet<K> {
    return new LinkedHashMapKeySet(this.map.opposite())
  }

  protected hasMember(key: K, method: string): boolean {
    return this.source.hasKey(key, `${this.className}.${method}`)
  }

  add(_key: K): this {
    throw unsupportedAdd(this.className)
  }

  override addAll(elements: Iterable<K>): boolean {
    if (this.readAll(elements, 'addAll').length === 0) return false
    throw unsupportedAdd(this.className, 'addAll')
  }

  addFirst(_key: K): this {
    throw unsupportedAdd(this.className, 'addFirst')
  }

  addLast(_key: K): this {
    throw unsupportedAdd(this.className, 'addLast')
  }

  getFirst(): K {
    return this.map.endRecord(false, `${this.className}.getFirst`, 'set').key
  }

  getLast(): K {
    return this.map.endRecord(true, `${this.className}.getLast`, 'set').key
  }

  removeFirst(): K {
    return this.removeEnd(false, 'removeFirst')
  }

  removeLast(): K {
    return this.removeEnd(true, 'removeLast')
  }

  private removeEnd(back: boolean, method: string): K {
    const record = this.map.endRecord(back, `${this.className}.${method}`, 'set')
    this.map.removeRecord(record)
    return record.key
  }

  override delete(key: K): boolean {
    return this.map.removeKey(key, `${this.className}.delete`) !== MISSING
  }

  override clear(): void {
    this.map.clear()
  }

  override forEach(
    action: (element: K, same: K, set: SequencedSet<K>) => void,
    thisArg?: unknown,
  ): void {
    this.map.call(() => super.forEach(action as never, thisArg))
  }

  cursor(): Cursor<K> {
    return this.map.cursor(keyOf, `${this.className}.cursor`)
  }

  override removeAll(keys: Iterable<K>): boolean {
    return this.removeMatching('removeAll', keys, true)
  }

  override retainAll(keys: Iterable<K>): boolean {
    return this.removeMatching('retainAll', keys, false)
  }

  /**
   * Builds a lookup of `keys` under the map's key equality (user code runs only here and while
   * probing it), decides every mapping, then removes the decided ones by mapping.
   */
  private removeMatching(method: string, keys: Iterable<K>, remove: boolean): boolean {
    const items = this.readAll(keys, method)
    for (let i = 0; i < items.length; i++) items[i] = normalise(items[i] as K)
    const map = this.map
    const where = `${this.className}.${method}`
    return map.call(() => {
      const matches = map.table.lookup(items, map.operation(where))
      return map.removeDecidedRecords((record) => matches(record) === remove, where)
    })
  }

  protected override removeDecided(
    method: string,
    decide: (element: K, index: number) => boolean,
  ): boolean {
    return this.map.removeDecidedRecords(
      (record, index) => decide(record.key, index),
      `${this.className}.${method}`,
    )
  }

  protected memberHashes(hash: HashFunction): number {
    return this.map.table.keyHashes(hash)
  }
}

/**
 * The live view of a linked hash map's mappings as entries. A value is a member when it is a map
 * entry whose key is present under the map's key equality with a value equal under `equals`.
 *
 * @internal
 */
export class LinkedHashMapEntrySet<K, V>
  extends AbstractSet<MapEntry<K, V>>
  implements SequencedSet<MapEntry<K, V>>
{
  private readonly source: AbstractLinkedMap<K, V>

  constructor(map: AbstractLinkedMap<K, V>) {
    super(map.changes)
    this.source = map
  }

  /** The map, in linked records. */
  private get map(): AbstractLinkedMap<K, V> {
    return this.source.promote()
  }

  get owner(): SequencedSet<MapEntry<K, V>> {
    return this
  }

  get [Symbol.toStringTag](): string {
    return 'LinkedHashMapEntrySet'
  }

  /** Marks every sequenced collection for `isSequencedCollection`, across loaded copies. */
  get [SEQUENCED_COLLECTION_BRAND](): true {
    return true
  }

  get size(): number {
    return this.source.size
  }

  [Symbol.iterator](): IterableIterator<MapEntry<K, V>> {
    const map = this.map
    return new MappedLiveIterator(map.table.iterator(map.fromBack), (record) => map.entryAt(record))
  }

  /** The entry view of the reversed map. */
  reversed(): SequencedSet<MapEntry<K, V>> {
    return new LinkedHashMapEntrySet(this.map.opposite())
  }

  protected hasMember(entry: MapEntry<K, V>, method: string): boolean {
    return this.source.holdsEntry(entry, `${this.className}.${method}`)
  }

  add(_entry: MapEntry<K, V>): this {
    throw unsupportedAdd(this.className)
  }

  override addAll(elements: Iterable<MapEntry<K, V>>): boolean {
    if (this.readAll(elements, 'addAll').length === 0) return false
    throw unsupportedAdd(this.className, 'addAll')
  }

  addFirst(_entry: MapEntry<K, V>): this {
    throw unsupportedAdd(this.className, 'addFirst')
  }

  addLast(_entry: MapEntry<K, V>): this {
    throw unsupportedAdd(this.className, 'addLast')
  }

  getFirst(): MapEntry<K, V> {
    return this.map.entryAt(this.map.endRecord(false, `${this.className}.getFirst`, 'set'))
  }

  getLast(): MapEntry<K, V> {
    return this.map.entryAt(this.map.endRecord(true, `${this.className}.getLast`, 'set'))
  }

  removeFirst(): MapEntry<K, V> {
    return this.removeEnd(false, 'removeFirst')
  }

  removeLast(): MapEntry<K, V> {
    return this.removeEnd(true, 'removeLast')
  }

  /** Makes the entry first, so it reads the value the mapping had, then removes the mapping. */
  private removeEnd(back: boolean, method: string): MapEntry<K, V> {
    const record = this.map.endRecord(back, `${this.className}.${method}`, 'set')
    const entry = this.map.entryAt(record)
    this.map.removeRecord(record)
    return entry
  }

  override delete(entry: MapEntry<K, V>): boolean {
    const record = this.map.locate(entry, `${this.className}.delete`)
    if (record === undefined) return false
    this.map.removeRecord(record)
    return true
  }

  override clear(): void {
    this.map.clear()
  }

  override forEach(
    action: (
      element: MapEntry<K, V>,
      same: MapEntry<K, V>,
      set: SequencedSet<MapEntry<K, V>>,
    ) => void,
    thisArg?: unknown,
  ): void {
    this.map.call(() => super.forEach(action as never, thisArg))
  }

  cursor(): Cursor<MapEntry<K, V>> {
    const map = this.map
    return map.cursor((record) => map.entryAt(record), `${this.className}.cursor`)
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
    const map = this.map
    const where = `${this.className}.${method}`
    return map.call(() => {
      const matched = new Set<unknown>()
      for (let i = 0; i < items.length; i++) {
        const record = map.locate(items[i], where)
        if (record !== undefined) matched.add(record.handle)
      }
      return map.removeDecidedRecords((record) => matched.has(record.handle) === remove, where)
    })
  }

  protected override removeDecided(
    method: string,
    decide: (element: MapEntry<K, V>, index: number) => boolean,
  ): boolean {
    const map = this.map
    return map.removeDecidedRecords(
      (record, index) => decide(map.entryAt(record), index),
      `${this.className}.${method}`,
    )
  }

  protected memberHashes(hash: HashFunction): number {
    return this.map.mappingHashes(hash)
  }
}

/**
 * The live view of a linked hash map's values, compared with SameValueZero. Removing a value
 * removes the first mapping with that value. It equals only itself.
 *
 * @internal
 */
export class LinkedHashMapValues<K, V>
  extends AbstractCollection<V>
  implements SequencedCollection<V>
{
  protected readonly iterationMode = 'live' as const
  private readonly source: AbstractLinkedMap<K, V>

  constructor(map: AbstractLinkedMap<K, V>) {
    super(map.changes)
    this.source = map
  }

  /** The map, in linked records. */
  private get map(): AbstractLinkedMap<K, V> {
    return this.source.promote()
  }

  get [Symbol.toStringTag](): string {
    return 'LinkedHashMapValues'
  }

  /** Marks every sequenced collection for `isSequencedCollection`, across loaded copies. */
  get [SEQUENCED_COLLECTION_BRAND](): true {
    return true
  }

  get size(): number {
    return this.source.size
  }

  [Symbol.iterator](): IterableIterator<V> {
    return this.map.values()
  }

  /** The value view of the reversed map. */
  reversed(): SequencedCollection<V> {
    return new LinkedHashMapValues(this.map.opposite())
  }

  /** Whether a value is SameValueZero to `value`, scanning in order; keeps the native layout. */
  override has(value: V): boolean {
    for (const candidate of this.source.values()) if (sameValueZero(candidate, value)) return true
    return false
  }

  add(_value: V): this {
    throw unsupportedAdd(this.className)
  }

  override addAll(elements: Iterable<V>): boolean {
    if (this.readAll(elements, 'addAll').length === 0) return false
    throw unsupportedAdd(this.className, 'addAll')
  }

  addFirst(_value: V): this {
    throw unsupportedAdd(this.className, 'addFirst')
  }

  addLast(_value: V): this {
    throw unsupportedAdd(this.className, 'addLast')
  }

  getFirst(): V {
    return this.map.endRecord(false, `${this.className}.getFirst`, 'collection').value
  }

  getLast(): V {
    return this.map.endRecord(true, `${this.className}.getLast`, 'collection').value
  }

  removeFirst(): V {
    const where = `${this.className}.removeFirst`
    return this.map.removeRecord(this.map.endRecord(false, where, 'collection'))
  }

  removeLast(): V {
    const where = `${this.className}.removeLast`
    return this.map.removeRecord(this.map.endRecord(true, where, 'collection'))
  }

  override clear(): void {
    this.map.clear()
  }

  override forEach(action: (element: V) => void, thisArg?: unknown): void {
    this.map.call(() => super.forEach(action, thisArg))
  }

  cursor(): Cursor<V> {
    return this.map.cursor(valueOfRecord, `${this.className}.cursor`)
  }

  protected override removeDecided(
    method: string,
    decide: (element: V, index: number) => boolean,
  ): boolean {
    return this.map.removeDecidedRecords(
      (record, index) => decide(record.value, index),
      `${this.className}.${method}`,
    )
  }
}
