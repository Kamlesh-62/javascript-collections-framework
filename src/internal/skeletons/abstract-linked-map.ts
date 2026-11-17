// The skeleton of a linked hash map and its reversed view: every map and sequenced-map operation is
// written once, in the map's own order, over a shared state (a linked hash table, a change counter
// and the options) and a direction. The map walks the table from the front; the reversed view walks
// the same table from the back, so its front is the map's back.
//
// Each operation turns a `-0` key into `0`, derives the key's probe once, finds the mapping and only
// then changes the table. A new key goes to the walker's own back (the map's front for the reversed
// view); an access move always goes to the map's back and an eviction always takes from the map's
// front. A record held across a user callback is read again through `table.current`, because an
// access made by the callback can replace it.

import { ConcurrentModificationError, NoSuchElementError } from '../../errors/errors'
import type { Cursor } from '../../interfaces/collection'
import type { SequencedCollection } from '../../interfaces/list'
import type { MapCollection, MapEntry } from '../../interfaces/map'
import type { SequencedMap } from '../../interfaces/sequenced-map'
import type { SequencedSet } from '../../interfaces/sequenced-set'
import { isBranded, MAP_COLLECTION_BRAND, MAP_ENTRY_BRAND, SEQUENCED_MAP_BRAND } from '../brand'
import { requireFunction } from '../checks'
import type { EvictionQueue } from '../engines/eviction-queue'
import { type HashEquality, normalise, Operation } from '../engines/hash-support'
import type { LinkedHashTable, LinkedRecord } from '../engines/linked-hash-table'
import { MISSING } from '../engines/map-stores'
import { equals, equalsSymbol, type HashFunction } from '../equality'
import { apply } from '../intrinsics'
import { LiveCursor } from '../iteration'
import { readPairs } from '../map-input'
import type { ChangeCounter } from '../revision'
import {
  LinkedHashMapEntrySet,
  LinkedHashMapKeySet,
  LinkedHashMapValues,
} from '../views/linked-hash-map-views'
import { type EntrySource, MapEntryHandle } from '../views/map-entry'
import { AbstractMap } from './abstract-map'

type Entry<K, V> = LinkedRecord<K, V>

/**
 * What a linked hash map and its reversed view share: the table, the change counter, the options
 * read at construction and the eviction queue.
 *
 * @internal
 */
export interface LinkedMapState<K, V> {
  readonly table: LinkedHashTable<K, V>
  readonly changes: ChangeCounter
  readonly equality: HashEquality<K>
  readonly accessOrder: boolean
  /** The most mappings kept, or `undefined` for no bound. */
  readonly maxSize: number | undefined
  readonly onEvict: ((value: V, key: K, map: never) => void) | undefined
  /** The queue of evicted mappings, when both `maxSize` and `onEvict` are set. */
  readonly queue: EvictionQueue<K, V> | undefined
}

/**
 * Base class of a linked hash map and its reversed view.
 *
 * Subclasses give the tag, the public owner, the map in the opposite order (`opposite`) and the
 * public `reversed()`; the state and the direction are fixed at construction.
 *
 * @internal
 */
