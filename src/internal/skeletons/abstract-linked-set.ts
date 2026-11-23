// The skeleton of a linked hash set and its reversed view: every operation is written once, in the
// set's own order, over a linked hash table and a direction. The set walks the table from the
// front; the reversed view walks the same table from the back, so its front is the set's back.
// Each operation derives the argument's key or hash once, finds the member, and only then changes
// the table.
//
// A set with SameValueZero members starts in the native layout (`state.flat`, see flat-layout.ts):
// its members live directly in a native `Set`, and the calls a native `Set` can answer are
// answered from it. Every other call reads `table`, which first makes the linked hash table from
// the native `Set`, once; the reversed view always does.

import { NoSuchElementError } from '../../errors/errors'
import type { Cursor } from '../../interfaces/collection'
import type { SequencedSet } from '../../interfaces/sequenced-set'
import { SEQUENCED_COLLECTION_BRAND } from '../brand'
import {
  type FlatLayout,
  FlatSetIterator,
  frontKey,
  isFront,
  tableFromSet,
} from '../engines/flat-layout'
import { type HashEquality, normalise, Operation } from '../engines/hash-support'
import type { LinkedHashTable, LinkedRecord } from '../engines/linked-hash-table'
import { MISSING } from '../engines/map-stores'
import type { HashFunction } from '../equality'
import { LiveCursor } from '../iteration'
import type { ChangeCounter } from '../revision'
import { AbstractSet } from './abstract-set'

type SetRecord<E> = LinkedRecord<E, undefined>

function keyOf<E>(record: SetRecord<E>): E {
  return record.key
}

/**
 * What a linked hash set and its reversed view share: the layout (the native `Set` or the table),
 * the change counter and the member equality.
 *
 * @internal
 */
export interface LinkedSetState<E> extends FlatLayout<Set<E>, E, undefined> {
  readonly changes: ChangeCounter
  readonly equality: HashEquality<E>
}

/**
 * Base class of a linked hash set and its reversed view.
 *
 * Subclasses give the tag, the public owner and `reversed()`; the state and the direction are
 * fixed at construction.
 *
 * @internal
 */
export abstract class AbstractLinkedSet<E> extends AbstractSet<E> implements SequencedSet<E> {
  /** The state, shared by a set and its reversed view. */
  readonly state: LinkedSetState<E>
  /** Whether this set walks the table from the back. */
  readonly fromBack: boolean

  constructor(state: LinkedSetState<E>, fromBack: boolean) {
    super(state.changes)
    this.state = state
    this.fromBack = fromBack
  }

  /** The table, shared by a set and its reversed view; made from the native layout on first use. */
  get table(): LinkedHashTable<E, undefined> {
    const state = this.state
    const flat = state.flat
    if (flat !== undefined) {
      state.table = tableFromSet(flat, state.equality)
      state.flat = undefined
      state.front = undefined
      state.frontKey = MISSING
    }
    return state.table as LinkedHashTable<E, undefined>
  }

  /** The native `Set` while the layout is native and this is the set, not its reversed view. */
  private flatOf(): Set<E> | undefined {
    return this.fromBack ? undefined : this.state.flat
  }

  abstract reversed(): SequencedSet<E>
  abstract override get owner(): SequencedSet<E>

  /** Marks every sequenced collection for `isSequencedCollection`, across loaded copies. */
  get [SEQUENCED_COLLECTION_BRAND](): true {
    return true
  }

  get size(): number {
    const flat = this.flatOf()
    return flat !== undefined ? flat.size : this.table.size
  }

  [Symbol.iterator](): IterableIterator<E> {
    const flat = this.flatOf()
    if (flat !== undefined) return new FlatSetIterator<E>(this.state, flat, false)
    return this.table.keyIterator(this.fromBack)
  }

