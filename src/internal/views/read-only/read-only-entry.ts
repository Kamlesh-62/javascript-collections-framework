// The entry a read-only map hands out: it wraps the source map's entry and reads it each time, so
// it shows the value the source entry shows. `setValue` is refused.

import type { MapEntry } from '../../../interfaces/map'
import { isBranded, MAP_ENTRY_BRAND } from '../../brand'
import { equals, equalsSymbol, type HashFunction, hashCodeSymbol } from '../../equality'
import { NativeLiveIterator } from '../../iteration'
import { INSPECT, type InspectOptions, inspectMapping, mappingToString } from '../../output'
import { mappingHash } from '../../skeletons/abstract-map'
import { refuse } from './refuse'

/**
 * A read-only entry over a source entry.
 *
 * @internal
 */
export class ReadOnlyEntry<K, V> implements MapEntry<K, V> {
  private readonly source: MapEntry<K, V>

  constructor(source: MapEntry<K, V>) {
    this.source = source
  }

  get key(): K {
    return this.source.key
  }

  get value(): V {
    return this.source.value
  }

  /** Marks every map entry, across loaded copies. */
  get [MAP_ENTRY_BRAND](): true {
    return true
  }

  setValue(_value: V): V {
    throw refuse('MapEntry.setValue')
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
