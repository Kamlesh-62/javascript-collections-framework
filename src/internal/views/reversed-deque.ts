// The reversed view of a deque: its front is the source's back. Every operation maps straight onto
// the source (always the engine, because reversing the view returns the source), so views never
// nest. It shares the source's change counter and never goes stale.

import type { Deque } from '../../interfaces/queue'
import { AbstractDeque, type DequeWalker } from '../skeletons/abstract-deque'

/**
 * A live view of a deque in reverse order.
 *
 * @internal
 */
export class ReversedDeque<E> extends AbstractDeque<E> {
  private readonly source: AbstractDeque<E>

  constructor(source: AbstractDeque<E>) {
    super(source.changeCounter)
    this.source = source
  }

  get [Symbol.toStringTag](): string {
    return 'ReversedDeque'
  }

  get size(): number {
    return this.source.size
  }

  override get storesEmpty(): boolean {
    return this.source.storesEmpty
  }

  peekFront(): E {
    return this.source.peekBack()
  }

  peekBack(): E {
    return this.source.peekFront()
  }

  walker(fromBack: boolean): DequeWalker<E> {
    return this.source.walker(!fromBack)
  }

  insertFront(element: E, where: string): void {
    this.source.insertBack(element, where)
  }

  insertBack(element: E, where: string): void {
    this.source.insertFront(element, where)
  }

  takeFront(): E {
    return this.source.takeBack()
  }

  takeBack(): E {
    return this.source.takeFront()
  }

  compact(flags: readonly boolean[]): void {
    const size = this.source.size
    const mirrored: boolean[] = []
    for (let i = 0; i < size; i++) mirrored.push(flags[size - 1 - i] === true)
    this.source.compact(mirrored)
  }

  clearAll(): void {
    this.source.clearAll()
  }

  override releaseStorage(): void {
    this.source.releaseStorage()
  }

  ensureRoom(count: number, where: string): void {
    this.source.ensureRoom(count, where)
  }

  reversed(): Deque<E> {
    return this.source.owner
  }
}
