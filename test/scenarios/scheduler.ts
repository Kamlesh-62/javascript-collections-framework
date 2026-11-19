// A discrete-event scheduler driven by a priority queue: events with tied times, re-scheduled by
// deleting the queued event and adding a new one, against a reference that sorts by time and then
// by sequence number.

import { PriorityQueue } from '../../src/index'
import type { WorkloadSizes } from '../stress/config'
import { eventLog } from '../support/data/events'
import { integer, seeded } from '../support/random'
import { same } from './check'

/** A queued event. Queued events are never changed: re-scheduling replaces the object. */
interface Scheduled {
  readonly id: number
  readonly time: number
  readonly seq: number
}

const byTimeThenSeq = (a: Scheduled, b: Scheduled): number =>
  a.time !== b.time ? a.time - b.time : a.seq - b.seq

/** The index where `s` belongs in `sorted`, which is sorted by time and then sequence. */
function place(sorted: readonly Scheduled[], s: Scheduled): number {
  let low = 0
  let high = sorted.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (byTimeThenSeq(sorted[mid] as Scheduled, s) < 0) low = mid + 1
    else high = mid
  }
  return low
}

export function run(sizes: WorkloadSizes, seed: number): void {
  const log = eventLog(sizes.events, seed)
  const random = seeded(seed ^ 0x7363_6864)
  // The queue's own order of equal elements is unspecified, so it gets the full comparator.
  const queue = new PriorityQueue<Scheduled>({ comparator: byTimeThenSeq })
  /** The reference: the pending events, kept sorted by time and then sequence number. */
  const sorted: Scheduled[] = []
  let seq = 0
  let next = 0
  let dispatched = 0

  const schedule = (id: number, time: number) => {
    const s = { id, time, seq: seq++ }
    queue.add(s)
    sorted.splice(place(sorted, s), 0, s)
  }
  // A third of the events start queued; the rest are added as the clock advances.
  const initial = Math.ceil(log.length / 3)
  while (next < initial) {
    const e = log[next++] as (typeof log)[number]
    schedule(e.id, e.time)
  }

  while (sorted.length > 0 || next < log.length) {
    const roll = integer(random, 0, 9)
    if ((roll < 3 || sorted.length === 0) && next < log.length) {
      const e = log[next++] as (typeof log)[number]
      schedule(e.id, e.time)
    } else if (roll < 4) {
      // Re-schedule a pending event: delete the queued object, add a new one with a new sequence.
      const index = integer(random, 0, sorted.length - 1)
      const old = sorted[index] as Scheduled
      same(queue.delete(old), true, `re-schedule ${old.id}`)
      sorted.splice(index, 1)
      schedule(old.id, old.time + integer(random, -1, 3) * 250)
    } else {
      const expected = sorted.shift() as Scheduled
      same(queue.poll(), expected, `dispatch ${dispatched}`)
      dispatched++
    }
    same(queue.size, sorted.length, `size after ${dispatched} dispatches`)
  }
  same(dispatched, log.length, 'dispatched')
  same(queue.poll(), undefined, 'empty queue')
}
