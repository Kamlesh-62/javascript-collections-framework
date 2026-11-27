// A hash table whose entries are also threaded on a doubly linked list, so the order can be read and
// changed at both ends. Lookup goes through a `MapStore` (one per key equality: a native `Map`, a
// `Map` from derived key, or seeded buckets) whose value for each key is that key's record; the
// order is a circular list of records through a sentinel.
//
// Every record carries a sequence number: one more than the greatest so far when inserted at the
// back, one less than the least so far when inserted at the front. Records are only inserted at the
// ends and never change place, so the live records are always in ascending sequence order and "the
// next member after a position" is "the first live record past a sequence number". Iterators rely
// on that to stay live without being registered anywhere.
//
// A move is a removal plus an insertion: the old record is unlinked and a new record, with the same
// key, value and store handle, is linked at the target end and written into the store. The store
// handle of a key therefore survives moves and is what finds a record's current place.
//
// Every record also carries an origin: its own sequence number when it is inserted, the replaced
// record's origin when it is moved by an access (an access-ordered table moves a mapping to the back
// whenever it is used), and when it is moved in a table without access order. In an access-ordered
// table an explicit move gives the record a new origin. A forward iteration of an access-ordered
// table remembers the origins it returned, so a mapping moved by an access is never returned twice.
//
// An access that no live walk can observe moves the record itself: while no `LinkedRecordIterator`
// has ever been made on a table (`walked`), nothing holds a position in its order, so an access
// relinks the same record at the back with a new sequence number and keeps its origin, saving a
// record and a store write. Code that holds records across a call finds the mapping again through
// `current`, and a record moved in place is still the current record of its mapping.
//
// For the same reason, an access-ordered table on the native store that has never been walked can
// give the record of the mapping it evicts to the mapping it inserts (`recycleFirst`): nothing
// outside a call holds a record, and code that holds one across a user callback checks for an
// added or removed mapping before it uses the record again, and an insertion is one.
//
// A table can also be made from a native `Map` or `Set` that held the contents so far (see
// flat-layout.ts): its records get the sequence numbers and origins 1…n, their rank in the native order,
// and `promoted` is n. Since moves keep origins, a record whose origin lies in 1…n is a member that
// was there at that moment and has not been removed since, and its origin is its rank: an iteration
// of the native contents still open then continues here past the rank of the first such member
// ahead of it (see `LinkedRecordIterator`'s `boundary`).

import type { HashFunction } from '../equality'
import { done, IteratorBase } from '../iteration'
import type { HashEquality, Operation } from './hash-support'
import { type MapStore, MISSING, newMapStore } from './map-stores'

/**
 * One entry of a linked hash table: the stored key, its value, the store handle of its mapping and
 * its place in the order.
 *
 * @internal
 */
export interface LinkedRecord<K, V> {
  /** The key; changes only when `recycleFirst` gives the record to a new mapping. */
  key: K
  value: V
  /** The `MapStore` handle of this key's mapping; the same across moves. */
  handle: unknown
  /** The neighbours: current while linked, as they were at removal once unlinked. */
  prev: LinkedRecord<K, V>
  next: LinkedRecord<K, V>
  /** The order stamp: records are linked in ascending `seq`. */
  seq: number
  /** The identity of the mapping across access moves: the `seq` of its last insertion or move. */
  origin: number
  /** Whether the record is linked (false once removed or replaced by a move). */
  live: boolean
}

/**
 * The sentinel: a record with the same fields, made in the same order as `link` makes them, so
 * every link a move writes goes to objects of one shape.
 */
function newHead<K, V>(): LinkedRecord<K, V> {
  const head = {
    key: undefined,
    value: undefined,
    handle: undefined,
    prev: undefined,
    next: undefined,
    seq: 0,
    origin: 0,
    live: false,
  } as unknown as LinkedRecord<K, V>
  head.prev = head
  head.next = head
  return head
}

