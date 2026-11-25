// Comparison with other collection libraries: the record of a run, its file name, the checks made
// before anything is timed (installed versions, agreement of results), and the section of the
// performance page rendered from it. Nothing here imports a compared package: the cases and the
// runner live in fixtures/competitors/.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatRate, formatRatio, normalise, RESULTS_DIR, UNSTABLE } from './results.mjs'

/** The name this library goes by in the comparison. */
export const THIS = 'javascript-collections-framework'
/** The folder that installs the compared packages. */
export const FIXTURE = 'fixtures/competitors'
/** The command that installs them. */
export const INSTALL = `pnpm -C ${FIXTURE} install --frozen-lockfile`

export const COMPARE_START = '<!-- compare:start -->'
export const COMPARE_END = '<!-- compare:end -->'

export const NO_COMPARE_RUN =
  `No recorded run yet: run \`${INSTALL}\`, then \`pnpm build && pnpm bench:compare\`, ` +
  '`pnpm bench:docs` and `pnpm bench:chart`.'

/** The image the section shows, relative to the performance page. */
export const CHART_LINK = 'images/benchmarks.svg'

/** @typedef {'this-first' | 'this-last'} CompareOrder */

/**
 * @typedef {import('./results.mjs').RunInfo} RunInfo
 * @typedef {Omit<RunInfo, 'order'> & { order: CompareOrder }} CompareInfo
 * @typedef {{ library: string, name: string, hz: number, rme: number }} LibraryResult
 * @typedef {{ case: string, operation: string, size: number, results: LibraryResult[] }} CompareCase
 * @typedef {{ info: CompareInfo, packages: Record<string, string>, sizes: number[], cases: CompareCase[] }} CompareResult
 */

/**
 * Which side the runner times first: this library, unless the arguments hold `--reverse`.
 * @param {readonly string[]} args
 * @returns {CompareOrder}
 */
export function compareOrder(args) {
  return args.includes('--reverse') ? 'this-last' : 'this-first'
}

/**
 * The file a comparison run is saved to: `bench/results/<date>-compare-node-<major>.json`.
 * @param {{ date: string, node: string }} info
 * @returns {string}
 */
export function compareFile(info) {
  const major = /^v?(\d+)/.exec(info.node)?.[1] ?? 'unknown'
  return `${RESULTS_DIR}/${info.date}-compare-node-${major}.json`
}

/**
 * The newest comparison run in `dir` (by the date in its name), or `undefined` when there is none.
 * @param {string} dir
 * @returns {{ file: string, result: CompareResult } | undefined}
 */
export function latestCompare(dir) {
  if (!existsSync(dir)) return undefined
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}-compare-node-\d+\.json$/.test(f))
    .sort()
  const file = files[files.length - 1]
  if (file === undefined) return undefined
  return { file, result: JSON.parse(readFileSync(join(dir, file), 'utf8')) }
}

/**
 * What differs between the pinned and the installed versions of the compared packages: a pin
 * that is not an exact version, a package that is not installed, or a different version.
 * @param {Readonly<Record<string, string>>} pins - Each package and its pin.
 * @param {Readonly<Record<string, string | undefined>>} installed - Each package and its installed
 *   version, or `undefined` when it is not installed.
 * @returns {string[]}
 */
export function versionProblems(pins, installed) {
  /** @type {string[]} */
  const problems = []
  for (const name of Object.keys(pins).sort()) {
    const pin = /** @type {string} */ (pins[name])
    const found = installed[name]
    if (!/^\d+\.\d+\.\d+$/.test(pin)) {
      problems.push(`${name}: pinned to ${pin}, which is not an exact version`)
    } else if (found === undefined) {
      problems.push(`${name}: not installed, pinned ${pin}; run \`${INSTALL}\``)
    } else if (found !== pin) {
      problems.push(`${name}: installed ${found}, pinned ${pin}`)
    }
  }
  return problems
}

/**
 * @typedef {object} Check
 * @property {string} case
 * @property {string} operation
 * @property {number} size
 * @property {string} library
 * @property {number} checksum - What one pass returned.
 */

/**
 * Every check whose checksum differs from this library's on the same case, operation and size,
 * naming them; a group with no result from this library is named too.
 * @param {readonly Check[]} checks
 * @returns {string[]}
 */
