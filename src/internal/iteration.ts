// Iterator and cursor bases shared by every collection.

import {
  ConcurrentModificationError,
  IllegalStateError,
  NoSuchElementError,
} from '../errors/errors'
import type { Cursor } from '../interfaces/collection'
import type { ChangeCounter } from './revision'

/** A constructor whose instances inherit from %IteratorPrototype%. @internal */
type IteratorBaseConstructor = abstract new () => object

/**
 * The base of every iterator the library returns: its prototype inherits from
 * `%IteratorPrototype%`, so iterators are iterable (`[Symbol.iterator]()` returns themselves) and,
 * where the runtime has them, gain the ES2025 helpers (`map`, `filter`, `take`, `toArray`, …) —
 * without generators and without needing the ES2025 `Iterator` global.
 *
 * @internal
 */
export const IteratorBase: IteratorBaseConstructor = /*#__PURE__*/ (() => {
  const iteratorPrototype: object = Object.getPrototypeOf(
    Object.getPrototypeOf([][Symbol.iterator]()),
  )
  function Base(this: object) {}
  Base.prototype = Object.create(iteratorPrototype)
  return Base as unknown as IteratorBaseConstructor
})()

/** The finished result every iterator returns once it is done. @internal */
export function done<T>(): IteratorResult<T> {
  return { done: true, value: undefined }
}

/**
 * Base of a fail-fast iterator: once created, a structural change to the collection made other
 * than through this iterator makes the next `next()` throw `ConcurrentModificationError`. An
 * iterator that has returned `done` stays done and never throws. Subclasses supply `step()`.
 *
 * @internal
 */
export abstract class FailFastIterator<E> extends IteratorBase implements IterableIterator<E> {
  private finished = false
  private readonly expected: number
  private readonly changes: ChangeCounter
  private readonly where: string

  constructor(changes: ChangeCounter, where: string) {
    super()
    this.changes = changes
    this.where = where
    this.expected = changes.structure
  }

  next(): IteratorResult<E> {
    if (this.finished) return done()
    if (this.changes.structure !== this.expected) {
      throw new ConcurrentModificationError(
        `${this.where}: the collection was changed during iteration`,
      )
    }
    const result = this.step()
    if (result.done) this.finished = true
    return result
  }

  [Symbol.iterator](): this {
    return this
  }

  /** Returns the next element, or `done` at the end. */
  protected abstract step(): IteratorResult<E>
}

/**
 * A live iterator over a native `Set`/`Map` iterator, which already has the live semantics:
 * deleted elements not yet reached are skipped, added ones are visited, and once done it stays
 * done. This class only gives it the library's prototype chain.
 *
 * @internal
 */
export class NativeLiveIterator<E> extends IteratorBase implements IterableIterator<E> {
  private readonly inner: Iterator<E>

  constructor(inner: Iterator<E>) {
    super()
    this.inner = inner
  }

  next(): IteratorResult<E> {
    return this.inner.next()
  }

  [Symbol.iterator](): this {
    return this
  }
}

function cursorMisuse(where: string, started: boolean): IllegalStateError {
  return new IllegalStateError(
    started
      ? `${where}: remove() called twice without next()`
      : `${where}: remove() called before next()`,
  )
}

/**
 * Base of a fail-fast cursor. Changes made through this cursor keep it valid; any other
 * structural change makes its next `next()` or `remove()` throw `ConcurrentModificationError`.
 * `hasNext()` never throws. Subclasses supply `hasMore`, `advance` and `removeLast`.
 *
 * @internal
 */
export abstract class FailFastCursor<E> implements Cursor<E> {
  private expected: number
  private canRemove = false
  private started = false
  private readonly changes: ChangeCounter
  private readonly where: string

  constructor(changes: ChangeCounter, where: string) {
    this.changes = changes
    this.where = where
    this.expected = changes.structure
  }

  hasNext(): boolean {
    return this.hasMore()
  }

  next(): E {
    this.check()
    if (!this.hasMore()) throw new NoSuchElementError(`${this.where}: no more elements`)
    const element = this.advance()
    this.canRemove = true
    this.started = true
    return element
  }

  remove(): void {
    this.check()
    if (!this.canRemove) throw cursorMisuse(this.where, this.started)
    this.removeLast()
    this.canRemove = false
    this.expected = this.changes.structure
  }

  private check(): void {
    if (this.changes.structure !== this.expected) {
      throw new ConcurrentModificationError(
        `${this.where}: the collection was changed other than through this cursor`,
      )
    }
  }

  /** Returns whether an element remains after the cursor. */
  protected abstract hasMore(): boolean
  /** Moves past the next element and returns it. */
  protected abstract advance(): E
  /** Removes the element `advance()` last returned. */
  protected abstract removeLast(): void
}

/**
 * A cursor over a live collection, driven by a native iterator. `hasNext()` fetches one element
 * ahead and that element counts as reached, so the following `next()` returns it even if it was
 * deleted meanwhile; once the native iterator is done the cursor is finished for good.
 * `remove()` deletes the last returned element by value and never fails if it is already gone.
 * `deleteElement` must delete from the underlying storage directly: the skeleton's default
 * `delete` opens a cursor, so passing it here would recurse without end.
 *
 * @internal
 */
export class LiveCursor<E> implements Cursor<E> {
  private slot: IteratorResult<E> | undefined
  private finished = false
  private last: { readonly value: E } | undefined
  private started = false
  private readonly inner: Iterator<E>
  private readonly deleteElement: (element: E) => unknown
  private readonly where: string

  constructor(inner: Iterator<E>, deleteElement: (element: E) => unknown, where: string) {
    this.inner = inner
    this.deleteElement = deleteElement
    this.where = where
  }

  hasNext(): boolean {
    if (this.finished) return false
    if (this.slot === undefined) {
      const result = this.inner.next()
      if (result.done) {
        this.finished = true
        return false
      }
      this.slot = result
    }
    return true
  }

  next(): E {
    if (!this.hasNext()) throw new NoSuchElementError(`${this.where}: no more elements`)
    const value = (this.slot as IteratorResult<E>).value as E
    this.slot = undefined
    this.last = { value }
    this.started = true
    return value
  }

  remove(): void {
    if (this.last === undefined) throw cursorMisuse(this.where, this.started)
    const { value } = this.last
    this.last = undefined
    this.deleteElement(value)
  }
}
