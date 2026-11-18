import { describe, expect, it } from 'vitest'
import { ArrayList, HashSet } from '../src/index'
import type { List } from '../src/interfaces/list'
import { DEEP, FAST, RUNS, type StressRun } from './stress/config'
import { REGRESSIONS } from './stress/regressions'
import { replayCommand, replayOnFailure, runStress } from './stress/runs'
import { withSeeds } from './stress/target'
import type { RunTuning } from './support/reference-model'
import { runListReferenceModel, runReferenceModel } from './support/reference-model'

/** The deep-run tuning with the fast subset's lower marks and denser checks. */
function fastTuning(run: StressRun): RunTuning {
  return {
    checkEvery: FAST.checkEvery,
    maxOpen: DEEP.maxOpen,
    marks: {
      high: Math.min(run.high, FAST.high),
      low: Math.min(run.low, FAST.low),
      cycles: FAST.cycles,
    },
  }
}

/** Wraps `target` so that `name` is replaced by `replacement` and every other method stays bound. */
function replacing<T extends object>(target: T, name: PropertyKey, replacement: unknown): T {
  return new Proxy(target, {
    get(t, property) {
      if (property === name) return replacement
      const value = Reflect.get(t, property, t)
      return typeof value === 'function' ? value.bind(t) : value
    },
  })
}

function messageOf(body: () => void): string {
  try {
    body()
  } catch (error) {
    return (error as Error).message
  }
  return ''
}

describe('deep random runs — the fast subset', () => {
  for (const run of RUNS) {
    it(`matches its reference model on the fixed seeds, crossing the size marks, with iterators held open (${run.name}) [033 S2-AC3] [033 S2-AC5]`, async () => {
      for (let seed = 1; seed <= FAST.seeds; seed++) {
        await withSeeds(seed, () => runStress(run, seed, FAST.steps, fastTuning(run)))
      }
    }, 60_000) // Room for a slow CI runner; a hung run fails instead of blocking the suite.
  }

  it('covers every reference model [033 S2-AC3]', () => {
    expect(new Set(RUNS.map((r) => r.model))).toEqual(
      new Set([
        'list',
        'deque',
        'priority-queue',
        'set',
        'map',
        'sorted-set',
        'sorted-map',
        'sequenced-set',
        'sequenced-map',
        'lru',
      ]),
    )
    expect(new Set(RUNS.map((r) => r.name)).size).toBe(RUNS.length)
  })
})

describe('deep random runs — failures and replay', () => {
  const drifting = (): List<number> => {
    const list = new ArrayList<number>()
    return replacing(list, 'get', (i: number) => list.get(i) + (list.size > 5 ? 1000 : 0))
  }
  const tuning: RunTuning = { checkEvery: 50, maxOpen: 4 }

  it('names the seed, step and operation of a divergence and shows both results [033 S2-AC2]', () => {
    const message = messageOf(() =>
      runListReferenceModel({ seed: 7, steps: 2_000, make: drifting, tuning }),
    )
    expect(message).toMatch(/list reference model seed 7 step \d+ op get/)
    const [, received, expected] = /expected (\d+) to be (\d+)/.exec(message) ?? []
    expect(Number(received)).toBe(Number(expected) + 1000)
  })

  it('reproduces the same failure from the same seed [033 S2-AC2]', () => {
    const first = messageOf(() =>
      runListReferenceModel({ seed: 7, steps: 2_000, make: drifting, tuning }),
    )
    const second = messageOf(() =>
      runListReferenceModel({ seed: 7, steps: 2_000, make: drifting, tuning }),
    )
    expect(first).not.toBe('')
    expect(second).toBe(first)
  })

  it('prints a replay command for one run and one seed against the source [033 S2-AC2]', () => {
    const run = RUNS[0] as StressRun
    expect(replayCommand(run, 3)).toBe(
      `pnpm test:stress --project src -t "deep random runs ${run.name} seed 3:"`,
    )
  })

  it('adds the replay command to the error of a failing run, whichever build it ran against [033 S3-AC2]', async () => {
    const run = RUNS[0] as StressRun
    let message = ''
    try {
      await replayOnFailure(run, 9, async () => {
        runListReferenceModel({ seed: 9, steps: 2_000, make: drifting, tuning })
      })
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toMatch(/list reference model seed 9 step \d+ op get/)
    expect(message).toContain(`Replay this seed against the source: ${replayCommand(run, 9)}`)
  })

  it('fails when an iterator held open over a fail-fast list survives a structural change [033 S2-AC5]', () => {
    const snapshotting = (): List<number> => {
      const list = new ArrayList<number>()
      return replacing(list, Symbol.iterator, () => list.toArray()[Symbol.iterator]())
    }
    const message = messageOf(() =>
      runListReferenceModel({ seed: 3, steps: 2_000, make: snapshotting, tuning }),
    )
    expect(message).toContain('a held iterator opened before a structural change')
  })

  it('fails when an iterator of a live set does not see later changes [033 S2-AC5]', () => {
    const snapshotting = () => {
      const set = new HashSet<number>()
      return replacing(set, Symbol.iterator, () => set.toArray()[Symbol.iterator]())
    }
    const message = messageOf(() =>
      runReferenceModel({ seed: 3, steps: 2_000, model: 'set', make: snapshotting, tuning }),
    )
    expect(message).toMatch(/reference model seed 3 step \d+ op step/)
  })
})

describe('deep random runs — regression seeds', () => {
  it('replays every seed that has found a bug, each naming a configured run [033 S2-AC4]', async () => {
    const names = new Set(RUNS.map((r) => r.name))
    // A fixed sample goes through the same path, so the replay is exercised while the list is empty.
    const sample = { run: (RUNS[0] as StressRun).name, seed: 1, steps: 200 }
    let replayed = 0
    for (const entry of [sample, ...REGRESSIONS]) {
      expect(names.has(entry.run), entry.run).toBe(true)
      const run = RUNS.find((r) => r.name === entry.run) as StressRun
      await withSeeds(entry.seed, () =>
        runStress(run, entry.seed, entry.steps, { checkEvery: 1, maxOpen: DEEP.maxOpen }),
      )
      replayed++
    }
    expect(replayed).toBe(REGRESSIONS.length + 1)
  })
})
