// Bundles entry.js with Metro for a React Native app (production, minified) and runs the bundle on
// the Hermes built by `node fixtures/engines/run.mjs hermes`. With `--bundle-only`, stops after the
// bundle. The run passes only when Hermes exits 0 and prints the closing line.

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { passed } from '../engines/lib/engines.mjs'

const here = import.meta.dirname
const require = createRequire(import.meta.url)
const Metro = require('metro')
const out = join(here, 'build')
mkdirSync(out, { recursive: true })
const bundle = join(out, 'index.bundle.js')

const config = await Metro.loadConfig({ config: join(here, 'metro.config.cjs'), cwd: here })
await Metro.runBuild(config, {
  entry: join(here, 'entry.js'),
  out: bundle,
  platform: 'ios',
  dev: false,
  minify: true,
})
console.log(`react-native: bundled ${bundle}`)
if (process.argv.includes('--bundle-only')) process.exit(0)

const hermes = resolve(here, '..', 'engines', '.cache', 'hermes', 'build', 'bin', 'hermes')
if (!existsSync(hermes)) {
  console.error(`react-native: ${hermes} is missing; run \`node fixtures/engines/run.mjs hermes\` first`)
  process.exit(1)
}
const run = spawnSync(hermes, [bundle], { encoding: 'utf8', timeout: 120_000 })
const stdout = `${run.stdout ?? ''}${run.stderr ?? ''}`
process.stdout.write(stdout)
const ok = passed({ status: run.status, stdout })
console.log(`react-native: ${ok ? 'passed' : `failed (status ${run.status})`}`)
process.exit(ok ? 0 : 1)
