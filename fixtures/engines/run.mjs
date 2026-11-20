// Usage: node fixtures/engines/run.mjs <quickjs|javascriptcore|spidermonkey|xs|hermes>
// Downloads the engine pinned in engines.json (Linux x64), checks its SHA-256 before unpacking,
// builds Hermes from its checked source, then runs the smoke check on the script-tag build. The
// run passes only when the engine exits 0 and prints the closing line.

import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { checkArchive, engineScript, passed, readEngines } from './lib/engines.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const name = process.argv[2]
const { engines, hermes } = readEngines(readFileSync(join(import.meta.dirname, 'engines.json'), 'utf8'))
const cache = join(import.meta.dirname, '.cache')
mkdirSync(cache, { recursive: true })

/** @param {string} url */
async function download(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`engines: ${url} answered ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

/** Downloads, checks and unpacks; returns the directory holding the engine. */
async function install(/** @type {string} */ engine, /** @type {string} */ url, /** @type {string} */ sum) {
  const dir = join(cache, engine)
  mkdirSync(dir, { recursive: true })
  const bytes = checkArchive(engine, await download(url), sum)
  const file = join(dir, url.split('/').pop() ?? 'archive')
  writeFileSync(file, bytes)
  if (url.endsWith('.zip')) execFileSync('unzip', ['-q', '-o', file, '-d', dir], { stdio: 'inherit' })
  else if (url.endsWith('.tar.gz')) execFileSync('tar', ['-xzf', file, '-C', dir], { stdio: 'inherit' })
  else chmodSync(file, 0o755)
  return dir
}

/** Builds the `hermes` command-line engine from the checked source; returns its path. */
async function buildHermes() {
  const dir = await install('hermes', hermes.url, hermes.sha256)
  const source = join(dir, `hermes-${hermes.tag}`)
  const build = join(dir, 'build')
  execFileSync('cmake', ['-S', source, '-B', build, '-G', 'Ninja', '-DCMAKE_BUILD_TYPE=Release'], { stdio: 'inherit' })
  execFileSync('cmake', ['--build', build, '--target', 'hermes'], { stdio: 'inherit' })
  const binary = join(build, 'bin', 'hermes')
  if (!existsSync(binary)) throw new Error(`engines: the Hermes build left no ${binary}`)
  return binary
}

/** @type {{ binary: string, args: string[], env: Record<string, string> }} */
let target
if (name === 'hermes') {
  target = { binary: await buildHermes(), args: [], env: {} }
} else {
  const entry = engines.find((e) => e.name === name)
  if (entry === undefined) {
    console.error(`usage: node fixtures/engines/run.mjs <${[...engines.map((e) => e.name), 'hermes'].join('|')}>`)
    process.exit(1)
  }
  const dir = await install(entry.name, entry.url, entry.sha256)
  const binary = join(dir, entry.binary)
  chmodSync(binary, 0o755)
  const env = Object.fromEntries(Object.entries(entry.env ?? {}).map(([k, v]) => [k, resolve(dir, v)]))
  target = { binary, args: entry.args, env }
}

const script = engineScript(
  readFileSync(join(root, 'dist', 'index.iife.js'), 'utf8'),
  readFileSync(join(root, 'fixtures', 'bundlers', 'smoke', 'smoke.js'), 'utf8'),
)
const work = mkdtempSync(join(tmpdir(), 'engine-smoke-'))
const file = join(work, 'smoke.js')
writeFileSync(file, script)
const run = spawnSync(target.binary, [...target.args, file], {
  encoding: 'utf8',
  env: { ...process.env, ...target.env },
  timeout: 120_000,
})
const stdout = `${run.stdout ?? ''}${run.stderr ?? ''}`
process.stdout.write(stdout)
const ok = passed({ status: run.status, stdout })
console.log(`engines: ${name} ${ok ? 'passed' : `failed (status ${run.status}${run.error ? `, ${run.error.message}` : ''})`}`)
process.exit(ok ? 0 : 1)
