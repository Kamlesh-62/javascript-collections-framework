// Cursors of read-only collections: each wraps the source collection's own cursor, so it moves,
// fails fast or follows live changes exactly as the source's does, and refuses every change before
// looking at its state.

import type { Cursor } from '../../../interfaces/collection'
import type { ListCursor } from '../../../interfaces/list'
import { refuse } from './refuse'

/**
 * A forward cursor over a source cursor; with `reveal`, each element is passed through it.
 *
 * @internal
 */
export class ReadOnlyCursor<E> implements Cursor<E> {
  private readonly source: Cursor<E>
  private readonly where: string
  private readonly reveal: ((element: E) => E) | undefined

  /**
   * @param source - The source collection's cursor.
   * @param where - The name refusals start with: `<Tag>.cursor`.
   * @param reveal - Maps each element before it is returned.
   */
  constructor(source: Cursor<E>, where: string, reveal?: (element: E) => E) {
    this.source = source
    this.where = where
    this.reveal = reveal
  }

  hasNext(): boolean {
    return this.source.hasNext()
  }

  next(): E {
    const element = this.source.next()
    return this.reveal === undefined ? element : this.reveal(element)
  }

  remove(): void {
    throw refuse(`${this.where}.remove`)
  }
}

/**
 * A list cursor over a source list cursor.
 *
 * @internal
 */
export class ReadOnlyListCursor<E> implements ListCursor<E> {
  private readonly source: ListCursor<E>
  private readonly where: string

  /**
   * @param source - The source list's cursor.
   * @param where - The name refusals start with: `<Tag>.cursor` or `<Tag>.listCursor`.
   */
  constructor(source: ListCursor<E>, where: string) {
    this.source = source
    this.where = where
  }

  hasNext(): boolean {
    return this.source.hasNext()
  }

  next(): E {
    return this.source.next()
  }

  hasPrevious(): boolean {
    return this.source.hasPrevious()
  }

  previous(): E {
    return this.source.previous()
  }

  nextIndex(): number {
    return this.source.nextIndex()
  }

  previousIndex(): number {
    return this.source.previousIndex()
  }

  remove(): void {
    throw refuse(`${this.where}.remove`)
  }

  set(_element: E): void {
    throw refuse(`${this.where}.set`)
  }

  insert(_element: E): void {
    throw refuse(`${this.where}.insert`)
  }
}
