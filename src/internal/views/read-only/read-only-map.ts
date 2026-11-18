// Read-only maps over another map: plain, sequenced and sorted. Reads, equality, hashing,
// iteration and `forEach` are the source's; key, entry and value views are read-only in turn,
// entries wrap the source's, and every change is refused before its arguments are looked at.

import type { Comparator } from '../../../functions/comparators'
import type { Collection } from '../../../interfaces/collection'
import type { SequencedCollection } from '../../../interfaces/list'
import type { MapCollection, MapEntry, ReadonlyMapCollection } from '../../../interfaces/map'
import type { ReadonlySequencedMap, SequencedMap } from '../../../interfaces/sequenced-map'
import type { SequencedSet } from '../../../interfaces/sequenced-set'
import type { SetCollection } from '../../../interfaces/set'
import type { ReadonlySortedMap, SortedMap } from '../../../interfaces/sorted-map'
import type { BoundOptions, SortedSet, SubSetOptions } from '../../../interfaces/sorted-set'
import { MAP_COLLECTION_BRAND, SEQUENCED_MAP_BRAND, SORTED_MAP_BRAND } from '../../brand'
import { requireFunction } from '../../checks'
import { equalsSymbol, type HashFunction, hashCodeSymbol } from '../../equality'
import { apply } from '../../intrinsics'
import { INSPECT, type InspectOptions, inspectMap, mapToString } from '../../output'
import { ReadOnlyCollection, ReadOnlySequencedCollection } from './read-only-collection'
import { ReadOnlyEntry } from './read-only-entry'
import { ReadOnlySequencedSet, ReadOnlySet, ReadOnlySortedSet } from './read-only-set'
import { refuse } from './refuse'
import { type ReadOnlyKind, registerReadOnly } from './registry'
import type { ReadOnlyTags } from './tags'

/** Wraps a source entry so it cannot be written. @internal */
export function readOnlyEntry<K, V>(entry: MapEntry<K, V>): MapEntry<K, V> {
  return new ReadOnlyEntry(entry)
}

function readOnlyEntryOrUndefined<K, V>(
  entry: MapEntry<K, V> | undefined,
): MapEntry<K, V> | undefined {
  return entry === undefined ? undefined : new ReadOnlyEntry(entry)
}

/** The roles a read-only map can play. @internal */
export type MapRole = 'map' | 'sequencedMap' | 'sortedMap'

/**
 * A read-only view of `source`, printed with the tag of its role.
 *
 * @internal
 */
export class ReadOnlyMap<K, V> implements MapCollection<K, V> {
  protected readonly source: ReadonlyMapCollection<K, V>
  protected readonly tags: ReadOnlyTags
  private readonly role: MapRole

  /**
   * @param kind - The family the view registers as; each library subclass passes its own.
   * @param exact - The class whose instances register as `kind`; an instance of any other class,
   *   such as a subclass defined outside the library, is not registered.
   */
  constructor(
    source: ReadonlyMapCollection<K, V>,
    tags: ReadOnlyTags,
    role: MapRole = 'map',
    kind: ReadOnlyKind = 'map',
    exact: unknown = ReadOnlyMap,
  ) {
    this.source = source
    this.tags = tags
    this.role = role
    registerReadOnly(this, new.target === exact ? kind : undefined, source, tags[role])
  }

  /** Marks every map for `isMapCollection`, across loaded copies. */
  get [MAP_COLLECTION_BRAND](): true {
    return true
  }

  get [Symbol.toStringTag](): string {
    return this.tags[this.role]
  }

  /** The name errors start with. */
  protected get className(): string {
    return this[Symbol.toStringTag]
  }

  get size(): number {
    return this.source.size
  }

  get revision(): number {
    return this.source.revision
  }

  isEmpty(): boolean {
    return this.source.isEmpty()
  }

  get(key: K): V | undefined {
    return this.source.get(key)
  }

  getOrDefault<D>(key: K, fallback: D): V | D {
    return this.source.getOrDefault(key, fallback)
  }

