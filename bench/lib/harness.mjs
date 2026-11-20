// A small benchmark harness: times a function in batches with a monotonic clock and reports the
// median rate and the spread of the batches. It reads no wall-clock date and takes the clock as an
// argument, so its arithmetic can be checked without timing anything.

/**
 * @typedef {object} Measurement
 * @property {number} hz - The median of the batches, in calls per second.
 * @property {number} rme - Half the range of the batches, as a percentage of the median.
 * @property {number[]} samples - Calls per second of each batch, in the order they ran.
 */

/**
 * The median and the spread of a list of rates.
 * @param {readonly number[]} rates - Calls per second of each batch; at least one.
 * @returns {{ hz: number, rme: number }}
 */
export function summarise(rates) {
  if (rates.length === 0) throw new RangeError('summarise: no samples')
  const sorted = [...rates].sort((a, b) => a - b)
  const at = (/** @type {number} */ i) => Number(sorted[i])
  const mid = sorted.length >> 1
  const hz = sorted.length % 2 === 1 ? at(mid) : (at(mid - 1) + at(mid)) / 2
  const spread = at(sorted.length - 1) - at(0)
  return { hz, rme: hz === 0 ? 0 : (spread / 2 / hz) * 100 }
}

/**
 * Times `fn`: calls it for `warmup` milliseconds, finds how many calls fill `minTime`
 * milliseconds, then takes `samples` batches of that many calls.
 * @param {() => unknown} fn - The work; its result is kept so that it cannot be optimised away.
 * @param {{ samples?: number, minTime?: number, warmup?: number }} [options]
 * @param {() => number} [now] - A monotonic clock in milliseconds.
 * @returns {Measurement}
 */
export function measure(fn, options = {}, now = () => performance.now()) {
  const samples = options.samples ?? 5
  const minTime = options.minTime ?? 100
  const warmup = options.warmup ?? 50
  if (!(samples >= 1) || !(minTime >= 0) || !(warmup >= 0))
    throw new RangeError('measure: samples must be at least 1, minTime and warmup at least 0')
  /** @type {unknown} */
  let sink
  const warmEnd = now() + warmup
  while (now() < warmEnd) sink = fn()
  // Grow the batch until one batch takes at least minTime (or a single call does).
  let calls = 1
  for (;;) {
    const start = now()
    for (let i = 0; i < calls; i++) sink = fn()
    if (now() - start >= minTime || calls >= 2 ** 30) break
    calls *= 2
  }
  /** @type {number[]} */
  const rates = []
  for (let s = 0; s < samples; s++) {
    const start = now()
    for (let i = 0; i < calls; i++) sink = fn()
    const elapsed = Math.max(now() - start, 1e-6)
    rates.push((calls / elapsed) * 1000)
  }
  keep(sink)
  return { ...summarise(rates), samples: rates }
}

/** @type {unknown} */
let kept
/** Holds on to a value so that the work that produced it is not dropped. @param {unknown} value */
function keep(value) {
  kept = value
}
/** The last value kept; read only so that `kept` is used. */
export const lastKept = () => kept

/**
 * A seeded generator of floats in [0, 1) (mulberry32): the same seed gives the same sequence.
 * @param {number} seed
 * @returns {() => number}
 */
export function seeded(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The integers 0 to n - 1 in a seeded order (Fisher–Yates).
 * @param {number} n
 * @param {number} seed
 * @returns {number[]}
 */
export function shuffled(n, seed) {
  const random = seeded(seed)
  const values = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const t = /** @type {number} */ (values[i])
    values[i] = /** @type {number} */ (values[j])
    values[j] = t
  }
  return values
}
