// A seeded event log: timestamps in milliseconds with many ties, as a log of real events has.

import { integer, seeded } from '../random'

/** One logged event. */
export interface LoggedEvent {
  readonly id: number
  readonly time: number
  readonly kind: string
}

/** 2023-11-14T22:13:20.000Z: the first timestamp of every log. */
export const EPOCH = 1_700_000_000_000

const KINDS = ['open', 'read', 'write', 'close', 'error'] as const

/** `count` events whose times fall on a grid of about `count / 4` instants, so many share one. */
export function eventLog(count: number, seed: number): LoggedEvent[] {
  const random = seeded(seed)
  const instants = Math.max(1, Math.floor(count / 4))
  const out: LoggedEvent[] = new Array(count)
  for (let id = 0; id < count; id++) {
    out[id] = {
      id,
      time: EPOCH + integer(random, 0, instants - 1) * 1_000 + integer(random, 0, 1) * 250,
      kind: KINDS[integer(random, 0, KINDS.length - 1)] as string,
    }
  }
  return out
}
