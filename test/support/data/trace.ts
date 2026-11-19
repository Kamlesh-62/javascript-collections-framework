// A seeded access trace with a skewed (Zipf-like) key distribution. The weights are integers, so
// the trace is the same on every engine: no `Math.pow` or `Math.log`.

import { integer, seeded } from '../random'

/** Cumulative integer weights: rank `k` (from 0) weighs ⌊2²⁰ / (k + 1)⌋. */
export function zipfWeights(ranks: number): number[] {
  const out: number[] = new Array(ranks)
  let total = 0
  for (let k = 0; k < ranks; k++) {
    total += Math.floor(1_048_576 / (k + 1))
    out[k] = total
  }
  return out
}

/** Draws a rank from cumulative `weights`. */
export function zipfIndex(weights: readonly number[], random: () => number): number {
  const target = integer(random, 0, (weights[weights.length - 1] as number) - 1)
  let low = 0
  let high = weights.length - 1
  while (low < high) {
    const mid = (low + high) >>> 1
    if ((weights[mid] as number) > target) high = mid
    else low = mid + 1
  }
  return low
}

/** One call of the trace. */
export type Access =
  | { readonly op: 'get'; readonly key: string }
  | { readonly op: 'has'; readonly key: string }
  | { readonly op: 'delete'; readonly key: string }

/**
 * `length` calls over `keys` distinct keys: mostly `get` (a miss is followed by `set`), with `has`
 * probes and `delete` invalidations. Keys are strings, so their ranks are not their order.
 */
export function accessTrace(length: number, keys: number, seed: number): Access[] {
  const random = seeded(seed)
  const weights = zipfWeights(keys)
  const out: Access[] = new Array(length)
  for (let i = 0; i < length; i++) {
    const key = `k${zipfIndex(weights, random) * 7919}`
    const roll = integer(random, 0, 99)
    out[i] = roll < 80 ? { op: 'get', key } : roll < 92 ? { op: 'has', key } : { op: 'delete', key }
  }
  return out
}
