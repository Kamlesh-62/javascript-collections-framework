// The slotted layout of an access-ordered linked hash map with SameValueZero keys: until a call
// needs records, its mappings live in slots. Each slot has a key, a value and two links (the slots
// before and after it), kept in parallel arrays; a native `Map` gives each key's slot. Moving a
// mapping to the back rewrites a few integers instead of the links of objects spread through
// memory, and evicting the first mapping gives its slot to the new one.
//
// Slots are walked only by `toTable`: every call other than `get`, `has`, `set`, `put` (without an
// eviction queue), `delete`, `size`, `isEmpty` and `clear` on the map itself makes a linked hash
// table from them first (O(n), once), in the same order. A slot freed by a removal is reused by the
// next insertion; the arrays keep their largest size until `clear`.

import { newInt32Array } from '../intrinsics'
import type { EvictionQueue } from './eviction-queue'
import type { HashEquality } from './hash-support'
import { LinkedHashTable } from './linked-hash-table'

/** No slot: the end of a chain. */
const NONE = -1

/** The capacity of the link arrays of a new or cleared layout. */
const FIRST_CAPACITY = 8

/**
 * The mappings of an access-ordered map in slots, least recently used first.
 *
 * @internal
 */
export class AccessSlots<K, V> {
  private readonly index = new Map<K, number>()
  private keys: Array<K | undefined> = []
  private values: Array<V | undefined> = []
  private next = newInt32Array(FIRST_CAPACITY)
  private prev = newInt32Array(FIRST_CAPACITY)
  /** The least recently used slot, or `NONE`. */
  private first = NONE
  /** The most recently used slot, or `NONE`. */
  private last = NONE
  /** The first free slot, or `NONE`; free slots chain through `next`. */
  private free = NONE
  /** How many slots have been handed out, free or not. */
  private used = 0

  get size(): number {
    return this.index.size
  }

  /** The slot of `key` (already normalised), or `undefined`. One native call. */
  find(key: K): number | undefined {
    return this.index.get(key)
  }

  valueAt(slot: number): V {
    return this.values[slot] as V
  }

  /** Writes `value` to `slot` and moves it to the back; returns whether it moved. */
  write(slot: number, value: V): boolean {
    this.values[slot] = value
    return this.access(slot)
  }

  /** Moves `slot` to the back. Returns `false`, changing nothing, when it is already last. */
  access(slot: number): boolean {
    if (slot === this.last) return false
    this.unlink(slot)
    this.linkLast(slot)
    return true
  }

  /** Adds a mapping of `key` (absent, already normalised) at the back. */
  add(key: K, value: V): void {
    let slot = this.free
    if (slot !== NONE) {
      this.free = this.next[slot] as number
    } else {
      slot = this.used++
      if (slot === this.next.length) this.grow()
    }
    this.keys[slot] = key
    this.values[slot] = value
    this.index.set(key, slot)
    this.linkLast(slot)
  }

  /**
   * Removes the first mapping, queues it on `queue` when given, and gives its slot to a new mapping
   * of `key` (absent, already normalised) at the back. The layout must not be empty.
   */
  recycleFirst(key: K, value: V, queue: EvictionQueue<K, V> | undefined): void {
    const slot = this.first
    const evicted = this.keys[slot] as K
    if (queue !== undefined) queue.push(evicted, this.values[slot] as V)
    this.index.delete(evicted)
    this.unlink(slot)
    this.keys[slot] = key
    this.values[slot] = value
    this.index.set(key, slot)
    this.linkLast(slot)
  }

  /** Removes the mapping of `key` (already normalised) and frees its slot; returns whether it was there. */
  remove(key: K): boolean {
    const slot = this.index.get(key)
    if (slot === undefined) return false
    this.index.delete(key)
    this.unlink(slot)
    // Nothing keeps the removed key or value alive.
    this.keys[slot] = undefined
    this.values[slot] = undefined
    this.next[slot] = this.free
    this.free = slot
    return true
  }

  /** Removes every mapping and returns to the first capacity. */
  clear(): void {
    this.index.clear()
    this.keys = []
    this.values = []
    this.next = newInt32Array(FIRST_CAPACITY)
    this.prev = newInt32Array(FIRST_CAPACITY)
    this.first = this.last = this.free = NONE
    this.used = 0
  }

  /** A table of the mappings, in order, in access order. No user calls. Time: O(n). */
  toTable(equality: HashEquality<K>): LinkedHashTable<K, V> {
    const table = new LinkedHashTable<K, V>(equality, undefined, true)
    const keys = this.keys
    for (let slot = this.first; slot !== NONE; slot = this.next[slot] as number) {
      const key = keys[slot] as K
      table.insert(key, key, this.values[slot] as V, false)
    }
    return table
  }

  private linkLast(slot: number): void {
    const last = this.last
    this.prev[slot] = last
    this.next[slot] = NONE
    if (last === NONE) this.first = slot
    else this.next[last] = slot
    this.last = slot
  }

  private unlink(slot: number): void {
    const before = this.prev[slot] as number
    const after = this.next[slot] as number
    if (before === NONE) this.first = after
    else this.next[before] = after
    if (after === NONE) this.last = before
    else this.prev[after] = before
  }

  /** Doubles the capacity of the link arrays. */
  private grow(): void {
    const old = this.next.length
    const next = newInt32Array(old * 2)
    const prev = newInt32Array(old * 2)
    for (let i = 0; i < old; i++) {
      next[i] = this.next[i] as number
      prev[i] = this.prev[i] as number
    }
    this.next = next
    this.prev = prev
  }
}
