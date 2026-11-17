// The skeleton of a sorted set and its views: everything is written once over an ordered tree, an
// optional range of it (low and high bounds, in ascending order) and a direction. The set itself is
// the whole tree in ascending order; a range view limits the range; a reversed view walks it the
// other way. Each operation compares first and changes the tree only after every comparison.

import {
  ConcurrentModificationError,
  IllegalArgumentError,
  NoSuchElementError,
  UnsupportedOperationError,
} from '../../errors/errors'
import type { Comparator } from '../../functions/comparators'
import type { Cursor } from '../../interfaces/collection'
import type { SetCollection } from '../../interfaces/set'
import type { BoundOptions, SortedSet, SubSetOptions } from '../../interfaces/sorted-set'
import { SEQUENCED_COLLECTION_BRAND, SORTED_SET_BRAND } from '../brand'
import { describeValue, requireElement } from '../checks'
import {
  ABSENT,
  type OrderedTree,
  predecessor,
  successor,
  TreeCursor,
  TreeIterator,
  type TreeNode,
} from '../engines/ordered-tree'
import type { HashFunction } from '../equality'
import { apply } from '../intrinsics'
import { AbstractSet } from './abstract-set'

/**
 * One end of a range, in ascending order.
 *
 * @internal
 */
export interface Bound<E> {
  readonly value: E
  readonly inclusive: boolean
}

/**
 * The bounds of a range in ascending order: low, then high.
 *
 * @internal
 */
export type Range<E> = readonly [Bound<E> | undefined, Bound<E> | undefined]

/** Reads one inclusive flag: `undefined` gives the default; anything but a boolean is refused. */
function readFlag(flag: unknown, fallback: boolean, where: string, name: string): boolean {
  if (flag === undefined) return fallback
  if (typeof flag !== 'boolean') {
    throw new TypeError(`${where}: ${name} is not a boolean (${describeValue(flag)})`)
  }
  return flag
}

/** Throws `TypeError` unless `options` is `undefined`, `null` or an object. */
function readOptions(options: unknown, where: string): Record<string, unknown> | undefined {
  if (options === undefined || options === null) return undefined
  if (typeof options !== 'object') {
    throw new TypeError(`${where}: options is not an object (${describeValue(options)})`)
  }
  return options as Record<string, unknown>
}

/**
 * Base class of a sorted set and its views.
 *
 * Subclasses give the tag, the public owner, `reversed()`, the comparator they report and how a
 * new range view is made; the tree, the range and the direction are fixed at construction.
 *
 * @internal
 */
export abstract class AbstractSortedSet<E> extends AbstractSet<E> implements SortedSet<E> {
  protected override readonly iterationMode = 'fail-fast' as const
  /** The tree, shared by a set and all its views. */
  readonly tree: OrderedTree<E>
  /** The low end of the range in ascending order, or `undefined` for none. */
  readonly low: Bound<E> | undefined
  /** The high end of the range in ascending order, or `undefined` for none. */
  readonly high: Bound<E> | undefined
  /** Whether this set walks the range from the greatest member down. */
  readonly descending: boolean

  constructor(
    tree: OrderedTree<E>,
    low: Bound<E> | undefined,
    high: Bound<E> | undefined,
    descending: boolean,
  ) {
    super(tree.changes)
    this.tree = tree
    this.low = low
    this.high = high
    this.descending = descending
  }

  abstract comparator(): Comparator<E> | undefined
  abstract reversed(): SortedSet<E>
  abstract override get owner(): SortedSet<E>

  /** Returns a new view of the ascending range from `low` to `high`, in this set's direction. */
  protected abstract openRange(low: Bound<E> | undefined, high: Bound<E> | undefined): SortedSet<E>

  /** Marks every sequenced collection for `isSequencedCollection`, across loaded copies. */
  get [SEQUENCED_COLLECTION_BRAND](): true {
    return true
  }

  /** Marks every sorted set for `isSortedSet`, across loaded copies. */
  get [SORTED_SET_BRAND](): true {
    return true
  }

  // ── The range ──

  /** Whether a range limits this set (always, for a range view). */
  get ranged(): boolean {
    return this.low !== undefined || this.high !== undefined
  }

