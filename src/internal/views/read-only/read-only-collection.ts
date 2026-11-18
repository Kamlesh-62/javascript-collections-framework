// Read-only collections that compare by identity, because their family has no value equality:
// an unmodifiable collection or sequenced collection, and a map's value view. Reads, iteration,
// `forEach` and cursors go to the source; every change is refused before its arguments are
// looked at.

import type { Cursor, ReadonlyCollection } from '../../../interfaces/collection'
import type { ReadonlySequencedCollection, SequencedCollection } from '../../../interfaces/list'
import { SEQUENCED_COLLECTION_BRAND } from '../../brand'
import { apply } from '../../intrinsics'
import { AbstractCollection } from '../../skeletons/abstract-collection'
import { ReadOnlyCursor } from './read-only-cursor'
import { empty, refuse } from './refuse'

/**
 * A read-only view of `source`, printed with `tag`, equal only to itself.
 *
 * @internal
 */
export class ReadOnlyCollection<E> extends AbstractCollection<E> {
  protected readonly iterationMode = 'live' as const
  protected readonly source: ReadonlyCollection<E>
  private readonly tag: string

  constructor(source: ReadonlyCollection<E>, tag: string) {
    super()
    this.source = source
    this.tag = tag
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
    return this.source[Symbol.iterator]()
  }

  override has(element: E): boolean {
    return this.source.has(element)
  }

  override toArray(): E[] {
    return this.source.toArray()
  }

  override forEach(action: (element: E) => void, thisArg?: unknown): void {
    this.requireFunction(action, 'forEach', 'action')
    this.source.forEach((element) => {
      apply(action, thisArg, [element])
    })
  }

  cursor(): Cursor<E> {
    return new ReadOnlyCursor(this.source.cursor(), `${this.className}.cursor`)
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
  /** Marks every sequenced collection for `isSequencedCollection`, across loaded copies. */
  get [SEQUENCED_COLLECTION_BRAND](): true {
    return true
  }

  getFirst(): E {
    if (this.source.isEmpty()) throw empty(`${this.className}.getFirst`)
    return (this.source as ReadonlySequencedCollection<E>).getFirst()
  }

  getLast(): E {
    if (this.source.isEmpty()) throw empty(`${this.className}.getLast`)
    return (this.source as ReadonlySequencedCollection<E>).getLast()
  }

  reversed(): SequencedCollection<E> {
    return new ReadOnlySequencedCollection(
      (this.source as ReadonlySequencedCollection<E>).reversed(),
      this.className,
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
