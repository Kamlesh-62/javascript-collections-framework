// The entry a read-only map hands out: a fixed key and value, equal to any entry with an equal
// key and value. `setValue` is refused.

import type { MapEntry } from '../../../interfaces/map'
import { isBranded, MAP_ENTRY_BRAND } from '../../brand'
import { equals, equalsSymbol, type HashFunction, hashCodeSymbol } from '../../equality'
import { NativeLiveIterator } from '../../iteration'
import { INSPECT, type InspectOptions, inspectMapping, mappingToString } from '../../output'
import { mappingHash } from '../../skeletons/abstract-map'
import { refuse } from './refuse'

/**
 * A read-only map entry holding `key` and `value`.
 *
 * @internal
 */
export class ReadOnlyEntry<K, V> implements MapEntry<K, V> {
  readonly key: K
  readonly value: V

  constructor(key: K, value: V) {
    this.key = key
    this.value = value
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
