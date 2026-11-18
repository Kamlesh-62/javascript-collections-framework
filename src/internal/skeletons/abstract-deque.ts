// The skeleton every deque extends: every `Queue`, `Deque` and `SequencedCollection` operation
// written once over a few end operations and a one-direction walker. Nothing here works by
// position, so a linked engine keeps every walk O(n); the reversed view swaps the ends and the
// walking direction of its source.

import { NoSuchElementError } from '../../errors/errors'
import type { Cursor } from '../../interfaces/collection'
import type { Deque } from '../../interfaces/queue'
import { DEQUE_BRAND, QUEUE_BRAND, SEQUENCED_COLLECTION_BRAND } from '../brand'
import { requireElement } from '../checks'
import { sameValueZero } from '../equality'
import { done, FailFastCursor, FailFastIterator } from '../iteration'
import type { ChangeCounter } from '../revision'
import { AbstractCollection } from './abstract-collection'

/**
 * Walks a deque in one direction, one element at a time. `next()` is called only after `hasNext()`
 * returned `true`; `remove()` removes the element `next()` last returned, as a structural change.
 *
 * @internal
 */
export interface DequeWalker<E> {
  hasNext(): boolean
  next(): E
  remove(): void
}

/** A fail-fast iterator over a deque, from its first element to its last. */
class DequeIterator<E> extends FailFastIterator<E> {
  private readonly walker: DequeWalker<E>

  constructor(walker: DequeWalker<E>, changes: ChangeCounter, where: string) {
    super(changes, where)
    this.walker = walker
  }

  protected step(): IteratorResult<E> {
    return this.walker.hasNext() ? { done: false, value: this.walker.next() } : done()
  }
}

/** A fail-fast cursor over a deque; `remove` removes the element `next` returned. */
class DequeCursor<E> extends FailFastCursor<E> {
  private readonly walker: DequeWalker<E>

  constructor(walker: DequeWalker<E>, changes: ChangeCounter, where: string) {
    super(changes, where)
    this.walker = walker
  }

  protected hasMore(): boolean {
    return this.walker.hasNext()
  }

  protected advance(): E {
    return this.walker.next()
  }

  protected removeLast(): void {
    this.walker.remove()
  }
}

/**
 * Base class of every deque and deque view.
 *
 * Subclasses implement `size`, `[Symbol.toStringTag]`, `reversed()` and the operations below;
 * changing operations record their change in the shared counter. Elements reaching them are
 * already checked, and the deque is non-empty where an operation says so.
 *
 * @internal
 */
export abstract class AbstractDeque<E> extends AbstractCollection<E> implements Deque<E> {
  protected readonly iterationMode = 'fail-fast' as const

  /** Returns the front element of a non-empty deque. */
  abstract peekFront(): E
  /** Returns the back element of a non-empty deque. */
  abstract peekBack(): E
  /** A walker from the front to the back, or from the back to the front. */
  abstract walker(fromBack: boolean): DequeWalker<E>
  /** Adds `element` at the front; throws before any change when the deque is full. */
  abstract insertFront(element: E, where: string): void
  /** Adds `element` at the back; throws before any change when the deque is full. */
  abstract insertBack(element: E, where: string): void
  /** Removes and returns the front element of a non-empty deque. */
  abstract takeFront(): E
  /** Removes and returns the back element of a non-empty deque. */
  abstract takeBack(): E
  /** Keeps the elements whose flag is not `true`, in order, in one pass. */
  abstract compact(flags: readonly boolean[]): void
  /** Removes every element of a non-empty deque. */
  abstract clearAll(): void

  /** Returns spare storage of an empty deque to its smallest size; not a structural change. */
  releaseStorage(): void {}
  /** Throws `IllegalStateError` when `count` more elements would not fit; changes nothing. */
  abstract ensureRoom(count: number, where: string): void
  abstract reversed(): Deque<E>

  /** Whether `null` and `undefined` are stored (`true`) or rejected with `NullElementError`. */
  get storesEmpty(): boolean {
    return false
  }

  /** The word error messages use for this deque: `the deque is empty`. */
  protected get noun(): string {
    return 'deque'
  }

  /** The deque the caller holds, used for identity: the public object for the engine. */
  get owner(): Deque<E> {
    return this
  }

