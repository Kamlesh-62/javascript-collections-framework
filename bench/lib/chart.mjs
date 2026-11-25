// The comparison chart: for each case, one horizontal bar per other library and operation, showing
// its median rate divided by this library's on a log scale centred on a 1× line. Written as SVG
// text with no dependency; the same result always gives the same bytes.

import { byCase, THIS } from './compare.mjs'
import { formatRatio, UNSTABLE } from './results.mjs'

/** Where the chart is written, from the repository root. */
export const CHART_PATH = 'docs/images/benchmarks.svg'

/** The size the chart shows, when the run has it. */
export const CHART_SIZE = 100_000

/** Colours: an opaque background, and text, bars and the 1× line that contrast with it. */
export const COLOURS = {
  background: '#ffffff',
  text: '#1f2328',
  bar: '#0969da',
  line: '#57606a',
}

/** The chart's title. */
export const CHART_TITLE = `Operations per second relative to ${THIS}`

const WIDTH = 800
const ROW = 22
const LABEL_END = 300
const AXIS_START = 320
const AXIS_END = 700
/** The axis runs from 2^-AXIS_RANGE to 2^AXIS_RANGE. */
const AXIS_RANGE = 3
const TOP = 76
const CAPTION_LINE = 16
const CAPTION_CHARS = 100

/**
 * The WCAG contrast ratio of two `#rrggbb` colours, from 1 to 21.
 * @param {string} foreground
 * @param {string} background
 * @returns {number}
 */
export function contrast(foreground, background) {
  const a = luminance(foreground)
  const b = luminance(background)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** @param {string} colour */
function luminance(colour) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour)
  if (match === null) throw new TypeError(`contrast: ${colour} is not a #rrggbb colour`)
  const [r, g, b] = [match[1], match[2], match[3]].map((hex) => {
    const c = Number.parseInt(/** @type {string} */ (hex), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * Number(r) + 0.7152 * Number(g) + 0.0722 * Number(b)
}

/**
 * @typedef {import('./compare.mjs').CompareResult} CompareResult
 * @typedef {object} ChartRow
 * @property {string} case
 * @property {string} operation
 * @property {string} library
 * @property {string} name
 * @property {number | undefined} ratio - Other ÷ this library; `undefined` when unstable.
 */

/**
 * The size the chart of `result` shows: {@link CHART_SIZE} when the run has it, else its largest.
 * @param {CompareResult} result
 * @returns {number}
 */
export function chartSize(result) {
  return result.sizes.includes(CHART_SIZE) ? CHART_SIZE : Math.max(...result.sizes)
}

/**
 * One row per case, operation and other library at the chart's size, in the order of the results.
 * @param {CompareResult} result
 * @returns {Map<string, ChartRow[]>}
 */
export function chartRows(result) {
  const size = chartSize(result)
  /** @type {Map<string, ChartRow[]>} */
  const groups = new Map()
  for (const [name, cases] of byCase(result)) {
    /** @type {ChartRow[]} */
    const rows = []
    for (const c of cases) {
      if (c.size !== size) continue
      const ours = c.results.find((r) => r.library === THIS)
      for (const r of c.results) {
        if (r.library === THIS) continue
        const stable =
          ours !== undefined && ours.hz > 0 && r.hz > 0 && ours.rme <= UNSTABLE && r.rme <= UNSTABLE
        rows.push({
          case: name,
          operation: c.operation,
          library: r.library,
          name: r.name,
          ratio: stable && ours !== undefined ? r.hz / ours.hz : undefined,
        })
      }
    }
    if (rows.length > 0) groups.set(name, rows)
  }
  return groups
}

/** @param {number | undefined} ratio */
const ratioLabel = (ratio) => (ratio === undefined ? 'unstable' : formatRatio(ratio))

/**
 * The alt text of the chart, stating its result.
 * @param {CompareResult} result
 * @returns {string}
 */
export function chartAlt(result) {
  const rows = [...chartRows(result).values()].flat()
  const higher = rows.filter((r) => r.ratio !== undefined && r.ratio > 1)
  const size = chartSize(result).toLocaleString('en-US')
  const list =
    higher.length === 0
      ? 'none'
      : higher
          .map((r) => `${r.case} ${r.operation} (${r.library} ${ratioLabel(r.ratio)})`)
          .join(', ')
  return (
    `Bar chart of each other library's median operations per second divided by ${THIS}'s, ` +
    `at ${size} elements, on a log scale centred on 1×. Rows where another library's median is ` +
    `higher, ${higher.length} of ${rows.length}: ${list}.`
  ).replace(/[[\]]/g, '')
}

/** @param {string} text */
const xml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** @param {number} n */
const px = (n) => n.toFixed(1)

/**
 * The x coordinate of `ratio` on the axis, clamped to its ends.
 * @param {number} ratio
 */
function axisX(ratio) {
  const log = Math.max(-AXIS_RANGE, Math.min(AXIS_RANGE, Math.log2(ratio)))
  return AXIS_START + ((log + AXIS_RANGE) / (2 * AXIS_RANGE)) * (AXIS_END - AXIS_START)
}

/**
 * `text` broken into lines of at most `width` characters, at spaces.
 * @param {string} text
 * @param {number} width
 * @returns {string[]}
 */
function wrap(text, width) {
  /** @type {string[]} */
  const lines = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line !== '' && line.length + 1 + word.length > width) {
      lines.push(line)
      line = word
    } else {
      line = line === '' ? word : `${line} ${word}`
    }
  }
  if (line !== '') lines.push(line)
  return lines
}

