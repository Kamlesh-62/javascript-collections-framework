// The engine behind `ArrayList`: the list operations over a native array. The public class holds
// one engine and delegates to it, so nothing here reaches the published types.

import type { List } from '../../interfaces/list'
import { checkIndex } from '../checks'
import { AbstractList } from '../skeletons/abstract-list'
import { reversedOf, subListOf } from '../views/list-views'

/**
 * A list stored in a native array. Elements move with plain index loops (no `splice` or spread),
 * so the array never gets holes and no argument-count limit applies.
 *
 * @internal
 */
export class ArrayListEngine<E> extends AbstractList<E> {
  /** The elements, in order. Never handed out; replaced only while the list is being built. */
  items: E[] = []
  private readonly facade: List<E>

  constructor(facade: List<E>) {
    super()
    this.facade = facade
  }

  override get owner(): List<E> {
    return this.facade
  }

  get [Symbol.toStringTag](): string {
    return 'ArrayList'
  }

  get size(): number {
    return this.items.length
  }

  override get(index: number): E {
    const items = this.items
    // A valid index is a whole number in 0..length - 1, and an array's length is below 2^32, so
    // `index >>> 0 === index` holds for every valid index; anything else goes to the full check,
    // which throws.
    if (typeof index === 'number' && index >>> 0 === index && index < items.length) {
      return items[index] as E
    }
    return items[checkIndex(index, items.length, this, 'get')] as E
  }

  getAt(index: number): E {
    return this.items[index] as E
  }

  setAt(index: number, element: E): void {
    this.items[index] = element
    this.changes.replaced()
  }

  override add(element: E): this {
    this.items.push(element)
    this.changes.structural()
    return this
  }

  insertAt(index: number, element: E): void {
    const items = this.items
    items.push(element)
    for (let j = items.length - 1; j > index; j--) items[j] = items[j - 1] as E
    items[index] = element
    this.changes.structural()
  }

  insertItems(index: number, elements: readonly E[]): void {
    const items = this.items
    const count = elements.length
    const oldLength = items.length
    // Grow with real elements first, so the array never has holes.
    for (let k = 0; k < count; k++) items.push(elements[k] as E)
    for (let j = oldLength - 1; j >= index; j--) items[j + count] = items[j] as E
    for (let k = 0; k < count; k++) items[index + k] = elements[k] as E
    this.changes.structural()
  }

  removeAtIndex(index: number): E {
    const items = this.items
    const element = items[index] as E
    const last = items.length - 1
    for (let j = index; j < last; j++) items[j] = items[j + 1] as E
    items.length = last
    this.changes.structural()
    return element
  }

  removeRange(from: number, to: number): void {
    const items = this.items
    const count = to - from
    const length = items.length
    for (let j = to; j < length; j++) items[j - count] = items[j] as E
    items.length = length - count
    this.changes.structural()
  }

  protected override removeMarked(flags: readonly boolean[]): void {
    const items = this.items
    let kept = 0
    for (let i = 0; i < items.length; i++) {
      if (flags[i] !== true) items[kept++] = items[i] as E
    }
    items.length = kept
    this.changes.structural()
  }

  subList(from: number, to: number): List<E> {
    this.checkSubList(from, to)
    return subListOf(this, from, to)
  }

  reversed(): List<E> {
    return reversedOf(this)
  }
}