  override entries(): IterableIterator<[E, E]> {
    const flat = this.flatOf()
    if (flat !== undefined) return new FlatSetIterator<[E, E]>(this.state, flat, true)
    return super.entries()
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
    const flat = this.flatOf()
    if (flat !== undefined) return flat.has(element)
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

  /** Adds `element` at the back of the native layout with one native call; returns whether it was new. */
  private addFlat(flat: Set<E>, element: E): boolean {
    const size = flat.size
    flat.add(element)
    if (flat.size === size) return false
    this.changes.structural()
    return true
  }

  add(element: E): this {
    const flat = this.flatOf()
    if (flat !== undefined) this.addFlat(flat, element)
    else if (this.table.plain) this.placePlain(element, false, false)
    else this.place(element, this.operation('add'), false, false)
    return this
  }

  addFirst(element: E): this {
    if (this.table.plain) this.placePlain(element, true, true)
    else this.place(element, this.operation('addFirst'), true, true)
    return this
  }

  addLast(element: E): this {
    const flat = this.flatOf()
    if (flat !== undefined && !flat.has(element)) this.addFlat(flat, element)
    else if (this.table.plain) this.placePlain(element, false, true)
    else this.place(element, this.operation('addLast'), false, true)
    return this
  }

  /** Adds each element of `elements` at the back, in order, naming `where` in errors. */
  addInitial(elements: Iterable<E>, where: string): void {
    const state = this.state
    if (state.flat !== undefined) {
      // A new set: one native construction, counted as one add per new member.
      const built = new Set<E>(elements)
      state.flat = built
      const changes = this.changes
      changes.revision += built.size
      changes.structure += built.size
      return
    }
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
    const flat = this.flatOf()
    const plain = flat !== undefined || this.table.plain
    let added = false
    for (const item of items) {
      if (
        flat !== undefined
          ? this.addFlat(flat, item)
          : plain
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
    const flat = this.flatOf()
    if (flat !== undefined) return this.front(flat, 'getFirst')
    return this.end(false, 'getFirst').key
  }

  /** The first member of the native layout, or the empty-set error. */
  private front(flat: Set<E>, method: string): E {
    const key = frontKey(this.state, flat, false)
    if (key === MISSING) {
      throw new NoSuchElementError(`${this.className}.${method}: the set is empty`)
    }
    return key as E
  }

  getLast(): E {
    return this.end(true, 'getLast').key
  }

  removeFirst(): E {
    const flat = this.flatOf()
    if (flat === undefined) return this.removeRecord(this.end(false, 'removeFirst')).key
    const key = this.front(flat, 'removeFirst')
    this.deleteElement(key, 'removeFirst')
    return key
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
    const flat = this.flatOf()
    if (flat !== undefined) {
      if (!flat.delete(element)) return false
      const state = this.state
      if (isFront(state, element)) state.frontKey = MISSING
      this.changes.structural()
      return true
    }
    const table = this.table
    const record = table.plain
      ? table.findPlain(normalise(element))
      : this.findRecord(normalise(element), this.operation(method))
    if (record === undefined) return false
    this.removeRecord(record)
    return true
  }

  override clear(): void {
    const flat = this.flatOf()
    if (flat !== undefined) {
      if (flat.size === 0) return
      flat.clear()
      this.state.frontKey = MISSING
      this.changes.structural()
      return
    }
    if (this.table.size === 0) return
    this.table.clear()
    this.changes.structural()
  }

  cursor(): Cursor<E> {
    const flat = this.flatOf()
    if (flat !== undefined) {
      // Removal by member, in whatever layout the set is in by then.
      return new LiveCursor<E>(
        new FlatSetIterator<E>(this.state, flat, false),
        (member) => this.deleteElement(member, 'cursor'),
        `${this.className}.cursor`,
      )
    }
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
    const flat = this.flatOf()
    if (flat !== undefined) {
      const lookup = new Set<E>(items)
      const doomed: E[] = []
      for (const member of flat) if (lookup.has(member) === remove) doomed.push(member)
      return this.removeMembers(doomed, method)
    }
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
    const flat = this.flatOf()
    if (flat !== undefined) {
      const doomed: E[] = []
      let i = 0
      for (const member of flat) if (flags[i++] === true) doomed.push(member)
      this.removeMembers(doomed, 'removeIf')
      return
    }
    const records = this.table.records(this.fromBack)
    for (let i = 0; i < records.length; i++) {
      if (flags[i] === true) this.table.remove(records[i] as SetRecord<E>)
    }
    this.changes.structural()
  }

  /** Removes `members` (all present) from the native layout; returns whether there were any. */
  private removeMembers(members: E[], method: string): boolean {
    if (members.length === 0) return false
    for (let i = 0; i < members.length; i++) this.deleteElement(members[i] as E, method)
    return true
  }

  protected memberHashes(hash: HashFunction): number {
    if (this.flatOf() !== undefined) {
      // Walked live: a member's hash may run code that changes the layout.
      let sum = 0
      for (const member of this) sum = (sum + hash(member)) | 0
      return sum
    }
    return this.table.keyHashes(hash)
  }
}
