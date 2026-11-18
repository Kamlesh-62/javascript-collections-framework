// Read-only sets over another set: plain, sequenced and sorted. Membership, equality, hashing,
// iteration, `forEach` and cursors are the source's; members can be mapped on the way out (a map's
// entries become read-only entries). Every change is refused before its arguments are looked at.

import type { Comparator } from '../../../functions/comparators'
import type { Cursor } from '../../../interfaces/collection'
import type { ReadonlySequencedSet, SequencedSet } from '../../../interfaces/sequenced-set'
import type { ReadonlySetCollection, SetCollection } from '../../../interfaces/set'
import type {
  BoundOptions,
  ReadonlySortedSet,
  SortedSet,
  SubSetOptions,
} from '../../../interfaces/sorted-set'
import { SEQUENCED_COLLECTION_BRAND, SORTED_SET_BRAND } from '../../brand'
import { type HashFunction, hashCodeSymbol } from '../../equality'
import { apply } from '../../intrinsics'
import { MappedLiveIterator } from '../../iteration'
import { AbstractSet } from '../../skeletons/abstract-set'
import { ReadOnlyCursor } from './read-only-cursor'
import { empty, refuse } from './refuse'

/**
 * A read-only view of `source`, printed with `tag`. With `reveal`, each member is passed through
 * it before it is handed out.
 *
 * @internal
 */
export class ReadOnlySet<E> extends AbstractSet<E> {
  protected readonly source: ReadonlySetCollection<E>
  private readonly tag: string
  protected readonly reveal: ((member: E) => E) | undefined

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

  override isEmpty(): boolean {
    return this.source.isEmpty()
  }

  /** `member` as handed out: through `reveal` when there is one. */
  protected shown(member: E): E {
    return this.reveal === undefined ? member : this.reveal(member)
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

  override equals(other: unknown): boolean {
    return other === this || this.source.equals(other)
  }

  override forEach(
    action: (element: E, same: E, set: SetCollection<E>) => void,
    thisArg?: unknown,
  ): void {
    this.requireFunction(action, 'forEach', 'action')
    this.source.forEach((member) => {
      const shown = this.shown(member)
      apply(action, thisArg, [shown, shown, this])
    })
  }

  cursor(): Cursor<E> {
    return new ReadOnlyCursor(this.source.cursor(), `${this.className}.cursor`, this.reveal)
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

/**
 * A read-only view of a sequenced set: the ends and a reversed view.
 *
 * @internal
 */
export class ReadOnlySequencedSet<E> extends ReadOnlySet<E> implements SequencedSet<E> {
  /** Marks every sequenced collection for `isSequencedCollection`, across loaded copies. */
  get [SEQUENCED_COLLECTION_BRAND](): true {
    return true
  }

  getFirst(): E {
    if (this.source.isEmpty()) throw empty(`${this.className}.getFirst`)
    return this.shown((this.source as ReadonlySequencedSet<E>).getFirst())
  }

  getLast(): E {
    if (this.source.isEmpty()) throw empty(`${this.className}.getLast`)
    return this.shown((this.source as ReadonlySequencedSet<E>).getLast())
  }

  reversed(): SequencedSet<E> {
    return new ReadOnlySequencedSet(
      (this.source as ReadonlySequencedSet<E>).reversed(),
      this.className,
      this.reveal,
    )
  }

  addFirst(_element: E): this {
    throw refuse(`${this.className}.addFirst`)
  }

  addLast(_element: E): this {
    throw refuse(`${this.className}.addLast`)
  }

  removeFirst(): E {
    throw refuse(`${this.className}.removeFirst`)
  }

  removeLast(): E {
    throw refuse(`${this.className}.removeLast`)
  }
}

/**
 * A read-only view of a sorted set: navigation, range views and a descending view.
 *
 * @internal
 */
export class ReadOnlySortedSet<E> extends ReadOnlySequencedSet<E> implements SortedSet<E> {
  /** Marks every sorted set for `isSortedSet`, across loaded copies. */
  get [SORTED_SET_BRAND](): true {
    return true
  }

  private get sorted(): ReadonlySortedSet<E> {
    return this.source as ReadonlySortedSet<E>
  }

  comparator(): Comparator<E> | undefined {
    return this.sorted.comparator()
  }

  lower(element: E): E | undefined {
    return this.sorted.lower(element)
  }

  floor(element: E): E | undefined {
    return this.sorted.floor(element)
  }

  ceiling(element: E): E | undefined {
    return this.sorted.ceiling(element)
  }

  higher(element: E): E | undefined {
    return this.sorted.higher(element)
  }

  subSet(from: E, to: E, options?: SubSetOptions | null): SortedSet<E> {
    return new ReadOnlySortedSet(this.sorted.subSet(from, to, options), this.className)
  }

  headSet(to: E, options?: BoundOptions | null): SortedSet<E> {
    return new ReadOnlySortedSet(this.sorted.headSet(to, options), this.className)
  }

  tailSet(from: E, options?: BoundOptions | null): SortedSet<E> {
    return new ReadOnlySortedSet(this.sorted.tailSet(from, options), this.className)
  }

  override reversed(): SortedSet<E> {
    return new ReadOnlySortedSet(this.sorted.reversed(), this.className)
  }

  pollFirst(): E | undefined {
    throw refuse(`${this.className}.pollFirst`)
  }

  pollLast(): E | undefined {
    throw refuse(`${this.className}.pollLast`)
  }
}
