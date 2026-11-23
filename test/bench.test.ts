import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  benchCases,
  LINEAR_LIMIT,
  LOOKUPS,
  lookupKeys,
  lowerBound,
  OPS,
  SIZES,
} from '../bench/lib/cases.mjs'
import { measure, seeded, shuffled, summarise } from '../bench/lib/harness.mjs'
import {
  BENCH_END,
  BENCH_START,
  type BenchResult,
  benchSectionProblems,
  formatRate,
  formatRatio,
  latestResult,
  NO_RUN,
  RESULTS_DIR,
  renderBenchSection,
  resultFile,
  runInfo,
  runOrder,
  sortCases,
  withBenchSection,
} from '../bench/lib/results.mjs'
import * as lib from '../src/index'

const ROOT = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

const COLLECTIONS = [
  'ArrayDeque',
  'ArrayList',
  'HashMap',
  'HashSet',
  'LinkedHashMap',
  'LinkedHashSet',
  'LinkedList',
  'PriorityQueue',
  'TreeMap',
  'TreeSet',
]

/** A clock that moves only when the measured function runs: each call takes `cost` milliseconds. */
function fakeWork(cost: number) {
  let t = 0
  let calls = 0
  return {
    now: () => t,
    fn: () => {
      calls++
      t += cost
      return calls
    },
    calls: () => calls,
  }
}

