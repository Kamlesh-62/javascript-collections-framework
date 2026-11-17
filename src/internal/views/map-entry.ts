// The entry handle every map returns, and the error its views throw for `add`. A map gives entries
// what they need through `EntrySource`, so an entry never depends on how the map stores mappings.

import { IllegalStateError, UnsupportedOperationError } from '../../errors/errors'
import type { MapEntry } from '../../interfaces/map'
import { isBranded, MAP_ENTRY_BRAND } from '../brand'
import { MISSING } from '../engines/map-stores'
import { equals, equalsSymbol, type HashFunction, hashCodeSymbol } from '../equality'
import { NativeLiveIterator } from '../iteration'
import { INSPECT, type InspectOptions, inspectMapping, mappingToString } from '../output'
import { mappingHash } from '../skeletons/abstract-map'

/**
 * The error a map view throws for `add` and non-empty `addAll`: a view cannot add.
 *
 * @internal
 */
export function unsupportedAdd(where: string, method = 'add'): UnsupportedOperationError {
  return new UnsupportedOperationError(
    `${where}.${method}: a map view cannot add; set the mapping on the map`,
  )
}

/**
 * What an entry needs from its map: reading a stored mapping by handle, finding the mapping a
 * handle stood for, and writing a value.
 *
 * @internal
 */
export interface EntrySource<K, V> {
  /** The key of a stored mapping. */
  keyAt(handle: unknown): K
  /** The value of a stored mapping. */
  valueAt(handle: unknown): V
  /**
   * The handle of the mapping `handle` stood for: `handle` itself while it is stored, otherwise a
   * mapping with a key equal to `key` (found with `probe` where the map keeps one), or `MISSING`.
   */
  relocate(handle: unknown, key: K, probe: unknown, where: string): unknown
  /** Writes `value` to a stored mapping, records the change and returns the value it replaced. */
  overwrite(handle: unknown, value: V): V
}

/**
 * One mapping of a map: a handle on (map, key). It keeps the stored handle (and the probe, where
 * the map keeps one) of its mapping, so reading and writing while the mapping is stored never
 * call user code, and it remembers the value it last returned or wrote, which it returns once the
 * key is gone.
 *
 * @internal
 */
export class MapEntryHandle<K, V> implements MapEntry<K, V> {
  readonly key: K
  private handle: unknown
  private last: V
  private readonly probe: unknown
  private readonly engine: EntrySource<K, V>

  constructor(engine: EntrySource<K, V>, handle: unknown, probe: unknown, value: V) {
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