/**
 * The chart of `result` as SVG text.
 * @param {CompareResult} result
 * @returns {string}
 */
export function renderChart(result) {
  const groups = chartRows(result)
  const rows = [...groups.values()].flat()
  const size = chartSize(result)
  const { info } = result
  const packages = Object.keys(result.packages)
    .sort()
    .map((name) => `${name} ${result.packages[name]}`)
    .join(', ')
  const caption = wrap(
    `Median operations per second of each library ÷ ${THIS} ${info.version}, ` +
      `${size.toLocaleString('en-US')} elements, log scale; bars are clamped at 1/8× and 8×, the ` +
      `printed ratio is exact. Run on ${info.date} with Node.js ${info.node} on ${info.cpu}. ` +
      `Packages: ${packages}.`,
    CAPTION_CHARS,
  )
  const operations = new Set(rows.map((r) => `${r.case}\n${r.operation}`)).size
  const bodyRows = groups.size + operations + rows.length
  const bodyEnd = TOP + bodyRows * ROW
  const height = bodyEnd + 16 + caption.length * CAPTION_LINE + 8
  const centre = axisX(1)
  const desc =
    `${CHART_TITLE}, at ${size.toLocaleString('en-US')} elements, run on ${info.date} with ` +
    `Node.js ${info.node}: ` +
    rows
      .map((r) => `${r.case}, ${r.operation}, ${r.library} ${r.name} ${ratioLabel(r.ratio)}`)
      .join('; ') +
    '.'
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" font-size="12">`,
    `<title>${xml(CHART_TITLE)}</title>`,
    `<desc>${xml(desc)}</desc>`,
    `<rect x="0" y="0" width="${WIDTH}" height="${height}" fill="${COLOURS.background}"/>`,
    `<text x="12" y="24" fill="${COLOURS.text}" font-size="15" font-weight="bold">${xml(CHART_TITLE)}</text>`,
    `<text x="${px(AXIS_START)}" y="46" fill="${COLOURS.text}">◀ ${xml(THIS)} higher</text>`,
    `<text x="${px(AXIS_END)}" y="46" fill="${COLOURS.text}" text-anchor="end">other library higher ▶</text>`,
  ]
  for (let p = -AXIS_RANGE; p <= AXIS_RANGE; p++) {
    const x = axisX(2 ** p)
    const label = p < 0 ? `1/${2 ** -p}×` : `${2 ** p}×`
    out.push(
      `<text x="${px(x)}" y="${TOP - 8}" fill="${COLOURS.text}" text-anchor="middle">${label}</text>`,
    )
  }
  out.push(
    `<line x1="${px(centre)}" y1="${TOP - 4}" x2="${px(centre)}" y2="${bodyEnd}" stroke="${COLOURS.line}" stroke-width="1.5" stroke-dasharray="4 3"/>`,
  )
  let y = TOP
  for (const [name, list] of groups) {
    out.push(
      `<text x="12" y="${y + 15}" fill="${COLOURS.text}" font-weight="bold">${xml(name)}</text>`,
    )
    y += ROW
    let operation = ''
    for (const r of list) {
      if (r.operation !== operation) {
        operation = r.operation
        out.push(
          `<text x="24" y="${y + 15}" fill="${COLOURS.text}" font-style="italic">${xml(operation)}</text>`,
        )
        y += ROW
      }
      out.push(
        `<text x="${LABEL_END}" y="${y + 15}" fill="${COLOURS.text}" text-anchor="end">${xml(`${r.library} ${r.name}`)}</text>`,
      )
      if (r.ratio !== undefined) {
        const x = axisX(r.ratio)
        const left = Math.min(x, centre)
        out.push(
          `<rect x="${px(left)}" y="${y + 4}" width="${px(Math.max(Math.abs(x - centre), 1))}" height="${ROW - 8}" fill="${COLOURS.bar}"/>`,
        )
      }
      out.push(
        `<text x="${WIDTH - 12}" y="${y + 15}" fill="${COLOURS.text}" text-anchor="end">${xml(ratioLabel(r.ratio))}</text>`,
      )
      y += ROW
    }
  }
  let captionY = bodyEnd + 20
  for (const line of caption) {
    out.push(`<text x="12" y="${captionY}" fill="${COLOURS.text}">${xml(line)}</text>`)
    captionY += CAPTION_LINE
  }
  out.push('</svg>')
  return `${out.join('\n')}\n`
}

