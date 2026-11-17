// The engine behind `LinkedHashMap`: a linked hash table walked from the front. The public class
// holds one engine and delegates to it, so nothing here reaches the published types.

import type { SequencedMap } from '../../interfaces/sequenced-map'
import { ChangeCounter } from '../revision'
import { AbstractLinkedMap, type LinkedMapState } from '../skeletons/abstract-linked-map'
import { ReversedLinkedHashMap } from '../views/reversed-linked-hash-map'
import { EvictionQueue } from './eviction-queue'
import type { HashEquality } from './hash-support'
import { LinkedHashTable } from './linked-hash-table'

/**
 * The options of a linked hash map, read and checked once at construction.
 *
 * @internal
 */
export interface LinkedMapSettings<K, V> {
  readonly equality: HashEquality<K>
  readonly accessOrder: boolean
  readonly maxSize: number | undefined
  readonly onEvict: ((value: V, key: K, map: never) => void) | undefined
}

/**
 * A map in insertion or access order, changeable at both ends and optionally bounded in size, whose
 * keys are compared with SameValueZero, by derived key, or by an equivalence; iteration is live.
 *
 * @internal
 */
export class LinkedHashMapEngine<K, V> extends AbstractLinkedMap<K, V> {
  private readonly facade: SequencedMap<K, V>
  private readonly settings: LinkedMapSettings<K, V>

  /**
   * @param facade - The public map, for identity, callbacks and `onEvict`.
   * @param settings - The options.
   * @param table - The table to use; a new empty one by default.
   */
  constructor(
    facade: SequencedMap<K, V>,
    settings: LinkedMapSettings<K, V>,
    table: LinkedHashTable<K, V> = new LinkedHashTable<K, V>(
      settings.equality,
      undefined,
      settings.accessOrder,
    ),
  ) {
    const { maxSize, onEvict } = settings
    const state: LinkedMapState<K, V> = {
      table,
      changes: new ChangeCounter(),
      equality: settings.equality,
      accessOrder: settings.accessOrder,
      maxSize,
      onEvict,
      queue:
        maxSize !== undefined && onEvict !== undefined
          ? new EvictionQueue<K, V>(onEvict, facade)
          : undefined,
    }
    super(state, false)
    this.facade = facade
    this.settings = settings
  }

  get [Symbol.toStringTag](): string {
    return 'LinkedHashMap'
  }

  get owner(): SequencedMap<K, V> {
    return this.facade
  }

  opposite(): AbstractLinkedMap<K, V> {
    return new ReversedLinkedHashMap(this)
  }

  reversed(): SequencedMap<K, V> {
    return this.opposite().owner
  }

  /** A new engine for `facade` with the same options, order and stored keys and hashes. */
  copy(facade: SequencedMap<K, V>): LinkedHashMapEngine<K, V> {
    return new LinkedHashMapEngine(facade, this.settings, this.table.copy(this.settings.equality))
  }
}
