import { afterEach, beforeEach } from 'vitest'
import { setHashSeedForTesting } from '../../src/internal/hashing'

/** The seed every hashing test runs under, so results are the same on every run. */
export const TEST_SEED = 0x2026_1112

/** Fixes the hash seed for each test in the calling file and releases it afterwards. */
export function fixHashSeed(seed: number = TEST_SEED): void {
  beforeEach(() => setHashSeedForTesting(seed))
  afterEach(() => setHashSeedForTesting(undefined))
}
