// A read-only list over another list. Indexes and ranges are checked under the read-only list's
// own name, then reads go to the source; sub-lists and reversed views are read-only in turn, and
// every change — on the list, its views and its cursors — is refused before its arguments are
// looked at.

import type { Comparator } from '../../../functions/comparators'
import type { List, ListCursor, ReadonlyList } from '../../../interfaces/list'
import { checkPosition } from '../../checks'
import { type HashFunction, hashCodeSymbol } from '../../equality'
import { apply } from '../../intrinsics'
import { AbstractList } from '../../skeletons/abstract-list'
import { ReadOnlyListCursor } from './read-only-cursor'
import { refuse } from './refuse'
import { registerReadOnly } from './registry'
import type { ReadOnlyTags } from './tags'

/** The roles a read-only list can play. @internal */
export type ListRole = 'list' | 'subList' | 'reversedList'

/**
 * A read-only view of `source`, printed with the tag of its `role`. Equality and hashing are the
 * source's; iteration, `forEach` and cursors fail fast as the source's do.
 *
 * @internal
 */
export class ReadOnlyList<E> extends AbstractList<E> {
  private readonly source: ReadonlyList<E>
  private readonly tags: ReadOnlyTags
  private readonly role: ListRole

  /**
   * @param exact - The class whose instances register as a list; an instance of any other class,
   *   such as a subclass defined outside the library, is not registered.
   */
  constructor(
    source: ReadonlyList<E>,
    tags: ReadOnlyTags,
    role: ListRole = 'list',
    exact: unknown = ReadOnlyList,
  ) {
    super()
    this.source = source
    this.tags = tags
    this.role = role
    registerReadOnly(this, new.target === exact ? 'list' : undefined, source, tags[role])
  }

  get [Symbol.toStringTag](): string {
    return this.tags[this.role]
  }

  get size(): number {
    return this.source.size
  }

  override get revision(): number {
    return this.source.revision
  }

  override isEmpty(): boolean {
    return this.source.isEmpty()
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

  override toArray(): E[] {
    return this.source.toArray()
  }

  override forEach(
    action: (element: E, index: number, list: List<E>) => void,
    thisArg?: unknown,
  ): void {
    this.requireFunction(action, 'forEach', 'action')
    this.source.forEach((element, index) => {
      apply(action, thisArg, [element, index, this])
    })
  }

  override equals(other: unknown): boolean {
    return other === this || this.source.equals(other)
  }

  override [hashCodeSymbol](hash: HashFunction): number {
    return this.source[hashCodeSymbol](hash)
  }

  override cursor(): ListCursor<E> {
    return new ReadOnlyListCursor(this.source.listCursor(0), `${this.className}.cursor`)
  }

  override listCursor(index?: number): ListCursor<E> {
    const where = `${this.className}.listCursor`
    const position = index === undefined ? 0 : checkPosition(index, this.size, where)
    return new ReadOnlyListCursor(this.source.listCursor(position), where)
  }

  subList(from: number, to: number): List<E> {
    this.checkSubList(from, to)
    return new ReadOnlyList(this.source.subList(from, to), this.tags, 'subList')
  }

  reversed(): List<E> {
    return new ReadOnlyList(this.source.reversed(), this.tags, 'reversedList')
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