export function disagreements(checks) {
  /** @type {Map<string, Check[]>} */
  const groups = new Map()
  for (const check of checks) {
    const key = `${check.case}, ${check.operation}, ${check.size.toLocaleString('en-US')}`
    const list = groups.get(key) ?? []
    list.push(check)
    groups.set(key, list)
  }
  /** @type {string[]} */
  const problems = []
  for (const [key, list] of groups) {
    const ours = list.find((c) => c.library === THIS)
    if (ours === undefined) {
      problems.push(`${key}: no result from ${THIS}`)
      continue
    }
    for (const c of list) {
      if (c.library !== THIS && c.checksum !== ours.checksum) {
        problems.push(
          `${key}: ${c.library} returned ${c.checksum}, ${THIS} returned ${ours.checksum}`,
        )
      }
    }
  }
  return problems
}

/**
 * Whether a measurement is too noisy to compare.
 * @param {{ hz: number, rme: number }} m
 */
const unstable = (m) => m.hz === 0 || m.rme > UNSTABLE

/**
 * The ratio of another library's figure to this library's, as text: `unstable` when either
 * spread is over the limit or either median is zero.
 * @param {LibraryResult} other
 * @param {LibraryResult} ours
 * @returns {string}
 */
export function ratioText(other, ours) {
  if (other.library === THIS) return '1×'
  return unstable(ours) || unstable(other) ? 'unstable' : formatRatio(other.hz / ours.hz)
}

/**
 * @typedef {object} Loss
 * @property {string} case
 * @property {string} operation
 * @property {number} size
 * @property {string} library
 * @property {string} name - The other library's class.
 * @property {string} ratio - Its figure ÷ this library's, as text.
 * @property {boolean} withinSpread - Whether the two ranges median × (1 ± spread) overlap.
 * @property {boolean} unstable - Whether either spread is over the limit.
 */

/**
 * Every case, operation, size and library in which another library has a higher median than
 * this library, in the order of the results.
 * @param {CompareResult} result
 * @returns {Loss[]}
 */
export function losses(result) {
  /** @type {Loss[]} */
  const found = []
  for (const c of result.cases) {
    const ours = c.results.find((r) => r.library === THIS)
    if (ours === undefined) continue
    for (const r of c.results) {
      if (r.library === THIS || !(r.hz > ours.hz)) continue
      found.push({
        case: c.case,
        operation: c.operation,
        size: c.size,
        library: r.library,
        name: r.name,
        ratio: ratioText(r, ours),
        withinSpread: r.hz * (1 - r.rme / 100) <= ours.hz * (1 + ours.rme / 100),
        unstable: unstable(ours) || unstable(r),
      })
    }
  }
  return found
}

/**
 * The libraries of a result other than this one, in the order they first appear.
 * @param {CompareResult} result
 * @returns {string[]}
 */
export function otherLibraries(result) {
  /** @type {string[]} */
  const names = []
  for (const c of result.cases) {
    for (const r of c.results) {
      if (r.library !== THIS && !names.includes(r.library)) names.push(r.library)
    }
  }
  return names
}

/**
 * The cases of a result grouped by name, in the order they first appear.
 * @param {CompareResult} result
 * @returns {Map<string, CompareCase[]>}
 */
export function byCase(result) {
  /** @type {Map<string, CompareCase[]>} */
  const groups = new Map()
  for (const c of result.cases) {
    const list = groups.get(c.case) ?? []
    list.push(c)
    groups.set(c.case, list)
  }
  return groups
}

/** @param {number} n */
const size = (n) => n.toLocaleString('en-US')

/**
 * The text between the compare markers of the performance page for `result`, or the "no run"
 * line.
 * @param {CompareResult | undefined} result
 * @param {string} [alt] - The chart's alt text; the chart is left out without it.
 * @returns {string}
 */
