// The engine behind `PriorityQueue`: a binary heap in a plain array. The public class holds one
// engine and delegates to it, so nothing here reaches the published types.
//
// Every repair of the heap is planned before it is written: the comparator only ever sees the heap
// as it was before the call, and an error it throws (or a change it makes to the queue) leaves the
// array untouched.

import { ConcurrentModificationError } from '../../errors/errors'
import type { Comparator } from '../../functions/comparators'
import type { Cursor } from '../../interfaces/collection'
import type { Queue } from '../../interfaces/queue'
import { requireElement } from '../checks'
import { guardedCompare } from '../compare'
import { sameValueZero } from '../equality'
import { done, FailFastCursor, FailFastIterator } from '../iteration'
import { compareNatural } from '../natural-order'
import type { ChangeCounter } from '../revision'
import { AbstractCollection } from '../skeletons/abstract-collection'

/** Where the former last element went when an element was removed from inside the heap. */
type Moved = 'none' | 'down' | 'stayed' | 'up'

/** A fail-fast iterator over the heap array in index order. */
class HeapIterator<E> extends FailFastIterator<E> {
  private index = 0
  private readonly heap: BinaryHeapEngine<E>

  constructor(heap: BinaryHeapEngine<E>, changes: ChangeCounter, where: string) {
    super(changes, where)
    this.heap = heap
  }

  protected step(): IteratorResult<E> {
    return this.index < this.heap.size
      ? { done: false, value: this.heap.elementAt(this.index++) }
      : done()
  }
}

/**
 * A fail-fast cursor over the heap array in index order. Removing an element moves the former last
 * element into the hole: if it lands at or below the hole, the hole holds an element not yet
 * visited, so the cursor steps back onto it; if it rises above the hole, into the part already
 * visited, the cursor keeps it in `pending` and returns it after the array is walked.
 */
class HeapCursor<E> extends FailFastCursor<E> {
  private index = 0
  private lastIndex = -1
  private pending: E[] | undefined
  private pendingIndex = 0
  private lastPending: { readonly value: E } | undefined
  private readonly heap: BinaryHeapEngine<E>
  private readonly site: string

  constructor(heap: BinaryHeapEngine<E>, changes: ChangeCounter, where: string) {
    super(changes, where)
    this.heap = heap
    this.site = where
  }

  protected hasMore(): boolean {
    return (
      this.index < this.heap.size ||
      (this.pending !== undefined && this.pendingIndex < this.pending.length)
    )
  }

  protected advance(): E {
    if (this.index < this.heap.size) {
      this.lastIndex = this.index
      this.lastPending = undefined
      return this.heap.elementAt(this.index++)
    }
    const value = (this.pending as E[])[this.pendingIndex++] as E
    this.lastIndex = -1
    this.lastPending = { value }
    return value
  }

  protected removeLast(): void {
    if (this.lastPending !== undefined) {
      // Every element still in the array has been visited, so where the move lands is irrelevant.
      this.heap.removeAt(this.heap.indexOfSame(this.lastPending.value), this.site)
      this.lastPending = undefined
      return
    }
    const index = this.lastIndex
    const last = this.heap.elementAt(this.heap.size - 1)
    const moved = this.heap.removeAt(index, this.site)
    if (moved === 'up') {
      if (this.pending === undefined) this.pending = []
      this.pending.push(last)
    } else {
      this.index = index
    }
    this.lastIndex = -1
  }
}

/**
 * A binary min-heap in an array: the parent of slot `i` is slot `(i - 1) >> 1`, and no element is
 * less than its parent under the queue's order. A removed element's slot is dropped, so the array
 * never keeps it alive.
 *
 * @internal
 */
export class BinaryHeapEngine<E> extends AbstractCollection<E> {
  protected readonly iterationMode = 'fail-fast' as const
  private heap: E[] = []
  private readonly order: Comparator<E> | undefined
  private readonly facade: Queue<E>

  /**
   * @param facade - The public queue, for identity.
   * @param order - The comparator, or `undefined` for natural order.
   */
  constructor(facade: Queue<E>, order: Comparator<E> | undefined) {
    super()
    this.facade = facade
    this.order = order
  }

