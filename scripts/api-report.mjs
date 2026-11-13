// The API report: the package's public type surface, normalised and committed, so any change to it
// shows up as a reviewed diff.
//
//   node scripts/api-report.mjs check    compare the build with the committed report (pnpm api:check)
//   node scripts/api-report.mjs update   rewrite the committed report from the build (pnpm api:update)
//
// Both read the existing dist/ (run `pnpm build` first). Both fail if the declarations contain an
// `@internal` tag or a declaration that is not exported, or if the ESM and CommonJS declarations
// differ.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apiReport } from './lib/api-report.mjs'

const mode = process.argv[2]
if (mode !== 'check' && mode !== 'update') {
  console.error('api report: usage: api-report.mjs check|update')
  process.exit(1)
}
const result = apiReport(join(dirname(fileURLToPath(import.meta.url)), '..'), mode)
if (result.ok) console.log(`api report: ${result.message}`)
else console.error(`api report: ${result.message}`)
process.exitCode = result.ok ? 0 : 1