  /**
   * Whether `value` lies below the range. With `lenient`, a value natural order cannot compare
   * counts as outside.
   */
  private tooLow(value: E, where: string, expected: number, lenient: boolean): boolean {
    const low = this.low
    if (low === undefined) return false
    const c = lenient
      ? this.tree.compareLenient(value, low.value, where, expected)
      : this.tree.compare(value, low.value, where, expected)
    return c === ABSENT || c < 0 || (c === 0 && !low.inclusive)
  }

  /** Whether `value` lies above the range; as `tooLow`. */
  private tooHigh(value: E, where: string, expected: number, lenient: boolean): boolean {
    const high = this.high
    if (high === undefined) return false
    const c = lenient
      ? this.tree.compareLenient(value, high.value, where, expected)
      : this.tree.compare(value, high.value, where, expected)
    return c === ABSENT || c > 0 || (c === 0 && !high.inclusive)
  }

  private inRange(value: E, where: string, expected: number, lenient: boolean): boolean {
    return (
      !this.tooLow(value, where, expected, lenient) &&
      !this.tooHigh(value, where, expected, lenient)
    )
  }

  /** The least node in range, or `null`. */
  lowestNode(where: string, expected: number): TreeNode<E> | null {
    const low = this.low
    const node =
      low === undefined
        ? this.tree.first()
        : this.tree.nearest(low.value, false, low.inclusive, where, expected)
    return node !== null && this.tooHigh(node.value, where, expected, false) ? null : node
  }

  /** The greatest node in range, or `null`. */
  private highestNode(where: string, expected: number): TreeNode<E> | null {
    const high = this.high
    const node =
      high === undefined
        ? this.tree.last()
        : this.tree.nearest(high.value, true, high.inclusive, where, expected)
    return node !== null && this.tooLow(node.value, where, expected, false) ? null : node
  }

  /** The first node in this set's direction, or `null`. */
  firstNode(where: string, expected: number): TreeNode<E> | null {
    return this.descending ? this.highestNode(where, expected) : this.lowestNode(where, expected)
  }

  /** The last node in this set's direction, or `null`. */
  lastNode(where: string, expected: number): TreeNode<E> | null {
    return this.descending ? this.lowestNode(where, expected) : this.highestNode(where, expected)
  }

  /** The node where a walk in this set's direction stops: the first one past the range, or `null`. */
  stopNode(where: string, expected: number): TreeNode<E> | null {
    if (this.descending) {
      const low = this.low
      return low === undefined
        ? null
        : this.tree.nearest(low.value, true, !low.inclusive, where, expected)
    }
    const high = this.high
    return high === undefined
      ? null
      : this.tree.nearest(high.value, false, !high.inclusive, where, expected)
  }

  /** Every node in range, in this set's direction. */
  nodes(where: string, expected: number): TreeNode<E>[] {
    const out: TreeNode<E>[] = []
    const stop = this.stopNode(where, expected)
    let node = this.firstNode(where, expected)
    while (node !== null && node !== stop) {
      out.push(node)
      node = this.descending ? predecessor(node) : successor(node)
    }
    return out
  }

  /**
   * The node holding `value`, or `null` when no member in range compares equal to it; in natural
   * order a value that cannot be compared is absent.
   */
  lookup(value: E, where: string, expected: number): TreeNode<E> | null {
    if (!this.inRange(value, where, expected, true)) return null
    return this.tree.find(value, where, expected, true)
  }

  /** In natural order: refuses `null`/`undefined` and stores `-0` as `0`. */
  private normalise(element: E, where: string): E {
    if (this.tree.order !== undefined) return element
    requireElement(element, where)
    return (element as unknown) === 0 ? (0 as E) : element
  }

  // ── Reading ──

  get size(): number {
    if (!this.ranged) return this.tree.count
    const where = `${this.className}.size`
    const expected = this.changes.structure
    const stop = this.stopNode(where, expected)
    let count = 0
    for (let node = this.firstNode(where, expected); node !== null && node !== stop; count++) {
      node = this.descending ? predecessor(node) : successor(node)
    }
    return count
  }

  override isEmpty(): boolean {
    if (!this.ranged) return this.tree.count === 0
    return this.lowestNode(`${this.className}.isEmpty`, this.changes.structure) === null
  }

