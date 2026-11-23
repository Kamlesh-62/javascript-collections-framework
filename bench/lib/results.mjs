// Benchmark results: the record of a run (machine, runtime, figures), its file name, and the
// section of the performance page rendered from it.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { cpus, platform, totalmem } from 'node:os'
import { join } from 'node:path'

export const RESULTS_DIR = 'bench/results'
export const BENCH_START = '<!-- bench:start -->'
export const BENCH_END = '<!-- bench:end -->'
/** A row whose spread is over this percentage shows no ratio: its figures are noise. */
export const UNSTABLE = 100

export const NO_RUN = 'No recorded run yet: run `pnpm bench`, then `pnpm bench:docs`.'

/**
 * @typedef {object} RunInfo
 * @property {string} date - UTC date of the run, `YYYY-MM-DD`.
 * @property {string} node - `process.version`.
 * @property {string} platform
 * @property {string} cpu - The processor model.
 * @property {number} cores
 * @property {number} memoryGb - Total memory, rounded to a whole number of gigabytes.
 * @property {string} version - The package version that was measured.
 * @property {RunOrder} [order] - Which side of each case was timed first; runs saved before the
 *   option existed have none and were timed native first.
 */

/** @typedef {'native-first' | 'library-first'} RunOrder */

/**
 * Which side of each case the runner times first: the native side, unless the arguments hold
 * `--library-first`.
 * @param {readonly string[]} args - The runner's command-line arguments.
 * @returns {RunOrder}
 */
export function runOrder(args) {
  return args.includes('--library-first') ? 'library-first' : 'native-first'
}

/**
 * @typedef {object} CaseResult
 * @property {string} collection
 * @property {string} operation
 * @property {number} size
 * @property {{ name: string, hz: number, rme: number }} native - Elements or operations per second.
 * @property {{ hz: number, rme: number }} library
 */

/** @typedef {{ info: RunInfo, sizes: number[], cases: CaseResult[] }} BenchResult */

/**
 * The machine and runtime of this run. No user name, host name or path is recorded.
 * @param {string} version - The package version.
 * @param {Date} [now]
 * @param {RunOrder} [order]
 * @returns {RunInfo}
 */
export function runInfo(version, now = new Date(), order = 'native-first') {
  const processors = cpus()
  return {
    date: now.toISOString().slice(0, 10),
    node: process.version,
    platform: platform(),
    cpu: (processors[0]?.model ?? 'unknown').trim(),
    cores: processors.length,
    memoryGb: Math.round(totalmem() / 2 ** 30),
    version,
    order,
  }
}

/**
 * The file a run is saved to: `bench/results/<date>-node-<major>.json`.
 * @param {RunInfo} info
 * @returns {string}
 */
export function resultFile(info) {
  const major = /^v?(\d+)/.exec(info.node)?.[1] ?? 'unknown'
  return `${RESULTS_DIR}/${info.date}-node-${major}.json`
}

/**
 * The newest run in `dir` (by the date in its name), or `undefined` when there is none.
 * @param {string} dir
 * @returns {{ file: string, result: BenchResult } | undefined}
 */
export function latestResult(dir) {
  if (!existsSync(dir)) return undefined
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}-node-\d+\.json$/.test(f))
    .sort()
  const file = files[files.length - 1]
  if (file === undefined) return undefined
  return { file, result: JSON.parse(readFileSync(join(dir, file), 'utf8')) }
}

/**
 * Sorts case results by collection, operation and size, so that a result renders the same way
 * every time.
 * @param {readonly CaseResult[]} cases
 * @returns {CaseResult[]}
 */
export function sortCases(cases) {
  const text = (/** @type {string} */ a, /** @type {string} */ b) => (a < b ? -1 : a > b ? 1 : 0)
  return [...cases].sort(
    (a, b) => text(a.collection, b.collection) || text(a.operation, b.operation) || a.size - b.size,
  )
}

/**
 * A rate in a short form: `12.3 M`, `456 k`, `789`.
 * @param {number} hz
 * @returns {string}
 */
