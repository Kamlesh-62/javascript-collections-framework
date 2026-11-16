// The engine behind `HashSet`. The public class holds one engine and delegates to it, so nothing
// here reaches the published types.
//
// The engine picks one store at construction and keeps it: a native `Set` (SameValueZero), a
// native `Map` from derived key to member (a `key` function), or seeded buckets (an equivalence).
// Every store keeps insertion order in native storage, so iteration is live exactly as a native
// `Set`'s is. A member's derived key or hash is computed once, when it is stored, and reused for
// every later removal by stored entry.

import { ConcurrentModificationError } from '../../errors/errors'
import type { Cursor } from '../../interfaces/collection'
import type { SetCollection } from '../../interfaces/set'
import {
  type HashFunction,
  type KeyOf,
  type ProtocolMethods,
  protocolOf,
  sameValueZero,
} from '../equality'
import type { CheckedEquivalence } from '../equivalence'
import { LiveCursor, MappedLiveIterator, NativeLiveIterator } from '../iteration'
import { deriveKey } from '../key'
import type { ChangeCounter } from '../revision'
import { AbstractSet } from '../skeletons/abstract-set'
import { type BucketEntry, BucketTable } from './hash-table'

/**
 * How a set decides that two values are equal, fixed at construction: SameValueZero on the values
 * (`native`), SameValueZero on derived keys (`keyed`), or an equivalence over seeded buckets
 * (`buckets`; `builtIn` for this copy's `valueEquivalence`).
 *
 * @internal
 */
export type HashSetEquality<E> =
  | { readonly kind: 'native' }
  | { readonly kind: 'keyed'; readonly key: KeyOf<E> }
  | {
      readonly kind: 'buckets'
      readonly equivalence: CheckedEquivalence
      readonly builtIn: boolean
    }

/**
 * One operation on a set: the API to name in errors, and the structure count when it started. A
 * `key`, `equals` or `hash` call is passed through `after`, which throws when the call changed the
 * set's members, so the operation itself changes nothing.
 */
class Operation {
  private readonly start: number
  readonly changes: ChangeCounter
  readonly where: string

  constructor(changes: ChangeCounter, where: string) {
    this.changes = changes
    this.where = where
    this.start = changes.structure
  }

  after<T>(result: T): T {
    if (this.changes.structure !== this.start) {
      throw new ConcurrentModificationError(
        `${this.where}: the set was changed by a key, equals or hash function`,
      )
    }
    return result
  }
}

/** Turns `-0` into `0`, as native `Set` does, before any user function sees the value. */
function normalise<E>(value: E): E {
  return ((value as unknown) === 0 ? 0 : value) as E
}

/**
 * Storage for one equality. Handles are what the store's live iteration yields (members, map
 * entries or bucket entries); removing by handle never calls user code.
 *
 * @internal
 */
export interface Store<E> {
  readonly size: number
  has(value: E, op: Operation): boolean
  /** Adds `value` unless an equal member is stored; returns whether it was added. */
  add(value: E, op: Operation): boolean
  delete(value: E, op: Operation): boolean
  clear(): void
  values(): IterableIterator<E>
  handles(): Iterator<unknown>
  member(handle: unknown): E
  /** Whether the entry `handle` stands for is still stored. */
  holds(handle: unknown): boolean
  removeHandle(handle: unknown): void
  /** A membership test of stored handles against `items`, under this store's equality. */
  lookup(items: readonly E[], op: Operation): (handle: unknown) => boolean
  memberHashes(hash: HashFunction): number
  copy(): Store<E>
}

class NativeStore<E> implements Store<E> {
  private readonly set: Set<E>

  constructor(set: Set<E>) {
    this.set = set
  }

  get size(): number {
    return this.set.size
  }

  has(value: E): boolean {
    return this.set.has(value)
  }

  add(value: E): boolean {
    if (this.set.has(value)) return false
    this.set.add(value)
    return true
  }

  delete(value: E): boolean {
    return this.set.delete(value)
  }

  clear(): void {
    this.set.clear()
  }

  values(): IterableIterator<E> {
    return new NativeLiveIterator(this.set.values())
  }

  handles(): Iterator<unknown> {
    return this.set.values()
  }

  member(handle: unknown): E {
    return handle as E
  }

  holds(handle: unknown): boolean {
    return this.set.has(handle as E)
  }

  removeHandle(handle: unknown): void {
    this.set.delete(handle as E)
  }

  lookup(items: readonly E[]): (handle: unknown) => boolean {
    const set = new Set<E>(items)
    return (handle) => set.has(handle as E)
  }

  memberHashes(hash: HashFunction): number {
    let sum = 0
    for (const element of this.set) sum = (sum + hash(element)) | 0
    return sum
  }

  copy(): Store<E> {
    return new NativeStore(new Set(this.set))
  }
}

type KeyedEntry<E> = [unknown, E]

class KeyedStore<E> implements Store<E> {
  private readonly key: KeyOf<E>
  private readonly map: Map<unknown, E>