  protected hasMember(element: E, method: string): boolean {
    return this.lookup(element, `${this.className}.${method}`, this.changes.structure) !== null
  }

  getFirst(): E {
    const node = this.firstNode(`${this.className}.getFirst`, this.changes.structure)
    if (node === null) throw this.empty('getFirst')
    return node.value
  }

  getLast(): E {
    const node = this.lastNode(`${this.className}.getLast`, this.changes.structure)
    if (node === null) throw this.empty('getLast')
    return node.value
  }

  lower(element: E): E | undefined {
    return this.navigate(element, true, false, 'lower')
  }

  floor(element: E): E | undefined {
    return this.navigate(element, true, true, 'floor')
  }

  ceiling(element: E): E | undefined {
    return this.navigate(element, false, true, 'ceiling')
  }

  higher(element: E): E | undefined {
    return this.navigate(element, false, false, 'higher')
  }

  /**
   * The nearest member before (`before`) or after `element` in this set's order, counting an equal
   * member when `inclusive`.
   */
  private navigate(element: E, before: boolean, inclusive: boolean, method: string): E | undefined {
    const where = `${this.className}.${method}`
    if (this.tree.order === undefined) requireElement(element, where)
    const node = this.nearestNode(element, before, inclusive, where)
    return node === null ? undefined : node.value
  }

  /**
   * The node nearest `element` before (`before`) or after it in this set's order, counting an
   * equal node when `inclusive`, or `null`. The caller has refused `null`/`undefined` in natural
   * order.
   */
  nearestNode(element: E, before: boolean, inclusive: boolean, where: string): TreeNode<E> | null {
    const expected = this.changes.structure
    // In ascending terms: below means towards the least member.
    const below = before !== this.descending
    let node: TreeNode<E> | null
    if (below) {
      if (this.tooHigh(element, where, expected, false)) {
        node = this.highestNode(where, expected)
      } else {
        node = this.tree.nearest(element, true, inclusive, where, expected)
        if (node !== null && this.tooLow(node.value, where, expected, false)) node = null
      }
    } else if (this.tooLow(element, where, expected, false)) {
      node = this.lowestNode(where, expected)
    } else {
      node = this.tree.nearest(element, false, inclusive, where, expected)
      if (node !== null && this.tooHigh(node.value, where, expected, false)) node = null
    }
    return node
  }

  [Symbol.iterator](): IterableIterator<E> {
    const where = `${this.className}[Symbol.iterator]().next`
    const expected = this.changes.structure
    return new TreeIterator(
      this.firstNode(where, expected),
      this.stopNode(where, expected),
      this.descending,
      this.changes,
      where,
    )
  }

  cursor(): Cursor<E> {
    const where = `${this.className}.cursor`
    const expected = this.changes.structure
    return new TreeCursor(
      this.tree,
      this.firstNode(where, expected),
      this.stopNode(where, expected),
      this.descending,
      where,
    )
  }

  override forEach(
    action: (element: E, same: E, set: SetCollection<E>) => void,
    thisArg?: unknown,
  ): void {
    this.requireFunction(action, 'forEach', 'action')
    const owner = this.owner
    const expected = this.changes.structure
    for (const element of this) {
      apply(action, thisArg, [element, element, owner])
      if (this.changes.structure !== expected) {
        throw new ConcurrentModificationError(
          `${this.className}.forEach: the collection was changed by the callback`,
        )
      }
    }
  }

  protected memberHashes(hash: HashFunction): number {
    let sum = 0
    for (const element of this) sum = (sum + hash(element)) | 0
    return sum
  }

  // ── Adding ──

  add(element: E): this {
    this.insert(element, `${this.className}.add`)
    return this
  }

  override addAll(elements: Iterable<E>): boolean {
    const where = `${this.className}.addAll`
    const items = this.readAll(elements, 'addAll')
    if (this.tree.order === undefined) {
      for (let i = 0; i < items.length; i++) requireElement(items[i], where)
    }
    let added = false
    for (let i = 0; i < items.length; i++) if (this.insert(items[i] as E, where)) added = true
    return added
  }

  private insert(element: E, where: string): boolean {
    const value = this.normalise(element, where)
    const expected = this.changes.structure
    this.requireInRange(value, where, expected)
    if (!this.tree.insert(value, where, expected)) return false
    this.changes.structural()
    return true
  }

