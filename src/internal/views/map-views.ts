// The live views of a hash map — its keys, its entries and its values — and the entry handle. Each
// view reads and changes the map's engine directly and shares its change counter; none can add.

import { IllegalStateError, UnsupportedOperationError } from '../../errors/errors'
import type { Cursor } from '../../interfaces/collection'
import type { MapEntry } from '../../interfaces/map'
import type { SetCollection } from '../../interfaces/set'
import { isBranded, MAP_ENTRY_BRAND } from '../brand'
import type { HashMapEngine } from '../engines/hash-map-engine'
import { normalise } from '../engines/hash-support'
import { MISSING } from '../engines/map-stores'
import { equals, equalsSymbol, type HashFunction, hashCodeSymbol } from '../equality'
import { MappedLiveIterator, NativeLiveIterator } from '../iteration'
import { INSPECT, type InspectOptions, inspectMapping, mappingToString } from '../output'
import { AbstractCollection } from '../skeletons/abstract-collection'
import { mappingHash } from '../skeletons/abstract-map'
import { AbstractSet } from '../skeletons/abstract-set'

function unsupportedAdd(where: string, method = 'add'): UnsupportedOperationError {
  return new UnsupportedOperationError(
    `${where}.${method}: a map view cannot add; set the mapping on the map`,
  )
}

/**
 * One mapping of a hash map: a handle on (map, key). It keeps the stored handle and probe of its
 * mapping, so reading and writing never call `key` or `hash`, and it remembers the value it last
 * returned or wrote, which it returns once the key is gone.
 *
 * @internal
 */
export class MapEntryHandle<K, V> implements MapEntry<K, V> {
  readonly key: K
  private handle: unknown
  private last: V
  private readonly probe: unknown
  private readonly engine: HashMapEngine<K, V>

  constructor(engine: HashMapEngine<K, V>, handle: unknown, probe: unknown, value: V) {
    this.engine = engine
    this.handle = handle
    this.probe = probe
    this.key = engine.keyAt(handle)
    this.last = value
  }

  /** Marks every map entry, across loaded copies. */
  get [MAP_ENTRY_BRAND](): true {
    return true
  }

  /** The handle of this entry's mapping now, or `MISSING` while its key is absent. */
  private current(where: string): unknown {
    const handle = this.engine.relocate(this.handle, this.key, this.probe, where)
    if (handle !== MISSING) this.handle = handle
    return handle
  }

  get value(): V {
    const handle = this.current('MapEntry.value')
    if (handle !== MISSING) this.last = this.engine.valueAt(handle)
    return this.last
  }

  setValue(value: V): V {
    const handle = this.current('MapEntry.setValue')
    if (handle === MISSING) {
      throw new IllegalStateError('MapEntry.setValue: the mapping was removed from the map')
    }
    const old = this.engine.overwrite(handle, value)
    this.last = value
    return old
  }

  [Symbol.iterator](): IterableIterator<K | V> {
    return new NativeLiveIterator<K | V>([this.key, this.value][Symbol.iterator]())
  }

  equals(other: unknown): boolean {
    if (other === this) return true
    if (!isBranded(other, MAP_ENTRY_BRAND)) return false
    const that = other as MapEntry<K, V>
    return equals(this.key, that.key) && equals(this.value, that.value)
  }

  [equalsSymbol](other: unknown): boolean {
    return this.equals(other)
  }

  [hashCodeSymbol](hash: HashFunction): number {
    return mappingHash(hash(this.key), hash(this.value))
  }

  toString(): string {
    return mappingToString(this, this.key, this.value)
  }

  toJSON(): [K, V] {
    return [this.key, this.value]
  }

  [INSPECT](
    _depth: number | null,
    options: InspectOptions,
    inspect: (value: unknown, options: InspectOptions) => string,
  ): string {
    return inspectMapping(this.key, this.value, options, inspect)
  }
}

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
