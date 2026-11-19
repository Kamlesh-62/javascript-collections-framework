// Prepares the smoke pages before the browsers start: the ES module page's bundle, built with
// Vite in production mode, and a local copy of the IIFE build.

import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..')

export default async function setup(): Promise<void> {
  const out = join(fixtures, 'smoke', '.out')
  mkdirSync(out, { recursive: true })
  const pkg = createRequire(join(fixtures, 'package.json')).resolve(
    'javascript-collections-framework/package.json',
  )
  for (const file of ['index.iife.js', 'index.iife.js.map']) {
    copyFileSync(join(dirname(pkg), 'dist', file), join(out, file))
  }
  await build({
    configFile: false,
    logLevel: 'warn',
    root: fixtures,
    build: {
      outDir: out,
      emptyOutDir: false,
      minify: true,
      lib: { entry: join(fixtures, 'smoke', 'entry.js'), formats: ['es'], fileName: () => 'esm.js' },
    },
  })
}
