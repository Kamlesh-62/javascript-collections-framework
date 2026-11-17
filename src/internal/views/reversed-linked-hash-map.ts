// The reversed view of a linked hash map: the same state walked from the back, so changes show in
// both and the view's ends are the map's ends swapped.

import type { SequencedMap } from '../../interfaces/sequenced-map'
import type { LinkedHashMapEngine } from '../engines/linked-hash-map-engine'
import { AbstractLinkedMap } from '../skeletons/abstract-linked-map'

/**
 * A live view of a linked hash map in the opposite order. Reversing it returns the map.
 *
 * @internal
 */
export class ReversedLinkedHashMap<K, V> extends AbstractLinkedMap<K, V> {
  private readonly source: LinkedHashMapEngine<K, V>

  /** @param source - The map to reverse. */
  constructor(source: LinkedHashMapEngine<K, V>) {
    super(source.state, true)
    this.source = source
  }

  get [Symbol.toStringTag](): string {
    return 'ReversedLinkedHashMap'
  }

  get owner(): SequencedMap<K, V> {
    return this
  }

  opposite(): AbstractLinkedMap<K, V> {
    return this.source
  }

  reversed(): SequencedMap<K, V> {
    return this.source.owner
  }
}