  /** Throws `IllegalArgumentError` when a range limits this set and `value` lies outside it. */
  requireInRange(value: E, where: string, expected: number): void {
    if (this.ranged && !this.inRange(value, where, expected, false)) {
      throw new IllegalArgumentError(
        `${where}: ${describeValue(value)} is outside the range of the view`,
      )
    }
  }

  addFirst(_element: E): this {
    throw this.unsupported('addFirst')
  }

  addLast(_element: E): this {
    throw this.unsupported('addLast')
  }

  // ── Removing ──

  override delete(element: E): boolean {
    const node = this.lookup(element, `${this.className}.delete`, this.changes.structure)
    if (node === null) return false
    this.tree.remove(node)
    this.changes.structural()
    return true
  }

  pollFirst(): E | undefined {
    return this.take(this.firstNode(`${this.className}.pollFirst`, this.changes.structure))
  }

  pollLast(): E | undefined {
    return this.take(this.lastNode(`${this.className}.pollLast`, this.changes.structure))
  }

  removeFirst(): E {
    const node = this.firstNode(`${this.className}.removeFirst`, this.changes.structure)
    if (node === null) throw this.empty('removeFirst')
    return this.take(node) as E
  }

  removeLast(): E {
    const node = this.lastNode(`${this.className}.removeLast`, this.changes.structure)
    if (node === null) throw this.empty('removeLast')
    return this.take(node) as E
  }

  private take(node: TreeNode<E> | null): E | undefined {
    if (node === null) return undefined
    this.tree.remove(node)
    this.changes.structural()
    return node.value
  }

  override clear(): void {
    if (!this.ranged) {
      if (this.tree.count === 0) return
      this.tree.clear()
      this.changes.structural()
      return
    }
    this.removeNodes(this.nodes(`${this.className}.clear`, this.changes.structure))
  }

  override removeAll(elements: Iterable<E>): boolean {
    const where = `${this.className}.removeAll`
    const items = this.readAll(elements, 'removeAll')
    const expected = this.changes.structure
    const doomed: TreeNode<E>[] = []
    const seen = new Set<TreeNode<E>>()
    for (let i = 0; i < items.length; i++) {
      const node = this.lookup(items[i] as E, where, expected)
      if (node !== null && !seen.has(node)) {
        seen.add(node)
        doomed.push(node)
      }
    }
    return this.removeNodes(doomed)
  }

  override retainAll(elements: Iterable<E>): boolean {
    const where = `${this.className}.retainAll`
    const items = this.readAll(elements, 'retainAll')
    const expected = this.changes.structure
    const kept = new Set<TreeNode<E>>()
    for (let i = 0; i < items.length; i++) {
      const node = this.lookup(items[i] as E, where, expected)
      if (node !== null) kept.add(node)
    }
    const doomed: TreeNode<E>[] = []
    for (const node of this.nodes(where, expected)) if (!kept.has(node)) doomed.push(node)
    return this.removeNodes(doomed)
  }

  /** Unlinks the members marked in `flags` (iteration order); no comparisons once found. */
  protected override removeMarked(flags: readonly boolean[], method: string): void {
    const all = this.nodes(`${this.className}.${method}`, this.changes.structure)
    const doomed: TreeNode<E>[] = []
    for (let i = 0; i < all.length; i++) if (flags[i] === true) doomed.push(all[i] as TreeNode<E>)
    this.removeNodes(doomed)
  }

  /** Unlinks every node of `doomed` and records one change when there was any. */
  private removeNodes(doomed: readonly TreeNode<E>[]): boolean {
    if (doomed.length === 0) return false
    for (let i = 0; i < doomed.length; i++) this.tree.remove(doomed[i] as TreeNode<E>)
    this.changes.structural()
    return true
  }

  // ── Range views ──

  subSet(from: E, to: E, options?: SubSetOptions | null): SortedSet<E> {
    const range = this.subRange(from, to, options, `${this.className}.subSet`)
    return this.openRange(range[0], range[1])
  }

  headSet(to: E, options?: BoundOptions | null): SortedSet<E> {
    const range = this.headRange(to, options, `${this.className}.headSet`)
    return this.openRange(range[0], range[1])
  }