  has(key: K): boolean {
    return this.source.has(key)
  }

  containsValue(value: V): boolean {
    return this.source.containsValue(value)
  }

  keySet(): SetCollection<K> {
    return new ReadOnlySet(this.source.keySet(), this.tags.keySet)
  }

  entrySet(): SetCollection<MapEntry<K, V>> {
    return new ReadOnlySet(this.source.entrySet(), this.tags.entrySet, readOnlyEntry)
  }

  valueCollection(): Collection<V> {
    return new ReadOnlyCollection(this.source.valueCollection(), this.tags.values)
  }

  keys(): IterableIterator<K> {
    return this.source.keys()
  }

  values(): IterableIterator<V> {
    return this.source.values()
  }

  entries(): IterableIterator<[K, V]> {
    return this.source.entries()
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.source.entries()
  }

  forEach(action: (value: V, key: K, map: MapCollection<K, V>) => void, thisArg?: unknown): void {
    requireFunction(action, `${this.className}.forEach`, 'action')
    this.source.forEach((value, key) => {
      apply(action, thisArg, [value, key, this])
    })
  }

  equals(other: unknown): boolean {
    return other === this || this.source.equals(other)
  }

  [equalsSymbol](other: unknown): boolean {
    return this.equals(other)
  }

  [hashCodeSymbol](hash: HashFunction): number {
    return this.source[hashCodeSymbol](hash)
  }

  toString(): string {
    return mapToString(this)
  }

  toJSON(): Array<[K, V]> {
    return this.source.toJSON()
  }

  [INSPECT](
    depth: number | null,
    options: InspectOptions,
    inspect: (value: unknown, options: InspectOptions) => string,
  ): string {
    return inspectMap(this, depth, options, inspect)
  }

  // ── Every change is refused ──

  set(_key: K, _value: V): this {
    throw refuse(`${this.className}.set`)
  }

  put(_key: K, _value: V): V | undefined {
    throw refuse(`${this.className}.put`)
  }

  putAll(_entries: Iterable<readonly [K, V] | MapEntry<K, V>>): void {
    throw refuse(`${this.className}.putAll`)
  }

  delete(_key: K): boolean {
    throw refuse(`${this.className}.delete`)
  }

  remove(_key: K): V | undefined {
    throw refuse(`${this.className}.remove`)
  }

  replace(_key: K, _value: V): V | undefined {
    throw refuse(`${this.className}.replace`)
  }

  replaceAll(_fn: (value: V, key: K, map: MapCollection<K, V>) => V): void {
    throw refuse(`${this.className}.replaceAll`)
  }

  getOrInsert(_key: K, _value: V): V {
    throw refuse(`${this.className}.getOrInsert`)
  }

  getOrInsertComputed(_key: K, _fn: (key: K) => V): V {
    throw refuse(`${this.className}.getOrInsertComputed`)
  }

