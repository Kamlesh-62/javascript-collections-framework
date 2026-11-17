// The reversed view of a linked hash set: the same table and change counter, walked from the back,
// so changes show in both and the view's ends are the set's ends swapped.

import type { SequencedSet } from '../../interfaces/sequenced-set'
import type { LinkedHashSetEngine } from '../engines/linked-hash-set-engine'
import { AbstractLinkedSet } from '../skeletons/abstract-linked-set'

/**
 * A live view of a linked hash set in the opposite order. Reversing it returns the set.
 *
 * @internal
 */
export class ReversedLinkedHashSet<E> extends AbstractLinkedSet<E> {
  private readonly source: LinkedHashSetEngine<E>

  /** @param source - The set to reverse. */
  constructor(source: LinkedHashSetEngine<E>) {
    super(source.table, source.changeCounter, true)
    this.source = source
  }

  get [Symbol.toStringTag](): string {
    return 'ReversedLinkedHashSet'
  }

  get owner(): SequencedSet<E> {
    return this
  }

  reversed(): SequencedSet<E> {
    return this.source.owner
  }
}
