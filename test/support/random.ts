// A small seeded pseudo-random generator for deterministic tests: the same seed always yields the
// same sequence, so a failing run can be replayed from the seed in its message.

/** Returns a generator of floats in [0, 1) for `seed` (mulberry32). */
export function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Returns an integer in [min, max] drawn from `random`. */
export function integer(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1))
}

/** Returns one element of `items` drawn from `random`. */
export function pick<T>(random: () => number, items: readonly T[]): T {
  return items[integer(random, 0, items.length - 1)] as T
}
