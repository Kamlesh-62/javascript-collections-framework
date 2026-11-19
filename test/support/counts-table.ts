// Renders the counts table of docs/testing.md from test/stress/config.ts, so the page states
// exactly what runs.

import type {
  DEEP,
  FAST,
  HOSTILE,
  LONG,
  NIGHTLY,
  RUNS,
  SCALE,
  WORKLOADS,
  WORST,
} from '../stress/config'

export interface CountsConfig {
  readonly SCALE: typeof SCALE
  readonly DEEP: typeof DEEP
  readonly FAST: typeof FAST
  readonly NIGHTLY: typeof NIGHTLY
  readonly RUNS: typeof RUNS
  readonly WORST: typeof WORST
  readonly LONG: typeof LONG
  readonly WORKLOADS: typeof WORKLOADS
  readonly HOSTILE: typeof HOSTILE
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
  const { SCALE, DEEP, FAST, NIGHTLY, RUNS, WORST, LONG, WORKLOADS, HOSTILE } = config
  /** One workload size, as `unit tests / stress`. */
  const both = (key: keyof (typeof WORKLOADS)['fast']) =>
    `${grouped(WORKLOADS.fast[key])} / ${grouped(WORKLOADS.full[key])}`
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
    ['Elements in each worst-case input shape', grouped(WORST.elements)],
    ['Distinct values whose hashes all collide', grouped(WORST.collidingValues)],
    ['Elements in the target of a sub-list search (worst case)', grouped(WORST.subListTarget)],
    [
      'Sizes at which the growth of each bound is counted',
      `${grouped(WORST.smallSize)} and ${grouped(WORST.largeSize)}`,
    ],
    ['Operations per inconsistent comparator', grouped(WORST.inconsistentSteps)],
    ['Depth of each chain of nested views', grouped(WORST.viewDepth)],
    ['Unmodifiable-view functions applied in turn', grouped(WORST.wraps)],
    ['Grow-and-drain cycles per class (long-running)', grouped(LONG.cycles)],
    ['Size each cycle grows to (long-running)', grouped(LONG.peak)],
    ['Small collections created per class (long-running)', grouped(LONG.smallCollections)],
    ['Largest size of a small collection', grouped(LONG.smallPeak)],
    ['Storage limit checked for each small collection (array slots)', grouped(LONG.smallSlots)],
    ['Values in the hash-flooding check', grouped(LONG.floodValues)],
    ['Of those, values crafted to share one bucket', grouped(LONG.craftedValues)],
    ['Buckets the crafted values are aimed at', grouped(LONG.craftedBuckets)],
    ['Longest bucket chain allowed after flooding', grouped(LONG.maxChain)],
    ['Seeds per realistic workload (unit tests / stress)', both('seeds')],
    ['Words in the multilingual text (unit tests / stress)', both('words')],
    ['Calls in the cache access trace (unit tests / stress)', both('trace')],
    ['Cache size (unit tests / stress)', both('cacheSize')],
    ['Events in the event log and the scheduler (unit tests / stress)', both('events')],
    ['Records with their own equality (unit tests / stress)', both('records')],
    ['Values in the sliding-window stream (unit tests / stress)', both('stream')],
    ['Values in each sliding window (unit tests / stress)', both('window')],
    ['Elements in the sorted array searched and shuffled (unit tests / stress)', both('sorted')],
    ['Code units in the very long string (hostile values)', grouped(HOSTILE.longString)],
    ['Companions of each kind next to a hostile value', grouped(HOSTILE.companions)],
    ['Bytes allowed in checked-in test data', grouped(HOSTILE.dataBudget)],
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
