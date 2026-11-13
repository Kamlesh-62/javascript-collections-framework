// The skeleton every collection extends: everything that can be written once from a few engine
// hooks. Families override methods for speed (hash lookups, O(1) clear) or semantics (structural
// equality, extra `forEach` arguments).

import { ConcurrentModificationError } from '../../errors/errors'
import type { Collection, Cursor } from '../../interfaces/collection'
import { describeValue } from '../checks'
import { equalsSymbol, type HashFunction, hashCodeSymbol, sameValueZero } from '../equality'
import { hashPrimitiveOrIdentity } from '../hashing'
import { apply } from '../intrinsics'
import {
  COLLECTION_BRAND,
  collectionToString,
  type InspectOptions,
  inspectCollection,
} from '../output'
import { ChangeCounter } from '../revision'

const INSPECT: unique symbol = /*#__PURE__*/ Symbol.for('nodejs.util.inspect.custom') as never

function isIterable(value: unknown): value is Iterable<unknown> {
  return (
    value !== null &&
    value !== undefined &&
    typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function'
  )
}

/**
 * Base class of every collection.
 *
 * Engines implement `size`, `[Symbol.iterator]`, `add`, `cursor` and `[Symbol.toStringTag]`, record
 * every change through `changes`, and choose an iteration mode. Everything else has a default here.
 *
 * @internal
 */
export abstract class AbstractCollection<E> implements Collection<E> {
  /** The change counter: `structural()` when elements are added or removed, `replaced()` otherwise. */
  protected readonly changes: ChangeCounter = new ChangeCounter()

  /** `fail-fast` for collections with no native counterpart, `live` for hash collections. */
  protected abstract readonly iterationMode: 'fail-fast' | 'live'

  abstract get size(): number
  abstract get [Symbol.toStringTag](): string
  abstract [Symbol.iterator](): IterableIterator<E>
  abstract add(element: E): this
  abstract cursor(): Cursor<E>

  /** The brackets `toString` and inspect use: `[]` by default, `{}` for sets. */
  protected brackets(): readonly [string, string] {
    return ['[', ']']
  }

  /** Element equality for `has`, `delete`, `removeAll` and `retainAll`. SameValueZero by default. */
  protected elementEquals(a: E, b: E): boolean {
    return sameValueZero(a, b)
  }

  /** The name that starts error messages and `toString`: the class name. */
  protected get className(): string {
    return this[Symbol.toStringTag]
  }

  /** Marks every collection for `isCollection`, across loaded copies. */
  get [COLLECTION_BRAND](): true {
    return true
  }

  get revision(): number {
    return this.changes.revision
  }

  isEmpty(): boolean {
    return this.size === 0
  }

  has(element: E): boolean {
    for (const candidate of this) if (this.elementEquals(candidate, element)) return true
    return false
  }

  toArray(): E[] {
    const out: E[] = []
    for (const element of this) out.push(element)
    return out
  }

  forEach(action: (element: E) => void, thisArg?: unknown): void {
    this.requireFunction(action, 'forEach', 'action')
    if (this.iterationMode === 'live') {
      for (const element of this) apply(action, thisArg, [element])
      return
    }
    const expected = this.changes.structure
    for (const element of this) {
      apply(action, thisArg, [element])
      if (this.changes.structure !== expected) {
        throw new ConcurrentModificationError(
          `${this.className}.forEach: the collection was changed by the callback`,
        )
      }
    }
  }

  delete(element: E): boolean {
    const cursor = this.cursor()
    while (cursor.hasNext()) {
      if (this.elementEquals(cursor.next(), element)) {
        cursor.remove()
        return true
      }
    }
    return false
  }

  addAll(elements: Iterable<E>): boolean {
    const items = this.readAll(elements, 'addAll')
    const before = this.changes.structure
    for (const item of items) this.add(item)
    return this.changes.structure !== before
  }

  removeAll(elements: Iterable<E>): boolean {
    const matches = this.membership(this.readAll(elements, 'removeAll'))
    return this.removeDecided('removeAll', (element) => matches(element))
  }

  retainAll(elements: Iterable<E>): boolean {
    const matches = this.membership(this.readAll(elements, 'retainAll'))
    return this.removeDecided('retainAll', (element) => !matches(element))
  }

  removeIf(predicate: (element: E) => unknown): boolean {
    this.requireFunction(predicate, 'removeIf', 'predicate')
    return this.removeDecided('removeIf', (element) =>
      Boolean(apply(predicate, undefined, [element])),
    )
  }

  clear(): void {
    const cursor = this.cursor()
    while (cursor.hasNext()) {
      cursor.next()
      cursor.remove()
    }
  }

  equals(other: unknown): boolean {
    return other === this
  }

  [equalsSymbol](other: unknown): boolean {
    return this.equals(other)
  }

  [hashCodeSymbol](_hash: HashFunction): number {
    return hashPrimitiveOrIdentity(this)
  }

  toString(): string {
    const [open, close] = this.brackets()
    return collectionToString(this, open, close)
  }

  toJSON(): E[] {
    return this.toArray()
  }

  [INSPECT](
    depth: number | null,
    options: InspectOptions,
    inspect: (value: unknown, options: InspectOptions) => string,
  ): string {
    const [open, close] = this.brackets()
    return inspectCollection(this, depth, options, inspect, open, close)
  }

  /** Throws `TypeError` unless `value` is a function. */
  protected requireFunction(value: unknown, method: string, what: string): void {
    if (typeof value !== 'function') {
      throw new TypeError(`${this.className}.${method}: ${what} is not a function`)
    }
  }

  /** Reads the whole argument into an array before any change (self, views, throwing iterables). */
  private readAll(elements: Iterable<E>, method: string): E[] {
    if (!isIterable(elements)) {
      throw new TypeError(
        `${this.className}.${method}: elements is not iterable (${describeValue(elements)})`,
      )
    }
    const items: E[] = []
    for (const item of elements) items.push(item)
    return items
  }

  /** Returns a membership test against `items` under this collection's equality. */
  private membership(items: E[]): (element: E) => boolean {
    if (this.elementEquals === AbstractCollection.prototype.elementEquals) {
      const set = new Set<E>(items)
      return (element) => set.has(element)
    }
    return (element) => {
      for (const item of items) if (this.elementEquals(element, item)) return true
      return false
    }
  }

  /**
   * Decides every element first (user code runs only here), then removes the chosen ones through a
   * cursor. An error while deciding removes nothing; a structural change while deciding throws
   * `ConcurrentModificationError` and removes nothing.
   */
  private removeDecided(method: string, decide: (element: E) => boolean): boolean {
    const flags: boolean[] = []
    const expected = this.changes.structure
    let any = false
    for (const element of this.toArray()) {
      const remove = decide(element)
      if (this.changes.structure !== expected) {
        throw new ConcurrentModificationError(
          `${this.className}.${method}: the collection was changed while deciding`,
        )
      }
      flags.push(remove)
      if (remove) any = true
    }
    if (!any) return false
    const cursor = this.cursor()
    let index = 0
    while (cursor.hasNext()) {
      cursor.next()
      if (flags[index++] === true) cursor.remove()
    }
    return true
  }
}
