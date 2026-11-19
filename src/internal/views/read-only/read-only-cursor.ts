// Cursors of read-only collections: each wraps the source collection's own cursor, so it moves,
// fails fast or follows live changes exactly as the source's does, and refuses every change before
// looking at its state.

import type { Cursor } from '../../../interfaces/collection'
import type { ListCursor } from '../../../interfaces/list'
import { refuse } from './refuse'
import { hideSource, SOURCE } from './source-key'

/**
 * A forward cursor over a source cursor; with `reveal`, each element is passed through it.
 *
 * @internal
 */
export class ReadOnlyCursor<E> implements Cursor<E> {
  declare readonly [SOURCE]: Cursor<E>
  private readonly where: string
  private readonly reveal: ((element: E) => E) | undefined

  /**
   * @param source - The source collection's cursor.
   * @param where - The name refusals start with: `<Tag>.cursor`.
   * @param reveal - Maps each element before it is returned.
   */
  constructor(source: Cursor<E>, where: string, reveal?: (element: E) => E) {
    hideSource(this, source)
    this.where = where
    this.reveal = reveal
  }

  hasNext(): boolean {
    return this[SOURCE].hasNext()
  }

  next(): E {
    const element = this[SOURCE].next()
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
  declare readonly [SOURCE]: ListCursor<E>
  private readonly where: string

  /**
   * @param source - The source list's cursor.
   * @param where - The name refusals start with: `<Tag>.cursor` or `<Tag>.listCursor`.
   */
  constructor(source: ListCursor<E>, where: string) {
    hideSource(this, source)
    this.where = where
  }

  hasNext(): boolean {
    return this[SOURCE].hasNext()
  }

  next(): E {
    return this[SOURCE].next()
  }

  hasPrevious(): boolean {
    return this[SOURCE].hasPrevious()
  }

  previous(): E {
    return this[SOURCE].previous()
  }

  nextIndex(): number {
    return this[SOURCE].nextIndex()
  }

  previousIndex(): number {
    return this[SOURCE].previousIndex()
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
