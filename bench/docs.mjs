// `update` writes the newest benchmark run, and the newest comparison with other libraries, into
// the benchmarks section of docs/performance.md; `check` fails when the page does not show them,
// when the comparison's package versions are not the fixture's pins, or when the chart differs
// from the newest comparison. Neither times anything.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHART_PATH, chartAlt, renderChart } from './lib/chart.mjs'
import {
  compareSectionProblems,
  FIXTURE,
  latestCompare,
  renderCompareSection,
  withCompareSection,
} from './lib/compare.mjs'
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
const compared = latestCompare(join(root, RESULTS_DIR))?.result
const alt = compared === undefined ? undefined : chartAlt(compared)
/** @type {Record<string, string>} */
const pins = JSON.parse(readFileSync(join(root, FIXTURE, 'package.json'), 'utf8')).devDependencies
const mode = process.argv[2]
if (mode === 'update') {
  const updated = withCompareSection(
    withBenchSection(page, renderBenchSection(result)),
    renderCompareSection(compared, alt),
  )
  writeFileSync(pagePath, updated)
  // Align the tables as the formatter does, so the page passes the lint check.
  const biome = join(root, 'node_modules', '@biomejs', 'biome', 'bin', 'biome')
  execFileSync(process.execPath, [biome, 'format', '--write', pagePath], { stdio: 'ignore' })
  console.log('bench docs: updated docs/performance.md')
} else if (mode === 'check') {
  const problems = [
    ...benchSectionProblems(page, result),
    ...compareSectionProblems(page, compared, pins, alt),
  ]
  if (compared !== undefined) {
    const chartPath = join(root, CHART_PATH)
    if (!existsSync(chartPath)) {
      problems.push(`${CHART_PATH} is missing: run \`pnpm bench:chart\``)
    } else if (readFileSync(chartPath, 'utf8') !== renderChart(compared)) {
      problems.push(`${CHART_PATH} does not show the newest comparison: run \`pnpm bench:chart\``)
    }
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`bench docs: ${problem}`)
    process.exit(1)
  }
  console.log('bench docs: docs/performance.md shows the newest runs')
} else {
  console.error('usage: node bench/docs.mjs update|check')
  process.exit(1)
}
