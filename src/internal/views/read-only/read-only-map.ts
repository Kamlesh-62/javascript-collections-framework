// A read-only map over another map. Reads, equality and hashing are the source's; its key, entry
// and value views are read-only in turn, entries are read-only copies, and every change is refused
// before its arguments are looked at.

import type { Collection } from '../../../interfaces/collection'
import type { MapCollection, MapEntry, ReadonlyMapCollection } from '../../../interfaces/map'
import type { SetCollection } from '../../../interfaces/set'
import { MAP_COLLECTION_BRAND } from '../../brand'
import { requireFunction } from '../../checks'
import { equalsSymbol, type HashFunction, hashCodeSymbol } from '../../equality'
import { apply } from '../../intrinsics'
import { INSPECT, type InspectOptions, inspectMap, mapToString } from '../../output'
import { ReadOnlyCollection } from './read-only-collection'
import { ReadOnlyEntry } from './read-only-entry'
import { ReadOnlySet } from './read-only-set'
import { refuse } from './refuse'

/** The tags of a read-only map and of the views it hands out. @internal */
export interface ReadOnlyMapTags {
  readonly map: string
  readonly keySet: string
  readonly entrySet: string
  readonly values: string
}

function readOnlyEntry<K, V>(entry: MapEntry<K, V>): MapEntry<K, V> {
  return new ReadOnlyEntry(entry.key, entry.value)
}

/**
 * A read-only view of `source`, printed with `tags.map`.
 *
 * @internal
 */
export class ReadOnlyMap<K, V> implements MapCollection<K, V> {
  private readonly source: ReadonlyMapCollection<K, V>
  private readonly tags: ReadOnlyMapTags

  constructor(source: ReadonlyMapCollection<K, V>, tags: ReadOnlyMapTags) {
    this.source = source
    this.tags = tags
  }

  /** Marks every map for `isMapCollection`, across loaded copies. */
  get [MAP_COLLECTION_BRAND](): true {
    return true
  }

  get [Symbol.toStringTag](): string {
    return this.tags.map
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
    requireFunction(action, `${this.tags.map}.forEach`, 'action')
    for (const [key, value] of this.source.entries()) apply(action, thisArg, [value, key, this])
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
    throw refuse(`${this.tags.map}.set`)
  }

  put(_key: K, _value: V): V | undefined {
    throw refuse(`${this.tags.map}.put`)
  }

  putAll(_entries: Iterable<readonly [K, V] | MapEntry<K, V>>): void {
    throw refuse(`${this.tags.map}.putAll`)
  }

  delete(_key: K): boolean {
    throw refuse(`${this.tags.map}.delete`)
  }

  remove(_key: K): V | undefined {
    throw refuse(`${this.tags.map}.remove`)
  }

  replace(_key: K, _value: V): V | undefined {
    throw refuse(`${this.tags.map}.replace`)
  }

  replaceAll(_fn: (value: V, key: K, map: MapCollection<K, V>) => V): void {
    throw refuse(`${this.tags.map}.replaceAll`)
  }

  getOrInsert(_key: K, _value: V): V {
    throw refuse(`${this.tags.map}.getOrInsert`)
  }

  getOrInsertComputed(_key: K, _fn: (key: K) => V): V {
    throw refuse(`${this.tags.map}.getOrInsertComputed`)
  }

  compute(
    _key: K,
    _fn: (value: V | undefined, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined {
    throw refuse(`${this.tags.map}.compute`)
  }

  computeIfPresent(
    _key: K,
    _fn: (value: V, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined {
    throw refuse(`${this.tags.map}.computeIfPresent`)
  }

  merge(
    _key: K,
    _value: V,
    _fn: (old: V, value: V, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined {
    throw refuse(`${this.tags.map}.merge`)
  }

  clear(): void {
    throw refuse(`${this.tags.map}.clear`)
  }
}