// ── The chart in the README ──

/** The markers around the chart in the README's comparison section. */
export const README_CHART_START = '<!-- readme-chart:start -->'
export const README_CHART_END = '<!-- readme-chart:end -->'

/**
 * Where the README loads the chart from and links it to. Absolute, because the README is also
 * shown on npm and as the front page of the API site, where relative paths do not resolve.
 */
export const CHART_RAW_URL =
  'https://raw.githubusercontent.com/Kamlesh-62/javascript-collections-framework/main/docs/images/benchmarks.svg'
export const CHART_PAGE_URL =
  'https://github.com/Kamlesh-62/javascript-collections-framework/blob/main/docs/performance.md#compared-with-other-libraries'

/**
 * The README's alt text for the chart: what it shows and in how many rows another library's
 * median is higher, counted as {@link chartAlt} counts them, without the list of rows.
 * @param {CompareResult} result
 * @returns {string}
 */
export function chartShortAlt(result) {
  const rows = [...chartRows(result).values()].flat()
  const higher = rows.filter((r) => r.ratio !== undefined && r.ratio > 1)
  const size = chartSize(result).toLocaleString('en-US')
  return (
    `Bar chart of other libraries' median operations per second relative to ${THIS} at ${size} ` +
    `elements, on a log scale centred on 1×; another library's median is higher in ` +
    `${higher.length} of ${rows.length} rows.`
  )
}

/**
 * The chart as the README shows it: the image, loaded from `main`, linked to the comparison.
 * @param {CompareResult} result
 * @returns {string}
 */
export function renderReadmeChart(result) {
  return `[![${chartShortAlt(result)}](${CHART_RAW_URL})](${CHART_PAGE_URL})`
}

/**
 * `readme` with the text between the README chart markers replaced by `chart`.
 * @param {string} readme
 * @param {string} chart
 * @returns {string}
 */
export function withReadmeChart(readme, chart) {
  const start = readme.indexOf(README_CHART_START)
  const end = readme.indexOf(README_CHART_END)
  if (start < 0 || end < start)
    throw new Error(`README.md needs ${README_CHART_START} and ${README_CHART_END}`)
  return `${readme.slice(0, start + README_CHART_START.length)}\n${chart}\n${readme.slice(end)}`
}

/**
 * The README as `bench:docs` writes it: the chart of the newest comparison between the markers, or
 * the README unchanged when there is no comparison run.
 * @param {string} readme
 * @param {CompareResult | undefined} result
 * @returns {string}
 */
export function updatedReadme(readme, result) {
  return result === undefined ? readme : withReadmeChart(readme, renderReadmeChart(result))
}

/**
 * What is wrong with the README's chart: missing markers, a chart shown with no comparison run, or
 * the first line that differs from {@link renderReadmeChart} of the newest comparison.
 * @param {string} readme
 * @param {CompareResult | undefined} result
 * @returns {string[]}
 */
export function readmeChartProblems(readme, result) {
  const start = readme.indexOf(README_CHART_START)
  const end = readme.indexOf(README_CHART_END)
  if (start < 0 || end < start)
    return [`README.md has no ${README_CHART_START} … ${README_CHART_END} section`]
  const shown = readme.slice(start + README_CHART_START.length, end).trim()
  if (result === undefined) {
    return shown === ''
      ? []
      : ['README.md shows the chart, but there is no compare run in bench/results']
  }
  const expected = renderReadmeChart(result)
  if (shown === expected) return []
  const shownLines = shown.split('\n')
  const expectedLines = expected.split('\n')
  for (let i = 0; i < Math.max(shownLines.length, expectedLines.length); i++) {
    if (shownLines[i] !== expectedLines[i]) {
      return [
        `README.md: the chart differs from the newest compare results at its line ${i + 1}: ` +
          `expected "${expectedLines[i] ?? ''}", found "${shownLines[i] ?? ''}"; run \`pnpm bench:docs\``,
      ]
    }
  }
  return []
}
