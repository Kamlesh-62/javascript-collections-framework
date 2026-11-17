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
  readonly key: K
  value: V
  /** The `MapStore` handle of this key's mapping; the same across moves. */
  readonly handle: unknown
  /** The neighbours: current while linked, as they were at removal once unlinked. */
  prev: LinkedRecord<K, V>
  next: LinkedRecord<K, V>
  /** The order stamp: records are linked in ascending `seq`. */
  readonly seq: number
  /** Whether the record is linked (false once removed or replaced by a move). */
  live: boolean
}

function newHead<K, V>(): LinkedRecord<K, V> {
  const head = { seq: 0, live: false, handle: undefined } as unknown as LinkedRecord<K, V>
  head.prev = head
  head.next = head
  return head
}

/**
 * A hash table of records in a defined order that can be changed at both ends in O(1).
 *
 * Time: `probe`, `find` O(1) average (O(chain) on the bucket path); `insert`, `move`, `remove`,
 * `current`, `first` O(1) average; `clear` O(1) on the bucket path, one native `clear` otherwise; `records`, `copy`, `keyHashes` O(n).
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
  private readonly store: MapStore<K, LinkedRecord<K, V>>

  /**
   * @param equality - How keys are compared.
   * @param store - The lookup to use; a new empty one by default.
   */
  constructor(equality: HashEquality<K>, store?: MapStore<K, LinkedRecord<K, V>>) {
    this.store = store === undefined ? newMapStore<K, LinkedRecord<K, V>>(equality) : store
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
    const handle = this.store.find(key, probe, op)
    return handle === MISSING ? undefined : this.store.valueAt(handle)
  }

  /** Links a new record for a key known to be absent, at the front or the back. */
  insert(key: K, probe: unknown, value: V, front: boolean): LinkedRecord<K, V> {
    const store = this.store
    const handle = store.insert(key, probe, undefined as unknown as LinkedRecord<K, V>)
    const record = this.link(key, value, handle, front)
    store.write(handle, record)
    return record
  }

  /**
   * Moves `record` to the front or the back: unlinks it and links a new record with the same key,
   * value and handle there. Returns `false`, changing nothing, when it is already at that end.
   */
  move(record: LinkedRecord<K, V>, front: boolean): boolean {
    const head = this.head
    if ((front ? head.next : head.prev) === record) return false
    this.unlink(record)
    this.store.write(record.handle, this.link(record.key, record.value, record.handle, front))
    return true
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
    const table = new LinkedHashTable<K, V>(equality, store)
    const head = this.head
    for (let record = head.next; record !== head; record = record.next) {
      const handle = handles.get(record.handle)
      store.write(handle, table.link(record.key, record.value, handle, false))
    }
    return table
  }

  private link(key: K, value: V, handle: unknown, front: boolean): LinkedRecord<K, V> {
    const head = this.head
    const prev = front ? head : head.prev
    const next = front ? head.next : head
    const record: LinkedRecord<K, V> = {
      key,
      value,
      handle,
      prev,
      next,
      seq: front ? --this.low : ++this.high,
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

  constructor(table: LinkedHashTable<K, V>, fromBack: boolean) {
    super()
    this.table = table
    this.fromBack = fromBack
    this.last = table.head
    this.boundary = fromBack ? table.high + 1 : table.low - 1
    this.epoch = table.epoch
  }

  next(): IteratorResult<LinkedRecord<K, V>> {
    if (this.finished) return done()
    const table = this.table
    const head = table.head
    const fromBack = this.fromBack
    if (this.epoch !== table.epoch) {
      this.epoch = table.epoch
      this.last = head
      this.boundary = fromBack ? table.clearedHigh + 1 : table.clearedLow - 1
    }
    // The nearest live record at or behind the position: the last record itself, or the first
    // live one found by walking back through the links removed records kept.
    let anchor = this.last
    while (anchor !== head && !anchor.live) anchor = fromBack ? anchor.next : anchor.prev
    let candidate = fromBack ? anchor.prev : anchor.next
    // Records linked at the starting end since the position was taken lie before it: skip them.
    const boundary = this.boundary
    while (
      candidate !== head &&
      (fromBack ? candidate.seq >= boundary : candidate.seq <= boundary)
    ) {
      candidate = fromBack ? candidate.prev : candidate.next
    }
    if (candidate === head) {
      this.finished = true
      return done()
    }
    this.last = candidate
    this.boundary = candidate.seq
    return { done: false, value: candidate }
  }

  [Symbol.iterator](): this {
    return this
  }
}
