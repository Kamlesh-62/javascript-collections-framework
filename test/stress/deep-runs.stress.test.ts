import { describe, it } from 'vitest'
import type { RunTuning } from '../support/reference-model'
import { DEEP, RUNS, type StressRun } from './config'
import { deepTitle, replayOnFailure, runStress } from './runs'
import { withSeeds } from './target'

function deepTuning(run: StressRun): RunTuning {
  return {
    checkEvery: DEEP.checkEvery,
    maxOpen: DEEP.maxOpen,
    marks: { high: run.high, low: run.low, cycles: run.cycles },
  }
}

// One test per run and seed, so a failure names both and `-t` replays exactly one.
describe('deep random runs', () => {
  for (const run of RUNS) {
    for (let seed = 1; seed <= DEEP.seeds; seed++) {
      it(`${deepTitle(run, seed)} matches its reference model at every step, crossing the size marks with iterators held open [033 S2-AC1] [033 S2-AC5] [033 S3-AC1]`, () =>
        replayOnFailure(run, seed, () =>
          withSeeds(seed, () => runStress(run, seed, DEEP.steps, deepTuning(run))),
        ))
    }
  }
})
