// Type-checks a consumer of the built package with every supported TypeScript version and module
// resolution, so declaration changes that break older compilers are caught. Run after `pnpm build`
// (pnpm test:consumers).
//
// The package is copied as an install would see it (package.json + dist/) into a scratch folder,
// next to test/consumers/use-all.ts copied as .ts, .mts and .cts; each version × mode gets its own
// tsconfig. `node10` resolution is checked below TypeScript 6 only (6 deprecates it, 7 removes it).

import { spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runMatrix, tsconfigFor } from './lib/old-typescript.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCRATCH = join(ROOT, 'node_modules', '.cache', 'jcf-consumers')
const PACKAGE = join(SCRATCH, 'node_modules', 'javascript-collections-framework')

for (const file of ['dist/index.js', 'dist/index.d.ts', 'dist/index.d.cts']) {
  if (!existsSync(join(ROOT, file))) {
    console.error(`old typescript: ${file} is missing — run pnpm build first`)
    process.exit(1)
  }
}

rmSync(SCRATCH, { recursive: true, force: true })
mkdirSync(PACKAGE, { recursive: true })
copyFileSync(join(ROOT, 'package.json'), join(PACKAGE, 'package.json'))
cpSync(join(ROOT, 'dist'), join(PACKAGE, 'dist'), { recursive: true })
for (const name of ['consumer.ts', 'consumer.mts', 'consumer.cts']) {
  copyFileSync(join(ROOT, 'test', 'consumers', 'use-all.ts'), join(SCRATCH, name))
}

const result = runMatrix((compiler, mode) => {
  const bin = join(ROOT, 'node_modules', compiler.bin)
  if (!existsSync(bin)) return { status: 'missing', output: '' }
  const config = join(SCRATCH, `tsconfig.${compiler.label}.${mode.label.replace(' ', '-')}.json`)
  writeFileSync(config, `${JSON.stringify(tsconfigFor(mode), null, 2)}\n`)
  const run = spawnSync(process.execPath, [bin, '-p', config], { cwd: SCRATCH, encoding: 'utf8' })
  return { status: run.status === 0 ? 'ok' : 'fail', output: `${run.stdout}${run.stderr}`.trim() }
})
console.log(result.table)
for (const failure of result.failures) console.error(`\n${failure}`)
console.log(result.ok ? 'old typescript: ok' : `old typescript: ${result.failures.length} failed`)
process.exitCode = result.ok ? 0 : 1
