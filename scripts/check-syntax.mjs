// Fails if any built JavaScript file uses syntax newer than ES2015.
// The package promises to run on ES2015 engines (old browsers, smart TVs, React Native);
// the build target lowers syntax, and this check proves it did.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'acorn'

const DIST = path.join(import.meta.dirname, '..', 'dist')
const EXPECTED = ['index.js', 'index.cjs', 'index.iife.js']
// The ES module build is one file per module, so every file under dist/ is checked.
const present = existsSync(DIST)
  ? readdirSync(DIST, { recursive: true }).map((name) => String(name).split(path.sep).join('/'))
  : []
const files = present.filter((name) => /\.(c?js)$/.test(name)).sort()

let failures = 0
for (const name of files) {
  const source = readFileSync(path.join(DIST, name), 'utf8')
  const sourceType = name.endsWith('.cjs') || name.endsWith('.iife.js') ? 'script' : 'module'
  try {
    parse(source, { ecmaVersion: 2015, sourceType })
    console.log(`✓ ${name} parses as ES2015 (${sourceType})`)
  } catch (error) {
    failures++
    console.log(`✗ ${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// The ES module build must stay one file per module (bundlers such as esbuild rely on it).
const perModule = files.filter((name) => name.endsWith('.js') && !name.endsWith('.iife.js'))
if (!present.includes('collections/array-list.js') || perModule.length < 10) {
  failures++
  console.log(
    '✗ the ES module build is not one file per module (dist/collections/array-list.js missing)',
  )
}

for (const name of EXPECTED) {
  if (!present.includes(name)) {
    failures++
    console.log(`✗ ${name} is missing from dist/ — the build did not produce it`)
  }
}
process.exit(failures ? 1 : 0)
