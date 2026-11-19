// The size report: the minified and gzipped bytes the whole package and each export add to a
// bundle, committed so every change shows what it costs.
//
//   node scripts/size-report.mjs check    compare the build with the committed report, then the
//                                         report with the budgets and the docs size table, then
//                                         the packed package (pnpm size:check)
//   node scripts/size-report.mjs update   rewrite the committed report and the docs size table from
//                                         the build; the budget file is never written
//                                         (pnpm size:update)
//
// Both read the existing dist/ (run `pnpm build` first).

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sizeReport } from './lib/size-report.mjs'

const mode = process.argv[2]
if (mode !== 'check' && mode !== 'update') {
  console.error('size report: usage: size-report.mjs check|update')
  process.exit(1)
}
const result = await sizeReport(join(dirname(fileURLToPath(import.meta.url)), '..'), mode)
if (result.ok) console.log(`size report: ${result.message}`)
else console.error(`size report: ${result.message}`)
process.exitCode = result.ok ? 0 : 1
