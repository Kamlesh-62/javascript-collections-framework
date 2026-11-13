// The skeleton every list extends: every `List` operation written once over six index operations,
// which the array engine implements on its array and the views implement by mapping indexes onto
// the list they show.

import { ConcurrentModificationError, NoSuchElementError } from '../../errors/errors'
import type { Comparator } from '../../functions/comparators'
import type { List, ListCursor } from '../../interfaces/list'
import { isBranded, LIST_BRAND, SEQUENCED_COLLECTION_BRAND } from '../brand'
import { checkIndex, checkPosition, checkRange } from '../checks'
import { guardedCompare } from '../compare'
import { createGuard } from '../cycle'
import { equalsAt, type HashFunction, hashCodeSymbol, sameValueZero } from '../equality'
import { apply, imul } from '../intrinsics'
import { type IndexedList, IndexIterator, IndexListCursor } from '../list-iteration'
import { compareNatural } from '../natural-order'
import type { ChangeCounter } from '../revision'
import { stableSort } from '../sort'
import { AbstractCollection } from './abstract-collection'

// One guard per operation, so an element's own code can compare or hash a list mid-operation.
const equalsGuard = /*#__PURE__*/ createGuard()
const hashGuard = /*#__PURE__*/ createGuard()

/**
 * Base class of every list and list view.
 *
 * Subclasses implement `size`, `[Symbol.toStringTag]` and the six index operations (`getAt`,
 * `setAt`, `insertAt`, `insertItems`, `removeAtIndex`, `removeRange`), each recording its change
 * in the shared counter. Indexes reaching them are already checked.
 *
 * @internal
 */
