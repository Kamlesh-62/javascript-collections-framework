// The live views of a hash map — its keys, its entries and its values. Each view reads and changes
// the map's engine directly and shares its change counter; none can add.

import type { Cursor } from '../../interfaces/collection'
import type { MapEntry } from '../../interfaces/map'
import type { SetCollection } from '../../interfaces/set'
import { isBranded, MAP_ENTRY_BRAND } from '../brand'
import type { HashMapEngine } from '../engines/hash-map-engine'
import { normalise } from '../engines/hash-support'
import { MISSING } from '../engines/map-stores'
import { equals, type HashFunction } from '../equality'
import { MappedLiveIterator } from '../iteration'
import { AbstractCollection } from '../skeletons/abstract-collection'
import { AbstractSet } from '../skeletons/abstract-set'
import { unsupportedAdd } from './map-entry'

/**
 * The live view of a hash map's keys, under the map's key equality.
 *
 * @internal
 */
export class HashMapKeySet<K, V> extends AbstractSet<K> {
  private readonly engine: HashMapEngine<K, V>

  constructor(engine: HashMapEngine<K, V>) {
    super(engine.changes)
    this.engine = engine
  }

  get owner(): SetCollection<K> {
    return this
  }

  get [Symbol.toStringTag](): string {
    return 'HashMapKeySet'
  }

  get size(): number {
    return this.engine.size
  }

  [Symbol.iterator](): IterableIterator<K> {
    return this.engine.keys()
  }

  protected hasMember(key: K, method: string): boolean {
    return this.engine.find(key, `${this.className}.${method}`) !== MISSING
  }

  add(_key: K): this {
    throw unsupportedAdd(this.className)
  }
  override addAll(elements: Iterable<K>): boolean {
    if (this.readAll(elements, 'addAll').length === 0) return false
    throw unsupportedAdd(this.className, 'addAll')
  }

  override delete(key: K): boolean {
    return this.engine.removeKey(key, `${this.className}.delete`) !== MISSING
  }

  override clear(): void {
    this.engine.clear()
  }

  cursor(): Cursor<K> {
    const engine = this.engine
    return engine.cursor((handle) => engine.keyAt(handle), `${this.className}.cursor`)
  }

  override removeAll(keys: Iterable<K>): boolean {
    return this.removeMatching('removeAll', keys, true)
  }

  override retainAll(keys: Iterable<K>): boolean {
    return this.removeMatching('retainAll', keys, false)
  }

  /**
   * Builds a lookup of `keys` under the map's key equality (user code runs only here and while
   * probing it), decides every mapping, then removes the decided ones by stored mapping.
   */
  private removeMatching(method: string, keys: Iterable<K>, remove: boolean): boolean {
    const items = this.readAll(keys, method)
    for (let i = 0; i < items.length; i++) items[i] = normalise(items[i] as K)
    const engine = this.engine
    const matches = engine.store.lookup(items, engine.operation(`${this.className}.${method}`))
    return engine.removeWhere((handle) => matches(handle) === remove)
  }

  protected memberHashes(hash: HashFunction): number {
    return this.engine.keyHashes(hash)
  }
}

/**
 * The live view of a hash map's mappings as entries. A value is a member when it is a map entry
 * whose key is present under the map's key equality with a value equal under `equals`.
 *
 * @internal
 */
export class HashMapEntrySet<K, V> extends AbstractSet<MapEntry<K, V>> {
  private readonly engine: HashMapEngine<K, V>

  constructor(engine: HashMapEngine<K, V>) {
    super(engine.changes)
    this.engine = engine
  }

  get owner(): SetCollection<MapEntry<K, V>> {
    return this
  }

  get [Symbol.toStringTag](): string {
    return 'HashMapEntrySet'
  }

  get size(): number {
    return this.engine.size
  }

  [Symbol.iterator](): IterableIterator<MapEntry<K, V>> {
    const engine = this.engine
    return new MappedLiveIterator(engine.handles(), (handle) => engine.entryAt(handle))
  }

  /** The handle of the mapping `value` stands for, or `MISSING` when it is not a member. */
  private locate(value: unknown, method: string): unknown {
    if (!isBranded(value, MAP_ENTRY_BRAND)) return MISSING
    const entry = value as MapEntry<K, V>
    const key = entry.key
    const expected = entry.value
    const engine = this.engine
    const where = `${this.className}.${method}`
    const handle = engine.find(key, where)
    if (handle === MISSING) return MISSING
    const op = engine.operation(where)
    return op.after(equals(engine.valueAt(handle), expected)) ? handle : MISSING
  }

  protected hasMember(entry: MapEntry<K, V>, method: string): boolean {
    return this.locate(entry, method) !== MISSING
  }

  add(_entry: MapEntry<K, V>): this {
    throw unsupportedAdd(this.className)
  }
  override addAll(elements: Iterable<MapEntry<K, V>>): boolean {
    if (this.readAll(elements, 'addAll').length === 0) return false
    throw unsupportedAdd(this.className, 'addAll')
  }

  override delete(entry: MapEntry<K, V>): boolean {
    const handle = this.locate(entry, 'delete')
    if (handle === MISSING) return false
    this.engine.removeAt(handle)
    return true
  }

  override clear(): void {
    this.engine.clear()
  }

  cursor(): Cursor<MapEntry<K, V>> {
    const engine = this.engine
    return engine.cursor(
      (handle, value) => engine.entryAt(handle, value),
      `${this.className}.cursor`,
    )
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
    const matched = new Set<unknown>()
    const op = this.engine.operation(`${this.className}.${method}`)
    for (const item of items) {
      const handle = this.locate(item, method)
      if (handle !== MISSING) matched.add(handle)
    }
    op.after(matched)
    return this.engine.removeWhere((handle) => matched.has(handle) === remove)
  }

  protected memberHashes(hash: HashFunction): number {
    return this.engine.mappingHashes(hash)
  }
}

/**
 * The live view of a hash map's values, compared with SameValueZero. Removing a value removes a
 * mapping with that value. It equals only itself.
 *
 * @internal
 */
export class HashMapValues<K, V> extends AbstractCollection<V> {
  protected readonly iterationMode = 'live' as const
  private readonly engine: HashMapEngine<K, V>

  constructor(engine: HashMapEngine<K, V>) {
    super(engine.changes)
    this.engine = engine
  }

  get [Symbol.toStringTag](): string {
    return 'HashMapValues'
  }

  get size(): number {
    return this.engine.size
  }

  [Symbol.iterator](): IterableIterator<V> {
    return this.engine.values()
  }

  add(_value: V): this {
    throw unsupportedAdd(this.className)
  }
  override addAll(elements: Iterable<V>): boolean {
    if (this.readAll(elements, 'addAll').length === 0) return false
    throw unsupportedAdd(this.className, 'addAll')
  }

  override clear(): void {
    this.engine.clear()
  }

  cursor(): Cursor<V> {
    const engine = this.engine
    return engine.cursor((_handle, value) => value, `${this.className}.cursor`)
  }
}