describe('the benchmark harness', () => {
  it('takes the median and half the range of the samples, as a percentage [041 S1-AC2]', () => {
    expect(summarise([10])).toEqual({ hz: 10, rme: 0 })
    expect(summarise([12, 8, 10])).toEqual({ hz: 10, rme: 20 })
    expect(summarise([8, 12, 10, 10])).toEqual({ hz: 10, rme: 20 })
    expect(summarise([0, 0])).toEqual({ hz: 0, rme: 0 })
    expect(() => summarise([])).toThrow(RangeError)
  })

  it('warms up, then times the requested number of batches with the given clock [041 S1-AC2]', () => {
    const work = fakeWork(0.5)
    const m = measure(work.fn, { samples: 7, minTime: 4, warmup: 3 }, work.now)
    // 0.5 ms a call: 6 warm-up calls, batches grow 1, 2, 4, 8 calls until one lasts 4 ms, then
    // seven batches of 8 calls, each at 2,000 calls a second.
    expect(m.samples).toEqual(Array(7).fill(2_000))
    expect(m.hz).toBe(2_000)
    expect(m.rme).toBe(0)
    expect(work.calls()).toBe(6 + 1 + 2 + 4 + 8 + 7 * 8)
    expect(() => measure(work.fn, { samples: 0 }, work.now)).toThrow(RangeError)
    expect(() => measure(work.fn, { minTime: -1 }, work.now)).toThrow(RangeError)
  })

  it('draws the same seeded input every time [041 S1-AC2]', () => {
    const a = seeded(7)
    const b = seeded(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(shuffled(50, 3)).toEqual(shuffled(50, 3))
    expect(shuffled(50, 3)).not.toEqual(shuffled(50, 4))
    expect([...shuffled(50, 3)].sort((x, y) => x - y)).toEqual(
      Array.from({ length: 50 }, (_, i) => i),
    )
    expect(lowerBound([1, 3, 5], 0)).toBe(0)
    expect(lowerBound([1, 3, 5], 3)).toBe(1)
    expect(lowerBound([1, 3, 5], 4)).toBe(2)
    expect(lowerBound([1, 3, 5], 6)).toBe(3)
  })
})

describe('the benchmark cases', () => {
  it('compare all ten collections with a native structure at three sizes, on their main operations [041 S1-AC1]', () => {
    expect(SIZES).toEqual([1_000, 100_000, 1_000_000])
    const cases = benchCases(lib, 1_000)
    expect([...new Set(cases.map((c) => c.collection))].sort()).toEqual(COLLECTIONS)
    const operations = (name: string) =>
      cases.filter((c) => c.collection === name).map((c) => c.operation)
    // Every collection is measured adding and removing; lists, sets and maps also looking up and
    // iterating; queues iterating where they can be iterated in order.
    const kinds = {
      add: /^add|^set|^build/,
      lookup: /^get|^has|floor|ceiling/,
      remove: /^delete|^remove|^take/,
      iterate: /^iterate$/,
    }
    const needs: Record<string, (keyof typeof kinds)[]> = {
      ArrayDeque: ['add', 'remove', 'iterate'],
      LinkedList: ['add', 'remove', 'iterate'],
      PriorityQueue: ['add', 'remove'],
    }
    for (const name of COLLECTIONS) {
      for (const kind of needs[name] ?? (['add', 'lookup', 'remove', 'iterate'] as const)) {
        expect(
          operations(name).some((op) => kinds[kind].test(op)),
          `${name} ${kind}`,
        ).toBe(true)
      }
    }
    expect(operations('TreeMap')).toEqual(
      expect.arrayContaining([
        'build from entries',
        'get',
        'floor entry',
        'delete and set again',
        'iterate',
      ]),
    )
    expect(operations('TreeSet')).toEqual(
      expect.arrayContaining(['ceiling', 'floor', 'has', 'add one by one']),
    )
    expect(operations('PriorityQueue')).toEqual(expect.arrayContaining(['take the least, add one']))
    expect(operations('LinkedHashMap')).toEqual(
      expect.arrayContaining(['get in access order (LRU)']),
    )
    expect(operations('HashMap')).toEqual(
      expect.arrayContaining(['get by value with the key option']),
    )
    for (const c of cases) {
      expect(c.native.name, `${c.collection} ${c.operation}`).toMatch(/Array|Map|Set/)
    }
  })

  it('give every side of every case its own run function with its own loop, sharing no iteration helper [044 S1-AC1]', () => {
    const cases = benchCases(lib, 1_000)
    const runs = cases.flatMap((c) => [c.native.run, c.library.run])
    expect(new Set(runs).size).toBe(cases.length * 2)
    // One function literal in the source per side: no helper or factory hands out a run.
    const source = read('bench/lib/cases.mjs')
    expect(source.match(/\brun:/g)?.length).toBe(cases.length * 2)
    expect(source.match(/\brun: \((?:\w+)?\) =>/g)?.length).toBe(cases.length * 2)
    expect(source).not.toMatch(/\bconst sum\b|=> \{\s*return \(\w+\) =>/)
    for (const c of cases) {
      for (const run of [c.native.run, c.library.run]) {
        const text = run.toString()
        expect(text, `${c.collection} ${c.operation}`).not.toMatch(/\bsum\(|sortedInsert/)
        if (c.operation === 'iterate' || c.ops !== c.size) expect(text).toMatch(/for \(/)
      }
    }
  })

  it('read min(n, 10,000) distinct present keys in a seeded order in lookups, and OPS operations in updates [044 S1-AC2]', () => {
    expect(LOOKUPS).toBe(10_000)
    expect(OPS).toBe(1_000)
    const lookup = /^get|^has|floor|ceiling/
    for (const n of [10, 1_000, 20_000]) {
      const keys = lookupKeys(n, 3)
      expect(keys).toHaveLength(Math.min(n, LOOKUPS))
      expect(new Set(keys).size).toBe(keys.length)
      expect(keys.every((k) => Number.isInteger(k) && k >= 0 && k < n)).toBe(true)
      expect(lookupKeys(n, 3)).toEqual(keys)
      for (const c of benchCases(lib, n)) {
        const name = `${c.collection} ${c.operation} at ${n}`
        if (
          c.operation === 'iterate' ||
          /^build|^add at the end|one by one|^set new/.test(c.operation)
        )
          expect(c.ops, name).toBe(n)
        else if (lookup.test(c.operation)) expect(c.ops, name).toBe(Math.min(n, LOOKUPS))
        else expect(c.ops, name).toBe(Math.min(n, OPS))
      }
    }
    // The native side of a lookup reads exactly those keys, in that order; the library side
    // returns the same checksum.
    const n = 20_000
    const get = benchCases(lib, n, 9).find(
      (c) => c.collection === 'HashMap' && c.operation === 'get',
    )
    if (get === undefined) throw new Error('no HashMap get case')
    const state = get.native.setup()
    const spy = vi.spyOn(Map.prototype, 'get')
    try {
      get.native.run(state)
      expect(spy.mock.calls.map((call) => call[0])).toEqual(lookupKeys(n, 10))
    } finally {
      spy.mockRestore()
    }
    expect(get.library.run(get.library.setup())).toBe(get.native.run(state))
    // Queries between stored keys use the same count.
    const floor = benchCases(lib, n).find((c) => c.operation === 'floor entry')
    expect(floor?.ops).toBe(LOOKUPS)
  })

  it('run the same work on both sides: each case returns the same checksum for the library and the native structure [041 S1-AC1]', () => {
    for (const size of [10, 1_000]) {
      for (const c of benchCases(lib, size, 5)) {
        const native = c.native.setup()
        const library = c.library.setup()
        // Twice, so that the steady-state cases are checked after a pass has changed them.
        for (let pass = 0; pass < 2; pass++) {
          expect(c.library.run(library), `${c.collection} ${c.operation} at ${size}`).toBe(
            c.native.run(native),
          )
        }
      }
    }
  })

  it('leave out native baselines that cost O(n) per operation above 100,000 elements [041 S1-AC1]', () => {
    expect(LINEAR_LIMIT).toBe(100_000)
    const small = benchCases(lib, 100, 1)
    const large = benchCases(lib, 200_000, 1)
    const linear = small.filter((c) => /shift|unshift|splice|insert/.test(c.native.name))
    expect(linear.length).toBeGreaterThan(0)
    for (const c of linear) {
      expect(large.some((l) => l.collection === c.collection && l.operation === c.operation)).toBe(
        false,
      )
    }
    expect(large.length).toBe(small.length - linear.length)
  }, 30_000)
})

describe('the benchmark results', () => {
  const info = {
    date: '2026-11-20',
    node: 'v24.11.1',
    platform: 'darwin',
    cpu: 'Test CPU',
    cores: 8,
    memoryGb: 16,
    version: '0.1.1',
  }
  const result: BenchResult = {
    info,
    sizes: [1_000],
    cases: [
      {
        collection: 'TreeMap',
        operation: 'get',
        size: 1_000,
        native: { name: 'Map get', hz: 2e7, rme: 1.4 },
        library: { hz: 5e6, rme: 2.6 },
      },
      {
        collection: 'HashMap',
        operation: 'get',
        size: 1_000,
        native: { name: 'Map get', hz: 2e7, rme: 1 },
        library: { hz: 1.5e7, rme: 3 },
      },
    ],
  }

  it('record the machine, runtime, version and UTC date, and nothing about the user [041 S1-AC2]', () => {
    const run = runInfo('0.1.1', new Date('2026-11-20T23:30:00-05:00'))
    expect(run.date).toBe('2026-11-21')
    expect(run.node).toBe(process.version)
    expect(run.version).toBe('0.1.1')
    expect(Object.keys(run).sort()).toEqual([
      'cores',
      'cpu',
      'date',
      'memoryGb',
      'node',
      'order',
      'platform',
      'version',
    ])
    expect(run.order).toBe('native-first')
    expect(resultFile(info)).toBe(`${RESULTS_DIR}/2026-11-20-node-24.json`)
    expect(sortCases(result.cases).map((c) => c.collection)).toEqual(['HashMap', 'TreeMap'])
    expect([formatRate(1.23e9), formatRate(4.567e6), formatRate(45_600), formatRate(789)]).toEqual([
      '1.23 G',
      '4.57 M',
      '45.6 k',
      '789',
    ])
    expect([formatRatio(0.4512), formatRatio(7), formatRatio(99.4), formatRatio(1_312.6)]).toEqual([
      '0.45×',
      '7.0×',
      '99×',
      '1,313×',
    ])
  })

  it('render into the performance page between markers, and the check fails when the page differs [041 S1-AC3]', () => {
    const section = renderBenchSection(result)
    expect(section).toContain(
      'Run on 2026-11-20 with Node.js v24.11.1 on darwin, Test CPU (8 cores, 16 GB), version 0.1.1',
    )
    expect(section.indexOf('### HashMap')).toBeLessThan(section.indexOf('### TreeMap'))
    expect(section).toContain('| get | 1,000 | Map get | 20.0 M ±1 % | 5.00 M ±3 % | 0.25× |')
    const page = `# P\n\n${BENCH_START}\n${NO_RUN}\n${BENCH_END}\n`
    expect(benchSectionProblems(page, undefined)).toEqual([])
    expect(benchSectionProblems(page, result)).toEqual([
      'the benchmark section does not match the newest result: run `pnpm bench:docs`',
    ])
    const updated = withBenchSection(page, section)
    expect(benchSectionProblems(updated, result)).toEqual([])
    expect(withBenchSection(updated, section)).toBe(updated)
    // A formatter's table alignment does not count as a difference.
    const aligned = updated
      .replace('| get | 1,000 |', '| get       |   1,000 |')
      .replace('| --- | --: |', '| ------ | ----: |')
    expect(aligned).not.toBe(updated)
    expect(benchSectionProblems(aligned, result)).toEqual([])
    expect(benchSectionProblems(updated.replace('5.00 M', '5.10 M'), result)).toHaveLength(1)
    // A row whose batches spread over 100 % shows no ratio.
    const noisy = renderBenchSection({
      ...result,
      cases: [
        { ...(result.cases[0] as BenchResult['cases'][number]), library: { hz: 1, rme: 150 } },
      ],
    })
    expect(noisy).toContain('| unstable |')
    expect(benchSectionProblems('# P\n', result)).toEqual([
      `the page has no ${BENCH_START} … ${BENCH_END} section`,
    ])
    expect(() => withBenchSection('# P\n', section)).toThrow()
  })

  it('show the newest committed run on the performance page, with the method and the indicative note [041 S1-AC3]', () => {
    const page = read('docs/performance.md')
    expect(benchSectionProblems(page, latestResult(join(ROOT, RESULTS_DIR))?.result)).toEqual([])
    const section = page.slice(page.indexOf('## Benchmarks'))
    expect(section).toContain('fixed seed')
    expect(section).toContain('median of five timed batches')
    expect(section).toContain('The figures are indicative')
    const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>
    expect(scripts.bench).toBe('node bench/run.mjs')
    expect(scripts['bench:docs']).toBe('node bench/docs.mjs update')
    expect(scripts['bench:check']).toBe('node bench/docs.mjs check')
    expect(scripts.check).toContain('pnpm bench:check')
    expect(scripts.check).not.toMatch(/pnpm bench( |$|:tree)/)
  })

  it('time the library side first when the runner is given --library-first, and record the order [044 S1-AC3]', () => {
    expect(runOrder([])).toBe('native-first')
    expect(runOrder(['--sizes', '100000'])).toBe('native-first')
    expect(runOrder(['--library-first'])).toBe('library-first')
    expect(runOrder(['--sizes', '1000', '--library-first'])).toBe('library-first')
    expect(runInfo('0.1.1', new Date(0), 'library-first').order).toBe('library-first')
    const run = read('bench/run.mjs')
    expect(run).toContain('const order = runOrder(args)')
    expect(run).toMatch(
      /if \(order === 'library-first'\) \{\s*library = timed\(c\.library\)\s*nativeRate = timed\(c\.native\)/,
    )
    expect(run).toContain('runInfo(version, new Date(), order)')
  })

  it('are smoke-run in CI once per case, with nothing timed or recorded [041 S1-AC4]', () => {
    const ci = read('.github/workflows/ci.yml')
    const check = ci.slice(ci.indexOf('\n  check:\n'), ci.indexOf('\n  windows:\n'))
    expect(check).toMatch(/run: pnpm build\n[\s\S]*run: node bench\/run\.mjs --smoke/)
    const run = read('bench/run.mjs')
    expect(run).toMatch(/smoke\s*\?\s*\[/)
    expect(run).toMatch(/console\.log\(`bench smoke: \$\{ran\} cases ran`\)/)
  })
})
