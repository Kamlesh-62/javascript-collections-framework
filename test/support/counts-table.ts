// Renders the counts table of docs/testing.md from test/stress/config.ts, so the page states
// exactly what runs.

import type { DEEP, FAST, NIGHTLY, RUNS, SCALE } from '../stress/config'

export interface CountsConfig {
  readonly SCALE: typeof SCALE
  readonly DEEP: typeof DEEP
  readonly FAST: typeof FAST
  readonly NIGHTLY: typeof NIGHTLY
  readonly RUNS: typeof RUNS
}

/** `1234567` as `1,234,567`, independent of the locale. */
export function grouped(n: number): string {
  const digits = String(n)
  let out = ''
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += ','
    out += digits[i]
  }
  return out
}

/** The Markdown table that sits between the counts markers on the testing page. */
export function renderCountsTable(config: CountsConfig): string {
  const { SCALE, DEEP, FAST, NIGHTLY, RUNS } = config
  const rows: Array<[string, string]> = [
    ['Elements in each scale, view and output test', grouped(SCALE.elements)],
    [
      'Lookups, end removals and near-end cursor removals per class (scale)',
      grouped(SCALE.queries),
    ],
    [
      'Lookups per class where one lookup walks the collection (scale)',
      grouped(SCALE.linearQueries),
    ],
    ['Nesting depth that prints, writes JSON, compares and hashes', grouped(SCALE.nestingDepth)],
    ['Nesting depth that throws `RangeError`', grouped(SCALE.overflowDepth)],
    ['Deep random runs (model, collection and options)', grouped(RUNS.length)],
    ['Seeds × steps per deep random run', `${grouped(DEEP.seeds)} × ${grouped(DEEP.steps)}`],
    ['Steps between full-contents comparisons (deep runs)', grouped(DEEP.checkEvery)],
    ['Iterators and cursors held open at once (deep runs)', grouped(DEEP.maxOpen)],
    ['Seeds × steps per run in the fast subset', `${grouped(FAST.seeds)} × ${grouped(FAST.steps)}`],
    ['Elements per collection with both builds loaded', grouped(SCALE.twoCopiesElements)],
    ['Nightly stress job timeout', `${grouped(NIGHTLY.timeoutMinutes)} minutes`],
  ]
  const width = Math.max(...rows.map((r) => r[0].length), 'What'.length)
  const valueWidth = Math.max(...rows.map((r) => r[1].length), 'Count'.length)
  const line = (a: string, b: string) => `| ${a.padEnd(width)} | ${b.padStart(valueWidth)} |`
  return [
    line('What', 'Count'),
    `| ${'-'.repeat(width)} | ${'-'.repeat(valueWidth - 1)}: |`,
    ...rows.map(([a, b]) => line(a, b)),
  ].join('\n')
}
