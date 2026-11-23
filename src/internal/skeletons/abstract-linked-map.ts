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
//
// A map with SameValueZero keys and no access order starts in the native layout (`state.flat`, see
// flat-layout.ts): its mappings live directly in a native `Map`, and the calls a native `Map` can
// answer are answered from it, as one native call where they make one. Every other call reads
// `table`, which makes the linked hash table from the native `Map` first, once; the reversed view
// always does. In the native layout a mapping's handle is its key; after the switch it is its
// record. A call that runs user code finds its mapping again by key afterwards, in whatever layout
// the map is in by then.

import { ConcurrentModificationError, NoSuchElementError } from '../../errors/errors'
import type { Cursor } from '../../interfaces/collection'
import type { SequencedCollection } from '../../interfaces/list'
import type { MapCollection, MapEntry } from '../../interfaces/map'
import type { SequencedMap } from '../../interfaces/sequenced-map'
import type { SequencedSet } from '../../interfaces/sequenced-set'
import { isBranded, MAP_COLLECTION_BRAND, MAP_ENTRY_BRAND, SEQUENCED_MAP_BRAND } from '../brand'
import { requireFunction } from '../checks'
import type { EvictionQueue } from '../engines/eviction-queue'
import {
  ENTRIES,
  type FlatLayout,
  FlatMapIterator,
  frontKey,
  HANDLES,
  isFront,
  KEYS,
  tableFromMap,
  VALUES,
} from '../engines/flat-layout'
import { type HashEquality, normalise, Operation } from '../engines/hash-support'
import {
  LinkedEntryIterator,
  type LinkedHashTable,
  LinkedKeyIterator,
  type LinkedRecord,
  LinkedValueIterator,
} from '../engines/linked-hash-table'
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

/** The kinds of `upsertFlat`. */
const COMPUTE = 0
const IF_PRESENT = 1
const MERGE = 2
const COMPUTED = 3
const GET_OR_INSERT = 4

/**
 * What a linked hash map and its reversed view share: the layout (the native `Map` or the table),
 * the change counter, the options read at construction and the eviction queue.
 *
 * @internal
 */
export interface LinkedMapState<K, V> extends FlatLayout<Map<K, V>, K, V> {
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
  /** Whether this map walks the table from the back. */
  readonly fromBack: boolean

  constructor(state: LinkedMapState<K, V>, fromBack: boolean) {
    super(state.changes)
    this.state = state
    this.fromBack = fromBack
  }

  /** The table, shared by a map and its reversed view; made from the native layout on first use. */
  get table(): LinkedHashTable<K, V> {
    return this.promote().state.table as LinkedHashTable<K, V>
  }

  /**
   * Leaves the native layout for good, if it is still in it: makes the table from the native `Map`
   * (O(n), once). Returns this map.
   */
  promote(): this {
    const state = this.state
    const flat = state.flat
    if (flat !== undefined) {
      state.table = tableFromMap(flat, state.equality)
      state.flat = undefined
      state.front = undefined
      state.frontKey = MISSING
    }
    return this
  }

  /** The native `Map` while the layout is native and this is the map, not its reversed view. */
  private flatOf(): Map<K, V> | undefined {
    return this.fromBack ? undefined : this.state.flat
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
    const flat = this.flatOf()
    return flat !== undefined ? flat.size : this.table.size
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
    const flat = this.flatOf()
    if (flat !== undefined) return new FlatMapIterator(this.state, flat, HANDLES)
    return this.table.iterator(this.fromBack)
  }

  keyAt(handle: unknown): K {
    return this.state.flat !== undefined ? (handle as K) : (handle as Entry<K, V>).key
  }

  valueAt(handle: unknown): V {
    const flat = this.state.flat
    return flat !== undefined ? (flat.get(handle as K) as V) : (handle as Entry<K, V>).value
  }

  keyHash(handle: unknown, hash: HashFunction): number {
    if (this.state.flat !== undefined) return hash(handle)
    return this.table.keyHash(handle as Entry<K, V>, hash)
  }

  /** The record of a key already normalised, or `undefined`. No access move. */
  private lookup(key: K, where: string): Entry<K, V> | undefined {
    const table = this.table
    if (table.plain) return table.findPlain(key)
    const op = this.operation(where)
    return this.table.find(key, this.table.probe(key, op), op)
  }

  find(key: K, where: string): unknown {
    const flat = this.flatOf()
    if (flat !== undefined) return flat.has(key) ? normalise(key) : MISSING
    const record = this.lookup(normalise(key), where)
    return record === undefined ? MISSING : record
  }

  /** A new entry for a stored mapping. */
  entryAt(handle: unknown): MapEntry<K, V> {
    const probe = this.state.flat !== undefined ? handle : this.table.probeAt(handle as Entry<K, V>)
    return new MapEntryHandle(this, handle, probe, this.valueAt(handle))
  }