export abstract class AbstractList<E>
  extends AbstractCollection<E>
  implements List<E>, IndexedList<E>
{
  protected readonly iterationMode = 'fail-fast' as const

  abstract getAt(index: number): E
  abstract setAt(index: number, element: E): void
  abstract insertAt(index: number, element: E): void
  abstract insertItems(index: number, elements: readonly E[]): void
  abstract removeAtIndex(index: number): E
  abstract removeRange(from: number, to: number): void

  /**
   * Records a structural change that moved elements without adding or removing any (a sort).
   * Views pass it to the list they show and refresh their own state.
   */
  markStructural(): void {
    this.changes.structural()
  }

  /** Throws when the list can no longer be used (a stale view). Lists that never go stale pass. */
  assertUsable(): void {}

  /** The list handed to callbacks as `list` and returned by `reversed().reversed()`: the public object the caller holds. */
  get owner(): List<E> {
    return this
  }

  /** The change counter, shared with the views of this list. */
  get changeCounter(): ChangeCounter {
    return this.changes
  }

  /** Marks every list for `isSequencedCollection`, across loaded copies. */
  get [SEQUENCED_COLLECTION_BRAND](): true {
    return true
  }

  /** Marks every list for `isList`, across loaded copies. */
  get [LIST_BRAND](): true {
    return true
  }

  // ── Reading ──

  get(index: number): E {
    return this.getAt(checkIndex(index, this.size, `${this.className}.get`))
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

  indexOf(element: E): number {
    const size = this.size
    for (let i = 0; i < size; i++) if (sameValueZero(this.getAt(i), element)) return i
    return -1
  }

  lastIndexOf(element: E): number {
    for (let i = this.size - 1; i >= 0; i--) if (sameValueZero(this.getAt(i), element)) return i
    return -1
  }

  override has(element: E): boolean {
    return this.indexOf(element) >= 0
  }

  override toArray(): E[] {
    const size = this.size
    const out: E[] = []
    for (let i = 0; i < size; i++) out.push(this.getAt(i))
    return out
  }

  // ── Changing ──

  add(element: E): this {
    this.insertAt(this.size, element)
    return this
  }

  addFirst(element: E): this {
    this.insertAt(0, element)
    return this
  }

  addLast(element: E): this {
    this.insertAt(this.size, element)
    return this
  }

  insert(index: number, element: E): this {
    this.insertAt(checkPosition(index, this.size, `${this.className}.insert`), element)
    return this
  }

  insertAll(index: number, elements: Iterable<E>): boolean {
    this.assertUsable()
    const where = 'insertAll'
    const position = checkPosition(index, this.size, `${this.className}.${where}`)
    const before = this.changes.structure
    const items = this.readAll(elements, where)
    if (this.changes.structure !== before) {
      throw new ConcurrentModificationError(
        `${this.className}.${where}: the list was changed while elements were read`,
      )
    }
    if (items.length === 0) return false
    this.insertItems(position, items)
    return true
  }

  override addAll(elements: Iterable<E>): boolean {
    this.assertUsable()
    const items = this.readAll(elements, 'addAll')
    if (items.length === 0) return false
    this.insertItems(this.size, items)
    return true
  }

  set(index: number, element: E): E {
    const i = checkIndex(index, this.size, `${this.className}.set`)
    const old = this.getAt(i)
    this.setAt(i, element)
    return old
  }

  removeAt(index: number): E {
    return this.removeAtIndex(checkIndex(index, this.size, `${this.className}.removeAt`))
  }

  removeFirst(): E {
    if (this.size === 0) throw this.empty('removeFirst')
    return this.removeAtIndex(0)
  }

  removeLast(): E {
    const size = this.size
    if (size === 0) throw this.empty('removeLast')
    return this.removeAtIndex(size - 1)
  }

  override delete(element: E): boolean {
    const index = this.indexOf(element)
    if (index < 0) return false
    this.removeAtIndex(index)
    return true
  }

  override clear(): void {
    const size = this.size
    if (size > 0) this.removeRange(0, size)
  }

  override removeAll(elements: Iterable<E>): boolean {
    this.assertUsable()
    return super.removeAll(elements)
  }

  override retainAll(elements: Iterable<E>): boolean {
    this.assertUsable()
    return super.retainAll(elements)
  }

  override removeIf(predicate: (element: E, index: number, list: List<E>) => unknown): boolean {
    this.assertUsable()
    this.requireFunction(predicate, 'removeIf', 'predicate')
    const list = this.owner
    return this.removeDecided('removeIf', (element, index) =>
      Boolean(apply(predicate, undefined, [element, index, list])),
    )
  }

  /** Keeps the unmarked elements in order, through two index operations (one pass each). */
  protected override removeMarked(flags: readonly boolean[]): void {
    const size = this.size
    const kept: E[] = []
    for (let i = 0; i < size; i++) if (flags[i] !== true) kept.push(this.getAt(i))
    this.removeRange(0, size)
    if (kept.length > 0) this.insertItems(0, kept)
  }

  replaceAll(op: (element: E, index: number, list: List<E>) => E): void {
    this.assertUsable()
    this.requireFunction(op, 'replaceAll', 'op')
    const list = this.owner
    const expected = this.changes.structure
    for (let i = 0; i < this.size; i++) {
      const value = apply(op, undefined, [this.getAt(i), i, list]) as E
      if (this.changes.structure !== expected) {
        throw new ConcurrentModificationError(
          `${this.className}.replaceAll: the list was changed by op`,
        )
      }
      this.setAt(i, value)
    }
  }

  sort(comparator?: Comparator<E>): this {
    this.assertUsable()
    const where = `${this.className}.sort`
    if (comparator !== undefined) this.requireFunction(comparator, 'sort', 'comparator')
    const items = this.toArray()
    if (items.length >= 2) {
      const expected = this.changes.structure
      const compare =
        comparator === undefined
          ? (a: E, b: E) => compareNatural(a, b, where)
          : (a: E, b: E) => guardedCompare(comparator, a, b, where)
      const sorted = stableSort(items, compare, () => {
        if (this.changes.structure !== expected) {
          throw new ConcurrentModificationError(`${where}: the list was changed by the comparator`)
        }
      })
      for (let i = 0; i < sorted.length; i++) this.setAt(i, sorted[i] as E)
    }
    this.markStructural()
    return this
  }

  // ── Iteration ──

  override forEach(
    action: (element: E, index: number, list: List<E>) => void,
    thisArg?: unknown,
  ): void {
    this.assertUsable()
    this.requireFunction(action, 'forEach', 'action')
    const list = this.owner
    const expected = this.changes.structure
    for (let i = 0; i < this.size; i++) {
      apply(action, thisArg, [this.getAt(i), i, list])
      if (this.changes.structure !== expected) {
        throw new ConcurrentModificationError(
          `${this.className}.forEach: the collection was changed by the callback`,
        )
      }
    }
  }

  [Symbol.iterator](): IterableIterator<E> {
    this.assertUsable()
    return new IndexIterator(this, this.changes, `${this.className}[Symbol.iterator]().next`)
  }

  cursor(): ListCursor<E> {
    this.assertUsable()
    return new IndexListCursor(this, this.changes, 0, `${this.className}.cursor`)
  }

  listCursor(index?: number): ListCursor<E> {
    const where = `${this.className}.listCursor`
    const position = index === undefined ? 0 : checkPosition(index, this.size, where)
    this.assertUsable()
    return new IndexListCursor(this, this.changes, position, where)
  }

  // ── Views ──

  abstract subList(from: number, to: number): List<E>
  abstract reversed(): List<E>

  /** Checks a `subList` range against this list; views are built by the subclass. */
  protected checkSubList(from: number, to: number): void {
    checkRange(from, to, this.size, `${this.className}.subList`)
  }

  // ── Equality and hashing ──

  override equals(other: unknown): boolean {
    this.assertUsable()
    if (other === this || other === this.owner) return true
    if (!isBranded(other, LIST_BRAND)) return false
    const size = this.size
    const that = other as List<unknown>
    if (that.size !== size) return false
    return equalsGuard(
      this,
      () => false,
      () => {
        let i = 0
        for (const element of that) {
          if (i >= size || !equalsAt(this.getAt(i), element, `${this.className}.equals`)) {
            return false
          }
          i++
        }
        return i === size
      },
    )
  }

  override [hashCodeSymbol](hash: HashFunction): number {
    return hashGuard(
      this,
      () => 0,
      () => {
        let h = 1
        const size = this.size
        for (let i = 0; i < size; i++) h = (imul(31, h) + hash(this.getAt(i))) | 0
        return h
      },
    )
  }

  private empty(method: string): NoSuchElementError {
    return new NoSuchElementError(`${this.className}.${method}: the list is empty`)
  }
}
