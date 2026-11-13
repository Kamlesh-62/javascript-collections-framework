// Iteration over indexed lists: a fail-fast iterator and a two-way list cursor, written once over
// the index operations every list provides (the array engine and the views alike).

import {
  ConcurrentModificationError,
  IllegalStateError,
  NoSuchElementError,
} from '../errors/errors'
import type { ListCursor } from '../interfaces/list'
import { done, FailFastIterator } from './iteration'
import type { ChangeCounter } from './revision'

/**
 * The index operations a list provides to its iterators and cursors. Each changing operation
 * records itself in the list's change counter.
 *
 * @internal
 */
export interface IndexedList<E> {
  readonly size: number
  getAt(index: number): E
  setAt(index: number, element: E): void
  insertAt(index: number, element: E): void
  removeAtIndex(index: number): E
}

/**
 * A fail-fast iterator over a list by index.
 *
 * @internal
 */
export class IndexIterator<E> extends FailFastIterator<E> {
  private index = 0
  private readonly list: IndexedList<E>

  constructor(list: IndexedList<E>, changes: ChangeCounter, where: string) {
    super(changes, where)
    this.list = list
  }

  protected step(): IteratorResult<E> {
    return this.index < this.list.size
      ? { done: false, value: this.list.getAt(this.index++) }
      : done()
  }
}

/**
 * A two-way cursor over a list. It sits between two elements; `next()` and `previous()` both count
 * as moves that make `set` and `remove` possible, and `insert` or `remove` end that until the next
 * move. Changes made through this cursor keep it valid; any other structural change makes its next
 * `next`, `previous`, `set`, `insert` or `remove` throw `ConcurrentModificationError`. `hasNext`,
 * `hasPrevious`, `nextIndex` and `previousIndex` never throw.
 *
 * @internal
 */
export class IndexListCursor<E> implements ListCursor<E> {
  /** The index of the element `next()` returns. */
  private position: number
  /** The index of the element the last move returned, or `-1` when `set`/`remove` are not allowed. */
  private last = -1
  private moved = false
  private expected: number
  private readonly list: IndexedList<E>
  private readonly changes: ChangeCounter
  private readonly where: string

  constructor(list: IndexedList<E>, changes: ChangeCounter, position: number, where: string) {
    this.list = list
    this.changes = changes
    this.position = position
    this.where = where
    this.expected = changes.structure
  }

  hasNext(): boolean {
    return this.position < this.size()
  }

  hasPrevious(): boolean {
    return this.position > 0
  }

  nextIndex(): number {
    return this.position
  }

  previousIndex(): number {
    return this.position - 1
  }

  next(): E {
    this.check()
    if (this.position >= this.list.size)
      throw new NoSuchElementError(`${this.where}: no more elements`)
    const element = this.list.getAt(this.position)
    this.last = this.position++
    this.moved = true
    return element
  }

  previous(): E {
    this.check()
    if (this.position <= 0) throw new NoSuchElementError(`${this.where}: no previous element`)
    const element = this.list.getAt(--this.position)
    this.last = this.position
    this.moved = true
    return element
  }

  set(element: E): void {
    this.check()
    if (this.last < 0) throw this.misuse('set')
    this.list.setAt(this.last, element)
  }

  insert(element: E): void {
    this.check()
    this.list.insertAt(this.position++, element)
    this.last = -1
    this.expected = this.changes.structure
  }

  remove(): void {
    this.check()
    if (this.last < 0) throw this.misuse('remove')
    this.list.removeAtIndex(this.last)
    this.position = this.last
    this.last = -1
    this.expected = this.changes.structure
  }

  /** The list's size, or `0` when reading it throws (a stale view): `hasNext` never throws. */
  private size(): number {
    try {
      return this.list.size
    } catch {
      return 0
    }
  }

  private check(): void {
    if (this.changes.structure !== this.expected) {
      throw new ConcurrentModificationError(
        `${this.where}: the list was changed other than through this cursor`,
      )
    }
  }

  private misuse(method: string): IllegalStateError {
    return new IllegalStateError(
      this.moved
        ? `${this.where}: ${method}() called after insert() or remove() without next() or previous()`
        : `${this.where}: ${method}() called before next()`,
    )
  }
}
