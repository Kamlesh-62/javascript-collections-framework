// Runs the comparison with other collection libraries against the built package, at every size,
// on seeded input, and saves the run under bench/results/. Before timing anything it checks that
// every compared package is installed at its pinned version and that every side of every case
// returns the same checksum as this library's at every size; either failure stops the run with no
// file written.
//
// `--smoke` checks the versions and runs every case once at the smallest size, timing nothing and
// saving nothing. `--sizes 1000,100000` limits the sizes. `--reverse` times this library's side of
// each case last instead of first, to show whether a ratio depends on the order.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  compareFile,
  compareOrder,
  disagreements,
  THIS,
  versionProblems,
} from '../../bench/lib/compare.mjs'
import { measure } from '../../bench/lib/harness.mjs'
import { formatRate, runInfo } from '../../bench/lib/results.mjs'
import { compareCases, LIBRARIES, SIZES } from './cases.mjs'

const here = import.meta.dirname
const root = join(here, '..', '..')
const entry = join(root, 'dist', 'index.js')
if (!existsSync(entry)) {
  console.error('bench compare: dist/index.js is missing; run `pnpm build` first')
  process.exit(1)
}

/** @param {string} path */
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

// The installed versions against the pins, before anything is imported.
/** @type {Record<string, string>} */
const pins = readJson(join(here, 'package.json')).devDependencies
/** @type {Record<string, string | undefined>} */
const installed = {}
for (const name of Object.keys(pins)) {
  const manifest = join(here, 'node_modules', name, 'package.json')
  installed[name] = existsSync(manifest) ? readJson(manifest).version : undefined
}
const versions = versionProblems(pins, installed)
if (versions.length > 0) {
  for (const problem of versions) console.error(`bench compare: ${problem}`)
  process.exit(1)
}

const args = process.argv.slice(2)
const smoke = args.includes('--smoke')
const order = compareOrder(args)
const sizesArg = args[args.indexOf('--sizes') + 1]
const sizes = smoke
  ? [/** @type {number} */ (SIZES[0])]
  : args.includes('--sizes') && sizesArg !== undefined
    ? sizesArg.split(',').map(Number)
    : SIZES
if (!sizes.every((n) => Number.isInteger(n) && n > 0)) {
  console.error('bench compare: --sizes takes positive whole numbers, such as --sizes 1000,100000')
  process.exit(1)
}

const lib = await import(pathToFileURL(entry).href)
/** @type {Record<string, any>} */
const others = {}
for (const { packages } of LIBRARIES) {
  for (const name of packages) others[name] = await import(name)
}
const version = readJson(join(root, 'package.json')).version

// Every side of every case at every size once, before any timing.
/** @type {import('../../bench/lib/compare.mjs').Check[]} */
const checks = []
for (const size of sizes) {
  for (const c of compareCases(lib, others, size)) {
    for (const side of c.sides) {
      checks.push({
        case: c.case,
        operation: c.operation,
        size,
        library: side.library,
        checksum: side.run(side.setup()),
      })
    }
  }
}
const differ = disagreements(checks)
if (differ.length > 0) {
  for (const problem of differ) console.error(`bench compare: ${problem}`)
  console.error('bench compare: the libraries disagree; nothing was timed or saved')
  process.exit(1)
}
if (smoke) {
  console.log(`bench compare smoke: ${checks.length} sides agree; versions match the pins`)
  process.exit(0)
}

/** @type {import('../../bench/lib/compare.mjs').CompareCase[]} */
const cases = []
for (const size of sizes) {
  for (const c of compareCases(lib, others, size)) {
    const timedOrder = order === 'this-last' ? [...c.sides].reverse() : c.sides
    /** @type {Map<string, { hz: number, rme: number }>} */
    const rates = new Map()
    for (const side of timedOrder) {
      const state = side.setup()
      const m = measure(() => side.run(state))
      rates.set(side.library, { hz: m.hz * c.ops, rme: m.rme })
    }
    const results = c.sides.map((side) => {
      const rate = /** @type {{ hz: number, rme: number }} */ (rates.get(side.library))
      return { library: side.library, name: side.name, hz: rate.hz, rme: rate.rme }
    })
    cases.push({ case: c.case, operation: c.operation, size, results })
    const ours = /** @type {{ hz: number }} */ (results.find((r) => r.library === THIS))
    console.log(
      `${c.case.padEnd(14)} ${c.operation.padEnd(36)} ${String(size).padStart(9)}  ` +
        results
          .map((r) => `${r.library} ${formatRate(r.hz)} (${(r.hz / ours.hz).toPrecision(2)}×)`)
          .join(', '),
    )
  }
}
const base = runInfo(version)
const info = { ...base, order }
/** @type {Record<string, string>} */
const packages = {}
for (const name of Object.keys(pins).sort()) packages[name] = /** @type {string} */ (installed[name])
const file = compareFile(info)
mkdirSync(join(root, 'bench', 'results'), { recursive: true })
writeFileSync(join(root, file), `${JSON.stringify({ info, packages, sizes, cases }, null, 2)}\n`)
console.log(`bench compare: saved ${file}`)
