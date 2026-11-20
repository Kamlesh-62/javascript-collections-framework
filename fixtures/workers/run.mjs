// Runs the smoke check of the built ES module package inside the Cloudflare Workers runtime
// (workerd, through Miniflare): every file of dist/ is a module of the worker, the worker imports
// the package and the smoke check, and one request answers with the closing line.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { Miniflare } from 'miniflare'
import { passed } from '../engines/lib/engines.mjs'

const root = resolve(import.meta.dirname, '..', '..')
const dist = join(root, 'dist')

/** Every built ES module under dist/, as a path relative to dist/ and its text. */
function distModules() {
  /** @type {Array<{ type: 'ESModule', path: string, contents: string }>} */
  const modules = []
  const walk = (/** @type {string} */ dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.js') && entry.name !== 'index.iife.js')
        modules.push({ type: 'ESModule', path: relative(dist, path).split('\\').join('/'), contents: readFileSync(path, 'utf8') })
    }
  }
  walk(dist)
  return modules
}

const worker = `
import * as lib from './index.js'
import { smoke } from './smoke.js'

export default {
  fetch() {
    try {
      const counts = smoke(lib)
      return new Response('smoke: ok ' + counts.collections + ' collections, ' + counts.errors + ' errors\\n')
    } catch (error) {
      return new Response('smoke: failed: ' + (error && error.message ? error.message : String(error)) + '\\n', { status: 500 })
    }
  },
}
`

const mf = new Miniflare({
  compatibilityDate: '2026-07-30',
  modules: [
    { type: 'ESModule', path: 'worker.mjs', contents: worker },
    { type: 'ESModule', path: 'smoke.js', contents: readFileSync(join(root, 'fixtures', 'bundlers', 'smoke', 'smoke.js'), 'utf8') },
    ...distModules(),
  ],
  modulesRoot: '/',
})
let ok = false
try {
  const response = await mf.dispatchFetch('http://localhost/')
  const stdout = await response.text()
  process.stdout.write(stdout)
  ok = passed({ status: response.ok ? 0 : response.status, stdout })
} finally {
  await mf.dispose()
}
console.log(`workers: ${ok ? 'passed' : 'failed'}`)
process.exit(ok ? 0 : 1)