  /** The change counter, shared with the reversed view. */
  get changeCounter(): ChangeCounter {
    return this.changes
  }

  /** Marks every sequenced collection for `isSequencedCollection`, across loaded copies. */
  get [SEQUENCED_COLLECTION_BRAND](): true {
    return true
  }

  /** Marks every queue for `isQueue`, across loaded copies. */
  get [QUEUE_BRAND](): true {
    return true
  }

  /** Marks every deque for `isDeque`, across loaded copies. */
  get [DEQUE_BRAND](): true {
    return true
  }

  // ── Adding ──

  add(element: E): this {
    this.insertChecked(element, 'add', false)
    return this
  }

  addLast(element: E): this {
    this.insertChecked(element, 'addLast', false)
    return this
  }

  push(element: E): this {
    this.insertChecked(element, 'push', false)
    return this
  }

  addFirst(element: E): this {
    this.insertChecked(element, 'addFirst', true)
    return this
  }

  override addAll(elements: Iterable<E>): boolean {
    const items = this.readAll(elements, 'addAll')
    this.appendAll(items, `${this.className}.addAll`)
    return items.length > 0
  }

  /** Checks every element and the room for all of them, then adds them at the back in order. */
  appendAll(items: readonly E[], where: string): void {
    if (!this.storesEmpty) for (let i = 0; i < items.length; i++) requireElement(items[i], where)
    if (items.length === 0) return
    this.ensureRoom(items.length, where)
    for (let i = 0; i < items.length; i++) this.insertBack(items[i] as E, where)
  }

  // ── Removing ──

  poll(): E | undefined {
    return this.size === 0 ? undefined : this.takeFront()
  }

  pop(): E | undefined {
    return this.size === 0 ? undefined : this.takeBack()
  }

  removeFirst(): E {
    if (this.size === 0) throw this.empty('removeFirst')
    return this.takeFront()
  }

  removeLast(): E {
    if (this.size === 0) throw this.empty('removeLast')
    return this.takeBack()
  }

  override delete(element: E): boolean {
    if (!this.storesEmpty && (element === null || element === undefined)) return false
    const walker = this.walker(false)
    while (walker.hasNext()) {
      if (sameValueZero(walker.next(), element)) {
        walker.remove()
        return true
      }
    }
    return false
  }

  override clear(): void {
    if (this.size > 0) this.clearAll()
    else this.releaseStorage()
  }

  protected override removeMarked(flags: readonly boolean[]): void {
    this.compact(flags)
  }

  // ── Reading ──

  peek(): E | undefined {
    return this.size === 0 ? undefined : this.peekFront()
  }

  peekLast(): E | undefined {
    return this.size === 0 ? undefined : this.peekBack()
  }

  getFirst(): E {
    if (this.size === 0) throw this.empty('getFirst')
    return this.peekFront()
  }

  getLast(): E {
    if (this.size === 0) throw this.empty('getLast')
    return this.peekBack()
  }

  override has(element: E): boolean {
    if (!this.storesEmpty && (element === null || element === undefined)) return false
    const walker = this.walker(false)
    while (walker.hasNext()) if (sameValueZero(walker.next(), element)) return true
    return false
  }

  override toArray(): E[] {
    const walker = this.walker(false)
    const out: E[] = []
    while (walker.hasNext()) out.push(walker.next())
    return out
  }

  // ── Iteration and equality ──

  [Symbol.iterator](): IterableIterator<E> {
    return new DequeIterator(
      this.walker(false),
      this.changes,
      `${this.className}[Symbol.iterator]().next`,
    )
  }

  cursor(): Cursor<E> {
    return new DequeCursor(this.walker(false), this.changes, `${this.className}.cursor`)
  }

  override equals(other: unknown): boolean {
    return other === this || other === this.owner
  }

  private insertChecked(element: E, method: string, front: boolean): void {
    const where = `${this.className}.${method}`
    if (!this.storesEmpty) requireElement(element, where)
    if (front) this.insertFront(element, where)
    else this.insertBack(element, where)
  }

  private empty(method: string): NoSuchElementError {
    return new NoSuchElementError(`${this.className}.${method}: the ${this.noun} is empty`)
  }
}
