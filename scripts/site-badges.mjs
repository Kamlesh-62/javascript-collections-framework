// Adds the package badges to the documentation site: the whole package's minified and gzipped
// size, from the committed size report, and its runtime dependency count, from package.json.
//
//   node scripts/site-badges.mjs <out dir>
//
// writes <out>/size.svg and <out>/dependencies.svg. The dependencies badge only ever says 0: a
// dependency of any kind stops the script, so the badge cannot claim what is not true.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { flatBadge, formatKb } from './lib/badge.mjs'
import { parseReport } from './lib/size-compare.mjs'
import { SIZE_REPORT_PATH } from './lib/size-report.mjs'

/** The `package.json` fields that would add a package to an install. */
export const DEPENDENCY_FIELDS = Object.freeze([
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'bundleDependencies',
])

/**
 * The size badge: the whole package (`*`) minified and gzipped, in kB rounded up.
 *
 * @param {readonly { name: string, minified: number, gzip: number }[]} report
 * @returns {string}
 */
export function sizeBadge(report) {
  const whole = report.find((e) => e.name === '*')
  if (whole === undefined)
    throw new Error('site-badges: the size report has no whole-package entry')
  return flatBadge('min+gzip', formatKb(whole.gzip), '#1f6feb')
}

/**
 * The dependencies badge, "dependencies: 0".
 *
 * @param {Record<string, unknown>} pkg - A parsed `package.json`.
 * @returns {string}
 * @throws {Error} naming the first entry of any dependency field.
 */
export function dependenciesBadge(pkg) {
  for (const field of DEPENDENCY_FIELDS) {
    const value = pkg[field]
    const names = Array.isArray(value)
      ? value
      : value !== null && typeof value === 'object'
        ? Object.keys(value)
        : value === true
          ? ['(all)']
          : []
    if (names.length > 0)
      throw new Error(`site-badges: package.json has ${field} entry '${names[0]}'`)
  }
  return flatBadge('dependencies', '0', '#2e7d32')
}

/**
 * Writes both badges under `outDir`.
 *
 * @param {string} root - The repository root.
 * @param {string} outDir
 */
export function writeSiteBadges(root, outDir) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const report = parseReport(readFileSync(path.join(root, SIZE_REPORT_PATH), 'utf8'))
  const dependencies = dependenciesBadge(pkg)
  const size = sizeBadge(report)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(path.join(outDir, 'size.svg'), size)
  writeFileSync(path.join(outDir, 'dependencies.svg'), dependencies)
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const outDir = process.argv[2]
  if (outDir === undefined) {
    console.error('usage: node scripts/site-badges.mjs <out dir>')
    process.exit(2)
  }
  writeSiteBadges(path.join(path.dirname(fileURLToPath(import.meta.url)), '..'), outDir)
  console.log(`site badges: size and dependencies → ${outDir}`)
}
