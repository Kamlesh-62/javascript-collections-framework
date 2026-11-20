// Usage: node fixtures/engines/update.mjs <engine|hermes> <version> [--write]
// Prints the new URL and SHA-256 of an engine at a version (for Hermes, a React Native version);
// with --write, also saves them to engines.json. Review the printed sum before writing.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readEngines } from './lib/engines.mjs'
import { updateEntry } from './lib/update.mjs'

const [name, version] = process.argv.slice(2)
if (name === undefined || version === undefined) {
  console.error('usage: node fixtures/engines/update.mjs <engine|hermes> <version> [--write]')
  process.exit(1)
}
const file = join(import.meta.dirname, 'engines.json')
const data = readEngines(readFileSync(file, 'utf8'))
const get = async (/** @type {string} */ url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`update: ${url} answered ${response.status}`)
  return response
}
const result = await updateEntry(
  data,
  name,
  version,
  async (url) => new Uint8Array(await (await get(url)).arrayBuffer()),
  async (url) => (await get(url)).text(),
)
console.log(result.summary)
if (process.argv.includes('--write')) {
  writeFileSync(file, `${JSON.stringify(result.data, null, 2)}\n`)
  console.log('update: engines.json written')
} else {
  console.log('update: nothing written (add --write after reviewing the sum)')
}
