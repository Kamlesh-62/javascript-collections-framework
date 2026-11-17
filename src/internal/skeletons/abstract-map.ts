// The skeleton every map extends: the native `Map` reading methods, live iterators, and equality,
// hashing and printing by mappings, whatever the insertion order. A map is not a collection; the
// public class carries the map brand.

import type { MapCollection, MapEntry } from '../../interfaces/map'
import { isBranded, MAP_COLLECTION_BRAND } from '../brand'
import { requireFunction } from '../checks'
import { createGuard } from '../cycle'
import { MISSING } from '../engines/map-stores'
import { equals, type HashFunction, hashCodeSymbol, sameValueZero } from '../equality'
import { apply, imul } from '../intrinsics'
import { MappedLiveIterator } from '../iteration'
import { INSPECT, type InspectOptions, inspectMap, mapToString } from '../output'
import { ChangeCounter } from '../revision'

// One guard per operation, so a value's own code can compare or hash a map mid-operation.
const equalsGuard = /*#__PURE__*/ createGuard()
const hashGuard = /*#__PURE__*/ createGuard()

/**
 * Combines the hash of a key and the hash of its value into the hash of one mapping. Equal
 * mappings (and equal entries) get equal hashes.
 *
 * @internal
 */
export function mappingHash(keyHash: number, valueHash: number): number {
  return (imul(keyHash, 31) + valueHash) | 0
}

/**
 * Base class of every map.
 *
 * Subclasses implement `size`, `[Symbol.toStringTag]`, `owner`, `handles` (an iterator over one
 * handle per mapping), `keyAt`, `valueAt`, `find` (the handle of a key, or `MISSING`) and
 * `keyHash` (a stored key's hash under the map's key equality), and record every change through
 * `changes`.
 *
 * @internal
 */
export abstract class AbstractMap<K, V> {
  /**
   * The change counter: `structural()` when mappings are added or removed, `replaced()` when a
   * value is written. Views share it.
   */
  readonly changes: ChangeCounter

  /** @param changes - The change counter; a new one by default, the map's own for a map view. */
  constructor(changes: ChangeCounter = new ChangeCounter()) {
    this.changes = changes
  }

  abstract get size(): number
  abstract get [Symbol.toStringTag](): string
  /** The public map handed to callbacks: the object the caller holds. */
  abstract get owner(): MapCollection<K, V>
  /**
   * An iterator over one handle per mapping, in the map's order: live for a map that iterates
   * live, fail-fast otherwise, with `where` naming the method in its errors.
   */
  abstract handles(where: string): Iterator<unknown>
  abstract keyAt(handle: unknown): K
  abstract valueAt(handle: unknown): V
  /** Returns the handle of the mapping whose key equals `key`, or `MISSING`; errors name `where`. */
  abstract find(key: K, where: string): unknown
  /** Returns the hash of a stored key under this map's key equality. */
  abstract keyHash(handle: unknown, hash: HashFunction): number
  /** Returns a new live entry for a stored mapping. */
  abstract entryAt(handle: unknown): MapEntry<K, V>

  get revision(): number {
    return this.changes.revision
  }

  /** `<Class>.<method>`, for messages. */
  protected at(method: string): string {
    return `${this[Symbol.toStringTag]}.${method}`
  }

  isEmpty(): boolean {
    return this.size === 0
  }

  get(key: K): V | undefined {
    const handle = this.find(key, this.at('get'))
    return handle === MISSING ? undefined : this.valueAt(handle)
  }

  getOrDefault<D>(key: K, fallback: D): V | D {
    const handle = this.find(key, this.at('getOrDefault'))
    return handle === MISSING ? fallback : this.valueAt(handle)
  }

  has(key: K): boolean {
    return this.find(key, this.at('has')) !== MISSING
  }

  containsValue(value: V): boolean {
    const handles = this.handles(this.at('containsValue'))
    for (let step = handles.next(); step.done !== true; step = handles.next()) {
      if (sameValueZero(this.valueAt(step.value), value)) return true
    }
    return false
  }

