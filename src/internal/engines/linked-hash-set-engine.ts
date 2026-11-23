// The engine behind `LinkedHashSet`: a linked hash table walked from the front. The public class
// holds one engine and delegates to it, so nothing here reaches the published types.

import type { SequencedSet } from '../../interfaces/sequenced-set'
import { ChangeCounter } from '../revision'
import { AbstractLinkedSet } from '../skeletons/abstract-linked-set'
import { ReversedLinkedHashSet } from '../views/reversed-linked-hash-set'
import type { HashEquality } from './hash-support'
import { LinkedHashTable } from './linked-hash-table'
import { MISSING } from './map-stores'

/**
 * A set in insertion order, changeable at both ends, whose members are compared with
 * SameValueZero, by derived key, or by an equivalence; iteration is live. With SameValueZero
 * members it starts in the native layout.
 *
 * @internal
 */
export class LinkedHashSetEngine<E> extends AbstractLinkedSet<E> {
  private readonly facade: SequencedSet<E>

  /**
   * @param facade - The public set, for identity and callbacks.
   * @param equality - How members are compared.
   * @param contents - The table to use, or the native `Set` of a set in the native layout; a new
   *   empty one by default.
   */
  constructor(
    facade: SequencedSet<E>,
    equality: HashEquality<E>,
    contents?: LinkedHashTable<E, undefined> | Set<E>,
  ) {
    let flat: Set<E> | undefined
    let table: LinkedHashTable<E, undefined> | undefined
    if (contents instanceof LinkedHashTable) table = contents
    else if (contents !== undefined) flat = contents
    else if (equality.kind === 'native') flat = new Set<E>()
    else table = new LinkedHashTable<E, undefined>(equality)
    super(
      {
        flat,
        table,
        front: undefined,
        frontKey: MISSING,
        frontValue: undefined,
        changes: new ChangeCounter(),
        equality,
      },
      false,
    )
    this.facade = facade
  }

  get [Symbol.toStringTag](): string {
    return 'LinkedHashSet'
  }

  get owner(): SequencedSet<E> {
    return this.facade
  }

  reversed(): SequencedSet<E> {
    return new ReversedLinkedHashSet(this)
  }

  /**
   * A new engine for `facade` with the same equality, order and stored keys and hashes; in the
   * native layout whenever the equality allows it, whatever this set's layout.
   */
  copy(facade: SequencedSet<E>): LinkedHashSetEngine<E> {
    const equality = this.state.equality
    if (equality.kind === 'native') return new LinkedHashSetEngine(facade, equality, new Set(this))
    return new LinkedHashSetEngine(facade, equality, this.table.copy(equality))
  }
}
