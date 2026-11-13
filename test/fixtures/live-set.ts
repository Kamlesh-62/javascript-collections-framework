// A test-only collection backed by a native Set, built on the skeleton: live iteration, no
// duplicates, printed with braces. It proves the live iteration base and cursor.

import type { Cursor } from '../../src/interfaces/collection'
import { LiveCursor, NativeLiveIterator } from '../../src/internal/iteration'
import { AbstractCollection } from '../../src/internal/skeletons/abstract-collection'

export class LiveSet<E> extends AbstractCollection<E> {
  protected readonly iterationMode = 'live' as const
  private readonly store = new Set<E>()

  constructor(initial: Iterable<E> = []) {
    super()
    for (const element of initial) this.store.add(element)
  }

  get size(): number {
    return this.store.size
  }

  get [Symbol.toStringTag](): string {
    return 'LiveSet'
  }

  protected override brackets(): readonly [string, string] {
    return ['{', '}']
  }

  override has(element: E): boolean {
    return this.store.has(element)
  }

  add(element: E): this {
    if (!this.store.has(element)) {
      this.store.add(element)
      this.changes.structural()
    }
    return this
  }

  override delete(element: E): boolean {
    const removed = this.store.delete(element)
    if (removed) this.changes.structural()
    return removed
  }

  override clear(): void {
    if (this.store.size === 0) return
    this.store.clear()
    this.changes.structural()
  }

  [Symbol.iterator](): IterableIterator<E> {
    return new NativeLiveIterator(this.store.values())
  }

  cursor(): Cursor<E> {
    return new LiveCursor(
      this.store.values(),
      (element) => this.delete(element),
      `${this[Symbol.toStringTag]}.cursor`,
    )
  }
}