/**
 * A hash table of records in a defined order that can be changed at both ends in O(1).
 *
 * Time: `probe`, `find` O(1) average (O(chain) on the bucket path); `insert`, `move`, `access`,
 * `remove`, `current`, `first` O(1) average; `clear` O(1) on the bucket path, one native `clear` otherwise; `records`, `copy`, `keyHashes` O(n).
 *
 * @internal
 */
export class LinkedHashTable<K, V> {
  /** The sentinel: `head.next` is the first record, `head.prev` the last. */
  readonly head: LinkedRecord<K, V> = newHead()
  /** The least and greatest sequence numbers handed out so far. */
  low = 0
  high = 0
  /** Changes on every `clear`, so open iterators know to start over. */
  epoch = 0
  /** `low` and `high` at the last `clear`. */
  clearedLow = 0
  clearedHigh = 0
  /** How many records the table was made with from a native `Map` or `Set` (ranks 1…promoted). */
  promoted = 0
  /** Whether mappings are moved by access, so forward iterations must remember what they returned. */
  readonly accessOrder: boolean
  /** Whether a live walk has ever been made on this table; until then accesses move in place. */
  walked = false
  private readonly store: MapStore<K, LinkedRecord<K, V>>

  /**
   * @param equality - How keys are compared.
   * @param store - The lookup to use; a new empty one by default.
   * @param accessOrder - Whether `access` is used on this table.
   */
  constructor(
    equality: HashEquality<K>,
    store?: MapStore<K, LinkedRecord<K, V>>,
    accessOrder = false,
  ) {
    this.store = store === undefined ? newMapStore<K, LinkedRecord<K, V>>(equality) : store
    this.accessOrder = accessOrder
    this.native = this.store.nativeMap()
  }

  /**
   * The native `Map` from key to record when no user code runs on a lookup (SameValueZero keys):
   * `findPlain` then reads it once, and `insert` writes it once.
   */
  private readonly native: Map<K, LinkedRecord<K, V>> | undefined

  /** Whether lookups run no user code, so `findPlain` may be used. */
  get plain(): boolean {
    return this.native !== undefined
  }

  /** The record of `key` (already normalised) on a plain table, with one native call. */
  findPlain(key: K): LinkedRecord<K, V> | undefined {
    return (this.native as Map<K, LinkedRecord<K, V>>).get(key)
  }

  get size(): number {
    return this.store.size
  }

  /** Derives the probe of `key`: the only place a `key` or `hash` function runs. */
  probe(key: K, op: Operation): unknown {
    return this.store.probe(key, op)
  }

  /** Returns the record whose key equals `key`, or `undefined`. */
  find(key: K, probe: unknown, op: Operation): LinkedRecord<K, V> | undefined {
    const native = this.native
    if (native !== undefined) return native.get(key)
    const handle = this.store.find(key, probe, op)
    return handle === MISSING ? undefined : this.store.valueAt(handle)
  }

  /** Links a new record for a key known to be absent, at the front or the back. */
  insert(key: K, probe: unknown, value: V, front: boolean): LinkedRecord<K, V> {
    const native = this.native
    if (native !== undefined) {
      // On the native store a record's handle is its key: link it, then store it with one write.
      const record = this.link(key, value, key, front)
      native.set(key, record)
      return record
    }
    const store = this.store
    const handle = store.insert(key, probe, undefined as unknown as LinkedRecord<K, V>)
    const record = this.link(key, value, handle, front)
    store.write(handle, record)
    return record
  }

  /**
   * Moves `record` to the front or the back: unlinks it and links a new record with the same key,
   * value and handle there, with the same origin unless the table is in access order. Returns
   * `false`, changing nothing, when it is already at that end.
   */
  move(record: LinkedRecord<K, V>, front: boolean): boolean {
    const head = this.head
    if ((front ? head.next : head.prev) === record) return false
    this.unlink(record)
    this.store.write(
      record.handle,
      this.link(
        record.key,
        record.value,
        record.handle,
        front,
        this.accessOrder ? undefined : record.origin,
      ),
    )
    return true
  }