  constructor(key: KeyOf<E>, map: Map<unknown, E>) {
    this.key = key
    this.map = map
  }

  get size(): number {
    return this.map.size
  }

  private keyOf(value: E, op: Operation): unknown {
    return op.after(deriveKey(this.key, value, op.where))
  }

  has(value: E, op: Operation): boolean {
    return this.map.has(this.keyOf(value, op))
  }

  add(value: E, op: Operation): boolean {
    const key = this.keyOf(value, op)
    if (this.map.has(key)) return false
    this.map.set(key, value)
    return true
  }

  delete(value: E, op: Operation): boolean {
    return this.map.delete(this.keyOf(value, op))
  }

  clear(): void {
    this.map.clear()
  }

  values(): IterableIterator<E> {
    return new NativeLiveIterator(this.map.values())
  }

  handles(): Iterator<unknown> {
    return this.map.entries()
  }

  member(handle: unknown): E {
    return (handle as KeyedEntry<E>)[1]
  }

  holds(handle: unknown): boolean {
    const [key, value] = handle as KeyedEntry<E>
    return this.map.has(key) && sameValueZero(this.map.get(key), value)
  }

  removeHandle(handle: unknown): void {
    this.map.delete((handle as KeyedEntry<E>)[0])
  }

  lookup(items: readonly E[], op: Operation): (handle: unknown) => boolean {
    const keys = new Set<unknown>()
    for (const item of items) keys.add(this.keyOf(item, op))
    return (handle) => keys.has((handle as KeyedEntry<E>)[0])
  }

  memberHashes(hash: HashFunction): number {
    let sum = 0
    for (const key of this.map.keys()) sum = (sum + hash(key)) | 0
    return sum
  }

  copy(): Store<E> {
    return new KeyedStore(this.key, new Map(this.map))
  }
}

function entryValue<E>(entry: BucketEntry<E>): E {
  return entry.value
}

class BucketStore<E> implements Store<E> {
  private readonly equivalence: CheckedEquivalence
  private readonly builtIn: boolean
  private readonly table: BucketTable<E>

  constructor(equivalence: CheckedEquivalence, builtIn: boolean, table: BucketTable<E>) {
    this.equivalence = equivalence
    this.builtIn = builtIn
    this.table = table
  }

  get size(): number {
    return this.table.size
  }

  /** The protocol methods of `value`, read once per operation, for the built-in equivalence. */
  private methodsOf(value: E): ProtocolMethods | undefined {
    return this.builtIn ? protocolOf(value) : undefined
  }

  private hashOf(value: E, op: Operation, methods: ProtocolMethods | undefined): number {
    return op.after(this.equivalence.hash(value, op.where, methods))
  }

  private find(
    value: E,
    hash: number,
    op: Operation,
    methods: ProtocolMethods | undefined,
  ): BucketEntry<E> | undefined {
    const equivalence = this.equivalence
    return this.table.find(hash, (stored) =>
      op.after(equivalence.equals(value, stored, op.where, methods)),
    )
  }

  has(value: E, op: Operation): boolean {
    const methods = this.methodsOf(value)
    return this.find(value, this.hashOf(value, op, methods), op, methods) !== undefined
  }

  add(value: E, op: Operation): boolean {
    const methods = this.methodsOf(value)
    const hash = this.hashOf(value, op, methods)
    if (this.find(value, hash, op, methods) !== undefined) return false
    this.table.insert(hash, value)
    return true
  }

  delete(value: E, op: Operation): boolean {
    const methods = this.methodsOf(value)
    const entry = this.find(value, this.hashOf(value, op, methods), op, methods)
    if (entry === undefined) return false
    this.table.remove(entry)
    return true
  }

  clear(): void {
    this.table.clear()
  }

  values(): IterableIterator<E> {
    return new MappedLiveIterator(this.table.entries(), entryValue)
  }

  handles(): Iterator<unknown> {
    return this.table.entries()
  }

  member(handle: unknown): E {
    return (handle as BucketEntry<E>).value
  }

  holds(handle: unknown): boolean {
    return this.table.contains(handle as BucketEntry<E>)
  }

  removeHandle(handle: unknown): void {
    this.table.remove(handle as BucketEntry<E>)
  }

  lookup(items: readonly E[], op: Operation): (handle: unknown) => boolean {
    const argument = new BucketTable<E>()
    for (const item of items) argument.insert(this.hashOf(item, op, this.methodsOf(item)), item)
    const equivalence = this.equivalence
    return (handle) => {
      const entry = handle as BucketEntry<E>
      return (
        argument.find(entry.hash, (item) =>
          op.after(equivalence.equals(entry.value, item, op.where)),
        ) !== undefined
      )
    }
  }

  memberHashes(hash: HashFunction): number {
    let sum = 0
    for (const entry of this.table.entries()) {
      sum = (sum + (this.builtIn ? hash(entry.value) : entry.hash)) | 0
    }
    return sum
  }

  copy(): Store<E> {
    return new BucketStore(this.equivalence, this.builtIn, this.table.copy())
  }
}

