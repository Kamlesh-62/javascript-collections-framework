// The skeleton every deque extends: every `Queue`, `Deque` and `SequencedCollection` operation
// written once over a few index and end operations, which the ring-buffer engine implements on its
// buffer and the reversed view implements by swapping the ends of its source.

import { NoSuchElementError } from '../../errors/errors'
import type { Cursor } from '../../interfaces/collection'
import type { Deque } from '../../interfaces/queue'
import { DEQUE_BRAND, QUEUE_BRAND, SEQUENCED_COLLECTION_BRAND } from '../brand'
import { requireElement } from '../checks'
import { sameValueZero } from '../equality'
import { done, FailFastCursor, FailFastIterator } from '../iteration'
import type { ChangeCounter } from '../revision'
import { AbstractCollection } from './abstract-collection'

/** A fail-fast iterator over a deque, from its first element to its last. */
class DequeIterator<E> extends FailFastIterator<E> {
  private index = 0
  private readonly deque: AbstractDeque<E>

  constructor(deque: AbstractDeque<E>, changes: ChangeCounter, where: string) {
    super(changes, where)
    this.deque = deque
  }

  protected step(): IteratorResult<E> {
    return this.index < this.deque.size
      ? { done: false, value: this.deque.getAt(this.index++) }
      : done()
  }
}

/** A fail-fast cursor over a deque; `remove` removes the element `next` returned. */
class DequeCursor<E> extends FailFastCursor<E> {
  private index = 0
  private readonly deque: AbstractDeque<E>

  constructor(deque: AbstractDeque<E>, changes: ChangeCounter, where: string) {
    super(changes, where)
    this.deque = deque
  }

  protected hasMore(): boolean {
    return this.index < this.deque.size
  }

  protected advance(): E {
    return this.deque.getAt(this.index++)
  }

  protected removeLast(): void {
    this.deque.removeAtIndex(--this.index)
  }
}

/**
 * Base class of every deque and deque view.
 *
 * Subclasses implement `size`, `[Symbol.toStringTag]`, `reversed()` and the operations below;
 * changing operations record their change in the shared counter. Indexes reaching them are in
 * range, and elements are already checked.
 *
 * @internal
 */
export abstract class AbstractDeque<E> extends AbstractCollection<E> implements Deque<E> {
  protected readonly iterationMode = 'fail-fast' as const

  /** Returns the element `index` places from the front. */
  abstract getAt(index: number): E
  /** Adds `element` at the front; throws before any change when the deque is full. */
  abstract insertFront(element: E, where: string): void
  /** Adds `element` at the back; throws before any change when the deque is full. */
  abstract insertBack(element: E, where: string): void
  /** Removes and returns the front element of a non-empty deque. */
  abstract takeFront(): E
  /** Removes and returns the back element of a non-empty deque. */
  abstract takeBack(): E
  /** Removes and returns the element `index` places from the front. */
  abstract removeAtIndex(index: number): E
  /** Keeps the elements whose flag is not `true`, in order, in one pass. */
  abstract compact(flags: readonly boolean[]): void
  /** Removes every element of a non-empty deque. */
  abstract clearAll(): void
  /** Throws `IllegalStateError` when `count` more elements would not fit; changes nothing. */
  abstract ensureRoom(count: number, where: string): void
  abstract reversed(): Deque<E>

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
    for (let i = 0; i < items.length; i++) requireElement(items[i], where)
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
    if (element === null || element === undefined) return false
    const size = this.size
    for (let i = 0; i < size; i++) {
      if (sameValueZero(this.getAt(i), element)) {
        this.removeAtIndex(i)
        return true
      }
    }
    return false
  }

  override clear(): void {
    if (this.size > 0) this.clearAll()
  }

  protected override removeMarked(flags: readonly boolean[]): void {
    this.compact(flags)
  }

  // ── Reading ──

  peek(): E | undefined {
    return this.size === 0 ? undefined : this.getAt(0)
  }

  peekLast(): E | undefined {
    const size = this.size
    return size === 0 ? undefined : this.getAt(size - 1)
  }

  getFirst(): E {
    if (this.size === 0) throw this.empty('getFirst')
    return this.getAt(0)
  }

  getLast(): E {
    const size = this.size
    if (size === 0) throw this.empty('getLast')
    return this.getAt(size - 1)
  }

  override has(element: E): boolean {
    if (element === null || element === undefined) return false
    const size = this.size
    for (let i = 0; i < size; i++) if (sameValueZero(this.getAt(i), element)) return true
    return false
  }

  override toArray(): E[] {
    const size = this.size
    const out: E[] = []
    for (let i = 0; i < size; i++) out.push(this.getAt(i))
    return out
  }

  // ── Iteration and equality ──

  [Symbol.iterator](): IterableIterator<E> {
    return new DequeIterator(this, this.changes, `${this.className}[Symbol.iterator]().next`)
  }

  cursor(): Cursor<E> {
    return new DequeCursor(this, this.changes, `${this.className}.cursor`)
  }

  override equals(other: unknown): boolean {
    return other === this || other === this.owner
  }

  private insertChecked(element: E, method: string, front: boolean): void {
    const where = `${this.className}.${method}`
    requireElement(element, where)
    if (front) this.insertFront(element, where)
    else this.insertBack(element, where)
  }

  private empty(method: string): NoSuchElementError {
    return new NoSuchElementError(`${this.className}.${method}: the deque is empty`)
  }
}
