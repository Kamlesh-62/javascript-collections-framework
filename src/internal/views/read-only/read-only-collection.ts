// A read-only collection over another collection, for views that compare by identity (a map's
// values). Reads go to the source; every change is refused before its arguments are looked at.

import type { Cursor, ReadonlyCollection } from '../../../interfaces/collection'
import { AbstractCollection } from '../../skeletons/abstract-collection'
import { ReadOnlyCursor } from './read-only-cursor'
import { refuse } from './refuse'

/**
 * A read-only view of `source`, printed with `tag`, equal only to itself.
 *
 * @internal
 */
export class ReadOnlyCollection<E> extends AbstractCollection<E> {
  protected readonly iterationMode = 'live' as const
  private readonly source: ReadonlyCollection<E>
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

  [Symbol.iterator](): IterableIterator<E> {
    return this.source[Symbol.iterator]()
  }

  override has(element: E): boolean {
    return this.source.has(element)
  }

  cursor(): Cursor<E> {
    return new ReadOnlyCursor(this.source[Symbol.iterator](), `${this.className}.cursor`)
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