export abstract class AbstractLinkedMap<K, V>
  extends AbstractMap<K, V>
  implements SequencedMap<K, V>, EntrySource<K, V>
{
  /** The state, shared by a map and its reversed view. */
  readonly state: LinkedMapState<K, V>
  /** The table, shared by a map and its reversed view. */
  readonly table: LinkedHashTable<K, V>
  /** Whether this map walks the table from the back. */
  readonly fromBack: boolean

  constructor(state: LinkedMapState<K, V>, fromBack: boolean) {
    super(state.changes)
    this.state = state
    this.table = state.table
    this.fromBack = fromBack
  }

  abstract override get owner(): SequencedMap<K, V>
  /** The map over the same state in the opposite direction. */
  abstract opposite(): AbstractLinkedMap<K, V>
  abstract reversed(): SequencedMap<K, V>

  /** Marks every map for `isMapCollection`, across loaded copies. */
  get [MAP_COLLECTION_BRAND](): true {
    return true
  }

  /** Marks every sequenced map, across loaded copies. */
  get [SEQUENCED_MAP_BRAND](): true {
    return true
  }

  get size(): number {
    return this.table.size
  }

  // ── Calls and handles ──

  /**
   * Runs `body` as one call on the map: with an eviction queue, the outermost call delivers the
   * evictions when it ends.
   */
  call<T>(body: () => T): T {
    const queue = this.state.queue
    return queue === undefined ? body() : queue.run(body)
  }

  /** Starts an operation whose errors name `where`. */
  operation(where: string): Operation {
    return new Operation(this.changes, where, 'map')
  }

  handles(_where?: string): Iterator<unknown> {
    return this.table.iterator(this.fromBack)
  }

  keyAt(handle: unknown): K {
    return (handle as Entry<K, V>).key
  }

  valueAt(handle: unknown): V {
    return (handle as Entry<K, V>).value
  }

  keyHash(handle: unknown, hash: HashFunction): number {
    return this.table.keyHash(handle as Entry<K, V>, hash)
  }

  /** The record of a key already normalised, or `undefined`. No access move. */
  private lookup(key: K, where: string): Entry<K, V> | undefined {
    const op = this.operation(where)
    return this.table.find(key, this.table.probe(key, op), op)
  }

  find(key: K, where: string): unknown {
    const record = this.lookup(normalise(key), where)
    return record === undefined ? MISSING : record
  }

  /** A new entry for a record. */
  entryAt(handle: unknown): MapEntry<K, V> {
    const record = handle as Entry<K, V>
    return new MapEntryHandle(this, record, this.table.probeAt(record), record.value)
  }

  /**
   * The record standing for the mapping `handle` stood for: its current record while stored,
   * otherwise a mapping with an equal key found by the stored probe, or `MISSING`.
   */
  relocate(handle: unknown, key: K, probe: unknown, where: string): unknown {
    const current = this.table.current(handle as Entry<K, V>)
    if (current !== undefined) return current
    return this.call(() => {
      const found = this.table.find(key, probe, this.operation(where))
      return found === undefined ? MISSING : found
    })
  }

  /** Writes `value` to a stored record, records the change and returns the value it replaced. */
  overwrite(handle: unknown, value: V): V {
    const record = handle as Entry<K, V>
    const old = record.value
    record.value = value
    this.changes.replaced()
    return old
  }

  // ── Changes ──

  /** In access order, moves a present record to the map's back. */
  private touch(record: Entry<K, V>): void {
    if (this.state.accessOrder && this.table.access(record)) this.changes.replaced()
  }

  /** Writes the value of a present record as a write of the key: an access in access order. */
  private write(record: Entry<K, V>, value: V): V {
    const old = this.overwrite(record, value)
    this.touch(record)
    return old
  }

  /** Removes a stored record and returns its value. */
  removeRecord(record: Entry<K, V>): V {
    this.table.remove(record)
    this.changes.structural()
    return record.value
  }

  /**
   * Links a new mapping for a key known to be absent at the map's front or back, then evicts from
   * the map's front, never the record just made, until the bound holds.
   */
  private insert(key: K, probe: unknown, value: V, front: boolean): void {
    const table = this.table
    const made = table.insert(key, probe, value, front)
    this.changes.structural()
    const { maxSize, queue } = this.state
    if (maxSize === undefined) return
    while (table.size > maxSize) {
      let victim = table.head.next
      if (victim === made) victim = victim.next
      table.remove(victim)
      this.changes.structural()
      if (queue !== undefined) queue.push(victim.key, victim.value)
    }
  }

  /** Throws when a callback of `where` added or removed mappings since `start`. */
  private checkCallback(start: number, where: string): void {
    if (this.changes.structure !== start) {
      throw new ConcurrentModificationError(`${where}: the map was changed by the callback`)
    }
  }

  /** Maps `key` to `value`; returns the previous value, or `MISSING` when the key was absent. */
  writeKey(key: K, value: V, where: string): unknown {
    const op = this.operation(where)
    const normalised = normalise(key)
    const table = this.table
    const probe = table.probe(normalised, op)
    const found = table.find(normalised, probe, op)
    if (found !== undefined) return this.write(found, value)
    this.insert(normalised, probe, value, this.fromBack)
    return MISSING
  }

  // ── Reading ──

  override get(key: K): V | undefined {
    return this.call(() => {
      const record = this.lookup(normalise(key), this.at('get'))
      if (record === undefined) return undefined
      this.touch(record)
      return record.value
    })
  }

  override getOrDefault<D>(key: K, fallback: D): V | D {
    return this.call(() => {
      const record = this.lookup(normalise(key), this.at('getOrDefault'))
      if (record === undefined) return fallback
      this.touch(record)
      return record.value
    })
  }

  override has(key: K): boolean {
    return this.call(() => this.lookup(normalise(key), this.at('has')) !== undefined)
  }

  override forEach(
    action: (value: V, key: K, map: MapCollection<K, V>) => void,
    thisArg?: unknown,
  ): void {
    this.call(() => super.forEach(action, thisArg))
  }

  override equals(other: unknown): boolean {
    return this.call(() => super.equals(other))
  }

  [equalsSymbol](other: unknown): boolean {
    return this.equals(other)
  }

  // ── Writing ──

  set(key: K, value: V): this {
    this.call(() => this.writeKey(key, value, this.at('set')))
    return this
  }

  put(key: K, value: V): V | undefined {
    const old = this.call(() => this.writeKey(key, value, this.at('put')))
    return old === MISSING ? undefined : (old as V)
  }

  putAll(entries: Iterable<readonly [K, V] | MapEntry<K, V>>): void {
    const where = this.at('putAll')
    this.call(() => {
      const pairs = readPairs<K, V>(entries, where)
      for (const pair of pairs) this.writeKey(pair[0], pair[1], where)
    })
  }

  /** Sets each checked pair in order as one call on the map, naming `where` in errors. */
  build(pairs: Array<[K, V]>, where: string): void {
    this.call(() => {
      for (const pair of pairs) this.writeKey(pair[0], pair[1], where)
    })
  }

  putFirst(key: K, value: V): this {
    this.call(() => this.place(key, value, true, this.at('putFirst')))
    return this
  }

  putLast(key: K, value: V): this {
    this.call(() => this.place(key, value, false, this.at('putLast')))
    return this
  }

  /** Inserts or moves the mapping of `key` to this map's front (`ownFront`) or back. */
  private place(key: K, value: V, ownFront: boolean, where: string): void {
    const op = this.operation(where)
    const normalised = normalise(key)
    const table = this.table
    const probe = table.probe(normalised, op)
    const found = table.find(normalised, probe, op)
    const front = ownFront !== this.fromBack
    if (found === undefined) {
      this.insert(normalised, probe, value, front)
    } else if (table.move(found, front)) {
      ;(table.current(found) as Entry<K, V>).value = value
      this.changes.structural()
    } else {
      this.overwrite(found, value)
    }
  }

  /** Removes the mapping of `key`; returns its value, or `MISSING`. */
  removeKey(key: K, where: string): unknown {
    return this.call(() => {
      const record = this.lookup(normalise(key), where)
      return record === undefined ? MISSING : this.removeRecord(record)
    })
  }

  delete(key: K): boolean {
    return this.removeKey(key, this.at('delete')) !== MISSING
  }

  remove(key: K): V | undefined {
    const removed = this.removeKey(key, this.at('remove'))
    return removed === MISSING ? undefined : (removed as V)
  }

  replace(key: K, value: V): V | undefined {
    return this.call(() => {
      const record = this.lookup(normalise(key), this.at('replace'))
      return record === undefined ? undefined : this.write(record, value)
    })
  }

  replaceAll(fn: (value: V, key: K, map: MapCollection<K, V>) => V): void {
    const where = this.at('replaceAll')
    requireFunction(fn, where, 'fn')
    this.call(() => {
      const table = this.table
      const owner = this.owner
      const start = this.changes.structure
      const records = table.records(this.fromBack)
      for (let i = 0; i < records.length; i++) {
        const record = table.current(records[i] as Entry<K, V>) as Entry<K, V>
        const result = apply(fn, undefined, [record.value, record.key, owner]) as V
        this.checkCallback(start, where)
        this.overwrite(table.current(record) as Entry<K, V>, result)
      }
    })
  }

  getOrInsert(key: K, value: V): V {
    return this.call(() => {
      const op = this.operation(this.at('getOrInsert'))
      const normalised = normalise(key)
      const probe = this.table.probe(normalised, op)
      const found = this.table.find(normalised, probe, op)
      if (found !== undefined) {
        this.touch(found)
        return found.value
      }
      this.insert(normalised, probe, value, this.fromBack)
      return value
    })
  }

  getOrInsertComputed(key: K, fn: (key: K) => V): V {
    const where = this.at('getOrInsertComputed')
    requireFunction(fn, where, 'fn')
    return this.call(() => {
      const normalised = normalise(key)
      const table = this.table
      const op = this.operation(where)
      const probe = table.probe(normalised, op)
      const found = table.find(normalised, probe, op)
      if (found !== undefined) {
        this.touch(found)
        return found.value
      }
      const value = apply(fn, undefined, [normalised]) as V
      // The callback may have changed the map: look again, with the probe already derived.
      const now = table.find(normalised, probe, this.operation(where))
      if (now !== undefined) this.write(now, value)
      else this.insert(normalised, probe, value, this.fromBack)
      return value
    })
  }

  compute(
    key: K,
    fn: (value: V | undefined, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined {
    const where = this.at('compute')
    requireFunction(fn, where, 'fn')
    return this.call(() => {
      const normalised = normalise(key)
      const table = this.table
      const op = this.operation(where)
      const probe = table.probe(normalised, op)
      const found = table.find(normalised, probe, op)
      const start = this.changes.structure
      const old = found === undefined ? undefined : found.value
      const result = apply(fn, undefined, [old, normalised, this.owner]) as V | undefined
      this.checkCallback(start, where)
      const record = found === undefined ? undefined : table.current(found)
      if (result === undefined) {
        if (record !== undefined) this.removeRecord(record)
      } else if (record !== undefined) {
        this.write(record, result)
      } else {
        this.insert(normalised, probe, result, this.fromBack)
      }
      return result
    })
  }

  computeIfPresent(
    key: K,
    fn: (value: V, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined {
    const where = this.at('computeIfPresent')
    requireFunction(fn, where, 'fn')
    return this.call(() => {
      const normalised = normalise(key)
      const found = this.lookup(normalised, where)
      if (found === undefined) return undefined
      const start = this.changes.structure
      const result = apply(fn, undefined, [found.value, normalised, this.owner]) as V | undefined
      this.checkCallback(start, where)
      const record = this.table.current(found) as Entry<K, V>
      if (result === undefined) this.removeRecord(record)
      else this.write(record, result)
      return result
    })
  }

  merge(
    key: K,
    value: V,
    fn: (old: V, value: V, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined {
    const where = this.at('merge')
    requireFunction(fn, where, 'fn')
    return this.call(() => {
      const normalised = normalise(key)
      const table = this.table
      const op = this.operation(where)
      const probe = table.probe(normalised, op)
      const found = table.find(normalised, probe, op)
      if (found === undefined) {
        this.insert(normalised, probe, value, this.fromBack)
        return value
      }
      const start = this.changes.structure
      const result = apply(fn, undefined, [found.value, value, normalised, this.owner]) as
        | V
        | undefined
      this.checkCallback(start, where)
      const record = table.current(found) as Entry<K, V>
      if (result === undefined) this.removeRecord(record)
      else this.write(record, result)
      return result
    })
  }

  clear(): void {
    if (this.table.size === 0) return
    this.table.clear()
    this.changes.structural()
  }

  // ── Ends ──

  /** The record at this map's front (`back` false) or back, or `undefined` when empty. */
  endOf(back: boolean): Entry<K, V> | undefined {
    return this.table.first(back !== this.fromBack)
  }

  /** The record at this map's front or back, or `NoSuchElementError` naming `where`. */
  endRecord(back: boolean, where: string, noun: string): Entry<K, V> {
    const record = this.endOf(back)
    if (record === undefined) throw new NoSuchElementError(`${where}: the ${noun} is empty`)
    return record
  }

  firstEntry(): MapEntry<K, V> | undefined {
    const record = this.endOf(false)
    return record === undefined ? undefined : this.entryAt(record)
  }

  lastEntry(): MapEntry<K, V> | undefined {
    const record = this.endOf(true)
    return record === undefined ? undefined : this.entryAt(record)
  }

  pollFirstEntry(): MapEntry<K, V> | undefined {
    return this.poll(this.endOf(false))
  }

  pollLastEntry(): MapEntry<K, V> | undefined {
    return this.poll(this.endOf(true))
  }

  /** Makes the entry first, so it reads the value the mapping had, then removes the record. */
  private poll(record: Entry<K, V> | undefined): MapEntry<K, V> | undefined {
    if (record === undefined) return undefined
    const entry = this.entryAt(record)
    this.removeRecord(record)
    return entry
  }

  // ── Views ──

  keySet(): SequencedSet<K> {
    return new LinkedHashMapKeySet(this)
  }

  entrySet(): SequencedSet<MapEntry<K, V>> {
    return new LinkedHashMapEntrySet(this)
  }

  valueCollection(): SequencedCollection<V> {
    return new LinkedHashMapValues(this)
  }

  /** Whether a key equal to `key` is present, for a view's errors naming `where`. No access. */
  hasKey(key: K, where: string): boolean {
    return this.call(() => this.lookup(normalise(key), where) !== undefined)
  }

  /**
   * The current record of the mapping `value` stands for, or `undefined` when it is not a map entry
   * whose key is present with a value equal under `equals`. No access.
   */
  locate(value: unknown, where: string): Entry<K, V> | undefined {
    if (!isBranded(value, MAP_ENTRY_BRAND)) return undefined
    const entry = value as MapEntry<K, V>
    const key = entry.key
    const expected = entry.value
    return this.call(() => {
      const record = this.lookup(normalise(key), where)
      if (record === undefined) return undefined
      const op = this.operation(where)
      return op.after(equals(record.value, expected)) ? this.table.current(record) : undefined
    })
  }

  /**
   * Decides every mapping in this map's order first (user code runs only here), then removes the
   * decided ones by mapping. A structural change while deciding throws
   * `ConcurrentModificationError` naming `where` and removes nothing.
   */
  removeDecidedRecords(
    decide: (record: Entry<K, V>, index: number) => boolean,
    where: string,
  ): boolean {
    return this.call(() => {
      const table = this.table
      const records = table.records(this.fromBack)
      const start = this.changes.structure
      const doomed: Entry<K, V>[] = []
      for (let i = 0; i < records.length; i++) {
        const record = records[i] as Entry<K, V>
        const remove = decide(table.current(record) as Entry<K, V>, i)
        if (this.changes.structure !== start) {
          throw new ConcurrentModificationError(
            `${where}: the collection was changed while deciding`,
          )
        }
        if (remove) doomed.push(record)
      }
      if (doomed.length === 0) return false
      for (let i = 0; i < doomed.length; i++) {
        table.remove(table.current(doomed[i] as Entry<K, V>) as Entry<K, V>)
      }
      this.changes.structural()
      return true
    })
  }

  /** A live cursor over the records in this map's order, projected; removal by mapping. */
  cursor<E>(project: (record: Entry<K, V>) => E, where: string): Cursor<E> {
    const table = this.table
    return new LiveCursor<E, Entry<K, V>>(
      table.iterator(this.fromBack),
      (record) => {
        const current = table.current(record)
        if (current !== undefined) this.removeRecord(current)
        else this.removeKey(record.key, where)
      },
      where,
      project,
    )
  }
}