  compute(
    _key: K,
    _fn: (value: V | undefined, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined {
    throw refuse(`${this.className}.compute`)
  }

  computeIfPresent(
    _key: K,
    _fn: (value: V, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined {
    throw refuse(`${this.className}.computeIfPresent`)
  }

  merge(
    _key: K,
    _value: V,
    _fn: (old: V, value: V, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined {
    throw refuse(`${this.className}.merge`)
  }

  clear(): void {
    throw refuse(`${this.className}.clear`)
  }
}

/**
 * A read-only view of a sequenced map: the ends, a reversed view, and sequenced key, entry and
 * value views.
 *
 * @internal
 */
export class ReadOnlySequencedMap<K, V> extends ReadOnlyMap<K, V> implements SequencedMap<K, V> {
  constructor(
    source: ReadonlySequencedMap<K, V>,
    tags: ReadOnlyTags,
    role: MapRole = 'sequencedMap',
    kind: ReadOnlyKind = 'sequenced-map',
    exact: unknown = ReadOnlySequencedMap,
  ) {
    super(source, tags, role, kind, exact)
  }

  /** Marks every sequenced map, across loaded copies. */
  get [SEQUENCED_MAP_BRAND](): true {
    return true
  }

  private get sequenced(): ReadonlySequencedMap<K, V> {
    return this.source as ReadonlySequencedMap<K, V>
  }

  firstEntry(): MapEntry<K, V> | undefined {
    return readOnlyEntryOrUndefined(this.sequenced.firstEntry())
  }

  lastEntry(): MapEntry<K, V> | undefined {
    return readOnlyEntryOrUndefined(this.sequenced.lastEntry())
  }

  reversed(): SequencedMap<K, V> {
    return new ReadOnlySequencedMap(this.sequenced.reversed(), this.tags)
  }

  override keySet(): SequencedSet<K> {
    return new ReadOnlySequencedSet(this.sequenced.keySet(), this.tags.sequencedSet)
  }

  override entrySet(): SequencedSet<MapEntry<K, V>> {
    return new ReadOnlySequencedSet(
      this.sequenced.entrySet(),
      this.tags.sequencedSet,
      readOnlyEntry,
    )
  }

  override valueCollection(): SequencedCollection<V> {
    return new ReadOnlySequencedCollection(
      this.sequenced.valueCollection(),
      this.tags.sequencedCollection,
    )
  }

  pollFirstEntry(): MapEntry<K, V> | undefined {
    throw refuse(`${this.className}.pollFirstEntry`)
  }

  pollLastEntry(): MapEntry<K, V> | undefined {
    throw refuse(`${this.className}.pollLastEntry`)
  }

  putFirst(_key: K, _value: V): this {
    throw refuse(`${this.className}.putFirst`)
  }

  putLast(_key: K, _value: V): this {
    throw refuse(`${this.className}.putLast`)
  }
}

/**
 * A read-only view of a sorted map: navigation entries, range views, a descending view and a
 * sorted key set.
 *
 * @internal
 */
export class ReadOnlySortedMap<K, V> extends ReadOnlySequencedMap<K, V> implements SortedMap<K, V> {
  constructor(source: ReadonlySortedMap<K, V>, tags: ReadOnlyTags) {
    super(source, tags, 'sortedMap', 'sorted-map', ReadOnlySortedMap)
  }

  /** Marks every sorted map for `isSortedMap`, across loaded copies. */
  get [SORTED_MAP_BRAND](): true {
    return true
  }

  private get sorted(): ReadonlySortedMap<K, V> {
    return this.source as ReadonlySortedMap<K, V>
  }

  comparator(): Comparator<K> | undefined {
    return this.sorted.comparator()
  }

  lowerEntry(key: K): MapEntry<K, V> | undefined {
    return readOnlyEntryOrUndefined(this.sorted.lowerEntry(key))
  }

  floorEntry(key: K): MapEntry<K, V> | undefined {
    return readOnlyEntryOrUndefined(this.sorted.floorEntry(key))
  }

  ceilingEntry(key: K): MapEntry<K, V> | undefined {
    return readOnlyEntryOrUndefined(this.sorted.ceilingEntry(key))
  }

  higherEntry(key: K): MapEntry<K, V> | undefined {
    return readOnlyEntryOrUndefined(this.sorted.higherEntry(key))
  }

  subMap(from: K, to: K, options?: SubSetOptions | null): SortedMap<K, V> {
    return new ReadOnlySortedMap(this.sorted.subMap(from, to, options), this.tags)
  }

  headMap(to: K, options?: BoundOptions | null): SortedMap<K, V> {
    return new ReadOnlySortedMap(this.sorted.headMap(to, options), this.tags)
  }

  tailMap(from: K, options?: BoundOptions | null): SortedMap<K, V> {
    return new ReadOnlySortedMap(this.sorted.tailMap(from, options), this.tags)
  }

  override reversed(): SortedMap<K, V> {
    return new ReadOnlySortedMap(this.sorted.reversed(), this.tags)
  }

  override keySet(): SortedSet<K> {
    return new ReadOnlySortedSet(this.sorted.keySet(), this.tags.sortedSet)
  }
}
