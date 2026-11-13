// Loads the built ESM and CommonJS files as two separate copies of the package in one process and
// checks that each accepts the other's values, and that values from another major version are
// refused. Run after `pnpm build` (pnpm test:copies).

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { checkTwoCopies } from './lib/two-copies.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ESM = join(ROOT, 'dist', 'index.js')
const CJS = join(ROOT, 'dist', 'index.cjs')

for (const file of [ESM, CJS]) {
  if (!existsSync(file)) {
    console.error(`two copies: ${file.slice(ROOT.length + 1)} is missing — run pnpm build first`)
    process.exit(1)
  }
}

const esm = await import(pathToFileURL(ESM).href)
const cjs = createRequire(import.meta.url)(CJS)
const result = checkTwoCopies({ ...esm }, cjs)
for (const line of result.lines) console.log(line)
for (const failure of result.failures) console.error(`  ✗ ${failure}`)
process.exitCode = result.ok ? 0 : 1