  keys(): IterableIterator<K> {
    return new MappedLiveIterator(this.handles(this.at('keys')), (handle) => this.keyAt(handle))
  }

  values(): IterableIterator<V> {
    return new MappedLiveIterator(this.handles(this.at('values')), (handle) => this.valueAt(handle))
  }

  entries(): IterableIterator<[K, V]> {
    return new MappedLiveIterator(this.handles(this.at('entries')), (handle): [K, V] => [
      this.keyAt(handle),
      this.valueAt(handle),
    ])
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.entries()
  }

  forEach(action: (value: V, key: K, map: MapCollection<K, V>) => void, thisArg?: unknown): void {
    requireFunction(action, this.at('forEach'), 'action')
    const owner = this.owner
    const handles = this.handles(this.at('forEach'))
    for (let step = handles.next(); step.done !== true; step = handles.next()) {
      apply(action, thisArg, [this.valueAt(step.value), this.keyAt(step.value), owner])
    }
  }

  /**
   * Equal when `other` is a map of the same size, every key of this map is in `other` with an
   * equal value, and every key of `other` is in this map with an equal value, so the result is the
   * same both ways round even when the two maps compare keys differently. `other` is asked through
   * its entry view's `has`, which never reorders a map.
   */
  equals(other: unknown): boolean {
    if (other === this || other === this.owner) return true
    if (!isBranded(other, MAP_COLLECTION_BRAND)) return false
    const that = other as MapCollection<K, V>
    if (that.size !== this.size) return false
    return equalsGuard(
      this,
      () => false,
      () => {
        const where = this.at('equals')
        const handles = this.handles(where)
        const entries = that.entrySet()
        for (let step = handles.next(); step.done !== true; step = handles.next()) {
          if (!entries.has(this.entryAt(step.value))) return false
        }
        const pairs = that[Symbol.iterator]()
        for (let step = pairs.next(); step.done !== true; step = pairs.next()) {
          const handle = this.find(step.value[0], where)
          if (handle === MISSING || !equals(step.value[1], this.valueAt(handle))) return false
        }
        return true
      },
    )
  }

  /** The order-independent 32-bit sum of the mappings' hashes. */
  [hashCodeSymbol](hash: HashFunction): number {
    return hashGuard(
      this,
      () => 0,
      () => this.mappingHashes(hash),
    )
  }

  /** The 32-bit sum of the mappings' hashes, unguarded (the entry view's hash is the map's). */
  mappingHashes(hash: HashFunction): number {
    let sum = 0
    const handles = this.handles(this.at('[hashCodeSymbol]'))
    for (let step = handles.next(); step.done !== true; step = handles.next()) {
      const handle = step.value
      sum = (sum + mappingHash(this.keyHash(handle, hash), hash(this.valueAt(handle)))) | 0
    }
    return sum
  }

  /** The 32-bit sum of the keys' hashes: the hash of the key view. */
  keyHashes(hash: HashFunction): number {
    let sum = 0
    const handles = this.handles(this.at('[hashCodeSymbol]'))
    for (let step = handles.next(); step.done !== true; step = handles.next()) {
      sum = (sum + this.keyHash(step.value, hash)) | 0
    }
    return sum
  }

  toString(): string {
    return mapToString(this)
  }

  toJSON(): Array<[K, V]> {
    const out: Array<[K, V]> = []
    const handles = this.handles(this.at('toJSON'))
    for (let step = handles.next(); step.done !== true; step = handles.next()) {
      out.push([this.keyAt(step.value), this.valueAt(step.value)])
    }
    return out
  }

  [INSPECT](
    depth: number | null,
    options: InspectOptions,
    inspect: (value: unknown, options: InspectOptions) => string,
  ): string {
    return inspectMap(this, depth, options, inspect)
  }
}
