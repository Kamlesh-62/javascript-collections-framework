// The size report command's logic, for a given repository root, so it can be tested on a small tree.
//
// Each runtime export of dist/index.js is bundled alone (an entry `export { X } from` the build),
// and the whole package once (`export * from`), minified, with the build tool's own bundler; the
// minified bytes and the gzipped (level 9) bytes are recorded.

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { Rolldown } from 'tsdown'
import { compareSizes, formatChanges, formatReport, parseReport } from './size-compare.mjs'

export const SIZE_REPORT_PATH = 'api/javascript-collections-framework.size.json'

/** @typedef {import('./size-compare.mjs').SizeEntry} SizeEntry */
/** @typedef {(entryFile: string) => Promise<string>} Bundler */

/** Bundles one entry file into minified ESM with the build tool's bundler. @type {Bundler} */
export async function bundleMinified(entryFile) {
  const bundle = await Rolldown.rolldown({
    input: entryFile,
    treeshake: true,
    logLevel: 'silent',
    transform: { target: 'es2015' },
  })
  try {
    const output = await bundle.generate({ format: 'esm', minify: true, comments: false })
    return output.output[0].code
  } finally {
    await bundle.close()
  }
}

/** @param {string} a @param {string} b @returns {number} */
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Measures the whole package and every runtime export alone. Each entry is bundled twice; the
 * minified sizes must agree.
 * @param {string} root
 * @param {Bundler} [bundle]
 * @returns {Promise<{ ok: true, entries: SizeEntry[] } | { ok: false, message: string }>}
 */
export async function measureSizes(root, bundle = bundleMinified) {
  const dist = join(root, 'dist', 'index.js')
  if (!existsSync(dist))
    return { ok: false, message: 'dist/index.js is missing — run pnpm build first' }

  // The query names the build's content, so a rebuilt file is loaded afresh, not from the cache.
  const version = createHash('sha256').update(readFileSync(dist)).digest('hex').slice(0, 16)
  const names = Object.keys(await import(`${pathToFileURL(dist).href}?${version}`)).sort(byCodeUnit)
  const scratch = join(root, 'node_modules', '.cache', 'jcf-size')
  rmSync(scratch, { recursive: true, force: true })
  mkdirSync(scratch, { recursive: true })
  const from = JSON.stringify(dist.split('\\').join('/'))

  /** @type {SizeEntry[]} */
  const entries = []
  const targets = ['*', ...names]
  for (let i = 0; i < targets.length; i++) {
    const name = /** @type {string} */ (targets[i])
    const entryFile = join(scratch, `entry-${i}.mjs`)
    writeFileSync(
      entryFile,
      name === '*' ? `export * from ${from}\n` : `export { ${name} } from ${from}\n`,
    )
    const first = await bundle(entryFile)
    const second = await bundle(entryFile)
    const minified = Buffer.byteLength(first, 'utf8')
    if (Buffer.byteLength(second, 'utf8') !== minified) {
      return {
        ok: false,
        message: `bundling '${name}' twice gave different minified sizes (${minified} and ${Buffer.byteLength(second, 'utf8')} bytes)`,
      }
    }
    entries.push({ name, minified, gzip: gzipSync(first, { level: 9 }).length })
  }
  return { ok: true, entries }
}

/**
 * Checks the measured sizes against the committed report, or rewrites the report.
 * @param {string} root
 * @param {'check' | 'update'} mode
 * @param {Bundler} [bundle]
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function sizeReport(root, mode, bundle = bundleMinified) {
  const measured = await measureSizes(root, bundle)
  if (!measured.ok) return measured
  const reportFile = join(root, SIZE_REPORT_PATH)

  if (mode === 'update') {
    mkdirSync(join(root, 'api'), { recursive: true })
    writeFileSync(reportFile, formatReport(measured.entries))
    return { ok: true, message: `wrote ${SIZE_REPORT_PATH} (${measured.entries.length} entries)` }
  }

  if (!existsSync(reportFile)) {
    return { ok: false, message: 'no committed size report — run pnpm size:update and commit it' }
  }
  const changes = compareSizes(parseReport(readFileSync(reportFile, 'utf8')), measured.entries)
  if (changes.length > 0) {
    return {
      ok: false,
      message:
        'bundle sizes differ from the committed report (bytes, minified / gzipped):\n' +
        `${formatChanges(changes)}\n` +
        'If the change is intended, update the report with: pnpm size:update',
    }
  }
  return { ok: true, message: `matches the committed report (${measured.entries.length} entries)` }
}
