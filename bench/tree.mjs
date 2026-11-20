// Compares the balanced binary tree behind `TreeMap` with a B+ tree prototype on the same sorted-map
// operations and sizes, and measures the gzipped size of both. Saves the run under bench/results/.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { bundleMinified } from '../scripts/lib/size-report.mjs'
import { BPlusTreeMap } from './bplus-tree.mjs'
import { SIZES } from './lib/cases.mjs'
import { measure, shuffled } from './lib/harness.mjs'
import { formatRate, runInfo } from './lib/results.mjs'

const root = join(import.meta.dirname, '..')
const entry = join(root, 'dist', 'index.js')
if (!existsSync(entry)) {
  console.error('bench: dist/index.js is missing; run `pnpm build` first')
  process.exit(1)
}
const { TreeMap } = await import(pathToFileURL(entry).href)
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const OPS = 1_000

/**
 * The operations, each a pass over a map of n entries that leaves it as it was.
 * @param {number} n
 */
function operations(n) {
  const keys = shuffled(n, 41).map((k) => k * 2)
  const entries = keys.map((k) => /** @type {[number, number]} */ ([k, k + 1]))
  const queries = shuffled(n, 42)
    .slice(0, Math.min(OPS, n))
    .map((q) => q * 2)
  const ops = queries.length
  /** @type {Array<{ name: string, ops: number, run: (make: (e?: Iterable<[number, number]>) => any) => () => number }>} */
  return [
    { name: 'build from entries', ops: n, run: (make) => () => make(entries).size },
    {
      name: 'set new keys in seeded order',
      ops: n,
      run: (make) => () => {
        const m = make()
        for (const k of keys) m.set(k, k)
        return m.size
      },
    },
    {
      name: 'get',
      ops,
      run: (make) => {
        const m = make(entries)
        return () => {
          let s = 0
          for (const q of queries) s += m.get(q)
          return s
        }
      },
    },
    {
      name: 'delete and set again',
      ops,
      run: (make) => {
        const m = make(entries)
        return () => {
          let s = 0
          for (const q of queries) {
            if (m.delete(q)) s++
            m.set(q, q + 1)
          }
          return s
        }
      },
    },
    {
      name: 'floor',
      ops,
      run: (make) => {
        const m = make(entries)
        const floor =
          m instanceof BPlusTreeMap
            ? (/** @type {number} */ q) => m.floorKey(q)
            : (/** @type {number} */ q) => m.floorEntry(q)?.key
        return () => {
          let s = 0
          for (const q of queries) s += floor(q + 1) ?? 0
          return s
        }
      },
    },
    {
      name: 'ceiling',
      ops,
      run: (make) => {
        const m = make(entries)
        const ceiling =
          m instanceof BPlusTreeMap
            ? (/** @type {number} */ q) => m.ceilingKey(q)
            : (/** @type {number} */ q) => m.ceilingEntry(q)?.key
        return () => {
          let s = 0
          for (const q of queries) s += ceiling(q - 1) ?? 0
          return s
        }
      },
    },
    {
      name: 'iterate',
      ops: n,
      run: (make) => {
        const m = make(entries)
        return () => {
          let s = 0
          for (const [k] of m) s += k
          return s
        }
      },
    },
  ]
}

/** @type {(e?: Iterable<[number, number]>) => any} */
const makeTree = (e) => new TreeMap(e)
/** @type {(e?: Iterable<[number, number]>) => any} */
const makePlus = (e) => new BPlusTreeMap(e)

/** @type {Array<{ operation: string, size: number, tree: { hz: number, rme: number }, bplus: { hz: number, rme: number } }>} */
const rows = []
for (const n of SIZES) {
  for (const op of operations(n)) {
    const a = op.run(makeTree)
    const b = op.run(makePlus)
    if (a() !== b()) throw new Error(`bench tree: ${op.name} at ${n} gives different answers`)
    const tree = measure(a)
    const plus = measure(b)
    const row = {
      operation: op.name,
      size: n,
      tree: { hz: tree.hz * op.ops, rme: tree.rme },
      bplus: { hz: plus.hz * op.ops, rme: plus.rme },
    }
    rows.push(row)
    console.log(
      `${op.name.padEnd(30)} ${String(n).padStart(9)}  tree ${formatRate(row.tree.hz).padStart(7)}  ` +
        `B+ ${formatRate(row.bplus.hz).padStart(7)}  ${(row.bplus.hz / row.tree.hz).toPrecision(2)}×`,
    )
  }
}

// Size: the TreeMap bundle with the ordered tree swapped for the prototype, estimated as
// TreeMap − ordered tree + prototype (gzip level 9 each).
const work = mkdtempSync(join(tmpdir(), 'bench-tree-'))
const gzip = async (/** @type {string} */ file) =>
  gzipSync(await bundleMinified(file), { level: 9 }).length
let sizes
try {
  const treeEntry = join(work, 'tree-map.mjs')
  writeFileSync(treeEntry, `export { TreeMap } from ${JSON.stringify(pathToFileURL(entry).href)}\n`)
  const engineEntry = join(work, 'ordered-tree.mjs')
  writeFileSync(
    engineEntry,
    `export * from ${JSON.stringify(join(root, 'src', 'internal', 'engines', 'ordered-tree.ts'))}\n`,
  )
  sizes = {
    treeMap: await gzip(treeEntry),
    orderedTree: await gzip(engineEntry),
    bplus: await gzip(join(root, 'bench', 'bplus-tree.mjs')),
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log(
  `\nsizes (gzip): TreeMap ${sizes.treeMap} B, ordered tree ${sizes.orderedTree} B, B+ tree ${sizes.bplus} B`,
)

const info = runInfo(version)
mkdirSync(join(root, 'bench', 'results'), { recursive: true })
const file = `bench/results/${info.date}-tree.json`
writeFileSync(join(root, file), `${JSON.stringify({ info, rows, sizes }, null, 2)}\n`)
console.log(`bench tree: saved ${file}`)
