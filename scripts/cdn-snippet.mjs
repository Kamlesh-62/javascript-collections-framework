// Writes the README's CDN snippet from package.json and the built dist/index.iife.js: the version
// in its src and the SHA-384 integrity value, nothing else. With --check, writes nothing and fails,
// showing both hashes, when the snippet differs from what it would write. Run from the package root.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IIFE, integrityOf, readSnippet, writeSnippet } from './lib/cdn-snippet.mjs'
import { VERSION } from './lib/release-draft.mjs'

const root = process.cwd()
/** @param {string} message @returns {never} */
function fail(message) {
  console.error(message)
  process.exit(1)
}

const args = process.argv.slice(2)
for (const arg of args) if (arg !== '--check') fail(`cdn-snippet: unknown argument ${arg}`)
const check = args.includes('--check')

const version = String(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version)
if (!VERSION.test(version)) fail(`cdn-snippet: package.json has an unexpected version: ${version}`)
const iife = join(root, IIFE)
if (!existsSync(iife)) fail(`cdn-snippet: ${IIFE} is missing; run pnpm build first`)
const integrity = integrityOf(readFileSync(iife))

const readmePath = join(root, 'README.md')
const readme = readFileSync(readmePath, 'utf8')
const snippet = readSnippet(readme)
if ('problems' in snippet) fail(snippet.problems.map((p) => `cdn-snippet: ${p}`).join('\n'))

if (snippet.version === version && snippet.integrity === integrity) {
  console.log(`cdn-snippet: README.md loads ${version} with ${integrity}`)
} else if (check) {
  fail(
    [
      'cdn-snippet: the README.md snippet differs from the build',
      `  README.md: ${snippet.version} ${snippet.integrity ?? '(no integrity)'}`,
      `  build:     ${version} ${integrity}`,
      'Run pnpm build && pnpm cdn:snippet, and commit README.md.',
    ].join('\n'),
  )
} else {
  writeFileSync(readmePath, writeSnippet(readme, version, integrity))
  console.log(`cdn-snippet: README.md now loads ${version} with ${integrity}`)
}
