// The eviction queue of a size-bounded map with an eviction callback. Evicted mappings are queued
// while a call on the map runs and delivered by the outermost call when it ends, one callback call
// per mapping, in a loop: a call made on the map from inside the callback (or from any other of the
// map's callbacks) only adds to the queue, so nesting never grows the stack.

import { apply } from '../intrinsics'

/**
 * One map's queue of evicted mappings and the depth of the calls running on that map.
 *
 * Time: `push` O(1); delivery O(e) for `e` queued mappings, plus the callback calls.
 *
 * @internal
 */
export class EvictionQueue<K, V> {
  /** The calls on the map that are running, delivery included. */
  private depth = 0
  /** Keys and values of the queued mappings, flat: key, value, key, value, … */
  private readonly pending: unknown[] = []
  private readonly onEvict: (value: V, key: K, map: never) => void
  private readonly map: unknown

  /**
   * @param onEvict - Called once per evicted mapping, with `this` undefined.
   * @param map - The public map passed to `onEvict`.
   */
  constructor(onEvict: (value: V, key: K, map: never) => void, map: unknown) {
    this.onEvict = onEvict
    this.map = map
  }

  /** Queues an evicted mapping. */
  push(key: K, value: V): void {
    this.pending.push(key, value)
  }

  /**
   * Runs `body` as one call on the map. When it is the outermost call, the queue is delivered after
   * it, also when it throws (before its error propagates).
   */
  run<T>(body: () => T): T {
    this.depth++
    let result: T
    try {
      result = body()
    } catch (error) {
      this.leave(true)
      throw error
    }
    this.leave(false)
    return result
  }

  /**
   * Ends a call; the outermost one delivers the queue. An error from `onEvict` drops the rest of
   * the queue and propagates, unless the call failed itself (`failed`), whose error then wins.
   */
  private leave(failed: boolean): void {
    if (--this.depth > 0) return
    const pending = this.pending
    if (pending.length === 0) return
    this.depth++
    try {
      for (let read = 0; read < pending.length; read += 2) {
        const key = pending[read]
        const value = pending[read + 1]
        // Release each delivered pair at once, so a long re-entrant chain keeps nothing alive.
        pending[read] = undefined
        pending[read + 1] = undefined
        apply(this.onEvict, undefined, [value, key, this.map])
      }
    } catch (error) {
      if (!failed) throw error
    } finally {
      pending.length = 0
      this.depth--
    }
  }
}
