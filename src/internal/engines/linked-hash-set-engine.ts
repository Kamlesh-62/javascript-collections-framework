// The engine behind `LinkedHashSet`: a linked hash table walked from the front. The public class
// holds one engine and delegates to it, so nothing here reaches the published types.

import type { SequencedSet } from '../../interfaces/sequenced-set'
import { ChangeCounter } from '../revision'
import { AbstractLinkedSet } from '../skeletons/abstract-linked-set'
import { ReversedLinkedHashSet } from '../views/reversed-linked-hash-set'
import type { HashEquality } from './hash-support'
import { LinkedHashTable } from './linked-hash-table'

/**
 * A set in insertion order, changeable at both ends, whose members are compared with
 * SameValueZero, by derived key, or by an equivalence; iteration is live.
 *
 * @internal
 */
export class LinkedHashSetEngine<E> extends AbstractLinkedSet<E> {
  private readonly facade: SequencedSet<E>
  private readonly equality: HashEquality<E>

  /**
   * @param facade - The public set, for identity and callbacks.
   * @param equality - How members are compared.
   * @param table - The table to use; a new empty one by default.
   */
  constructor(
    facade: SequencedSet<E>,
    equality: HashEquality<E>,
    table: LinkedHashTable<E, undefined> = new LinkedHashTable<E, undefined>(equality),
  ) {
    super(table, new ChangeCounter(), false)
    this.facade = facade
    this.equality = equality
  }

  get [Symbol.toStringTag](): string {
    return 'LinkedHashSet'
  }

  get owner(): SequencedSet<E> {
    return this.facade
  }

  /** The change counter, shared with the reversed view. */
  get changeCounter(): ChangeCounter {
    return this.changes
  }

  reversed(): SequencedSet<E> {
    return new ReversedLinkedHashSet(this)
  }

  /** A new engine for `facade` with the same equality, order and stored keys and hashes. */
  copy(facade: SequencedSet<E>): LinkedHashSetEngine<E> {
    return new LinkedHashSetEngine(facade, this.equality, this.table.copy(this.equality))
  }
}
