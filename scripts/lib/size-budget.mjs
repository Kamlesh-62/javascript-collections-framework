// Size budgets: the largest gzipped size each entry of the size report may have, and the size table
// of docs/performance.md. Pure functions.
//
// A budget is the entry's gzipped size when the budget was set, plus 10 %, rounded up to the next
// multiple of 64 bytes. Budgets are compared with the committed report's gzipped sizes, so the
// result is the same on every machine. The size commands never write the budget file: a budget
// changes only by hand, with its reason in the pull request's changeset.

/** @typedef {import('./size-compare.mjs').SizeEntry} SizeEntry */

export const BUDGET_PATH = 'api/javascript-collections-framework.budget.json'
export const PERFORMANCE_PAGE = 'docs/performance.md'
export const TABLE_START = '<!-- sizes:start -->'
export const TABLE_END = '<!-- sizes:end -->'

/**
 * The budget for an entry of `gzip` bytes: `gzip` plus 10 %, rounded up to a multiple of 64.
 * Integer arithmetic, so an exact multiple stays exact.
 * @param {number} gzip
 * @returns {number}
 */
export function budgetFor(gzip) {
  return Math.ceil((gzip * 11) / 640) * 64
}

/** @param {string} a @param {string} b @returns {number} */
const byName = (a, b) => (a === '*' ? -1 : b === '*' ? 1 : a < b ? -1 : a > b ? 1 : 0)

/**
 * Reads the bundle budgets of a budget file: `{ "budgets": { "<entry>": <bytes>, ... },
 * "unpacked": <bytes> }`.
 * @param {string} text
 * @returns {Map<string, number>}
 */
export function parseBudgets(text) {
  const data = JSON.parse(text)
  if (
    data === null ||
    typeof data !== 'object' ||
    data.budgets === null ||
    typeof data.budgets !== 'object' ||
    Array.isArray(data.budgets)
  ) {
    throw new TypeError('size budgets: expected { "budgets": { "<entry>": <bytes> } }')
  }
  /** @type {Map<string, number>} */
  const budgets = new Map()
  for (const [name, bytes] of Object.entries(data.budgets)) {
    if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes <= 0) {
      throw new TypeError(`size budgets: the budget of '${name}' must be a positive integer`)
    }
    budgets.set(name, bytes)
  }
  return budgets
}

/**
 * The budget file's text for the given budgets: `*` first, then names by code unit, then the
 * unpacked-size budget when there is one.
 * @param {ReadonlyMap<string, number>} budgets
 * @param {number} [unpacked]
 * @returns {string}
 */
export function formatBudgets(budgets, unpacked) {
  const lines = [...budgets.keys()]
    .sort(byName)
    .map((name) => `    ${JSON.stringify(name)}: ${budgets.get(name)}`)
  const tail = unpacked === undefined ? '' : `,\n  "unpacked": ${unpacked}`
  return `{\n  "budgets": {\n${lines.join(',\n')}\n  }${tail}\n}\n`
}

/**
 * Reads the unpacked-size budget of a budget file: the top-level `unpacked` field, in bytes, set
 * like the other budgets (`budgetFor` of the measured size), or `undefined` when there is none.
 * @param {string} text
 * @returns {number | undefined}
 */
export function parseUnpacked(text) {
  const { unpacked } = JSON.parse(text)
  if (unpacked === undefined) return undefined
  if (typeof unpacked !== 'number' || !Number.isInteger(unpacked) || unpacked <= 0)
    throw new TypeError('size budgets: "unpacked" must be a positive integer')
  return unpacked
}

/**
 * Every problem with the budgets for a report: an entry over its budget, an entry with no budget,
 * and a budget for an entry the report does not have.
 * @param {readonly SizeEntry[]} report
 * @param {ReadonlyMap<string, number>} budgets
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function checkBudgets(report, budgets) {
  /** @type {string[]} */
  const problems = []
  const names = new Set(report.map((entry) => entry.name))
  for (const entry of report) {
    const budget = budgets.get(entry.name)
    if (budget === undefined) {
      problems.push(
        `'${entry.name}' has no budget (by the formula: ${budgetFor(entry.gzip)} bytes for ${entry.gzip} gzipped)`,
      )
    } else if (entry.gzip > budget) {
      problems.push(
        `'${entry.name}' is ${entry.gzip} bytes gzipped, over its budget of ${budget} bytes`,
      )
    }
  }
  for (const name of [...budgets.keys()].sort(byName)) {
    if (!names.has(name))
      problems.push(`the budget for '${name}' names no entry of the size report`)
  }
  return { ok: problems.length === 0, problems }
}

/**
 * The size table of the performance page: export, minified, gzipped and budget bytes, the whole
 * package first. An entry with no budget shows a dash. Columns are padded to one width, numbers
 * aligned right, as the repository's Markdown formatter writes tables.
 * @param {readonly SizeEntry[]} report
 * @param {ReadonlyMap<string, number>} budgets
 * @returns {string}
 */
export function renderSizeTable(report, budgets) {
  const header = ['Export', 'Minified (bytes)', 'Gzipped (bytes)', 'Budget, gzipped (bytes)']
  const rows = [...report]
    .sort((a, b) => byName(a.name, b.name))
    .map((entry) => {
      const budget = budgets.get(entry.name)
      return [
        entry.name === '*' ? 'Whole package' : `\`${entry.name}\``,
        String(entry.minified),
        String(entry.gzip),
        budget === undefined ? '—' : String(budget),
      ]
    })
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => (row[column] ?? '').length)),
  )
  /** @param {string[]} cells */
  const line = (cells) =>
    `| ${cells
      .map((cell, column) =>
        column === 0 ? cell.padEnd(widths[column] ?? 0) : cell.padStart(widths[column] ?? 0),
      )
      .join(' | ')} |`
  const rule = `| ${widths
    .map((width, column) => (column === 0 ? '-'.repeat(width) : `${'-'.repeat(width - 1)}:`))
    .join(' | ')} |`
  return [line(header), rule, ...rows.map(line)].join('\n')
}

/**
 * The text between the size table markers of a page, without the newlines next to the markers,
 * or `undefined` when the markers are missing or out of order.
 * @param {string} page
 * @returns {string | undefined}
 */
export function tableIn(page) {
  const start = page.indexOf(TABLE_START)
  const end = page.indexOf(TABLE_END)
  if (start === -1 || end === -1 || end < start) return undefined
  return page.slice(start + TABLE_START.length, end).replace(/^\n+|\n+$/g, '')
}

/**
 * `page` with the text between its size table markers replaced by `table`, or `undefined` when
 * the markers are missing or out of order.
 * @param {string} page
 * @param {string} table
 * @returns {string | undefined}
 */
export function withTable(page, table) {
  const start = page.indexOf(TABLE_START)
  const end = page.indexOf(TABLE_END)
  if (start === -1 || end === -1 || end < start) return undefined
  return `${page.slice(0, start + TABLE_START.length)}\n${table}\n${page.slice(end)}`
}
