// A read-only set over another set. Membership, equality and hashing are the source's; members
// can be mapped on the way out (a map's entries become read-only entries). Every change is
// refused before its arguments are looked at.

import type { Cursor } from '../../../interfaces/collection'
import type { ReadonlySetCollection, SetCollection } from '../../../interfaces/set'
import { type HashFunction, hashCodeSymbol } from '../../equality'
import { MappedLiveIterator } from '../../iteration'
import { AbstractSet } from '../../skeletons/abstract-set'
import { ReadOnlyCursor } from './read-only-cursor'
import { refuse } from './refuse'

/**
 * A read-only view of `source`, printed with `tag`. With `reveal`, each member is passed through
 * it before it is handed out.
 *
 * @internal
 */
export class ReadOnlySet<E> extends AbstractSet<E> {
  private readonly source: ReadonlySetCollection<E>
  private readonly tag: string
  private readonly reveal: ((member: E) => E) | undefined

  constructor(source: ReadonlySetCollection<E>, tag: string, reveal?: (member: E) => E) {
    super()
    this.source = source
    this.tag = tag
    this.reveal = reveal
  }

  get owner(): SetCollection<E> {
    return this
  }

  get [Symbol.toStringTag](): string {
    return this.tag
  }

  get size(): number {
    return this.source.size
  }

  override get revision(): number {
    return this.source.revision
  }

  [Symbol.iterator](): IterableIterator<E> {
    const members = this.source[Symbol.iterator]()
    return this.reveal === undefined ? members : new MappedLiveIterator(members, this.reveal)
  }

  protected hasMember(element: E, _method: string): boolean {
    return this.source.has(element)
  }

  protected memberHashes(hash: HashFunction): number {
    return this.source[hashCodeSymbol](hash)
  }

  cursor(): Cursor<E> {
    return new ReadOnlyCursor(this[Symbol.iterator](), `${this.className}.cursor`)
  }

  add(_element: E): this {
    throw refuse(`${this.className}.add`)
  }

  override addAll(_elements: Iterable<E>): boolean {
    throw refuse(`${this.className}.addAll`)
  }

  override delete(_element: E): boolean {
    throw refuse(`${this.className}.delete`)
  }

  override removeAll(_elements: Iterable<E>): boolean {
    throw refuse(`${this.className}.removeAll`)
  }

  override retainAll(_elements: Iterable<E>): boolean {
    throw refuse(`${this.className}.retainAll`)
  }

  override removeIf(_predicate: (element: E) => unknown): boolean {
    throw refuse(`${this.className}.removeIf`)
  }

  override clear(): void {
    throw refuse(`${this.className}.clear`)
  }
}