function newStore<E>(equality: HashSetEquality<E>): Store<E> {
  switch (equality.kind) {
    case 'native':
      return new NativeStore(new Set<E>())
    case 'keyed':
      return new KeyedStore(equality.key, new Map<unknown, E>())
    default:
      return new BucketStore(equality.equivalence, equality.builtIn, new BucketTable<E>())
  }
}

/**
 * A set whose members are compared with SameValueZero, by derived key, or by an equivalence, and
 * kept in insertion order with live iteration.
 *
 * @internal
 */
export class HashSetEngine<E> extends AbstractSet<E> {
  private readonly store: Store<E>
  private readonly facade: SetCollection<E>
  private readonly equality: HashSetEquality<E>

  /**
   * @param facade - The public set, for identity and callbacks.
   * @param equality - How members are compared.
   * @param store - The storage to use; a new empty one by default.
   */
  constructor(
    facade: SetCollection<E>,
    equality: HashSetEquality<E>,
    store: Store<E> = newStore(equality),
  ) {
    super()
    this.facade = facade
    this.equality = equality
    this.store = store
  }

  get owner(): SetCollection<E> {
    return this.facade
  }

  get [Symbol.toStringTag](): string {
    return 'HashSet'
  }

  get size(): number {
    return this.store.size
  }

  [Symbol.iterator](): IterableIterator<E> {
    return this.store.values()
  }

  /** Starts an operation whose errors name `HashSet.<method>`. */
  private operation(method: string): Operation {
    return new Operation(this.changes, `${this.className}.${method}`)
  }

  protected hasMember(element: E, method: string): boolean {
    return this.store.has(normalise(element), this.operation(method))
  }

  add(element: E): this {
    this.addElement(element, this.operation('add'))
    return this
  }

  /** Adds each element of `elements` in order, naming `where` in errors (construction). */
  addInitial(elements: Iterable<E>, where: string): void {
    for (const element of elements) this.addElement(element, new Operation(this.changes, where))
  }

  private addElement(element: E, op: Operation): boolean {
    const added = this.store.add(normalise(element), op)
    if (added) this.changes.structural()
    return added
  }

  override delete(element: E): boolean {
    return this.deleteElement(element, 'delete')
  }

  private deleteElement(element: E, method: string): boolean {
    const removed = this.store.delete(normalise(element), this.operation(method))
    if (removed) this.changes.structural()
    return removed
  }

  override clear(): void {
    if (this.store.size === 0) return
    this.store.clear()
    this.changes.structural()
  }

  cursor(): Cursor<E> {
    const store = this.store
    return new LiveCursor<E, unknown>(
      store.handles(),
      (handle) => {
        if (store.holds(handle)) {
          store.removeHandle(handle)
          this.changes.structural()
        } else {
          this.deleteElement(store.member(handle), 'cursor')
        }
      },
      `${this.className}.cursor`,
      (handle) => store.member(handle),
    )
  }

  override addAll(elements: Iterable<E>): boolean {
    const items = this.readAll(elements, 'addAll')
    let added = false
    for (const item of items) if (this.addElement(item, this.operation('addAll'))) added = true
    return added
  }

  override removeAll(elements: Iterable<E>): boolean {
    return this.removeMatching('removeAll', elements, true)
  }

  override retainAll(elements: Iterable<E>): boolean {
    return this.removeMatching('retainAll', elements, false)
  }

  /**
   * Builds a lookup of `elements` under this set's equality (user code runs only here and while
   * probing it), decides every member, then removes the decided ones by stored entry.
   */
  private removeMatching(method: string, elements: Iterable<E>, remove: boolean): boolean {
    const items = this.readAll(elements, method)
    for (let i = 0; i < items.length; i++) items[i] = normalise(items[i] as E)
    const op = this.operation(method)
    const matches = this.store.lookup(items, op)
    const doomed: unknown[] = []
    for (const handle of this.handleArray()) if (matches(handle) === remove) doomed.push(handle)
    if (doomed.length === 0) return false
    for (const handle of doomed) this.store.removeHandle(handle)
    this.changes.structural()
    return true
  }

  /** Removes the members marked in `flags` (iteration order) by stored entry. */
  protected override removeMarked(flags: readonly boolean[]): void {
    const handles = this.handleArray()
    let removed = false
    for (let i = 0; i < handles.length; i++) {
      if (flags[i] === true) {
        this.store.removeHandle(handles[i])
        removed = true
      }
    }
    if (removed) this.changes.structural()
  }

  private handleArray(): unknown[] {
    const out: unknown[] = []
    const handles = this.store.handles()
    for (let step = handles.next(); step.done !== true; step = handles.next()) out.push(step.value)
    return out
  }

  protected memberHashes(hash: HashFunction): number {
    return this.store.memberHashes(hash)
  }

  /** A new engine for `facade` with the same equality and the same stored keys and hashes. */
  copy(facade: SetCollection<E>): HashSetEngine<E> {
    return new HashSetEngine(facade, this.equality, this.store.copy())
  }
}
