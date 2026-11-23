// The skeleton of a linked hash set and its reversed view: every operation is written once, in the
// set's own order, over a linked hash table and a direction. The set walks the table from the
// front; the reversed view walks the same table from the back, so its front is the set's back.
// Each operation derives the argument's key or hash once, finds the member, and only then changes
// the table.

import { NoSuchElementError } from '../../errors/errors'
import type { Cursor } from '../../interfaces/collection'
import type { SequencedSet } from '../../interfaces/sequenced-set'
import { SEQUENCED_COLLECTION_BRAND } from '../brand'
import { normalise, Operation } from '../engines/hash-support'
import type { LinkedHashTable, LinkedRecord } from '../engines/linked-hash-table'
import type { HashFunction } from '../equality'
import { LiveCursor } from '../iteration'
import type { ChangeCounter } from '../revision'
import { AbstractSet } from './abstract-set'

type SetRecord<E> = LinkedRecord<E, undefined>

function keyOf<E>(record: SetRecord<E>): E {
  return record.key
}

/**
 * Base class of a linked hash set and its reversed view.
 *
 * Subclasses give the tag, the public owner and `reversed()`; the table, the change counter and
 * the direction are fixed at construction.
 *
 * @internal
 */
export abstract class AbstractLinkedSet<E> extends AbstractSet<E> implements SequencedSet<E> {
  /** The table, shared by a set and its reversed view. */
  readonly table: LinkedHashTable<E, undefined>
  /** Whether this set walks the table from the back. */
  readonly fromBack: boolean

  constructor(table: LinkedHashTable<E, undefined>, changes: ChangeCounter, fromBack: boolean) {
    super(changes)
    this.table = table
    this.fromBack = fromBack
  }

  abstract reversed(): SequencedSet<E>
  abstract override get owner(): SequencedSet<E>

  /** Marks every sequenced collection for `isSequencedCollection`, across loaded copies. */
  get [SEQUENCED_COLLECTION_BRAND](): true {
    return true
  }

  get size(): number {
    return this.table.size
  }

  [Symbol.iterator](): IterableIterator<E> {
    return this.table.keyIterator(this.fromBack)
  }

  /** Starts an operation whose errors name `<tag>.<method>`. */
  protected operation(method: string): Operation {
    return new Operation(this.changes, `${this.className}.${method}`)
  }

  /** Finds the member equal to `value` (already normalised), with one `key` or `hash` call. */
  private findRecord(value: E, op: Operation): SetRecord<E> | undefined {
    const table = this.table
    return table.find(value, table.probe(value, op), op)
  }

  protected hasMember(element: E, method: string): boolean {
    const table = this.table
    if (table.plain) return table.findPlain(normalise(element)) !== undefined
    return this.findRecord(normalise(element), this.operation(method)) !== undefined
  }

  /**
   * Inserts `element` at this set's front or back unless a member equals it; a present member is
   * moved to that end when `move` is set and kept where it is otherwise. Returns whether `element`
   * was inserted.
   */
  private place(element: E, op: Operation, ownFront: boolean, move: boolean): boolean {
    const value = normalise(element)
    const table = this.table
    const probe = table.probe(value, op)
    const found = table.find(value, probe, op)
    const front = ownFront !== this.fromBack
    if (found === undefined) {
      table.insert(value, probe, undefined, front)
      this.changes.structural()
      return true
    }
    if (move && table.move(found, front)) this.changes.structural()
    return false
  }

  /**
   * `place` on a plain table: one native read, then at most one native write. Runs no user code,
   * so no operation is needed.
   */
  private placePlain(element: E, ownFront: boolean, move: boolean): boolean {
    const value = normalise(element)
    const table = this.table
    const found = table.findPlain(value)
    const front = ownFront !== this.fromBack
    if (found === undefined) {
      table.insert(value, value, undefined, front)
      this.changes.structural()
      return true
    }
    if (move && table.move(found, front)) this.changes.structural()
    return false
  }

  add(element: E): this {
    if (this.table.plain) this.placePlain(element, false, false)
    else this.place(element, this.operation('add'), false, false)
    return this
  }

