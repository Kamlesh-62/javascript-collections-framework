// The runnable recipes in examples/recipes/: their list, the header each opens with, and the
// checks shared by scripts/recipes.mjs and the tests: every `console.log` is a top-level statement
// with the text it prints in a trailing comment, a recipe runs without error and its output matches
// those comments line by line, and a recipe imports only named exports of the package.

import { spawnSync } from 'node:child_process'

/** The folder of the recipes, from the repository root. */
export const RECIPES_DIR = 'examples/recipes'

/** The package a recipe imports from. */
export const PACKAGE_NAME = 'javascript-collections-framework'

/**
 * @typedef {object} Recipe
 * @property {string} file - The file name in {@link RECIPES_DIR}.
 * @property {string} task - The task, as the recipes page names it.
 * @property {string[]} uses - The collections the recipe imports and shows.
 * @property {string[]} pages - The collection pages in `docs/` that link to the recipe.
 */

/** @type {readonly Recipe[]} The recipes in the order of the recipes page's table. */
export const RECIPES = [
  {
    file: 'top-k.mjs',
    task: 'The k largest values of a stream',
    uses: ['PriorityQueue'],
    pages: ['docs/priority-queues.md'],
  },
  {
    file: 'merge-sorted.mjs',
    task: 'Merging sorted arrays',
    uses: ['PriorityQueue'],
    pages: ['docs/priority-queues.md'],
  },
  {
    file: 'sliding-window-max.mjs',
    task: 'The maximum of each sliding window',
    uses: ['ArrayDeque'],
    pages: ['docs/deques.md'],
  },
  {
    file: 'lru-cache.mjs',
    task: 'An LRU cache',
    uses: ['LinkedHashMap'],
    pages: ['docs/linked-hash-maps.md'],
  },
  {
    file: 'booking-calendar.mjs',
    task: 'A booking calendar that rejects overlaps',
    uses: ['TreeMap'],
    pages: ['docs/sorted-maps.md'],
  },
  {
    file: 'grid-shortest-path.mjs',
    task: 'The shortest path on a grid',
    uses: ['HashSet', 'ArrayDeque'],
    pages: ['docs/deques.md', 'docs/sets.md'],
  },
  {
    file: 'running-median.mjs',
    task: 'A running median',
    uses: ['PriorityQueue'],
    pages: ['docs/priority-queues.md'],
  },
  {
    file: 'recent-distinct.mjs',
    task: 'The most recent distinct items',
    uses: ['LinkedHashSet'],
    pages: ['docs/linked-hash-sets.md'],
  },
  {
    file: 'time-range.mjs',
    task: 'The events inside a time range',
    uses: ['TreeMap'],
    pages: ['docs/sorted-maps.md'],
  },
]

/** The labels of the comment lines a recipe opens with, in order. */
export const HEADER = ['// Task:', '// Uses:', '// Time:', '// With Array, Map and Set only:']

/**
 * @typedef {object} LogLine
 * @property {number} line - The 1-based line of the `console.log`.
 * @property {string} expected - The text after `// ` on that line: what the call prints.
 */

/**
 * The `console.log` calls of a recipe, each with the text its trailing comment says it prints, and
 * a problem for each call that has no trailing comment or is not at the start of a line (an
 * indented call sits inside a block, so it is not a top-level statement). Comment lines are
 * skipped.
 * @param {string} file - The name used in problems.
 * @param {string} source
 * @returns {{ logs: LogLine[], problems: string[] }}
 */
export function logLines(file, source) {
  /** @type {LogLine[]} */
  const logs = []
  /** @type {string[]} */
  const problems = []
  const lines = source.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i] ?? ''
    if (/^\s*\/\//.test(text) || !/\bconsole\.log\(/.test(text)) continue
    if (!/^console\.log\(/.test(text)) {
      problems.push(`${file}:${i + 1}: console.log is not a top-level statement`)
      continue
    }
    const comment = /^console\.log\(.*\) \/\/ (.*)$/.exec(text)
    if (!comment) {
      problems.push(`${file}:${i + 1}: console.log has no result comment on its line`)
      continue
    }
    logs.push({ line: i + 1, expected: comment[1] ?? '' })
  }
  return { logs, problems }
}