  get [Symbol.toStringTag](): string {
    return 'PriorityQueue'
  }

  get size(): number {
    return this.heap.length
  }

  /** The comparator given at construction, or `undefined` for natural order. */
  get comparator(): Comparator<E> | undefined {
    return this.order
  }

  /** Returns the element in slot `index`. */
  elementAt(index: number): E {
    return this.heap[index] as E
  }

  /** Returns the slot holding exactly `element` (`Object.is`), or -1. */
  indexOfSame(element: E): number {
    const heap = this.heap
    for (let i = 0; i < heap.length; i++) if (Object.is(heap[i], element)) return i
    return -1
  }

  // ── Comparing and planning ──

  /**
   * Compares `a` and `b` under the queue's order, then checks that the comparator did not add or
   * remove elements: `expected` is the structure count when the outer operation started.
   */
  private compare(a: E, b: E, where: string, expected: number): number {
    const result =
      this.order === undefined
        ? compareNatural(a, b, where)
        : guardedCompare(this.order, a, b, where)
    if (this.changes.structure !== expected) {
      throw new ConcurrentModificationError(`${where}: the queue was changed by the comparator`)
    }
    return result
  }

  /** The slot `x` rises to from the hole at `index`, comparing it with each parent. */
  private planUp(x: E, index: number, where: string, expected: number): number {
    const heap = this.heap
    let i = index
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.compare(x, heap[parent] as E, where, expected) >= 0) break
      i = parent
    }
    return i
  }

  /**
   * The children that move up, in order, when `x` sinks from the hole at `index` in a heap of
   * `length` slots: at each level the smaller child moves up while it is less than `x`.
   */
  private planDown(x: E, index: number, length: number, where: string, expected: number): number[] {
    const heap = this.heap
    const path: number[] = []
    let i = index
    for (;;) {
      let child = 2 * i + 1
      if (child >= length) break
      const right = child + 1
      if (right < length && this.compare(heap[right] as E, heap[child] as E, where, expected) < 0) {
        child = right
      }
      if (this.compare(heap[child] as E, x, where, expected) >= 0) break
      path.push(child)
      i = child
    }
    return path
  }

  /** Moves each parent from `from` up to `to` one level down, then places `x` at `to`. */
  private applyUp(x: E, from: number, to: number): void {
    const heap = this.heap
    let i = from
    while (i > to) {
      const parent = (i - 1) >> 1
      heap[i] = heap[parent] as E
      i = parent
    }
    heap[to] = x
  }

  /** Moves each child on `path` one level up into the hole at `from`, then places `x` at its end. */
  private applyDown(x: E, from: number, path: readonly number[]): void {
    const heap = this.heap
    let hole = from
    for (let k = 0; k < path.length; k++) {
      const child = path[k] as number
      heap[hole] = heap[child] as E
      hole = child
    }
    heap[hole] = x
  }

  /** Orders `items` into a heap in place (bottom-up), checking the structure after each call. */
  private heapify(items: E[], where: string, expected: number): void {
    const length = items.length
    if (length === 1 && this.order === undefined) {
      // Alone, the element is compared with itself so an incomparable value is still refused.
      const only = items[0] as E
      this.compare(only, only, where, expected)
      return
    }
    for (let start = (length >> 1) - 1; start >= 0; start--) {
      const x = items[start] as E
      let i = start
      for (;;) {
        let child = 2 * i + 1
        if (child >= length) break
        const right = child + 1
        if (
          right < length &&
          this.compare(items[right] as E, items[child] as E, where, expected) < 0
        ) {
          child = right
        }
        if (this.compare(items[child] as E, x, where, expected) >= 0) break
        items[i] = items[child] as E
        i = child
      }
      items[i] = x
    }
  }

  // ── Building ──

  /** Replaces the contents of a new, empty queue with `items`, checked and ordered. */
  build(items: E[], where: string): void {
    for (let i = 0; i < items.length; i++) requireElement(items[i], where)
    this.heapify(items, where, this.changes.structure)
    this.heap = items
    if (items.length > 0) this.changes.structural()
  }

  /** Fills a new, empty queue with a copy of `source`'s array, which is already a heap. */
  copyFrom(source: BinaryHeapEngine<E>): void {
    this.heap = source.heap.slice()
    if (this.heap.length > 0) this.changes.structural()
  }

  // ── Adding ──

  add(element: E): this {
    this.insert(element, `${this.className}.add`)
    return this
  }

  override addAll(elements: Iterable<E>): boolean {
    const where = `${this.className}.addAll`
    const items = this.readAll(elements, 'addAll')
    for (let i = 0; i < items.length; i++) requireElement(items[i], where)
    for (let i = 0; i < items.length; i++) this.insert(items[i] as E, where)
    return items.length > 0
  }

  private insert(x: E, where: string): void {
    requireElement(x, where)
    const expected = this.changes.structure
    const length = this.heap.length
    let to = 0
    if (length > 0) to = this.planUp(x, length, where, expected)
    else if (this.order === undefined) this.compare(x, x, where, expected)
    this.heap.push(x)
    this.applyUp(x, length, to)
    this.changes.structural()
  }

  // ── Removing ──

  peek(): E | undefined {
    return this.heap.length === 0 ? undefined : this.heap[0]
  }

  poll(): E | undefined {
    const heap = this.heap
    const length = heap.length
    if (length === 0) return undefined
    const top = heap[0] as E
    if (length === 1) {
      heap.pop()
      this.changes.structural()
      return top
    }
    const x = heap[length - 1] as E
    const path = this.planDown(x, 0, length - 1, `${this.className}.poll`, this.changes.structure)
    heap.pop()
    this.applyDown(x, 0, path)
    this.changes.structural()
    return top
  }

  /**
   * Removes the element in slot `index`, filling the hole with the last element, and reports where
   * that element went relative to the hole.
   */
  removeAt(index: number, where: string): Moved {
    const heap = this.heap
    const last = heap.length - 1
    if (index === last) {
      heap.pop()
      this.changes.structural()
      return 'none'
    }
    const expected = this.changes.structure
    const x = heap[last] as E
    const path = this.planDown(x, index, last, where, expected)
    if (path.length > 0) {
      heap.pop()
      this.applyDown(x, index, path)
      this.changes.structural()
      return 'down'
    }
    const to = this.planUp(x, index, where, expected)
    heap.pop()
    this.applyUp(x, index, to)
    this.changes.structural()
    return to < index ? 'up' : 'stayed'
  }

  override has(element: E): boolean {
    if (element === null || element === undefined) return false
    const heap = this.heap
    for (let i = 0; i < heap.length; i++) if (sameValueZero(heap[i], element)) return true
    return false
  }

  override delete(element: E): boolean {
    if (element === null || element === undefined) return false
    const heap = this.heap
    for (let i = 0; i < heap.length; i++) {
      if (sameValueZero(heap[i], element)) {
        this.removeAt(i, `${this.className}.delete`)
        return true
      }
    }
    return false
  }

  /** Rebuilds the kept elements in a scratch array and switches to it only when that succeeds. */
  protected override removeMarked(flags: readonly boolean[], method: string): void {
    const heap = this.heap
    const kept: E[] = []
    for (let i = 0; i < heap.length; i++) if (flags[i] !== true) kept.push(heap[i] as E)
    const where = `${this.className}.${method}`
    if (kept.length > 1) this.heapify(kept, where, this.changes.structure)
    this.heap = kept
    this.changes.structural()
  }

  override clear(): void {
    if (this.heap.length === 0) return
    this.heap = []
    this.changes.structural()
  }

  // ── Reading ──

  override toArray(): E[] {
    return this.heap.slice()
  }

  [Symbol.iterator](): IterableIterator<E> {
    return new HeapIterator(this, this.changes, `${this.className}[Symbol.iterator]().next`)
  }

  cursor(): Cursor<E> {
    return new HeapCursor(this, this.changes, `${this.className}.cursor`)
  }

  override equals(other: unknown): boolean {
    return other === this || other === this.facade
  }
}
