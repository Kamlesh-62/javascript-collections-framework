// Loads the built package by name through `import` (and `require` where the runtime supports
// require(esm)) and checks both paths reach one copy of the module. Run after `pnpm build`.
//   node scripts/smoke.mjs     bun scripts/smoke.mjs

import { createRequire } from 'node:module'

const esm = await import('javascript-collections-framework')
const require = createRequire(import.meta.url)
const cjs = require('javascript-collections-framework')

const isDeno = 'Deno' in globalThis
const isBun = 'Bun' in globalThis
const runtime = isDeno ? 'deno' : isBun ? 'bun' : `node ${process.versions.node}`
const [major = 0, minor = 0] = (process.versions.node ?? '0.0').split('.').map(Number)
const nodeHasModuleSync =
  !isDeno &&
  !isBun &&
  (major > 22 || (major === 22 && minor >= 12) || (major === 20 && minor >= 19))

if (typeof esm !== 'object' || typeof cjs !== 'object')
  throw new Error('smoke: module did not load')
if (nodeHasModuleSync && cjs !== esm) {
  throw new Error(
    'smoke: require() and import() returned different module copies (dual-package hazard)',
  )
}
console.log(`smoke: ${runtime} loads ESM and CJS${nodeHasModuleSync ? ' — one shared copy' : ''}`)