export function renderCompareSection(result, alt) {
  if (result === undefined) return NO_COMPARE_RUN
  const { info } = result
  const packages = Object.keys(result.packages)
    .sort()
    .map((name) => `${name} ${result.packages[name]}`)
    .join(', ')
  const order = info.order === 'this-last' ? 'this library last' : 'this library first'
  const lines = [
    `Run on ${info.date} with Node.js ${info.node} on ${info.platform}, ${info.cpu} ` +
      `(${info.cores} cores, ${info.memoryGb} GB), version ${info.version} of the package, ` +
      `each case timed ${order}. Compared packages: ${packages}.`,
  ]
  if (alt !== undefined) lines.push('', `![${alt}](${CHART_LINK})`)
  const others = otherLibraries(result)
  for (const [name, cases] of byCase(result)) {
    lines.push(
      '',
      `#### ${name}`,
      '',
      '| Operation | Size | Library | Per second | Other ÷ this library |',
      '| --- | --: | --- | --: | --: |',
    )
    /** @type {Set<string>} */
    const present = new Set()
    for (const c of cases) {
      const ours = c.results.find((r) => r.library === THIS)
      for (const r of c.results) {
        present.add(r.library)
        const ratio = ours === undefined ? 'unstable' : ratioText(r, ours)
        lines.push(
          `| ${c.operation} | ${size(c.size)} | ${r.library} \`${r.name}\` | ` +
            `${formatRate(r.hz)} ±${Math.round(r.rme)} % | ${ratio} |`,
        )
      }
    }
    const missing = others.filter((library) => !present.has(library))
    if (missing.length > 0) lines.push('', `No counterpart: ${missing.join(', ')}.`)
  }
  const lost = losses(result)
  if (lost.length === 0) {
    lines.push('', 'No other library has a higher median in this run.')
  } else {
    lines.push('', 'Another library has a higher median in:', '')
    for (const l of lost) {
      const note = l.unstable ? ' (unstable)' : l.withinSpread ? ' (within spread)' : ''
      lines.push(
        `- ${l.case}, ${l.operation}, ${size(l.size)} (${l.library} \`${l.name}\` ${l.ratio})${note}`,
      )
    }
  }
  return lines.join('\n')
}

/**
 * `page` with the text between the compare markers replaced by `section`.
 * @param {string} page
 * @param {string} section
 * @returns {string}
 */
export function withCompareSection(page, section) {
  const start = page.indexOf(COMPARE_START)
  const end = page.indexOf(COMPARE_END)
  if (start < 0 || end < start)
    throw new Error(`the page needs ${COMPARE_START} and ${COMPARE_END}`)
  return `${page.slice(0, start + COMPARE_START.length)}\n${section}\n${page.slice(end)}`
}

/**
 * What is wrong with the page's compare section: missing markers, a package in the results file
 * whose version is not the fixture's pin, or the first line that differs from
 * {@link renderCompareSection}.
 * @param {string} page
 * @param {CompareResult | undefined} result
 * @param {Readonly<Record<string, string>>} pins - The fixture's pins.
 * @param {string} [alt] - The chart's alt text, as {@link renderCompareSection} takes it.
 * @returns {string[]}
 */
export function compareSectionProblems(page, result, pins, alt) {
  const start = page.indexOf(COMPARE_START)
  const end = page.indexOf(COMPARE_END)
  if (start < 0 || end < start) return [`the page has no ${COMPARE_START} … ${COMPARE_END} section`]
  /** @type {string[]} */
  const problems = []
  if (result !== undefined) {
    const names = [...new Set([...Object.keys(pins), ...Object.keys(result.packages)])].sort()
    for (const name of names) {
      if (result.packages[name] !== pins[name]) {
        problems.push(
          `${name}: the results file records ${result.packages[name] ?? 'no version'}, ` +
            `the fixture pins ${pins[name] ?? 'no version'}`,
        )
      }
    }
  }
  const shown = normalise(page.slice(start + COMPARE_START.length, end)).split('\n')
  const expected = normalise(renderCompareSection(result, alt)).split('\n')
  for (let i = 0; i < Math.max(shown.length, expected.length); i++) {
    if (shown[i] !== expected[i]) {
      problems.push(
        `the compare section differs from the newest compare results at its line ${i + 1}: ` +
          `expected "${expected[i] ?? ''}", found "${shown[i] ?? ''}"; run \`pnpm bench:docs\``,
      )
      break
    }
  }
  return problems
}
