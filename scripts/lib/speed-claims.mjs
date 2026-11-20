// Finds speed comparisons in the README and the docs pages outside the benchmarks section of the
// performance page: a statement that something is faster or slower needs a recorded run, and the
// recorded runs live in that section.

/** Words that compare speed. */
export const SPEED_WORDS = /\b(faster|slower|quicker|as fast)\b/i

/** The page whose benchmarks section may compare speeds. */
export const BENCHMARK_PAGE = 'docs/performance.md'

/**
 * Each line that compares speed, as `path:line: text`, skipping fenced code blocks and the
 * `## Benchmarks` section of the performance page (up to the next `## ` heading).
 * @param {ReadonlyMap<string, string>} files - Each path (from the repository root) and its text.
 * @returns {string[]}
 */
export function speedClaims(files) {
  /** @type {string[]} */
  const found = []
  for (const [path, text] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    let fenced = false
    let benchmarks = false
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? ''
      if (/^\s*(```|~~~)/.test(line)) {
        fenced = !fenced
        continue
      }
      if (fenced) continue
      if (/^## /.test(line)) benchmarks = path === BENCHMARK_PAGE && /^## Benchmarks\s*$/.test(line)
      if (benchmarks) continue
      if (SPEED_WORDS.test(line)) found.push(`${path}:${i + 1}: ${line.trim()}`)
    }
  }
  return found
}
