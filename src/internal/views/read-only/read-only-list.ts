// A read-only list over another list. Indexes and ranges are checked under the read-only list's
// own name, then reads go to the source; sub-lists and reversed views are read-only in turn, and
// every change — on the list, its views and its cursors — is refused before its arguments are
// looked at.

import type { Comparator } from '../../../functions/comparators'
import type { List, ListCursor, ReadonlyList } from '../../../interfaces/list'
import { checkPosition } from '../../checks'
import { AbstractList } from '../../skeletons/abstract-list'
import { ReadOnlyListCursor } from './read-only-cursor'
import { refuse } from './refuse'

/** The tags of a read-only list and of the views it hands out. @internal */
export interface ReadOnlyListTags {
  readonly list: string
  readonly subList: string
  readonly reversed: string
}

/**
 * A read-only view of `source`, printed with `tags.list`.
 *
 * @internal
 */
export class ReadOnlyList<E> extends AbstractList<E> {
  private readonly source: ReadonlyList<E>
  private readonly tags: ReadOnlyListTags

  constructor(source: ReadonlyList<E>, tags: ReadOnlyListTags) {
    super()
    this.source = source
    this.tags = tags
  }

  get [Symbol.toStringTag](): string {
    return this.tags.list
  }

  get size(): number {
    return this.source.size
  }

  override get revision(): number {
    return this.source.revision
  }

  getAt(index: number): E {
    return this.source.get(index)
  }

  override [Symbol.iterator](): IterableIterator<E> {
    return this.source[Symbol.iterator]()
  }

  override indexOf(element: E): number {
    return this.source.indexOf(element)
  }

  override lastIndexOf(element: E): number {
    return this.source.lastIndexOf(element)
  }

  override cursor(): ListCursor<E> {
    return new ReadOnlyListCursor(this, 0, `${this.className}.cursor`)
  }

  override listCursor(index?: number): ListCursor<E> {
    const where = `${this.className}.listCursor`
    const position = index === undefined ? 0 : checkPosition(index, this.size, where)
    return new ReadOnlyListCursor(this, position, where)
  }

  subList(from: number, to: number): List<E> {
    this.checkSubList(from, to)
    const tags = this.tags
    return new ReadOnlyList(this.source.subList(from, to), {
      list: tags.subList,
      subList: tags.subList,
      reversed: tags.reversed,
    })
  }

  reversed(): List<E> {
    const tags = this.tags
    return new ReadOnlyList(this.source.reversed(), {
      list: tags.reversed,
      subList: tags.subList,
      reversed: tags.reversed,
    })
  }

  // ── Every change is refused ──

  setAt(_index: number, _element: E): void {
    throw refuse(`${this.className}.set`)
  }

  insertAt(_index: number, _element: E): void {
    throw refuse(`${this.className}.insert`)
  }

  insertItems(_index: number, _elements: readonly E[]): void {
    throw refuse(`${this.className}.insertAll`)
  }

  removeAtIndex(_index: number): E {
    throw refuse(`${this.className}.removeAt`)
  }

  removeRange(_from: number, _to: number): void {
    throw refuse(`${this.className}.clear`)
  }

  override add(_element: E): this {
    throw refuse(`${this.className}.add`)
  }

  override addFirst(_element: E): this {
    throw refuse(`${this.className}.addFirst`)
  }

  override addLast(_element: E): this {
    throw refuse(`${this.className}.addLast`)
  }

  override insert(_index: number, _element: E): this {
    throw refuse(`${this.className}.insert`)
  }

  override insertAll(_index: number, _elements: Iterable<E>): boolean {
    throw refuse(`${this.className}.insertAll`)
  }

  override addAll(_elements: Iterable<E>): boolean {
    throw refuse(`${this.className}.addAll`)
  }

  override set(_index: number, _element: E): E {
    throw refuse(`${this.className}.set`)
  }

  override removeAt(_index: number): E {
    throw refuse(`${this.className}.removeAt`)
  }

  override removeFirst(): E {
    throw refuse(`${this.className}.removeFirst`)
  }

  override removeLast(): E {
    throw refuse(`${this.className}.removeLast`)
  }

  override delete(_element: E): boolean {
    throw refuse(`${this.className}.delete`)
  }

  override clear(): void {
    throw refuse(`${this.className}.clear`)
  }

  override removeAll(_elements: Iterable<E>): boolean {
    throw refuse(`${this.className}.removeAll`)
  }

  override retainAll(_elements: Iterable<E>): boolean {
    throw refuse(`${this.className}.retainAll`)
  }

  override removeIf(_predicate: (element: E, index: number, list: List<E>) => unknown): boolean {
    throw refuse(`${this.className}.removeIf`)
  }

  override replaceAll(_op: (element: E, index: number, list: List<E>) => E): void {
    throw refuse(`${this.className}.replaceAll`)
  }

  override sort(_comparator?: Comparator<E>): this {
    throw refuse(`${this.className}.sort`)
  }
}
