// Read-only collections that compare by identity, because their family has no value equality:
// an unmodifiable collection or sequenced collection, and a map's value view. Reads, iteration,
// `forEach` and cursors go to the source, and members can be mapped on the way out (a map's
// entries become read-only entries); every change is refused before its arguments are looked at.

import type { Cursor, ReadonlyCollection } from '../../../interfaces/collection'
import type { ReadonlySequencedCollection, SequencedCollection } from '../../../interfaces/list'
import { SEQUENCED_COLLECTION_BRAND } from '../../brand'
import { apply } from '../../intrinsics'
import { MappedLiveIterator } from '../../iteration'
import { AbstractCollection } from '../../skeletons/abstract-collection'
import { ReadOnlyCursor } from './read-only-cursor'
import { empty, refuse } from './refuse'
import { type ReadOnlyKind, registerReadOnly } from './registry'

/**
 * A read-only view of `source`, printed with `tag`, equal only to itself. With `reveal`, each
 * member is passed through it before it is handed out.
 *
 * @internal
 */
export class ReadOnlyCollection<E> extends AbstractCollection<E> {
  protected readonly iterationMode = 'live' as const
  protected readonly source: ReadonlyCollection<E>
  private readonly tag: string
  protected readonly reveal: ((member: E) => E) | undefined

  /**
   * @param kind - The family the view registers as; each library subclass passes its own.
   * @param exact - The class whose instances register as `kind`; an instance of any other class,
   *   such as a subclass defined outside the library, is not registered.
   */
  constructor(
    source: ReadonlyCollection<E>,
    tag: string,
    reveal?: (member: E) => E,
    kind: ReadOnlyKind = 'collection',
    exact: unknown = ReadOnlyCollection,
  ) {
    super()
    this.source = source
    this.tag = tag
    this.reveal = reveal
    registerReadOnly(this, new.target === exact ? kind : undefined, source, tag, reveal)
  }

  /** `member` as handed out: through `reveal` when there is one. */
  protected shown(member: E): E {
    return this.reveal === undefined ? member : this.reveal(member)
  }

  get [Symbol.toStringTag](): string {
    return this.tag
  }

  get size(): number {
    return this.source.size
  }

  override get revision(): number {
    return this.source.revision
  }

  override isEmpty(): boolean {
    return this.source.isEmpty()
  }

  [Symbol.iterator](): IterableIterator<E> {
    const members = this.source[Symbol.iterator]()
    return this.reveal === undefined ? members : new MappedLiveIterator(members, this.reveal)
  }

  override has(element: E): boolean {
    return this.source.has(element)
  }

  override toArray(): E[] {
    const members = this.source.toArray()
    if (this.reveal !== undefined) {
      for (let i = 0; i < members.length; i++) members[i] = this.reveal(members[i] as E)
    }
    return members
  }

  override forEach(action: (element: E) => void, thisArg?: unknown): void {
    this.requireFunction(action, 'forEach', 'action')
    this.source.forEach((element) => {
      apply(action, thisArg, [this.shown(element)])
    })
  }

  cursor(): Cursor<E> {
    return new ReadOnlyCursor(this.source.cursor(), `${this.className}.cursor`, this.reveal)
  }

  add(_element: E): this {
    throw refuse(`${this.className}.add`)
  }

  override addAll(_elements: Iterable<E>): boolean {
    throw refuse(`${this.className}.addAll`)
  }

  override delete(_element: E): boolean {
    throw refuse(`${this.className}.delete`)
  }

  override removeAll(_elements: Iterable<E>): boolean {
    throw refuse(`${this.className}.removeAll`)
  }

  override retainAll(_elements: Iterable<E>): boolean {
    throw refuse(`${this.className}.retainAll`)
  }

  override removeIf(_predicate: (element: E) => unknown): boolean {
    throw refuse(`${this.className}.removeIf`)
  }

  override clear(): void {
    throw refuse(`${this.className}.clear`)
  }
}

/**
 * A read-only view of a sequenced collection: the ends and a reversed view, equal only to itself.
 *
 * @internal
 */
export class ReadOnlySequencedCollection<E>
  extends ReadOnlyCollection<E>
  implements SequencedCollection<E>
{
  constructor(source: ReadonlySequencedCollection<E>, tag: string, reveal?: (member: E) => E) {
    super(source, tag, reveal, 'sequenced-collection', ReadOnlySequencedCollection)
  }

  /** Marks every sequenced collection for `isSequencedCollection`, across loaded copies. */
  get [SEQUENCED_COLLECTION_BRAND](): true {
    return true
  }

  getFirst(): E {
    if (this.source.isEmpty()) throw empty(`${this.className}.getFirst`)
    return this.shown((this.source as ReadonlySequencedCollection<E>).getFirst())
  }

  getLast(): E {
    if (this.source.isEmpty()) throw empty(`${this.className}.getLast`)
    return this.shown((this.source as ReadonlySequencedCollection<E>).getLast())
  }

  reversed(): SequencedCollection<E> {
    return new ReadOnlySequencedCollection(
      (this.source as ReadonlySequencedCollection<E>).reversed(),
      this.className,
      this.reveal,
    )
  }

  addFirst(_element: E): this {
    throw refuse(`${this.className}.addFirst`)
  }

  addLast(_element: E): this {
    throw refuse(`${this.className}.addLast`)
  }

  removeFirst(): E {
    throw refuse(`${this.className}.removeFirst`)
  }

  removeLast(): E {
    throw refuse(`${this.className}.removeLast`)
  }
}