  /**
   * The handle standing for the mapping `handle` stood for: its current record while stored,
   * otherwise a mapping with an equal key found by the stored probe, or `MISSING`. With
   * SameValueZero keys both are the mapping of `key`, found in the current layout.
   */
  relocate(handle: unknown, key: K, probe: unknown, where: string): unknown {
    const state = this.state
    const table = state.table as LinkedHashTable<K, V>
    if (state.flat !== undefined || table.plain) return this.find(key, where)
    const current = table.current(handle as Entry<K, V>)
    if (current !== undefined) return current
    return this.call(() => {
      const found = table.find(key, probe, this.operation(where))
      return found === undefined ? MISSING : found
    })
  }

  /** Writes `value` to a stored mapping, records the change and returns the value it replaced. */
  overwrite(handle: unknown, value: V): V {
    const flat = this.state.flat
    if (flat !== undefined) {
      const old = flat.get(handle as K) as V
      flat.set(handle as K, value)
      this.changes.replaced()
      this.noteFront(handle as K, value)
      return old
    }
    const record = handle as Entry<K, V>
    const old = record.value
    record.value = value
    this.changes.replaced()
    return old
  }

  // ── The native layout ──

  /**
   * Sets a mapping in the native layout with one native call: a new key is structural and evicts
   * past `maxSize`, a present one is a written value.
   */
  private setFlat(flat: Map<K, V>, key: K, value: V): void {
    const size = flat.size
    flat.set(key, value)
    if (flat.size === size) {
      this.changes.replaced()
      this.noteFront(key, value)
      return
    }
    this.changes.structural()
    const maxSize = this.state.maxSize
    if (maxSize !== undefined && flat.size > maxSize) this.evictFlat(flat, maxSize)
  }

  /** Keeps the front reader's value current where an eviction callback will be given it. */
  private noteFront(key: K, value: V): void {
    const state = this.state
    if (state.queue !== undefined && isFront(state, key)) state.frontValue = value
  }

  /** Removes a present or absent key in the native layout with one native call. */
  private deleteFlat(flat: Map<K, V>, key: K): boolean {
    if (!flat.delete(key)) return false
    const state = this.state
    if (isFront(state, key)) state.frontKey = MISSING
    this.changes.structural()
    return true
  }

  /** Removes mappings from the front until `maxSize` holds: one `delete` each, no lookup. */
  private evictFlat(flat: Map<K, V>, maxSize: number): void {
    const state = this.state
    const queue = state.queue
    while (flat.size > maxSize) {
      const key = frontKey(state, flat, true) as K
      flat.delete(key)
      state.frontKey = MISSING
      this.changes.structural()
      if (queue !== undefined) queue.push(key, state.frontValue as V)
    }
  }

