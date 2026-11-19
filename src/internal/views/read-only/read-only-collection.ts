// Read-only collections that compare by identity, because their family has no value equality:
// an unmodifiable collection or sequenced collection, and a map's value view. Reads, iteration,
// `forEach` and cursors go to the source, and members can be mapped on the way out (a map's
// entries become read-only entries); every change is refused before its arguments are looked at.

import type { Cursor, ReadonlyCollection } from '../../../interfaces/collection'
import type { ReadonlySequencedCollection, SequencedCollection } from '../../../interfaces/list'
import { SEQUENCED_COLLECTION_BRAND } from '../../brand'
import { apply } from '../../intrinsics'
import { AbstractCollection } from '../../skeletons/abstract-collection'
import { ReadOnlyCursor } from './read-only-cursor'
import { empty, refuse } from './refuse'
import { type ReadOnlyKind, registerReadOnly } from './registry'
import { hideSource, ReadOnlyIterator, SOURCE } from './source-key'

/**
 * A read-only view of `source`, printed with `tag`, equal only to itself. With `reveal`, each
 * member is passed through it before it is handed out.
 *
 * @internal
 */
export class ReadOnlyCollection<E> extends AbstractCollection<E> {
  protected readonly iterationMode = 'live' as const
  declare readonly [SOURCE]: ReadonlyCollection<E>
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
    hideSource(this, source)
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
    return this[SOURCE].size
  }

  override get revision(): number {
    return this[SOURCE].revision
  }

  override isEmpty(): boolean {
    return this[SOURCE].isEmpty()
  }

  [Symbol.iterator](): IterableIterator<E> {
    const members = this[SOURCE][Symbol.iterator]()
    return new ReadOnlyIterator(members, this.reveal)
  }

  override has(element: E): boolean {
    return this[SOURCE].has(element)
  }

  override toArray(): E[] {
    const members = this[SOURCE].toArray()
    if (this.reveal !== undefined) {
      for (let i = 0; i < members.length; i++) members[i] = this.reveal(members[i] as E)
    }
    return members
  }

  override forEach(action: (element: E) => void, thisArg?: unknown): void {
    this.requireFunction(action, 'forEach', 'action')
    this[SOURCE].forEach((element) => {
      apply(action, thisArg, [this.shown(element)])
    })
  }

  cursor(): Cursor<E> {
    return new ReadOnlyCursor(this[SOURCE].cursor(), `${this.className}.cursor`, this.reveal)
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
    if (this[SOURCE].isEmpty()) throw empty(`${this.className}.getFirst`)
    return this.shown((this[SOURCE] as ReadonlySequencedCollection<E>).getFirst())
  }

  getLast(): E {
    if (this[SOURCE].isEmpty()) throw empty(`${this.className}.getLast`)
    return this.shown((this[SOURCE] as ReadonlySequencedCollection<E>).getLast())
  }

  reversed(): SequencedCollection<E> {
    return new ReadOnlySequencedCollection(
      (this[SOURCE] as ReadonlySequencedCollection<E>).reversed(),
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
