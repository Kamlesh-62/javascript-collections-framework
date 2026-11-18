// The library build the stress suites run against, and the seeding hooks for replaying a run.

import { seeded } from '../support/random'
import type { StressTarget } from './config'

function readTarget(): StressTarget {
  const value = process.env.STRESS_TARGET
  if (value === undefined || value === '' || value === 'src') return 'src'
  if (value === 'esm' || value === 'cjs') return value
  throw new Error(`stress: STRESS_TARGET must be src, esm or cjs, not ${value}`)
}

/** `src` (the default), or the built `esm` or `cjs` file the project aliases the entry to. */
export const TARGET: StressTarget = readTarget()

/**
 * Runs `body` with the hash seed and the per-table bucket seed source fixed from `seed`, then
 * releases them. Only on `src`: the hooks live in `src/internal`, and loading them in a build run
 * would mix a second copy of the library into it, so a build run uses its own random seeds (its
 * results do not depend on them).
 */
export async function withSeeds<T>(seed: number, body: () => T): Promise<T> {
  if (TARGET !== 'src') return body()
  const { setHashSeedForTesting } = await import('../../src/internal/hashing')
  const { setBucketSeedSourceForTesting } = await import('../../src/internal/engines/hash-table')
  const buckets = seeded(seed ^ 0x6275_636b)
  setHashSeedForTesting(seed ^ 0x6861_7368)
  setBucketSeedSourceForTesting(() => (buckets() * 4294967296) | 0)
  try {
    return body()
  } finally {
    setHashSeedForTesting(undefined)
    setBucketSeedSourceForTesting(undefined)
  }
}
