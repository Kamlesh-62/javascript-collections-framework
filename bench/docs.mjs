// `update` writes the newest benchmark run into the benchmarks section of docs/performance.md;
// `check` fails when the section does not show it. Neither times anything.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  benchSectionProblems,
  latestResult,
  RESULTS_DIR,
  renderBenchSection,
  withBenchSection,
} from './lib/results.mjs'

const root = join(import.meta.dirname, '..')
const pagePath = join(root, 'docs', 'performance.md')
const page = readFileSync(pagePath, 'utf8')
const result = latestResult(join(root, RESULTS_DIR))?.result
const mode = process.argv[2]
if (mode === 'update') {
  writeFileSync(pagePath, withBenchSection(page, renderBenchSection(result)))
  // Align the tables as the formatter does, so the page passes the lint check.
  const biome = join(root, 'node_modules', '@biomejs', 'biome', 'bin', 'biome')
  execFileSync(process.execPath, [biome, 'format', '--write', pagePath], { stdio: 'ignore' })
  console.log('bench docs: updated docs/performance.md')
} else if (mode === 'check') {
  const problems = benchSectionProblems(page, result)
  if (problems.length > 0) {
    for (const problem of problems) console.error(`bench docs: ${problem}`)
    process.exit(1)
  }
  console.log('bench docs: docs/performance.md shows the newest run')
} else {
  console.error('usage: node bench/docs.mjs update|check')
  process.exit(1)
}