export function formatRate(hz) {
  if (hz >= 1e9) return `${(hz / 1e9).toPrecision(3)} G`
  if (hz >= 1e6) return `${(hz / 1e6).toPrecision(3)} M`
  if (hz >= 1e3) return `${(hz / 1e3).toPrecision(3)} k`
  return hz.toPrecision(3)
}

/**
 * A ratio in a short form: two significant digits below 100 (`0.45×`, `7.0×`), whole numbers
 * above (`1,300×`).
 * @param {number} ratio
 * @returns {string}
 */
export function formatRatio(ratio) {
  return ratio >= 100 ? `${Math.round(ratio).toLocaleString('en-US')}×` : `${ratio.toPrecision(2)}×`
}

/** @param {{ hz: number, rme: number }} m */
const rate = (m) => `${formatRate(m.hz)} ±${Math.round(m.rme)} %`

/** @param {number} n */
const size = (n) => n.toLocaleString('en-US')

/**
 * The text between the markers of the performance page for `result`, or the "no run" line.
 * @param {BenchResult | undefined} result
 * @returns {string}
 */
export function renderBenchSection(result) {
  if (result === undefined) return NO_RUN
  const { info } = result
  const lines = [
    `Run on ${info.date} with Node.js ${info.node} on ${info.platform}, ${info.cpu} ` +
      `(${info.cores} cores, ${info.memoryGb} GB), version ${info.version} of the package.`,
  ]
  /** @type {Map<string, CaseResult[]>} */
  const byCollection = new Map()
  for (const c of sortCases(result.cases)) {
    const list = byCollection.get(c.collection) ?? []
    list.push(c)
    byCollection.set(c.collection, list)
  }
  for (const [collection, cases] of byCollection) {
    lines.push(
      '',
      `### ${collection}`,
      '',
      '| Operation | Size | Native baseline | Native per second | Library per second | Library ÷ native |',
      '| --- | --: | --- | --: | --: | --: |',
    )
    for (const c of cases) {
      const ratio =
        c.native.hz === 0 || c.native.rme > UNSTABLE || c.library.rme > UNSTABLE
          ? 'unstable'
          : formatRatio(c.library.hz / c.native.hz)
      lines.push(
        `| ${c.operation} | ${size(c.size)} | ${c.native.name} | ${rate(c.native)} | ${rate(c.library)} | ${ratio} |`,
      )
    }
  }
  return lines.join('\n')
}

/**
 * `page` with the text between the markers replaced by `section`.
 * @param {string} page
 * @param {string} section
 * @returns {string}
 */
export function withBenchSection(page, section) {
  const start = page.indexOf(BENCH_START)
  const end = page.indexOf(BENCH_END)
  if (start < 0 || end < start) throw new Error(`the page needs ${BENCH_START} and ${BENCH_END}`)
  return `${page.slice(0, start + BENCH_START.length)}\n${section}\n${page.slice(end)}`
}

/**
 * What is wrong with the page's benchmark section for `result`: missing markers, or text that
 * differs from {@link renderBenchSection}.
 * @param {string} page
 * @param {BenchResult | undefined} result
 * @returns {string[]}
 */
export function benchSectionProblems(page, result) {
  const start = page.indexOf(BENCH_START)
  const end = page.indexOf(BENCH_END)
  if (start < 0 || end < start) return [`the page has no ${BENCH_START} … ${BENCH_END} section`]
  const shown = page.slice(start + BENCH_START.length, end)
  return normalise(shown) === normalise(renderBenchSection(result))
    ? []
    : ['the benchmark section does not match the newest result: run `pnpm bench:docs`']
}

/**
 * The text with table padding removed, so a page whose tables a formatter has aligned still
 * matches the rendered section.
 * @param {string} text
 * @returns {string}
 */
export function normalise(text) {
  return text
    .trim()
    .split('\n')
    .map((line) =>
      line.startsWith('|')
        ? line
            .replace(/\s*\|\s*/g, '|')
            .replace(/\|:?-+:?(?=\|)/g, (cell) => cell.replace(/-+/, '-'))
        : line.trimEnd(),
    )
    .join('\n')
}