  tailSet(from: E, options?: BoundOptions | null): SortedSet<E> {
    const range = this.tailRange(from, options, `${this.className}.tailSet`)
    return this.openRange(range[0], range[1])
  }

  /** Reads the options of `subSet` (or `subMap`) and checks the range from `from` to `to`. */
  subRange(from: E, to: E, options: unknown, where: string): Range<E> {
    const read = readOptions(options, where)
    const fromInclusive = readFlag(
      read === undefined ? undefined : read.fromInclusive,
      true,
      where,
      'fromInclusive',
    )
    const toInclusive = readFlag(
      read === undefined ? undefined : read.toInclusive,
      false,
      where,
      'toInclusive',
    )
    return this.checkRange(
      { value: from, inclusive: fromInclusive },
      { value: to, inclusive: toInclusive },
      where,
    )
  }

  /** Reads the options of `headSet` (or `headMap`) and checks the range up to `to`. */
  headRange(to: E, options: unknown, where: string): Range<E> {
    const read = readOptions(options, where)
    const inclusive = readFlag(
      read === undefined ? undefined : read.inclusive,
      false,
      where,
      'inclusive',
    )
    return this.checkRange(undefined, { value: to, inclusive }, where)
  }

  /** Reads the options of `tailSet` (or `tailMap`) and checks the range from `from`. */
  tailRange(from: E, options: unknown, where: string): Range<E> {
    const read = readOptions(options, where)
    const inclusive = readFlag(
      read === undefined ? undefined : read.inclusive,
      true,
      where,
      'inclusive',
    )
    return this.checkRange({ value: from, inclusive }, undefined, where)
  }

  /**
   * Checks the range from `from` to `to`, given in this set's order: each bound as an element,
   * then that `from` is not after `to`, then that the range lies within this one. Returns the
   * new range's bounds in ascending order.
   */
  private checkRange(
    from: Bound<E> | undefined,
    to: Bound<E> | undefined,
    where: string,
  ): Range<E> {
    const expected = this.changes.structure
    if (from !== undefined) this.checkBound(from.value, where, expected)
    if (to !== undefined) this.checkBound(to.value, where, expected)
    const low = this.descending ? to : from
    const high = this.descending ? from : to
    if (low !== undefined && high !== undefined) {
      if (this.tree.compare(low.value, high.value, where, expected) > 0) {
        throw new IllegalArgumentError(
          `${where}: from ${describeValue((from as Bound<E>).value)} is after to ${describeValue((to as Bound<E>).value)}`,
        )
      }
    }
    if (low !== undefined) this.checkWithin(low, where, expected)
    if (high !== undefined) this.checkWithin(high, where, expected)
    return [low === undefined ? this.low : low, high === undefined ? this.high : high]
  }

  /** In natural order, refuses a bound that could not be added as an element. */
  private checkBound(value: E, where: string, expected: number): void {
    if (this.tree.order !== undefined) return
    requireElement(value, where)
    this.tree.checkNatural(value, where, expected)
  }

  /**
   * Refuses a new bound outside this set's range: an inclusive bound must be in range; an exclusive
   * one may also sit on an end of the range.
   */
  private checkWithin(bound: Bound<E>, where: string, expected: number): void {
    const low = this.low
    const high = this.high
    let outside = false
    if (low !== undefined) {
      const c = this.tree.compare(bound.value, low.value, where, expected)
      outside = c < 0 || (c === 0 && bound.inclusive && !low.inclusive)
    }
    if (!outside && high !== undefined) {
      const c = this.tree.compare(bound.value, high.value, where, expected)
      outside = c > 0 || (c === 0 && bound.inclusive && !high.inclusive)
    }
    if (outside) {
      throw new IllegalArgumentError(
        `${where}: ${describeValue(bound.value)} is outside the range of the view`,
      )
    }
  }

  // ── Errors ──

  private empty(method: string): NoSuchElementError {
    return new NoSuchElementError(`${this.className}.${method}: the set is empty`)
  }

  private unsupported(method: string): UnsupportedOperationError {
    return new UnsupportedOperationError(
      `${this.className}.${method}: a sorted set places each member by its order; use add`,
    )
  }
}