  /**
   * Moves `record` to the back as an access: like `move`, but the new record keeps the mapping's
   * origin, so an open forward iteration that returned it does not return it again. Before any walk
   * of the table, the record itself moves. Returns `false`, changing nothing, when it is already
   * last.
   */
  access(record: LinkedRecord<K, V>): boolean {
    const head = this.head
    const last = head.prev
    if (last === record) return false
    if (!this.walked) {
      // No walk can be at the record: unlink it and link it again at the back, as the last record.
      record.prev.next = record.next
      record.next.prev = record.prev
      record.prev = last
      record.next = head
      record.seq = ++this.high
      last.next = record
      head.prev = record
      return true
    }
    this.unlink(record)
    this.store.write(
      record.handle,
      this.link(record.key, record.value, record.handle, false, record.origin),
    )
    return true
  }

  /**
   * Whether `recycleFirst` may be used: an access-ordered table on the native store that has never
   * been walked.
   */
  get recyclable(): boolean {
    return this.accessOrder && !this.walked && this.native !== undefined
  }

  /**
   * Removes the first record's mapping and gives the record to a new mapping of `key` (absent,
   * already normalised) at the back. Only while `recyclable`; the table must not be empty.
   */
  recycleFirst(key: K, value: V): LinkedRecord<K, V> {
    const native = this.native as Map<K, LinkedRecord<K, V>>
    const head = this.head
    const record = head.next
    native.delete(record.key)
    head.next = record.next
    record.next.prev = head
    const last = head.prev
    record.prev = last
    record.next = head
    last.next = record
    head.prev = record
    record.key = key
    record.handle = key
    record.value = value
    const seq = ++this.high
    record.seq = seq
    record.origin = seq
    native.set(key, record)
    return record
  }

  /** Unlinks `record` and removes its mapping by stored entry, calling no user function. */
  remove(record: LinkedRecord<K, V>): void {
    this.unlink(record)
    this.store.removeHandle(record.handle)
  }

  /**
   * Returns the record now standing for the same mapping as `record` — itself, or the record a move
   * replaced it with — or `undefined` when that mapping has been removed.
   */
  current(record: LinkedRecord<K, V>): LinkedRecord<K, V> | undefined {
    const store = this.store
    return store.holds(record.handle) ? store.valueAt(record.handle) : undefined
  }

  /** The stored probe of a record's key, for finding the mapping again without user calls. */
  probeAt(record: LinkedRecord<K, V>): unknown {
    return this.store.probeAt(record.handle)
  }

  /** The hash of a record's stored key under this table's equality. */
  keyHash(record: LinkedRecord<K, V>, hash: HashFunction): number {
    return this.store.keyHash(record.handle, hash)
  }

  /** The first record (`fromBack` false) or the last (`fromBack` true), or `undefined` when empty. */
  first(fromBack: boolean): LinkedRecord<K, V> | undefined {
    const head = this.head
    const record = fromBack ? head.prev : head.next
    return record === head ? undefined : record
  }

  /** Removes every record. Open iterators start over before the first record of the empty table. */
  clear(): void {
    const head = this.head
    this.store.clear()
    head.next = head
    head.prev = head
    this.clearedLow = this.low
    this.clearedHigh = this.high
    this.epoch++
  }

  /** The records in order, from the front or from the back. */
  records(fromBack: boolean): LinkedRecord<K, V>[] {
    const head = this.head
    const out: LinkedRecord<K, V>[] = []
    let record = fromBack ? head.prev : head.next
    while (record !== head) {
      out.push(record)
      record = fromBack ? record.prev : record.next
    }
    return out
  }

  /** A live iterator over the records, from the front or from the back. */
  iterator(fromBack: boolean): LinkedRecordIterator<K, V> {
    return new LinkedRecordIterator(this, fromBack)
  }

  /** An iterator over the keys, with one result object per step. */
  keyIterator(fromBack: boolean): IterableIterator<K> {
    return new LinkedKeyIterator(new LinkedRecordIterator(this, fromBack))
  }

