// The live list views: a sub-list (a window `[from, to)`) and a reversed list. Every view reads and
// writes the root list (the one that is not a view) directly, through a span — a span of the
// root's indexes — and a direction, so an operation costs the same however deeply views are
// nested, and nothing recurses. Views share the root's change counter, so `revision` and fail-fast
// checks are the root's.

import { ConcurrentModificationError } from '../../errors/errors'
import type { List } from '../../interfaces/list'
import { INSPECT, type InspectOptions } from '../output'
import { AbstractList } from '../skeletons/abstract-list'

/**
 * A span of the root's indexes that one or more views show. A sub-list has its own span, made
 * inside its source's span (`parent`); a reversed view shares its source's span. The root's own
 * span (`parent === undefined`) always covers the whole root and never goes stale.
 *
 * A structural change made through a span updates its length and expected structure count and
 * those of every span it was made from, in a loop; any other structural change of the root leaves
 * `expected` behind, which makes the span, and every view showing it, stale.
 *
 * @internal
 */
class Span<E> {
  readonly root: AbstractList<E>
  readonly parent: Span<E> | undefined
  /** The root index of the span's first element. */
  readonly start: number
  private ownLength: number
  private expected: number

  constructor(root: AbstractList<E>, parent: Span<E> | undefined, start: number, length: number) {
    this.root = root
    this.parent = parent
    this.start = start
    this.ownLength = length
    this.expected = root.changeCounter.structure
  }

  get length(): number {
    return this.parent === undefined ? this.root.size : this.ownLength
  }

  isStale(): boolean {
    return this.parent !== undefined && this.root.changeCounter.structure !== this.expected
  }

  /** Records a structural change of `delta` elements made through this span. */
  changed(delta: number): void {
    const structure = this.root.changeCounter.structure
    let span: Span<E> | undefined = this
    while (span !== undefined && span.parent !== undefined) {
      span.ownLength += delta
      span.expected = structure
      span = span.parent
    }
  }
}

/**
 * A live view of another list: a sub-list (`SubList`) or a reversed list (`ReversedList`). Once
 * its span is stale, every method and `size` throw `ConcurrentModificationError`, while
 * `revision`, the tag, the brands and Node's inspect hook still work.
 *
 * @internal
 */
class ListView<E> extends AbstractList<E> {
  private readonly span: Span<E>
  /** Whether index 0 of the view is the last element of the span. */
  private readonly backwards: boolean
  private readonly tag: 'SubList' | 'ReversedList'
  /** The list `reversed()` or `subList()` was called on: what `reversed().reversed()` returns. */
  private readonly source: List<E>

  constructor(span: Span<E>, backwards: boolean, tag: 'SubList' | 'ReversedList', source: List<E>) {
    super(span.root.changeCounter)
    this.span = span
    this.backwards = backwards
    this.tag = tag
    this.source = source
  }

  get [Symbol.toStringTag](): string {
    return this.tag
  }

  get size(): number {
    this.assertUsable()
    return this.span.length
  }

  override assertUsable(): void {
    if (this.span.isStale()) {
      throw new ConcurrentModificationError(
        `${this.tag}: the list it shows was changed other than through this view`,
      )
    }
  }

  /** The root index of the view's element `index`. */
  private at(index: number): number {
    const span = this.span
    return this.backwards ? span.start + span.length - 1 - index : span.start + index
  }

  /** The root insertion position for the view's position `position`. */
  private position(position: number): number {
    const span = this.span
    return this.backwards ? span.start + span.length - position : span.start + position
  }

  getAt(index: number): E {
    this.assertUsable()
    return this.span.root.getAt(this.at(index))
  }

  setAt(index: number, element: E): void {
    this.assertUsable()
    this.span.root.setAt(this.at(index), element)
  }

  insertAt(index: number, element: E): void {
    this.assertUsable()
    this.span.root.insertAt(this.position(index), element)
    this.span.changed(1)
  }

  insertItems(index: number, elements: readonly E[]): void {
    this.assertUsable()
    let items = elements
    if (this.backwards) {
      const reversed: E[] = []
      for (let i = elements.length - 1; i >= 0; i--) reversed.push(elements[i] as E)
      items = reversed
    }
    this.span.root.insertItems(this.position(index), items)
    this.span.changed(elements.length)
  }

  removeAtIndex(index: number): E {
    this.assertUsable()
    const element = this.span.root.removeAtIndex(this.at(index))
    this.span.changed(-1)
    return element
  }

  removeRange(from: number, to: number): void {
    this.assertUsable()
    const span = this.span
    const start = span.start
    const end = start + span.length
    if (this.backwards) span.root.removeRange(end - to, end - from)
    else span.root.removeRange(start + from, start + to)
    span.changed(from - to)
  }

  override markStructural(): void {
    this.assertUsable()
    this.span.root.markStructural()
    this.span.changed(0)
  }

  subList(from: number, to: number): List<E> {
    this.checkSubList(from, to)
    const span = this.span
    const start = this.backwards ? span.start + span.length - to : span.start + from
    const inner = new Span(span.root, span, start, to - from)
    return new ListView(inner, this.backwards, 'SubList', this)
  }

  reversed(): List<E> {
    this.assertUsable()
    if (this.tag === 'ReversedList') return this.source
    return new ListView(this.span, !this.backwards, 'ReversedList', this)
  }

  override [INSPECT](
    depth: number | null,
    options: InspectOptions,
    inspect: (value: unknown, options: InspectOptions) => string,
  ): string {
    return this.span.isStale() ? `${this.tag} <stale>` : super[INSPECT](depth, options, inspect)
  }
}

/**
 * Returns the live view `[from, to)` of `root`, a list that is not a view. The range is already
 * checked.
 *
 * @internal
 */
export function subListOf<E>(root: AbstractList<E>, from: number, to: number): List<E> {
  const whole = new Span(root, undefined, 0, 0)
  return new ListView(new Span(root, whole, from, to - from), false, 'SubList', root.owner)
}

/**
 * Returns the live reversed view of `root`, a list that is not a view.
 *
 * @internal
 */
export function reversedOf<E>(root: AbstractList<E>): List<E> {
  return new ListView(new Span(root, undefined, 0, 0), true, 'ReversedList', root.owner)
}
