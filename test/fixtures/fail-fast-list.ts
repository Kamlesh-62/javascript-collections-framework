// A test-only, array-backed collection built on the skeleton: fail-fast, ordered, duplicates
// allowed. It proves the skeleton's defaults before any real collection exists.

import type { Cursor } from '../../src/interfaces/collection'
import { done, FailFastCursor, FailFastIterator } from '../../src/internal/iteration'
import type { ChangeCounter } from '../../src/internal/revision'
import { AbstractCollection } from '../../src/internal/skeletons/abstract-collection'

class ArrayIterator<E> extends FailFastIterator<E> {
  private index = 0
  private readonly items: E[]
  constructor(items: E[], changes: ChangeCounter, where: string) {
    super(changes, where)
    this.items = items
  }
  protected step(): IteratorResult<E> {
    return this.index < this.items.length
      ? { done: false, value: this.items[this.index++] as E }
      : done()
  }
}

class ArrayCursor<E> extends FailFastCursor<E> {
  private index = 0
  private readonly owner: FailFastList<E>
  constructor(owner: FailFastList<E>, changes: ChangeCounter, where: string) {
    super(changes, where)
    this.owner = owner
  }
  protected hasMore(): boolean {
    return this.index < this.owner.items.length
  }
  protected advance(): E {
    return this.owner.items[this.index++] as E
  }
  protected removeLast(): void {
    this.index--
    this.owner.removeAtIndex(this.index)
  }
}

export class FailFastList<E> extends AbstractCollection<E> {
  protected readonly iterationMode = 'fail-fast' as const
  /** @internal test access */
  readonly items: E[] = []

  constructor(initial: Iterable<E> = []) {
    super()
    for (const element of initial) this.items.push(element)
  }

  get size(): number {
    return this.items.length
  }

  get [Symbol.toStringTag](): string {
    return 'FailFastList'
  }

  add(element: E): this {
    this.items.push(element)
    this.changes.structural()
    return this
  }

  /** Replaces the element at `index` in place (no structural change). */
  set(index: number, element: E): void {
    this.items[index] = element
    this.changes.replaced()
  }

  /** @internal used by the cursor */
  removeAtIndex(index: number): void {
    this.items.splice(index, 1)
    this.changes.structural()
  }

  [Symbol.iterator](): IterableIterator<E> {
    return new ArrayIterator(
      this.items,
      this.changes,
      `${this[Symbol.toStringTag]}[Symbol.iterator]().next`,
    )
  }

  cursor(): Cursor<E> {
    return new ArrayCursor(this, this.changes, `${this[Symbol.toStringTag]}.cursor`)
  }
}
