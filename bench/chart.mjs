// Writes docs/images/benchmarks.svg from the newest comparison run in bench/results/. Times
// nothing.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CHART_PATH, renderChart } from './lib/chart.mjs'
import { latestCompare } from './lib/compare.mjs'
import { RESULTS_DIR } from './lib/results.mjs'

const root = join(import.meta.dirname, '..')
const latest = latestCompare(join(root, RESULTS_DIR))
if (latest === undefined) {
  console.error('bench chart: no comparison run in bench/results; run `pnpm bench:compare` first')
  process.exit(1)
}
const path = join(root, CHART_PATH)
mkdirSync(dirname(path), { recursive: true })
writeFileSync(path, renderChart(latest.result))
console.log(`bench chart: wrote ${CHART_PATH} from ${latest.file}`)
