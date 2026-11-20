// The published package as npm packs it: its file list and unpacked size, read from
// `npm pack --dry-run --json`, and the checks the size command runs on it.

import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/** @typedef {{ unpackedSize: number, files: string[] }} Pack */
/** @typedef {(root: string) => Pack} Packer */

/**
 * Packs the package in `root` without writing a tarball or running any script, and returns its
 * unpacked size in bytes and its file paths.
 * @type {Packer}
 */
export function packDryRun(root) {
  const windows = process.platform === 'win32'
  // The arguments are constants; on Windows the npm shim is a .cmd file, which needs a shell.
  const out = execFileSync(
    windows ? 'npm.cmd' : 'npm',
    ['pack', '--dry-run', '--json', '--ignore-scripts'],
    { cwd: root, encoding: 'utf8', shell: windows, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const [result] = JSON.parse(out)
  return {
    unpackedSize: result.unpackedSize,
    files: result.files.map((/** @type {{ path: string }} */ f) => f.path),
  }
}

/**
 * The text of every built JavaScript file under `dist/`, keyed by its path from `root`.
 * @param {string} root
 * @returns {Map<string, string>}
 */
export function builtScripts(root) {
  /** @type {Map<string, string>} */
  const texts = new Map()
  const walk = (/** @type {string} */ dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (/\.(c|m)?js$/.test(entry.name))
        texts.set(relative(root, path).split('\\').join('/'), readFileSync(path, 'utf8'))
    }
  }
  walk(join(root, 'dist'))
  return texts
}

/** The built files every package must contain. */
export const PACKED_REQUIRED = Object.freeze([
  'dist/index.cjs',
  'dist/index.d.cts',
  'dist/index.d.ts',
  'dist/index.iife.js',
  'dist/index.js',
])

const PACKED_FILES = new Set(['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md'])
const PACKED_BUILD = /^dist\/.+\.(js|cjs|d\.ts|d\.cts)$/

/**
 * Every packed file outside the allowlist (`package.json`, `README.md`, `LICENSE`,
 * `CHANGELOG.md`, and `.js`, `.cjs`, `.d.ts` and `.d.cts` files under `dist/`), and every
 * required build file that is not packed. Source maps are left to their own check.
 * @param {readonly string[]} files - The packed paths.
 * @returns {string[]}
 */
export function packedFileProblems(files) {
  /** @type {string[]} */
  const problems = []
  const packed = new Set(files)
  for (const file of [...files].sort()) {
    if (file.endsWith('.map') || PACKED_FILES.has(file) || PACKED_BUILD.test(file)) continue
    problems.push(`the package contains ${file}, which is not in the allowlist of published files`)
  }
  for (const file of PACKED_REQUIRED)
    if (!packed.has(file)) problems.push(`the package does not contain ${file}`)
  return problems
}

/**
 * Every problem with a packed package: a file outside the allowlist or a required file missing,
 * a source map in it, a built file that points to a source
 * map, type declarations without their TSDoc, and an unpacked size over its budget.
 * @param {Pack} pack
 * @param {ReadonlyMap<string, string>} scripts - From {@link builtScripts}.
 * @param {string | undefined} declarations - The text of `dist/index.d.ts`.
 * @param {number} budget - The unpacked budget in bytes.
 * @param {number} [sourceExamples] - The number of `@example` tags in `src/`.
 * @returns {string[]}
 */
export function packageProblems(pack, scripts, declarations, budget, sourceExamples = 0) {
  /** @type {string[]} */
  const problems = packedFileProblems(pack.files)
  for (const file of pack.files.filter((f) => f.endsWith('.map')).sort())
    problems.push(`the package contains the source map ${file}`)
  for (const [file, text] of [...scripts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (/[#@] sourceMappingURL=/.test(text)) problems.push(`${file} has a sourceMappingURL comment`)
  }
  if (declarations === undefined) problems.push('dist/index.d.ts is missing')
  else problems.push(...tsdocProblems(declarations, sourceExamples))
  if (pack.unpackedSize > budget)
    problems.push(
      `the package is ${pack.unpackedSize} bytes unpacked, over its budget of ${budget} bytes`,
    )
  return problems
}

/**
 * Every sign that the type declarations lost their TSDoc: a top-level `export declare` without a
 * doc comment that has a summary and an `@example` right above it, and fewer `@example` tags than
 * the source has.
 * @param {string} declarations - The text of `dist/index.d.ts`.
 * @param {number} sourceExamples - The number of `@example` tags in `src/`.
 * @returns {string[]}
 */
export function tsdocProblems(declarations, sourceExamples) {
  /** @type {string[]} */
  const problems = []
  const lines = declarations.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const declared = /^export declare (?:abstract )?(?:class|function|const) (\w+)/.exec(
      lines[i] ?? '',
    )
    if (declared === null) continue
    const end = i - 1
    let start = end
    while (start >= 0 && !(lines[start] ?? '').trimStart().startsWith('/**')) start--
    const block = /\*\/\s*$/.test(lines[end] ?? '') && start >= 0 ? lines.slice(start, end + 1) : []
    const summary = block.map((l) => l.replace(/^\s*\/?\*+\/?\s?/, '').trim()).find((l) => l !== '')
    if (summary === undefined || summary.startsWith('@') || !block.join('\n').includes('@example'))
      problems.push(`dist/index.d.ts: ${declared[1]} has no summary and @example`)
  }
  const examples = declarations.split('@example').length - 1
  if (examples < sourceExamples)
    problems.push(
      `dist/index.d.ts has ${examples} @example tags, fewer than the ${sourceExamples} in src/`,
    )
  return problems
}

/**
 * The number of `@example` tags in the TypeScript files under `src/`.
 * @param {string} root
 * @returns {number}
 */
export function sourceExampleCount(root) {
  let count = 0
  const walk = (/** @type {string} */ dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.ts'))
        count += readFileSync(path, 'utf8').split('@example').length - 1
    }
  }
  if (existsSync(join(root, 'src'))) walk(join(root, 'src'))
  return count
}
