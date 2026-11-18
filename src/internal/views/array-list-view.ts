// The list `asList` returns: every list operation over the caller's own array. Changes made through
// the list write to the array; changes made to the array directly show through, and a direct change
// of its length counts as a structural change the next time the list looks, so open iterators,
// cursors and sub-lists fail fast. Elements move with index loops, never the array's own methods.

import { ConcurrentModificationError } from '../../errors/errors'
import type { List } from '../../interfaces/list'
import { type HashFunction, hashCodeSymbol } from '../equality'
import { isExtensible, isFrozen } from '../intrinsics'
import type { ChangeCounter } from '../revision'
import { AbstractList } from '../skeletons/abstract-list'
import { reversedOf, subListOf, type ViewLabels } from './list-views'

const TAG = 'ArrayListView'
const LABELS: ViewLabels = { subList: TAG, reversed: TAG }

/**
 * A change counter that also watches an array's length: reading `revision` or `structure` first
 * compares the length with the last one seen and records a structural change when it differs.
 * Every fail-fast check reads `structure`, so all of them notice a direct `push` or `splice`.
 *
 * @internal
 */
export class ArrayLengthCounter {
  private readonly array: readonly unknown[]
  private seenLength: number
  private revisions = 0
  private structures = 0

  constructor(array: readonly unknown[]) {
    this.array = array
    this.seenLength = array.length
  }

  /** Records a direct change of the array's length, if there was one. */
  private sync(): void {
    const length = this.array.length
    if (length !== this.seenLength) {
      this.seenLength = length
      this.revisions++
      this.structures++
    }
  }

  get revision(): number {
    this.sync()
    return this.revisions
  }

  get structure(): number {
    this.sync()
    return this.structures
  }

  /** Records a change through the list that replaced an element. */
  replaced(): void {
    this.revisions++
  }

  /** Records a change through the list that added or removed elements. */
  structural(): void {
    this.seenLength = this.array.length
    this.revisions++
    this.structures++
  }
}

/**
 * A list whose elements are the caller's array.
 *
 * @internal
 */
export class ArrayListView<E> extends AbstractList<E> {
  private readonly items: E[]

  constructor(items: E[]) {
    super(new ArrayLengthCounter(items) as unknown as ChangeCounter)
    this.items = items
  }

  get [Symbol.toStringTag](): string {
    return TAG
  }

  get size(): number {
    return this.items.length
  }

  /** Set while a bulk write (`sort`, `replaceAll`) runs after one check, so each step skips it. */
  private checked = false

  /**
   * Throws before a write when the array cannot take it. An extensible array is neither sealed nor
   * frozen, so the common case is one O(1) test; the full check runs only for a non-extensible one.
   */
  private writable(method: string, resizes: boolean): void {
    const items = this.items
    if (isExtensible(items) || (this.checked && !resizes)) return
    if (resizes) throw new TypeError(`${TAG}.${method}: the array cannot change its length`)
    if (isFrozen(items)) throw new TypeError(`${TAG}.${method}: the array is frozen`)
  }

  /** Runs a bulk write after one check of the array. */
  private bulk<R>(method: string, body: () => R): R {
    this.writable(method, false)
    this.checked = true
    try {
      return body()
    } finally {
      this.checked = false
    }
  }

  getAt(index: number): E {
    return this.items[index] as E
  }

  setAt(index: number, element: E): void {
    this.writable('set', false)
    this.items[index] = element
    this.changes.replaced()
  }

  override add(element: E): this {
    this.writable('add', true)
    const items = this.items
    items[items.length] = element
    this.changes.structural()
    return this
  }

  insertAt(index: number, element: E): void {
    this.writable('insert', true)
    const items = this.items
    for (let j = items.length; j > index; j--) items[j] = items[j - 1] as E
    items[index] = element
    this.changes.structural()
  }

  insertItems(index: number, elements: readonly E[]): void {
    this.writable('insertAll', true)
    const items = this.items
    const count = elements.length
    const oldLength = items.length
    for (let j = oldLength - 1; j >= index; j--) items[j + count] = items[j] as E
    for (let k = 0; k < count; k++) items[index + k] = elements[k] as E
    this.changes.structural()
  }

  removeAtIndex(index: number): E {
    this.writable('removeAt', true)
    const items = this.items
    const element = items[index] as E
    const last = items.length - 1
    for (let j = index; j < last; j++) items[j] = items[j + 1] as E
    items.length = last
    this.changes.structural()
    return element
  }

  removeRange(from: number, to: number): void {
    this.writable('clear', true)
    const items = this.items
    const count = to - from
    const length = items.length
    for (let j = to; j < length; j++) items[j - count] = items[j] as E
    items.length = length - count
    this.changes.structural()
  }

  protected override removeMarked(flags: readonly boolean[]): void {
    this.writable('removeIf', true)
    const items = this.items
    let kept = 0
    const length = items.length
    for (let i = 0; i < length; i++) {
      if (flags[i] !== true) items[kept++] = items[i] as E
    }
    items.length = kept
    this.changes.structural()
  }

  override sort(comparator?: Parameters<AbstractList<E>['sort']>[0]): this {
    return this.bulk('sort', () => super.sort(comparator))
  }

  override replaceAll(op: Parameters<AbstractList<E>['replaceAll']>[0]): void {
    this.bulk('replaceAll', () => super.replaceAll(op))
  }

  /** Runs `body`, then throws if element code changed the array's length meanwhile. */
  private unchanged<R>(method: string, body: () => R): R {
    const expected = this.changes.structure
    const result = body()
    if (this.changes.structure !== expected) {
      throw new ConcurrentModificationError(`${TAG}.${method}: the array was changed meanwhile`)
    }
    return result
  }

  override equals(other: unknown): boolean {
    return this.unchanged('equals', () => super.equals(other))
  }

  override [hashCodeSymbol](hash: HashFunction): number {
    return this.unchanged('[hashCodeSymbol]', () => super[hashCodeSymbol](hash))
  }

  subList(from: number, to: number): List<E> {
    this.checkSubList(from, to)
    return subListOf(this, from, to, LABELS)
  }

  reversed(): List<E> {
    return reversedOf(this, LABELS)
  }
}