  /** `setFlat` as one call on the map, so evictions are delivered when it ends. */
  private setFlatCall(flat: Map<K, V>, key: K, value: V): void {
    const queue = this.state.queue
    if (queue === undefined) {
      this.setFlat(flat, key, value)
      return
    }
    queue.enter()
    this.setFlat(flat, key, value)
    queue.leave(false)
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

  /**
   * Whether writes may take the plain path: lookups run no user code and no eviction queue has to
   * wrap the write.
   */
  private get plainWrites(): boolean {
    return this.table.plain && this.state.queue === undefined
  }

  /**
   * `writeKey` on a plain table without an eviction queue: one native read, then at most one
   * native write (plus one removal per evicted mapping). Runs no user code.
   */
  private writePlain(key: K, value: V): unknown {
    const normalised = normalise(key)
    const found = this.table.findPlain(normalised)
    if (found !== undefined) return this.write(found, value)
    this.insert(normalised, normalised, value, this.fromBack)
    return MISSING
  }

  /**
   * Maps `key` to `value`; returns the previous value, or `MISSING` when the key was absent
   * (`undefined` in the native layout, where no caller reads it).
   */
  writeKey(key: K, value: V, where: string): unknown {
    const flat = this.flatOf()
    if (flat !== undefined) {
      this.setFlat(flat, key, value)
      return undefined
    }
    if (this.plainWrites) return this.writePlain(key, value)
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
    const flat = this.flatOf()
    if (flat !== undefined) return flat.get(key)
    const table = this.table
    if (table.plain && this.state.queue === undefined) {
      // No user code runs and no eviction can follow: read the record directly.
      const record = table.findPlain(normalise(key))
      if (record === undefined) return undefined
      this.touch(record)
      return record.value
    }
    return this.call(() => {
      const record = this.lookup(normalise(key), this.at('get'))
      if (record === undefined) return undefined
      this.touch(record)
      return record.value
    })
  }

  override getOrDefault<D>(key: K, fallback: D): V | D {
    const flat = this.flatOf()
    if (flat !== undefined) return flat.has(key) ? (flat.get(key) as V) : fallback
    return this.call(() => {
      const record = this.lookup(normalise(key), this.at('getOrDefault'))
      if (record === undefined) return fallback
      this.touch(record)
      return record.value
    })
  }

  override has(key: K): boolean {
    const flat = this.flatOf()
    if (flat !== undefined) return flat.has(key)
    const table = this.table
    if (table.plain && this.state.queue === undefined)
      return table.findPlain(normalise(key)) !== undefined
    return this.call(() => this.lookup(normalise(key), this.at('has')) !== undefined)
  }

  // ── Iterating ──

  override keys(): IterableIterator<K> {
    const flat = this.flatOf()
    if (flat !== undefined) return new FlatMapIterator<K>(this.state, flat, KEYS)
    return new LinkedKeyIterator(this.table.iterator(this.fromBack))
  }

  override values(): IterableIterator<V> {
    const flat = this.flatOf()
    if (flat !== undefined) return new FlatMapIterator<V>(this.state, flat, VALUES)
    return new LinkedValueIterator(this.table.iterator(this.fromBack))
  }

  override entries(): IterableIterator<[K, V]> {
    const flat = this.flatOf()
    if (flat !== undefined) return new FlatMapIterator<[K, V]>(this.state, flat, ENTRIES)
    return new LinkedEntryIterator(this.table.iterator(this.fromBack))
  }

  override forEach(
    action: (value: V, key: K, map: MapCollection<K, V>) => void,
    thisArg?: unknown,
  ): void {
    this.call(() => {
      requireFunction(action, this.at('forEach'), 'action')
      const owner = this.owner
      const flat = this.flatOf()
      if (flat !== undefined) {
        // One native iterator over the entries; it hands over to the records if a callback
        // switches the layout.
        const pairs = new FlatMapIterator<[K, V]>(this.state, flat, ENTRIES)
        for (let step = pairs.next(); step.done !== true; step = pairs.next()) {
          apply(action, thisArg, [step.value[1], step.value[0], owner])
        }
        return
      }
      const records = this.table.iterator(this.fromBack)
      for (let step = records.next(); step.done !== true; step = records.next()) {
        const record = step.value
        apply(action, thisArg, [record.value, record.key, owner])
      }
    })
  }

  override equals(other: unknown): boolean {
    return this.call(() => super.equals(other))
  }

  [equalsSymbol](other: unknown): boolean {
    return this.equals(other)
  }

  // ── Writing ──

  set(key: K, value: V): this {
    const flat = this.flatOf()
    if (flat !== undefined) this.setFlatCall(flat, key, value)
    else if (this.plainWrites) this.writePlain(key, value)
    else this.call(() => this.writeKey(key, value, this.at('set')))
    return this
  }

  put(key: K, value: V): V | undefined {
    const flat = this.flatOf()
    if (flat !== undefined) {
      const previous = flat.get(key)
      this.setFlatCall(flat, key, value)
      return previous
    }
    const old = this.plainWrites
      ? this.writePlain(key, value)
      : this.call(() => this.writeKey(key, value, this.at('put')))
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
    const state = this.state
    const flat = this.flatOf()
    if (flat !== undefined && flat.size === 0 && state.maxSize === undefined) {
      // A new map: one native construction, counted as one set per pair.
      const built = new Map<K, V>(pairs)
      state.flat = built
      const changes = this.changes
      changes.revision += pairs.length
      changes.structure += built.size
      return
    }
    this.call(() => {
      for (const pair of pairs) this.writeKey(pair[0], pair[1], where)
    })
  }

  putFirst(key: K, value: V): this {
    this.call(() => this.place(key, value, true, this.at('putFirst')))
    return this
  }

  putLast(key: K, value: V): this {
    const flat = this.flatOf()
    if (flat !== undefined && !flat.has(key)) {
      this.setFlatCall(flat, key, value)
      return this
    }
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
    const flat = this.flatOf()
    if (flat !== undefined) return this.deleteFlat(flat, key)
    return this.removeKey(key, this.at('delete')) !== MISSING
  }

  remove(key: K): V | undefined {
    const flat = this.flatOf()
    if (flat !== undefined) {
      const value = flat.get(key)
      return this.deleteFlat(flat, key) ? value : undefined
    }
    const removed = this.removeKey(key, this.at('remove'))
    return removed === MISSING ? undefined : (removed as V)
  }

  replace(key: K, value: V): V | undefined {
    const flat = this.flatOf()
    if (flat !== undefined) return flat.has(key) ? this.overwrite(key, value) : undefined
    return this.call(() => {
      const record = this.lookup(normalise(key), this.at('replace'))
      return record === undefined ? undefined : this.write(record, value)
    })
  }

  replaceAll(fn: (value: V, key: K, map: MapCollection<K, V>) => V): void {
    const where = this.at('replaceAll')
    requireFunction(fn, where, 'fn')
    this.call(() => {
      const owner = this.owner
      const start = this.changes.structure
      const flat = this.flatOf()
      if (flat !== undefined) {
        // Each mapping is read and written by key, in whatever layout the callbacks leave the map.
        const keys: K[] = []
        const all = flat.keys()
        for (let step = all.next(); step.done !== true; step = all.next()) keys.push(step.value)
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i] as K
          const result = apply(fn, undefined, [this.get(key), key, owner]) as V
          this.checkCallback(start, where)
          this.set(key, result)
        }
        return
      }
      const table = this.table
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
      const flat = this.flatOf()
      if (flat !== undefined)
        return this.upsertFlat(flat, key, GET_OR_INSERT, value, undefined, '') as V
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
      const flat = this.flatOf()
      if (flat !== undefined)
        return this.upsertFlat(flat, normalised, COMPUTED, undefined, fn, where) as V
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
      const flat = this.flatOf()
      if (flat !== undefined)
        return this.upsertFlat(flat, normalised, COMPUTE, undefined, fn, where)
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
      const flat = this.flatOf()
      if (flat !== undefined)
        return this.upsertFlat(flat, normalised, IF_PRESENT, undefined, fn, where)
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
      const flat = this.flatOf()
      if (flat !== undefined) return this.upsertFlat(flat, normalised, MERGE, value, fn, where)
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

  /**
   * `compute`, `computeIfPresent`, `merge`, `getOrInsert` or `getOrInsertComputed` (`kind`) in the
   * native layout, as one call on the map. The callback's result is applied by key in the layout
   * the callback leaves the map in: `undefined` removes the mapping found before it ran (except for
   * `getOrInsertComputed`), anything else writes or inserts it.
   */
  private upsertFlat(
    flat: Map<K, V>,
    key: K,
    kind: number,
    value: V | undefined,
    fn: ((...args: never[]) => unknown) | undefined,
    where: string,
  ): V | undefined {
    const old = flat.get(key)
    const present = old !== undefined || flat.has(key)
    if (present ? kind >= COMPUTED : kind === IF_PRESENT) return old
    if (!present && kind !== COMPUTE && kind !== COMPUTED) {
      this.setFlat(flat, key, value as V)
      return value
    }
    const start = this.changes.structure
    const owner = this.owner
    const result = apply(
      fn as (...args: never[]) => unknown,
      undefined,
      kind === COMPUTED ? [key] : kind === MERGE ? [old, value, key, owner] : [old, key, owner],
    ) as V | undefined
    if (kind !== COMPUTED) this.checkCallback(start, where)
    if (result !== undefined || kind === COMPUTED) this.writeKey(key, result as V, where)
    else if (present) this.remove(key)
    return result
  }

  clear(): void {
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
    const flat = this.flatOf()
    if (flat !== undefined) {
      const key = frontKey(this.state, flat, true)
      return key === MISSING ? undefined : this.entryAt(key)
    }
    const record = this.endOf(false)
    return record === undefined ? undefined : this.entryAt(record)
  }

  lastEntry(): MapEntry<K, V> | undefined {
    const record = this.endOf(true)
    return record === undefined ? undefined : this.entryAt(record)
  }

  pollFirstEntry(): MapEntry<K, V> | undefined {
    const flat = this.flatOf()
    if (flat === undefined) return this.poll(this.endOf(false))
    const state = this.state
    // A fresh step of the front reader gives the value with the key.
    const fresh = state.frontKey === MISSING
    const key = frontKey(state, flat, true) as K
    if (key === MISSING) return undefined
    const entry = new MapEntryHandle(
      this,
      key,
      key,
      (fresh ? state.frontValue : flat.get(key)) as V,
    )
    this.deleteFlat(flat, key)
    return entry
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
    const flat = this.flatOf()
    if (flat !== undefined) return flat.has(key)
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
   * Whether `value` is a map entry whose key is present with a value equal under `equals`, as
   * `locate` decides it, in either layout. No access.
   */
  holdsEntry(value: unknown, where: string): boolean {
    if (this.flatOf() === undefined) return this.locate(value, where) !== undefined
    if (!isBranded(value, MAP_ENTRY_BRAND)) return false
    const entry = value as MapEntry<K, V>
    const key = entry.key
    const expected = entry.value
    return this.call(() => {
      const handle = this.find(key, where)
      return (
        handle !== MISSING && this.operation(where).after(equals(this.valueAt(handle), expected))
      )
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
