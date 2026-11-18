// Cursors over read-only collections: they walk like any cursor and refuse every change before
// looking at their state, so `remove()` before `next()` is refused rather than misused.

import { NoSuchElementError } from '../../../errors/errors'
import type { Cursor } from '../../../interfaces/collection'
import type { ListCursor, ReadonlyList } from '../../../interfaces/list'
import { refuse } from './refuse'

/**
 * A forward cursor over an iterator, looking one element ahead so `hasNext` can answer.
 *
 * @internal
 */
export class ReadOnlyCursor<E> implements Cursor<E> {
  private readonly iterator: Iterator<E>
  private readonly where: string
  private ahead: IteratorResult<E> | undefined

  /**
   * @param iterator - The elements to walk.
   * @param where - The name errors start with: `<Tag>.cursor`.
   */
  constructor(iterator: Iterator<E>, where: string) {
    this.iterator = iterator
    this.where = where
    this.ahead = undefined
  }

  hasNext(): boolean {
    if (this.ahead === undefined) this.ahead = this.iterator.next()
    return this.ahead.done !== true
  }

  next(): E {
    if (!this.hasNext()) throw new NoSuchElementError(`${this.where}: no more elements`)
    const value = (this.ahead as IteratorResult<E>).value as E
    this.ahead = undefined
    return value
  }

  remove(): void {
    throw refuse(`${this.where}.remove`)
  }
}

/**
 * A list cursor over a read-only list, moving by index in both directions.
 *
 * @internal
 */
export class ReadOnlyListCursor<E> implements ListCursor<E> {
  private readonly list: ReadonlyList<E>
  private readonly where: string
  private position: number

  /**
   * @param list - The list to walk; the cursor reads it through `get`.
   * @param position - The checked index of the first `next()`.
   * @param where - The name errors start with: `<Tag>.cursor` or `<Tag>.listCursor`.
   */
  constructor(list: ReadonlyList<E>, position: number, where: string) {
    this.list = list
    this.position = position
    this.where = where
  }

  hasNext(): boolean {
    return this.position < this.list.size
  }

  next(): E {
    if (!this.hasNext()) throw new NoSuchElementError(`${this.where}: no more elements`)
    return this.list.get(this.position++)
  }

  hasPrevious(): boolean {
    return this.position > 0
  }

  previous(): E {
    if (!this.hasPrevious()) throw new NoSuchElementError(`${this.where}: no previous element`)
    return this.list.get(--this.position)
  }

  nextIndex(): number {
    return this.position
  }

  previousIndex(): number {
    return this.position - 1
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
