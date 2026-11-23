// Runs the benchmarks against the built package: every collection against its closest native
// structure, at every size, on seeded input. Prints a table and saves the run under
// bench/results/. `--smoke` runs each case once at the smallest size and saves nothing;
// `--sizes 1000,100000` limits the sizes. `--library-first` times each case's library side before
// its native side, to show whether a ratio depends on the order.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { benchCases, SIZES } from './lib/cases.mjs'
import { measure } from './lib/harness.mjs'
import { formatRate, resultFile, runInfo, runOrder, sortCases } from './lib/results.mjs'

const root = join(import.meta.dirname, '..')
const entry = join(root, 'dist', 'index.js')
if (!existsSync(entry)) {
  console.error('bench: dist/index.js is missing; run `pnpm build` first')
  process.exit(1)
}
const args = process.argv.slice(2)
const smoke = args.includes('--smoke')
const order = runOrder(args)
const sizesArg = args[args.indexOf('--sizes') + 1]
const sizes = smoke
  ? [/** @type {number} */ (SIZES[0])]
  : args.includes('--sizes') && sizesArg !== undefined
    ? sizesArg.split(',').map(Number)
    : SIZES
if (!sizes.every((n) => Number.isInteger(n) && n > 0)) {
  console.error('bench: --sizes takes positive whole numbers, such as --sizes 1000,100000')
  process.exit(1)
}
const lib = await import(pathToFileURL(entry).href)
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version

/** @type {import('./lib/results.mjs').CaseResult[]} */
const results = []
let ran = 0
for (const size of sizes) {
  for (const c of benchCases(lib, size)) {
    if (smoke) {
      c.native.run(c.native.setup())
      c.library.run(c.library.setup())
      ran++
      continue
    }
    const timed = (/** @type {import('./lib/cases.mjs').Side} */ side) => {
      const state = side.setup()
      const m = measure(() => side.run(state))
      return { hz: m.hz * c.ops, rme: m.rme }
    }
    /** @type {{ hz: number, rme: number }} */
    let nativeRate
    /** @type {{ hz: number, rme: number }} */
    let library
    if (order === 'library-first') {
      library = timed(c.library)
      nativeRate = timed(c.native)
    } else {
      nativeRate = timed(c.native)
      library = timed(c.library)
    }
    const native = { name: c.native.name, ...nativeRate }
    results.push({ collection: c.collection, operation: c.operation, size, native, library })
    console.log(
      `${c.collection.padEnd(14)} ${c.operation.padEnd(36)} ${String(size).padStart(9)}  ` +
        `${formatRate(native.hz).padStart(7)} vs ${formatRate(library.hz).padStart(7)}  ` +
        `${(library.hz / native.hz).toPrecision(2)}×`,
    )
  }
}
if (smoke) {
  console.log(`bench smoke: ${ran} cases ran`)
} else {
  const info = runInfo(version, new Date(), order)
  const file = join(root, resultFile(info))
  mkdirSync(join(root, 'bench', 'results'), { recursive: true })
  writeFileSync(file, `${JSON.stringify({ info, sizes, cases: sortCases(results) }, null, 2)}\n`)
  console.log(`bench: saved ${resultFile(info)}`)
}