  /** A test of records against `keys` under this table's equality. */
  lookup(keys: readonly K[], op: Operation): (record: LinkedRecord<K, V>) => boolean {
    const matches = this.store.lookup(keys, op)
    return (record) => matches(record.handle)
  }

  /** The 32-bit sum of the keys' hashes, as the store defines them; independent of the order. */
  keyHashes(hash: HashFunction): number {
    const store = this.store
    const handles = store.handles()
    let sum = 0
    for (let step = handles.next(); step.done !== true; step = handles.next()) {
      sum = (sum + store.keyHash(step.value, hash)) | 0
    }
    return sum
  }

  /** A new table with the same keys, values, order and stored keys or hashes. No user calls. */
  copy(equality: HashEquality<K>): LinkedHashTable<K, V> {
    const source = this.store
    const store = source.copy()
    const handles = new Map<unknown, unknown>()
    const from = source.handles()
    const to = store.handles()
    for (let a = from.next(), b = to.next(); a.done !== true; a = from.next(), b = to.next()) {
      handles.set(a.value, b.value)
    }
    const table = new LinkedHashTable<K, V>(equality, store, this.accessOrder)
    const head = this.head
    for (let record = head.next; record !== head; record = record.next) {
      const handle = handles.get(record.handle)
      store.write(handle, table.link(record.key, record.value, handle, false))
    }
    return table
  }

  /** Links a new record at the front or the back; `origin` defaults to its sequence number. */
  link(key: K, value: V, handle: unknown, front: boolean, origin?: number): LinkedRecord<K, V> {
    const head = this.head
    const prev = front ? head : head.prev
    const next = front ? head.next : head
    const seq = front ? --this.low : ++this.high
    const record: LinkedRecord<K, V> = {
      key,
      value,
      handle,
      prev,
      next,
      seq,
      origin: origin === undefined ? seq : origin,
      live: true,
    }
    prev.next = record
    next.prev = record
    return record
  }

  private unlink(record: LinkedRecord<K, V>): void {
    record.prev.next = record.next
    record.next.prev = record.prev
    record.live = false
  }
}

/**
 * A live iterator over the records of a linked hash table, in one direction. It is never registered
 * with the table: it keeps the record it last returned and that record's sequence number, and each
 * step returns the first live record past that number in its direction.
 *
 * - Records removed before they are reached are skipped; records linked at the end it is heading to
 *   are visited; records linked at the end it started from are not.
 * - When the record it last returned has been removed or moved, it continues from that record's old
 *   neighbour, found through the links the record kept at removal.
 * - After `clear`, it starts over before the first record of the empty table; once done it stays
 *   done.
 * - Walking forward over an access-ordered table, it keeps the origins of the records it returned
 *   and skips any record with one of them: a mapping an access moved behind it is not returned
 *   again. A backward walk needs none: accesses move records to its starting end.
 * - Given a `boundary`, it resumes a forward walk of the native contents the table was made from:
 *   it starts before the first record with a greater sequence number, as of the table's first
 *   epoch, so a `clear` since the table was made starts it over as usual.
 *
 * Time: O(1) amortised per step.
 *
 * @internal
 */
