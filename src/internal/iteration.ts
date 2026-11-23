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

/**
 * The same wrapper as `NativeLiveIterator`, kept as its own class for native `Map` iterators, so
 * that each class's `next` sees one kind of native iterator and stays fast.
 *
 * @internal
 */
export class NativeMapIterator<E> extends IteratorBase implements IterableIterator<E> {
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

/**
 * A live iterator over a native `Set`/`Map` iterator whose items are mapped before they are
 * returned (stored entries to members, members to `[member, member]` pairs). The live semantics
 * are the native iterator's.
 *
 * @internal
 */
export class MappedLiveIterator<H, E> extends IteratorBase implements IterableIterator<E> {
  private readonly inner: Iterator<H>
  private readonly map: (item: H) => E

  constructor(inner: Iterator<H>, map: (item: H) => E) {
    super()
    this.inner = inner
    this.map = map
  }

  next(): IteratorResult<E> {
    const result = this.inner.next()
    if (result.done) return done()
    return { done: false, value: this.map(result.value) }
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
 *
 * The native iterator yields handles `H` — the elements themselves by default, or stored entries
 * that `project` turns into elements. `remove()` passes the handle of the last returned element to
 * `removeHandle`, which must never fail when that element is already gone. It must remove from the
 * underlying storage directly: the skeleton's default `delete` opens a cursor, so passing it here
 * would recurse without end.
 *
 * @internal
 */
export class LiveCursor<E, H = E> implements Cursor<E> {
  private slot: IteratorResult<H> | undefined
  private finished = false
  private last: { readonly handle: H } | undefined
  private started = false
  private readonly inner: Iterator<H>
  private readonly removeHandle: (handle: H) => unknown
  private readonly where: string
  private readonly project: ((handle: H) => E) | undefined

  constructor(
    inner: Iterator<H>,
    removeHandle: (handle: H) => unknown,
    where: string,
    project?: (handle: H) => E,
  ) {
    this.inner = inner
    this.removeHandle = removeHandle
    this.where = where
    this.project = project
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
    const handle = (this.slot as IteratorResult<H>).value as H
    this.slot = undefined
    this.last = { handle }
    this.started = true
    return this.project === undefined ? (handle as unknown as E) : this.project(handle)
  }

  remove(): void {
    if (this.last === undefined) throw cursorMisuse(this.where, this.started)
    const { handle } = this.last
    this.last = undefined
    this.removeHandle(handle)
  }
}
