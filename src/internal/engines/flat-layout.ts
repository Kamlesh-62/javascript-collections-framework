// The native layout of a default linked hash map or set: until a call needs linked order, its
// contents live directly in a native `Map` or `Set`, which already keeps insertion order and live
// iteration. The first call that needs more makes a linked hash table from it (`fromMap`,
// `fromSet`), once.
//
// An iteration started in the native layout walks the native collection. At its first step after
// the switch it continues over the table as an iteration over linked records would: the first
// member still ahead of it in the native order that was there at the switch (its record's origin is
// its rank, 1…n) tells how far it had come, and it resumes after the rank before that one.
//
// Reads at the front use one native iterator per layout, kept with the key it last gave: every key
// before that one has been deleted, so after a delete of that key (or a `clear`) the next step
// lands on the new first key.

import { sameValueZero } from '../equality'
import { done, IteratorBase } from '../iteration'
import type { HashEquality } from './hash-support'
import {
  LinkedEntryIterator,
  LinkedHashTable,
  LinkedKeyIterator,
  type LinkedRecord,
  LinkedRecordIterator,
  LinkedValueIterator,
} from './linked-hash-table'
import { MISSING, nativeMapStore } from './map-stores'

/**
 * What a linked collection keeps for its layout: the native contents, or the table once made, and
 * the front reader of the native layout.
 *
 * @internal
 */
export interface FlatLayout<T, K = unknown, V = unknown> {
  /** The native contents; `undefined` once the table is made. */
  flat: T | undefined
  /** The table; `undefined` while the contents are native. */
  table: LinkedHashTable<K, V> | undefined
  /** The front reader's native iterator, made on the first front read. */
  front: Iterator<unknown> | undefined
  /** The key the front reader last gave, while it is the first key; `MISSING` otherwise. */
  frontKey: unknown
  /** The value of `frontKey` in a map with an eviction callback. */
  frontValue: unknown
}

/** The iteration kinds of `FlatMapIterator`. @internal */
export const KEYS = 0
/** @internal */
export const VALUES = 1
/** @internal */
export const ENTRIES = 2
/** Keys in the native layout, records after the switch: the handles of a linked map. @internal */
export const HANDLES = 3

/**
 * A table of the mappings of `map`, in its order, ranked 1…n. Each value of `map` is replaced by
 * its record and `map` itself becomes the store, so the keys keep their native order and open
 * iterators of `map` stay valid. No user calls.
 *
 * Time: O(n).
 *
 * @internal
 */
export function tableFromMap<K, V>(
  map: Map<K, V>,
  equality: HashEquality<K>,
): LinkedHashTable<K, V> {
  const records = map as unknown as Map<K, LinkedRecord<K, V>>
  const table = new LinkedHashTable<K, V>(equality, nativeMapStore(records))
  const entries = map.entries()
  for (let step = entries.next(); step.done !== true; step = entries.next()) {
    const key = step.value[0]
    records.set(key, table.link(key, step.value[1], key, false))
  }
  table.promoted = table.high
  return table
}

/**
 * A table of the members of `set`, in its order, ranked 1…n, in a new store; `set` is left as it
 * is. No user calls.
 *
 * Time: O(n).
 *
 * @internal
 */
export function tableFromSet<E>(
  set: Set<E>,
  equality: HashEquality<E>,
): LinkedHashTable<E, undefined> {
  const table = new LinkedHashTable<E, undefined>(equality)
  const members = set.values()
  for (let step = members.next(); step.done !== true; step = members.next()) {
    table.insert(step.value, step.value, undefined, false)
  }
  table.promoted = table.high
  return table
}

/** Where a resumed walk starts: after the rank before `record`'s, or after every ranked record. */
function boundaryOf(record: LinkedRecord<unknown, unknown> | undefined, ranked: number): number {
  if (record === undefined) return ranked
  const origin = record.origin
  return origin >= 1 && origin <= ranked ? origin - 1 : ranked
}

/**
 * A live iteration of a linked map started in the native layout: native steps while the layout
 * holds, then the records of the table.
 *
 * Time: O(1) per native step; the switch costs O(1) amortised over the steps taken and the changes
 * made since.
 *
 * @internal
 */
export class FlatMapIterator<T> extends IteratorBase implements IterableIterator<T> {
  private readonly layout: FlatLayout<Map<unknown, unknown>>
  private readonly flat: Map<unknown, unknown>
  private readonly inner: Iterator<unknown>
  private readonly kind: number
  private records: Iterator<unknown> | undefined
  private finished = false

  /**
   * @param layout - The collection's layout.
   * @param flat - Its native `Map`, which must be `layout.flat`.
   * @param kind - `KEYS`, `VALUES`, `ENTRIES` or `HANDLES`.
   */
  constructor(layout: object, flat: object, kind: number) {
    super()
    this.layout = layout as FlatLayout<Map<unknown, unknown>>
    const map = flat as Map<unknown, unknown>
    this.flat = map
    this.kind = kind
    this.inner = kind === VALUES ? map.values() : kind === ENTRIES ? map.entries() : map.keys()
  }

