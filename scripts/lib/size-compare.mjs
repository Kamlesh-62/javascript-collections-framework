// Comparing measured bundle sizes with the committed size report. Pure functions.
//
// Minified sizes must match exactly: the same build and build-tool version give the same bytes
// everywhere. Gzipped sizes may differ by up to 1% or 16 bytes, whichever is larger, because the
// zlib build inside Node can vary by machine and version.

/** @typedef {{ name: string, minified: number, gzip: number }} SizeEntry */
/** @typedef {{ name: string, committed: SizeEntry | undefined, measured: SizeEntry | undefined, reason: string }} SizeChange */

/** The largest gzip difference accepted for a committed gzip size. */
export function gzipTolerance(/** @type {number} */ committedGzip) {
  return Math.max(committedGzip / 100, 16)
}

/**
 * Every entry that fails the comparison, in report order (committed entries first, then added).
 * @param {readonly SizeEntry[]} committed
 * @param {readonly SizeEntry[]} measured
 * @returns {SizeChange[]}
 */
export function compareSizes(committed, measured) {
  const byName = new Map(measured.map((entry) => [entry.name, entry]))
  const known = new Set(committed.map((entry) => entry.name))
  /** @type {SizeChange[]} */
  const changes = []
  for (const entry of committed) {
    const now = byName.get(entry.name)
    if (now === undefined) {
      changes.push({ name: entry.name, committed: entry, measured: undefined, reason: 'removed' })
    } else if (now.minified !== entry.minified) {
      changes.push({ name: entry.name, committed: entry, measured: now, reason: 'minified size' })
    } else if (Math.abs(now.gzip - entry.gzip) > gzipTolerance(entry.gzip)) {
      changes.push({ name: entry.name, committed: entry, measured: now, reason: 'gzipped size' })
    }
  }
  for (const entry of measured) {
    if (!known.has(entry.name)) {
      changes.push({ name: entry.name, committed: undefined, measured: entry, reason: 'added' })
    }
  }
  return changes
}

/** @param {SizeEntry | undefined} entry @returns {string} */
const cell = (entry) => (entry === undefined ? '—' : `${entry.minified} / ${entry.gzip}`)

/** @param {number} n @returns {string} */
const signed = (n) => (n > 0 ? `+${n}` : `${n}`)

/**
 * A table of the failing entries: name, committed size, new size and difference, each as
 * `minified / gzipped` bytes.
 * @param {readonly SizeChange[]} changes
 * @returns {string}
 */
export function formatChanges(changes) {
  const rows = [['export', 'committed', 'new', 'difference', 'why']]
  for (const change of changes) {
    const before = change.committed ?? { minified: 0, gzip: 0 }
    const after = change.measured ?? { minified: 0, gzip: 0 }
    rows.push([
      change.name,
      cell(change.committed),
      cell(change.measured),
      `${signed(after.minified - before.minified)} / ${signed(after.gzip - before.gzip)}`,
      change.reason,
    ])
  }
  const widths =
    rows[0]?.map((_, column) => Math.max(...rows.map((row) => (row[column] ?? '').length))) ?? []
  return rows
    .map((row) =>
      row
        .map((text, column) => text.padEnd(widths[column] ?? 0))
        .join('  ')
        .trimEnd(),
    )
    .join('\n')
}

/**
 * The committed report's text for a list of entries: `*` first, then names by code unit.
 * @param {readonly SizeEntry[]} entries
 * @returns {string}
 */
export function formatReport(entries) {
  const sorted = [...entries].sort((a, b) =>
    a.name === '*' ? -1 : b.name === '*' ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )
  const lines = sorted.map(
    (e) =>
      `    { "name": ${JSON.stringify(e.name)}, "minified": ${e.minified}, "gzip": ${e.gzip} }`,
  )
  return `{\n  "entries": [\n${lines.join(',\n')}\n  ]\n}\n`
}

/**
 * Reads a committed report's entries.
 * @param {string} text
 * @returns {SizeEntry[]}
 */
export function parseReport(text) {
  const data = JSON.parse(text)
  if (data === null || typeof data !== 'object' || !Array.isArray(data.entries)) {
    throw new TypeError('size report: expected { "entries": [...] }')
  }
  return data.entries.map((/** @type {unknown} */ raw) => {
    const e = /** @type {Record<string, unknown>} */ (raw)
    if (
      typeof e.name !== 'string' ||
      typeof e.minified !== 'number' ||
      typeof e.gzip !== 'number'
    ) {
      throw new TypeError('size report: each entry needs name, minified and gzip')
    }
    return { name: e.name, minified: e.minified, gzip: e.gzip }
  })
}
