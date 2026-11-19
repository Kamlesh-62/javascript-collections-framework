// A seeded event log in two sorted maps, one keyed by milliseconds and one by `Date`, queried by
// ranges and nearest matches against a sorted array with the same bounds.

import { type MapEntry, type SortedMap, TreeMap } from '../../src/index'
import type { WorkloadSizes } from '../stress/config'
import { EPOCH, eventLog, type LoggedEvent } from '../support/data/events'
import { integer, seeded } from '../support/random'
import { same, sameSequence } from './check'

/** Queries of each kind per run. */
const QUERIES = 200

interface Bounds {
  readonly from?: number | undefined
  readonly fromInclusive?: boolean | undefined
  readonly to?: number | undefined
  readonly toInclusive?: boolean | undefined
}

/** The number of `times` less than `t` (`orEqual`: less than or equal). */
function count(times: readonly number[], t: number, orEqual: boolean): number {
  let low = 0
  let high = times.length
  while (low < high) {
    const mid = (low + high) >>> 1
    const x = times[mid] as number
    if (x < t || (orEqual && x === t)) low = mid + 1
    else high = mid
  }
  return low
}

/** The reference: the sorted distinct times inside `bounds`. */
function inRange(times: readonly number[], b: Bounds): number[] {
  const start = b.from === undefined ? 0 : count(times, b.from, b.fromInclusive === false)
  const end = b.to === undefined ? times.length : count(times, b.to, b.toInclusive === true)
  return times.slice(start, Math.max(start, end))
}

function floor(times: readonly number[], t: number): number | undefined {
  const n = count(times, t, true)
  return n === 0 ? undefined : times[n - 1]
}

function ceiling(times: readonly number[], t: number): number | undefined {
  const n = count(times, t, false)
  return n === times.length ? undefined : times[n]
}

function checkView<K>(
  view: SortedMap<K, LoggedEvent[]>,
  expected: readonly number[],
  time: (k: K) => number,
  byTime: Map<number, LoggedEvent[]>,
  at: string,
): void {
  same(view.size, expected.length, `${at} size`)
  let i = 0
  for (const [k, events] of view) {
    // The message is built only on a mismatch: views here hold many entries.
    if (time(k) !== expected[i] || events !== byTime.get(expected[i] as number)) {
      same(time(k), expected[i], `${at} key ${i}`)
      same(events, byTime.get(expected[i] as number), `${at} events ${i}`)
    }
    i++
  }
  same(i, expected.length, `${at} iterated`)
}

function checkEntry<K>(
  entry: MapEntry<K, LoggedEvent[]> | undefined,
  expected: number | undefined,
  time: (k: K) => number,
  at: string,
): void {
  same(entry === undefined ? undefined : time(entry.key), expected, at)
}

export function run(sizes: WorkloadSizes, seed: number): void {
  const log = eventLog(sizes.events, seed)
  const byMs = new TreeMap<number, LoggedEvent[]>()
  const byDate = new TreeMap<Date, LoggedEvent[]>()
  const reference = new Map<number, LoggedEvent[]>()
  const firstDate = new Map<number, Date>()
  for (const event of log) {
    byMs.getOrInsertComputed(event.time, () => []).push(event)
    const date = new Date(event.time)
    if (!firstDate.has(event.time)) firstDate.set(event.time, date)
    byDate.getOrInsertComputed(date, () => []).push(event)
    const list = reference.get(event.time)
    if (list === undefined) reference.set(event.time, [event])
    else list.push(event)
  }
  const times = [...reference.keys()].sort((a, b) => a - b)
  const ms = (k: number) => k
  const dt = (k: Date) => k.getTime()

  same(byMs.size, times.length, 'milliseconds size')
  same(byDate.size, times.length, 'dates size')
  let i = 0
  for (const [k, events] of byMs) {
    same(k, times[i], `milliseconds key ${i}`)
    sameSequence(events, reference.get(k) as LoggedEvent[], `milliseconds events ${i}`)
    i++
  }
  i = 0
  for (const [k, events] of byDate) {
    // Dates with equal time are one key, and the first `Date` object for a time is kept.
    same(k, firstDate.get(times[i] as number), `dates key ${i}`)
    sameSequence(events, reference.get(k.getTime()) as LoggedEvent[], `dates events ${i}`)
    i++
  }
  // Both maps hold the same event arrays as the reference, each built by `getOrInsertComputed`.
  const msLists = new Map<number, LoggedEvent[]>(byMs)
  const dateLists = new Map<number, LoggedEvent[]>()
  for (const [k, v] of byDate) dateLists.set(k.getTime(), v)

  const random = seeded(seed ^ 0x7175_6572)
  const span = (times[times.length - 1] as number) - EPOCH + 2_000
  // Probes fall on stored times and between them.
  const probe = () =>
    integer(random, 0, 1) === 0
      ? (times[integer(random, 0, times.length - 1)] as number)
      : EPOCH - 1_000 + integer(random, 0, span)
  const flag = () => (integer(random, 0, 2) === 0 ? undefined : integer(random, 0, 1) === 1)

  for (let q = 0; q < QUERIES; q++) {
    let from = probe()
    let to = probe()
    if (from > to) {
      const t = from
      from = to
      to = t
    }
    const fromInclusive = flag()
    const toInclusive = flag()
    const at = `query ${q}`
    const options =
      fromInclusive === undefined && toInclusive === undefined
        ? undefined
        : { fromInclusive, toInclusive }
    const sub = inRange(times, { from, fromInclusive, to, toInclusive })
    checkView(byMs.subMap(from, to, options), sub, ms, msLists, `${at} subMap`)
    checkView(
      byDate.subMap(new Date(from), new Date(to), options),
      sub,
      dt,
      dateLists,
      `${at} dates subMap`,
    )

    const inclusive = flag()
    const bound = inclusive === undefined ? undefined : { inclusive }
    const head = inRange(times, { to, toInclusive: inclusive })
    checkView(byMs.headMap(to, bound), head, ms, msLists, `${at} headMap`)
    checkView(byDate.headMap(new Date(to), bound), head, dt, dateLists, `${at} dates headMap`)
    const tail = inRange(times, { from, fromInclusive: inclusive })
    checkView(byMs.tailMap(from, bound), tail, ms, msLists, `${at} tailMap`)
    checkView(byDate.tailMap(new Date(from), bound), tail, dt, dateLists, `${at} dates tailMap`)

    const t = probe()
    checkEntry(byMs.floorEntry(t), floor(times, t), ms, `${at} floorEntry`)
    checkEntry(byMs.ceilingEntry(t), ceiling(times, t), ms, `${at} ceilingEntry`)
    checkEntry(byDate.floorEntry(new Date(t)), floor(times, t), dt, `${at} dates floorEntry`)
    checkEntry(byDate.ceilingEntry(new Date(t)), ceiling(times, t), dt, `${at} dates ceilingEntry`)
  }
}