  next(): IteratorResult<T> {
    if (this.layout.flat === this.flat) {
      const step = this.inner.next()
      if (step.done === true) this.finished = true
      return step as IteratorResult<T>
    }
    return this.linked()
  }

  /** A step after the switch. */
  private linked(): IteratorResult<T> {
    if (this.finished) return done()
    const kind = this.kind
    let records = this.records
    if (records === undefined) {
      // The native `Map` is the table's store now: its values are the records.
      const table = this.layout.table as LinkedHashTable<unknown, unknown>
      const ahead = this.inner.next()
      let record: LinkedRecord<unknown, unknown> | undefined
      if (ahead.done !== true) {
        const value = ahead.value
        record = (
          kind === VALUES
            ? value
            : kind === ENTRIES
              ? (value as unknown[])[1]
              : table.findPlain(value)
        ) as LinkedRecord<unknown, unknown> | undefined
      }
      const walk = new LinkedRecordIterator(table, false, boundaryOf(record, table.promoted))
      records = this.records =
        kind === KEYS
          ? new LinkedKeyIterator(walk)
          : kind === VALUES
            ? new LinkedValueIterator(walk)
            : kind === ENTRIES
              ? new LinkedEntryIterator(walk)
              : walk
    }
    return records.next() as IteratorResult<T>
  }

  [Symbol.iterator](): this {
    return this
  }
}

/**
 * A live iteration of a linked set started in the native layout: native steps while the layout
 * holds, then the members of the table. The native `Set` is left as it was at the switch, so the
 * first of its members ahead that is still in the table with its rank tells where to resume.
 *
 * Time: O(1) per native step; the switch costs O(1) amortised over the steps taken and the changes
 * made since.
 *
 * @internal
 */
export class FlatSetIterator<T> extends IteratorBase implements IterableIterator<T> {
  private readonly layout: FlatLayout<Set<unknown>>
  private readonly flat: Set<unknown>
  private readonly inner: Iterator<unknown>
  private readonly pairs: boolean
  private records: LinkedRecordIterator<unknown, unknown> | undefined
  private finished = false

  /**
   * @param layout - The collection's layout.
   * @param flat - Its native `Set`, which must be `layout.flat`.
   * @param pairs - Whether each step is a `[member, member]` pair.
   */
  constructor(layout: object, flat: object, pairs: boolean) {
    super()
    const set = flat as Set<unknown>
    this.layout = layout as FlatLayout<Set<unknown>>
    this.flat = set
    this.pairs = pairs
    this.inner = pairs ? set.entries() : set.values()
  }

  next(): IteratorResult<T> {
    if (this.layout.flat === this.flat) {
      const step = this.inner.next()
      if (step.done === true) this.finished = true
      return step as IteratorResult<T>
    }
    return this.linked()
  }

  /** A step after the switch. */
  private linked(): IteratorResult<T> {
    if (this.finished) return done()
    const pairs = this.pairs
    let records = this.records
    if (records === undefined) {
      const table = this.layout.table as LinkedHashTable<unknown, unknown>
      const ranked = table.promoted
      const inner = this.inner
      let boundary = ranked
      for (let step = inner.next(); step.done !== true; step = inner.next()) {
        const record = table.findPlain(pairs ? (step.value as unknown[])[0] : step.value)
        if (record !== undefined && record.origin >= 1 && record.origin <= ranked) {
          boundary = record.origin - 1
          break
        }
      }
      records = this.records = new LinkedRecordIterator(table, false, boundary)
    }
    const step = records.next() as IteratorResult<unknown>
    if (step.done !== true) {
      const key = (step.value as LinkedRecord<unknown, unknown>).key
      step.value = pairs ? [key, key] : key
    }
    return step as IteratorResult<T>
  }

  [Symbol.iterator](): this {
    return this
  }
}

/**
 * The first key of the native layout, or `MISSING` when it is empty. With `pairs` (a map), the
 * reader walks `entries()` and keeps the value of the key it reads in `frontValue`.
 *
 * Time: O(1) amortised: the reader's steps never exceed the keys ever inserted plus the reads.
 *
 * @internal
 */
export function frontKey(layout: object, flat: object, pairs: boolean): unknown {
  const reader = layout as FlatLayout<unknown>
  const native = flat as Map<unknown, unknown> | Set<unknown>
  if (native.size === 0) return MISSING
  if (reader.frontKey === MISSING) {
    let front = reader.front
    if (front === undefined) front = reader.front = pairs ? native.entries() : native.values()
    const value = front.next().value
    if (pairs) {
      reader.frontKey = (value as unknown[])[0]
      reader.frontValue = (value as unknown[])[1]
    } else {
      reader.frontKey = value
    }
  }
  return reader.frontKey
}

/** Whether `key` is the key the front reader holds (SameValueZero). @internal */
export function isFront(layout: object, key: unknown): boolean {
  return sameValueZero((layout as FlatLayout<unknown>).frontKey, key)
}
