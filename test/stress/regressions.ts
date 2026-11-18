// Seeds that have found a bug. Every `pnpm test` replays each entry at its step count, so a fixed
// bug stays fixed. An entry names a run in `RUNS`, the seed, the steps the bug needed and what it
// found; the bug's fix also has its own regression test under the rule it broke.

export interface Regression {
  /** A run's `name` in `RUNS`. */
  readonly run: string
  readonly seed: number
  readonly steps: number
  /** What the seed found, in one line. */
  readonly found: string
}

export const REGRESSIONS: readonly Regression[] = []
