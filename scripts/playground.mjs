// Runs the playground (examples/playground/index.mjs) against the built package. The file is fed
// to Node from the repository root, so its import of the package by name resolves to this
// package's own build. Run after `pnpm build`.
//   node scripts/playground.mjs

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = readFileSync(join(root, 'examples', 'playground', 'index.mjs'), 'utf8')
const run = spawnSync(process.execPath, ['--input-type=module'], {
  cwd: root,
  input: source,
  encoding: 'utf8',
})
if (run.status !== 0) {
  process.stderr.write(run.stderr ?? `${run.error}\n`)
  console.error('playground: examples/playground/index.mjs failed')
  process.exit(1)
}
console.log('playground: examples/playground/index.mjs runs against the build')