  addFirst(element: E): this {
    if (this.table.plain) this.placePlain(element, true, true)
    else this.place(element, this.operation('addFirst'), true, true)
    return this
  }

  addLast(element: E): this {
    if (this.table.plain) this.placePlain(element, false, true)
    else this.place(element, this.operation('addLast'), false, true)
    return this
  }

  /** Adds each element of `elements` at the back, in order, naming `where` in errors. */
  addInitial(elements: Iterable<E>, where: string): void {
    if (this.table.plain) {
      for (const element of elements) this.placePlain(element, false, false)
      return
    }
    for (const element of elements) {
      this.place(element, new Operation(this.changes, where), false, false)
    }
  }

  override addAll(elements: Iterable<E>): boolean {
    const items = this.readAll(elements, 'addAll')
    const plain = this.table.plain
    let added = false
    for (const item of items) {
      if (
        plain
          ? this.placePlain(item, false, false)
          : this.place(item, this.operation('addAll'), false, false)
      ) {
        added = true
      }
    }
    return added
  }

  /** The record at this set's front (`back` false) or back, or the empty-set error. */
  private end(back: boolean, method: string): SetRecord<E> {
    const record = this.table.first(back !== this.fromBack)
    if (record === undefined) {
      throw new NoSuchElementError(`${this.className}.${method}: the set is empty`)
    }
    return record
  }

  getFirst(): E {
    return this.end(false, 'getFirst').key
  }

  getLast(): E {
    return this.end(true, 'getLast').key
  }

  removeFirst(): E {
    return this.removeRecord(this.end(false, 'removeFirst')).key
  }

  removeLast(): E {
    return this.removeRecord(this.end(true, 'removeLast')).key
  }

  private removeRecord(record: SetRecord<E>): SetRecord<E> {
    this.table.remove(record)
    this.changes.structural()
    return record
  }

  override delete(element: E): boolean {
    return this.deleteElement(element, 'delete')
  }

  private deleteElement(element: E, method: string): boolean {
    const table = this.table
    const record = table.plain
      ? table.findPlain(normalise(element))
      : this.findRecord(normalise(element), this.operation(method))
    if (record === undefined) return false
    this.removeRecord(record)
    return true
  }

  override clear(): void {
    if (this.table.size === 0) return
    this.table.clear()
    this.changes.structural()
  }

  cursor(): Cursor<E> {
    const table = this.table
    return new LiveCursor<E, SetRecord<E>>(
      table.iterator(this.fromBack),
      (record) => {
        const current = table.current(record)
        if (current !== undefined) this.removeRecord(current)
        else this.deleteElement(record.key, 'cursor')
      },
      `${this.className}.cursor`,
      keyOf,
    )
  }

  override removeAll(elements: Iterable<E>): boolean {
    return this.removeMatching('removeAll', elements, true)
  }

  override retainAll(elements: Iterable<E>): boolean {
    return this.removeMatching('retainAll', elements, false)
  }

  /**
   * Builds a lookup of `elements` under this set's equality (user code runs only here and while
   * probing it, in this set's order), decides every member, then removes the decided ones.
   */
  private removeMatching(method: string, elements: Iterable<E>, remove: boolean): boolean {
    const items = this.readAll(elements, method)
    for (let i = 0; i < items.length; i++) items[i] = normalise(items[i] as E)
    const matches = this.table.lookup(items, this.operation(method))
    const doomed: SetRecord<E>[] = []
    for (const record of this.table.records(this.fromBack)) {
      if (matches(record) === remove) doomed.push(record)
    }
    if (doomed.length === 0) return false
    for (const record of doomed) this.table.remove(record)
    this.changes.structural()
    return true
  }

  /**
   * Removes the members marked in `flags` (this set's order) by stored entry. Called only when at
   * least one member is marked.
   */
  protected override removeMarked(flags: readonly boolean[]): void {
    const records = this.table.records(this.fromBack)
    for (let i = 0; i < records.length; i++) {
      if (flags[i] === true) this.table.remove(records[i] as SetRecord<E>)
    }
    this.changes.structural()
  }

  protected memberHashes(hash: HashFunction): number {
    return this.table.keyHashes(hash)
  }
}
