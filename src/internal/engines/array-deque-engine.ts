// The engine behind `ArrayDeque`: a circular array. The public class holds one engine and
// delegates to it, so nothing here reaches the published types.

import { IllegalStateError } from '../../errors/errors'
import type { Deque } from '../../interfaces/queue'
import { AbstractDeque, type DequeWalker } from '../skeletons/abstract-deque'
import { ReversedDeque } from '../views/reversed-deque'

/** The smallest buffer, and the size `clear()` returns to. */
const MIN_CAPACITY = 8

/** The default maximum number of elements. */
const MAX_CAPACITY = 1073741824 // 2^30

/** A new buffer of `capacity` slots, all `undefined` (no holes). */
function newBuffer<E>(capacity: number): Array<E | undefined> {
  const buffer: Array<E | undefined> = []
  for (let i = 0; i < capacity; i++) buffer.push(undefined)
  return buffer
}

/** Walks an `ArrayDequeEngine` by index, front to back or back to front. */
class IndexWalker<E> implements DequeWalker<E> {
  private index: number
  private readonly deque: ArrayDequeEngine<E>
  private readonly fromBack: boolean

  constructor(deque: ArrayDequeEngine<E>, fromBack: boolean) {
    this.deque = deque
    this.fromBack = fromBack
    this.index = fromBack ? deque.size - 1 : 0
  }

  hasNext(): boolean {
    return this.fromBack ? this.index >= 0 : this.index < this.deque.size
  }

  next(): E {
    return this.deque.getAt(this.fromBack ? this.index-- : this.index++)
  }

  remove(): void {
    // Removing never moves the elements still ahead of a backward walk, so its index stays.
    if (this.fromBack) this.deque.removeAtIndex(this.index + 1)
    else this.deque.removeAtIndex(--this.index)
  }
}

/**
 * A deque stored in a circular array whose capacity is a power of two, so positions wrap with a
 * mask. Elements are never shifted by the end operations; a removed element's slot is cleared, so
 * the buffer never keeps it alive.
 *
 * @internal
 */
export class ArrayDequeEngine<E> extends AbstractDeque<E> {
  private buffer: Array<E | undefined>
  private head = 0
  private length = 0
  private readonly maxCapacity: number
  private readonly facade: Deque<E>

  /**
   * @param facade - The public deque, for identity and callbacks.
   * @param maxCapacity - The most elements the deque may hold: a power of two of at least 8.
   */
  constructor(facade: Deque<E>, maxCapacity: number = MAX_CAPACITY) {
    super()
    this.facade = facade
    this.maxCapacity = maxCapacity
    this.buffer = newBuffer(MIN_CAPACITY)
  }

  override get owner(): Deque<E> {
    return this.facade
  }

  get [Symbol.toStringTag](): string {
    return 'ArrayDeque'
  }

  get size(): number {
    return this.length
  }

  /** Returns the element `index` places from the front. */
  getAt(index: number): E {
    return this.buffer[(this.head + index) & (this.buffer.length - 1)] as E
  }

  peekFront(): E {
    return this.getAt(0)
  }

  peekBack(): E {
    return this.getAt(this.length - 1)
  }

  walker(fromBack: boolean): DequeWalker<E> {
    return new IndexWalker(this, fromBack)
  }

  ensureRoom(count: number, where: string): void {
    const needed = this.length + count
    if (needed > this.maxCapacity) {
      throw new IllegalStateError(
        `${where}: the deque cannot hold more than ${this.maxCapacity} elements`,
      )
    }
    let capacity = this.buffer.length
    if (needed <= capacity) return
    while (capacity < needed) capacity *= 2
    // Build the new buffer completely before switching to it.
    const next = newBuffer<E>(capacity)
    for (let i = 0; i < this.length; i++) next[i] = this.getAt(i)
    this.buffer = next
    this.head = 0
  }

  insertBack(element: E, where: string): void {
    this.ensureRoom(1, where)
    this.buffer[(this.head + this.length) & (this.buffer.length - 1)] = element
    this.length++
    this.changes.structural()
  }

  insertFront(element: E, where: string): void {
    this.ensureRoom(1, where)
    this.head = (this.head - 1) & (this.buffer.length - 1)
    this.buffer[this.head] = element
    this.length++
    this.changes.structural()
  }

  takeFront(): E {
    const element = this.buffer[this.head] as E
    this.buffer[this.head] = undefined
    this.head = (this.head + 1) & (this.buffer.length - 1)
    this.length--
    this.changes.structural()
    return element
  }

  takeBack(): E {
    const index = (this.head + this.length - 1) & (this.buffer.length - 1)
    const element = this.buffer[index] as E
    this.buffer[index] = undefined
    this.length--
    this.changes.structural()
    return element
  }

  /** Removes and returns the element `index` places from the front, shifting the shorter side. */
  removeAtIndex(index: number): E {
    const buffer = this.buffer
    const mask = buffer.length - 1
    const head = this.head
    const element = buffer[(head + index) & mask] as E
    if (index < this.length - 1 - index) {
      // Fewer elements before it: shift them back by one.
      for (let j = index; j > 0; j--) buffer[(head + j) & mask] = buffer[(head + j - 1) & mask]
      buffer[head] = undefined
      this.head = (head + 1) & mask
    } else {
      for (let j = index; j < this.length - 1; j++) {
        buffer[(head + j) & mask] = buffer[(head + j + 1) & mask]
      }
      buffer[(head + this.length - 1) & mask] = undefined
    }
    this.length--
    this.changes.structural()
    return element
  }

  compact(flags: readonly boolean[]): void {
    const buffer = this.buffer
    const mask = buffer.length - 1
    let kept = 0
    for (let read = 0; read < this.length; read++) {
      if (flags[read] !== true) {
        buffer[(this.head + kept) & mask] = buffer[(this.head + read) & mask]
        kept++
      }
    }
    for (let i = kept; i < this.length; i++) buffer[(this.head + i) & mask] = undefined
    this.length = kept
    this.changes.structural()
  }

  clearAll(): void {
    this.releaseStorage()
    this.length = 0
    this.changes.structural()
  }

  override releaseStorage(): void {
    this.buffer = newBuffer(MIN_CAPACITY)
    this.head = 0
  }

  reversed(): Deque<E> {
    return new ReversedDeque(this)
  }
}