export class LinkedRecordIterator<K, V>
  extends IteratorBase
  implements IterableIterator<LinkedRecord<K, V>>
{
  private readonly table: LinkedHashTable<K, V>
  private readonly fromBack: boolean
  private last: LinkedRecord<K, V>
  private boundary: number
  private epoch: number
  private finished = false
  /** The origins returned so far, on a forward walk of an access-ordered table; made on demand. */
  private visited: Set<number> | undefined

  /**
   * @param table - The table to walk.
   * @param fromBack - Whether to walk from the back.
   * @param boundary - For a resumed forward walk: the sequence number to start after.
   */
  constructor(table: LinkedHashTable<K, V>, fromBack: boolean, boundary?: number) {
    super()
    table.walked = true
    this.table = table
    this.fromBack = fromBack
    this.last = table.head
    if (boundary === undefined) {
      this.boundary = fromBack ? table.high + 1 : table.low - 1
      this.epoch = table.epoch
    } else {
      this.boundary = boundary
      this.epoch = 0
    }
  }

  // Returns a fresh result object every step: `LinkedKeyIterator`, `LinkedValueIterator` and
  // `LinkedEntryIterator` rewrite its `value` in place.
  next(): IteratorResult<LinkedRecord<K, V>> {
    if (this.finished) return done()
    const table = this.table
    const head = table.head
    const fromBack = this.fromBack
    if (this.epoch !== table.epoch) {
      this.epoch = table.epoch
      this.last = head
      this.boundary = fromBack ? table.clearedHigh + 1 : table.clearedLow - 1
      if (this.visited !== undefined) this.visited.clear()
    }
    // The nearest live record at or behind the position: the last record itself, or the first
    // live one found by walking back through the links removed records kept.
    let anchor = this.last
    while (anchor !== head && !anchor.live) anchor = fromBack ? anchor.next : anchor.prev
    let candidate = fromBack ? anchor.prev : anchor.next
    // Records linked at the starting end since the position was taken lie before it: skip them,
    // and the records of mappings already returned.
    const boundary = this.boundary
    const visited = this.visited
    while (
      candidate !== head &&
      (fromBack
        ? candidate.seq >= boundary
        : candidate.seq <= boundary || (visited !== undefined && visited.has(candidate.origin)))
    ) {
      candidate = fromBack ? candidate.prev : candidate.next
    }
    if (candidate === head) {
      this.finished = true
      return done()
    }
    this.last = candidate
    this.boundary = candidate.seq
    if (!fromBack && table.accessOrder) {
      if (visited === undefined) this.visited = new Set<number>([candidate.origin])
      else visited.add(candidate.origin)
    }
    return { done: false, value: candidate }
  }

  [Symbol.iterator](): this {
    return this
  }
}

/**
 * The keys of a `LinkedRecordIterator`: each step's result object is fresh, so its value is
 * replaced by the record's key instead of building another result.
 *
 * @internal
 */
export class LinkedKeyIterator<K, V> extends IteratorBase implements IterableIterator<K> {
  private readonly records: LinkedRecordIterator<K, V>

  constructor(records: LinkedRecordIterator<K, V>) {
    super()
    this.records = records
  }

  next(): IteratorResult<K> {
    const step = this.records.next() as IteratorResult<unknown>
    if (step.done !== true) step.value = (step.value as LinkedRecord<K, V>).key
    return step as IteratorResult<K>
  }

  [Symbol.iterator](): this {
    return this
  }
}

/**
 * The values of a `LinkedRecordIterator`, read when each step is taken; the step's fresh result
 * object is reused.
 *
 * @internal
 */
export class LinkedValueIterator<K, V> extends IteratorBase implements IterableIterator<V> {
  private readonly records: LinkedRecordIterator<K, V>

  constructor(records: LinkedRecordIterator<K, V>) {
    super()
    this.records = records
  }

  next(): IteratorResult<V> {
    const step = this.records.next() as IteratorResult<unknown>
    if (step.done !== true) step.value = (step.value as LinkedRecord<K, V>).value
    return step as IteratorResult<V>
  }

  [Symbol.iterator](): this {
    return this
  }
}

/**
 * The entries of a `LinkedRecordIterator`, each a fresh `[key, value]` array read when the step is
 * taken; the step's fresh result object is reused.
 *
 * @internal
 */
export class LinkedEntryIterator<K, V> extends IteratorBase implements IterableIterator<[K, V]> {
  private readonly records: LinkedRecordIterator<K, V>

  constructor(records: LinkedRecordIterator<K, V>) {
    super()
    this.records = records
  }

  next(): IteratorResult<[K, V]> {
    const step = this.records.next() as IteratorResult<unknown>
    if (step.done !== true) {
      const record = step.value as LinkedRecord<K, V>
      step.value = [record.key, record.value]
    }
    return step as IteratorResult<[K, V]>
  }

  [Symbol.iterator](): this {
    return this
  }
}