/**
 * The differences between what a recipe printed and what its result comments say, pairing output
 * lines with comments in source order: a differing line names the file, the line and both texts;
 * an output line with no comment, or a comment with no output line, is a difference too.
 * @param {string} file - The name used in problems.
 * @param {readonly LogLine[]} logs
 * @param {string} stdout
 * @returns {string[]}
 */
export function compareOutput(file, logs, stdout) {
  const printed = stdout.split(/\r?\n/)
  if (printed[printed.length - 1] === '') printed.pop()
  /** @type {string[]} */
  const problems = []
  const count = Math.max(printed.length, logs.length)
  for (let i = 0; i < count; i++) {
    const log = logs[i]
    const text = printed[i]
    if (log === undefined) {
      problems.push(`${file}: output line ${i + 1} "${text}" has no result comment`)
    } else if (text === undefined) {
      problems.push(`${file}:${log.line}: printed nothing, comment says "${log.expected}"`)
    } else if (text !== log.expected) {
      problems.push(`${file}:${log.line}: printed "${text}", comment says "${log.expected}"`)
    }
  }
  return problems
}

/**
 * The import problems of a recipe: anything other than named imports from the package of names in
 * `allowed` — a namespace or default import, a dynamic `import()`, `require`, or an import of
 * another module (a relative path, a `node:` module, another package).
 * @param {string} file - The name used in problems.
 * @param {string} source
 * @param {readonly string[]} allowed - The export names a recipe may import.
 * @returns {string[]}
 */
export function importProblems(file, source, allowed) {
  /** @type {string[]} */
  const problems = []
  if (/\bimport\s*\*/.test(source)) problems.push(`${file}: uses import *`)
  if (/\bimport\s*\(/.test(source)) problems.push(`${file}: uses import()`)
  if (/\brequire\s*\(/.test(source)) problems.push(`${file}: uses require`)
  for (const match of source.matchAll(/^import\s+(?:([\s\S]*?)\s+from\s+)?['"]([^'"]+)['"]/gm)) {
    const clause = (match[1] ?? '').trim()
    const from = match[2] ?? ''
    if (from !== PACKAGE_NAME) {
      problems.push(`${file}: imports '${from}'`)
      continue
    }
    const named = /^\{([^}]*)\}$/.exec(clause)
    if (!named) {
      problems.push(`${file}: imports '${from}' without named imports: ${clause || '(none)'}`)
      continue
    }
    for (const part of (named[1] ?? '').split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0] ?? ''
      if (name !== '' && !allowed.includes(name)) {
        problems.push(`${file}: imports ${name}, which is not an export of every release`)
      }
    }
  }
  return problems
}

/**
 * Runs `source` as an ES module in Node from `cwd`, so that an import of the package by name
 * resolves to the package in `cwd`, and returns its problems: those of {@link logLines}, a throw
 * or a non-zero exit (with Node's error output), and the differences of {@link compareOutput}.
 * @param {string} file - The name used in problems.
 * @param {string} source
 * @param {string} cwd
 * @returns {string[]}
 */
export function runRecipe(file, source, cwd) {
  const found = logLines(file, source)
  const run = spawnSync(process.execPath, ['--input-type=module'], {
    cwd,
    input: source,
    encoding: 'utf8',
  })
  if (run.status !== 0) {
    const output = (run.stderr ?? '').trim() || String(run.error ?? '')
    return [...found.problems, `${file}: exited with ${run.status}\n${output}`]
  }
  return [...found.problems, ...compareOutput(file, found.logs, run.stdout)]
}
