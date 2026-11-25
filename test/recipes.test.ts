import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  compareOutput,
  HEADER,
  importProblems,
  logLines,
  RECIPES,
  RECIPES_DIR,
  runRecipe,
} from '../scripts/lib/recipes.mjs'
import { SPEED_WORDS } from '../scripts/lib/speed-claims.mjs'

const ROOT = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const recipes = RECIPES.map((r) => ({ ...r, source: read(`${RECIPES_DIR}/${r.file}`) }))

/** The runtime exports every release since 0.1.0 has had; a recipe may import only these. */
const RELEASED_EXPORTS = [
  'ArrayDeque',
  'ArrayList',
  'ClassCastError',
  'ConcurrentModificationError',
  'HashMap',
  'HashSet',
  'IllegalArgumentError',
  'IllegalStateError',
  'IndexOutOfBoundsError',
  'LinkedHashMap',
  'LinkedHashSet',
  'LinkedList',
  'NoSuchElementError',
  'NullElementError',
  'PriorityQueue',
  'TreeMap',
  'TreeSet',
  'UnsupportedOperationError',
  'asList',
  'binarySearch',
  'compareSymbol',
  'comparing',
  'copyOfList',
  'copyOfMap',
  'copyOfSet',
  'disjoint',
  'equals',
  'equalsSymbol',
  'fill',
  'frequency',
  'hashCode',
  'hashCodeSymbol',
  'indexOfSubList',
  'isCollection',
  'isDeque',
  'isList',
  'isMapCollection',
  'isQueue',
  'isSequencedCollection',
  'isSetCollection',
  'isSortedMap',
  'isSortedSet',
  'lastIndexOfSubList',
  'listOf',
  'mapOf',
  'max',
  'min',
  'naturalOrder',
  'newSetFromMap',
  'nullsFirst',
  'nullsLast',
  'reverse',
  'reverseOrder',
  'rotate',
  'sameValueZeroEquivalence',
  'setOf',
  'shuffle',
  'sortedIndex',
  'swap',
  'thenComparing',
  'unmodifiableCollection',
  'unmodifiableList',
  'unmodifiableMap',
  'unmodifiableSequencedCollection',
  'unmodifiableSequencedMap',
  'unmodifiableSequencedSet',
  'unmodifiableSet',
  'unmodifiableSortedMap',
  'unmodifiableSortedSet',
  'valueEquivalence',
]

const PKG = 'javascript-collections-framework'

describe('the recipe checks', () => {
  it('reject an import other than named exports of every release [048 S1-AC1]', () => {
    const ok = `import { PriorityQueue, TreeMap as Sorted } from '${PKG}'\n`
    expect(importProblems('a.mjs', ok, RELEASED_EXPORTS)).toEqual([])
    const multiLine = `import {\n  ArrayDeque,\n  HashSet,\n} from '${PKG}'\n`
    expect(importProblems('a.mjs', multiLine, RELEASED_EXPORTS)).toEqual([])
    const cases: Array<[string, RegExp]> = [
      [`import * as jcf from '${PKG}'`, /a\.mjs: uses import \*/],
      [`const m = await import('${PKG}')`, /a\.mjs: uses import\(\)/],
      [`const m = require('${PKG}')`, /a\.mjs: uses require/],
      [`import { x } from './helper.mjs'`, /a\.mjs: imports '\.\/helper\.mjs'/],
      [`import { readFileSync } from 'node:fs'`, /a\.mjs: imports 'node:fs'/],
      [`import lib from '${PKG}'`, /a\.mjs: imports '.*' without named imports: lib/],
      [`import '${PKG}'`, /a\.mjs: imports '.*' without named imports/],
      [`import { Deque2 } from '${PKG}'`, /a\.mjs: imports Deque2, which is not an export/],
    ]
    for (const [source, problem] of cases) {
      const found = importProblems('a.mjs', `${source}\n`, RELEASED_EXPORTS)
      expect(found.join('\n'), source).toMatch(problem)
    }
  })

  it('pair each top-level console.log with the text of its result comment [048 S1-AC2]', () => {
    const source = [
      '// Task: shows a call. console.log(x) in a comment is skipped',
      'const x = [1, 2]',
      'console.log(x) // [ 1, 2 ]',
      "console.log('a', `b // c`) // a b // c",
    ].join('\n')
    expect(logLines('r.mjs', source)).toEqual({
      logs: [
        { line: 3, expected: '[ 1, 2 ]' },
        { line: 4, expected: 'a b // c' },
      ],
      problems: [],
    })
  })

  it('name a console.log with no result comment or inside a block [048 S1-AC2]', () => {
    const source = ['console.log(1)', 'for (const x of [1]) {', '  console.log(x) // 1', '}'].join(
      '\n',
    )
    expect(logLines('r.mjs', source).problems).toEqual([
      'r.mjs:1: console.log has no result comment on its line',
      'r.mjs:3: console.log is not a top-level statement',
    ])
    expect(logLines('r.mjs', 'console.log(\n  1,\n) // 1').problems).toEqual([
      'r.mjs:1: console.log has no result comment on its line',
    ])
  })

  it('name the file, the line and both texts of a differing output line [048 S1-AC2]', () => {
    const logs = [
      { line: 3, expected: '[ 1, 2 ]' },
      { line: 5, expected: '7' },
    ]
    expect(compareOutput('r.mjs', logs, '[ 1, 2 ]\n7\n')).toEqual([])
    expect(compareOutput('r.mjs', logs, '[ 1, 2 ]\n8\n')).toEqual([
      'r.mjs:5: printed "8", comment says "7"',
    ])
    expect(compareOutput('r.mjs', logs, '[ 1, 2 ]\n')).toEqual([
      'r.mjs:5: printed nothing, comment says "7"',
    ])
    expect(compareOutput('r.mjs', logs, '[ 1, 2 ]\n7\nextra\n')).toEqual([
      'r.mjs: output line 3 "extra" has no result comment',
    ])
  })
})

/** The recipe files, in the order of the recipes page's table. */
const FILES = [
  'top-k.mjs',
  'merge-sorted.mjs',
  'sliding-window-max.mjs',
  'lru-cache.mjs',
  'booking-calendar.mjs',
  'grid-shortest-path.mjs',
  'running-median.mjs',
  'recent-distinct.mjs',
  'time-range.mjs',
]

/** The collections each recipe shows, as the task list names them. */
const USES: Record<string, string[]> = {
  'top-k.mjs': ['PriorityQueue'],
  'merge-sorted.mjs': ['PriorityQueue'],
  'sliding-window-max.mjs': ['ArrayDeque'],
  'lru-cache.mjs': ['LinkedHashMap'],
  'booking-calendar.mjs': ['TreeMap'],
  'grid-shortest-path.mjs': ['HashSet', 'ArrayDeque'],
  'running-median.mjs': ['PriorityQueue'],
  'recent-distinct.mjs': ['LinkedHashSet'],
  'time-range.mjs': ['TreeMap'],
}

/** The documentation page of each collection a recipe shows. */
const PAGE_OF: Record<string, string> = {
  PriorityQueue: 'docs/priority-queues.md',
  ArrayDeque: 'docs/deques.md',
  HashSet: 'docs/sets.md',
  LinkedHashMap: 'docs/linked-hash-maps.md',
  TreeMap: 'docs/sorted-maps.md',
  LinkedHashSet: 'docs/linked-hash-sets.md',
}

/** The README's `## ` sections, as before the recipes were added; the link adds none. */
const README_SECTIONS = [
  'Quick start',
  'Why this library?',
  'Install',
  'Goals',
  'Available collections',
  'Planned collections',
  'Documentation',
  'Security',
  'Contributing',
  'License',
]

/** The names a recipe imports from the package. */
function importedNames(source: string): string[] {
  const clause = /^import \{([^}]*)\} from 'javascript-collections-framework'/m.exec(source)?.[1]
  return (clause ?? '')
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean)
}

/** The lines of a recipe that are code, not whole-line comments. */
const codeLines = (source: string) => source.split('\n').filter((line) => !/^\s*\/\//.test(line))

/** What a recipe may not use: input that changes between runs, or an API newer than Node 18. */
const FORBIDDEN: Array<[string, RegExp]> = [
  ['Math.random', /\bMath\.random\b/],
  ['Date', /\bDate\b/],
  ['performance', /\bperformance\b/],
  ['process', /\bprocess\b/],
  ['crypto', /\bcrypto\b/],
  ['require', /\brequire\b/],
  ['import()', /\bimport\s*\(/],
  ['node:', /['"]node:/],
  ['fs', /['"](node:)?fs(\/promises)?['"]/],
  ['toSorted', /\.toSorted\(/],
  ['toReversed', /\.toReversed\(/],
  ['toSpliced', /\.toSpliced\(/],
  ['with', /\.with\(/],
  ['findLast', /\.findLast(Index)?\(/],
  ['groupBy', /\b(Object|Map)\.groupBy\b/],
  ['Array.fromAsync', /\bArray\.fromAsync\b/],
  [
    'Set methods',
    /\.(union|intersection|difference|symmetricDifference|isSubsetOf|isSupersetOf|isDisjointFrom)\(/,
  ],
  ['Promise.withResolvers', /\bPromise\.withResolvers\b/],
  ['import.meta', /\bimport\.meta\b/],
]

describe('the recipes', () => {
  const pkg = JSON.parse(read(`${RECIPES_DIR}/package.json`))

  it('import only named exports every release has had [048 S1-AC1]', () => {
    for (const { file, source } of recipes) {
      expect(importProblems(file, source, RELEASED_EXPORTS), file).toEqual([])
    }
  })

  it('are a private package that depends on the latest release and nothing else [048 S1-AC1]', () => {
    expect(pkg.private).toBe(true)
    expect(pkg.type).toBe('module')
    expect(pkg.dependencies).toEqual({ 'javascript-collections-framework': 'latest' })
    for (const field of [
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
      'bundleDependencies',
      'bundledDependencies',
    ]) {
      expect(pkg[field], field).toBeUndefined()
    }
  })

  it('print only from top-level console.log calls on one line with a result comment [048 S1-AC2]', () => {
    for (const { file, source } of recipes) {
      const { logs, problems } = logLines(file, source)
      expect(problems, file).toEqual([])
      expect(logs.length, file).toBeGreaterThan(0)
      for (const line of source.split('\n')) {
        expect(line.length, `${file}: ${line}`).toBeLessThanOrEqual(100)
      }
    }
  })

  it('are exactly the nine files, each at most 60 lines, with package.json and .stackblitzrc [048 S1-AC3]', () => {
    expect(RECIPES.map((r) => r.file)).toEqual(FILES)
    expect(readdirSync(join(ROOT, RECIPES_DIR)).sort()).toEqual(
      [...FILES, 'package.json', '.stackblitzrc'].sort(),
    )
    for (const { file, source } of recipes) {
      expect(source.trimEnd().split('\n').length, file).toBeLessThanOrEqual(60)
    }
  })

  it('import the collections each task names [048 S1-AC3]', () => {
    expect(Object.fromEntries(recipes.map((r) => [r.file, r.uses]))).toEqual(USES)
    for (const { file, source, uses: names } of recipes) {
      expect(importedNames(source), file).toEqual(expect.arrayContaining(names))
      for (const name of names) expect(source, file).toContain(`new ${name}(`)
    }
    const sourceOf = (file: string) => recipes.find((r) => r.file === file)?.source ?? ''
    expect(sourceOf('lru-cache.mjs')).toMatch(/accessOrder: true/)
    expect(sourceOf('lru-cache.mjs')).toMatch(/maxSize: \d+/)
    expect(sourceOf('grid-shortest-path.mjs')).toMatch(/new HashSet\(\{ key: /)
    expect(sourceOf('running-median.mjs').match(/new PriorityQueue\(/g)).toHaveLength(2)
    expect(sourceOf('booking-calendar.mjs')).toMatch(/\.floorEntry\(/)
    expect(sourceOf('booking-calendar.mjs')).toMatch(/\.ceilingEntry\(/)
    expect(sourceOf('time-range.mjs')).toMatch(/\.subMap\(/)
  })

  it('open with the Task, Uses, Time and Array, Map and Set lines, in order, without speed words [048 S1-AC4]', () => {
    for (const { file, source } of recipes) {
      const lines = source.split('\n')
      const end = lines.findIndex((line) => !line.startsWith('//'))
      const header = lines.slice(0, end)
      expect(header[0]?.startsWith(HEADER[0] ?? ''), file).toBe(true)
      const labels = header.filter((line) => HEADER.some((label) => line.startsWith(label)))
      expect(
        labels.map((line) => HEADER.find((label) => line.startsWith(label))),
        file,
      ).toEqual(HEADER)
      for (const line of labels)
        expect(line.split(':').slice(1).join(':').trim(), file).not.toBe('')
      expect(header.join('\n'), file).not.toMatch(SPEED_WORDS)
    }
  })

  it('run against the build in the smoke check, after the build, in pnpm check and CI [048 S1-AC5]', () => {
    const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>
    expect(scripts['test:smoke']).toMatch(/&& node scripts\/recipes\.mjs$/)
    const check = scripts.check ?? ''
    expect(check.indexOf('pnpm build')).toBeGreaterThanOrEqual(0)
    expect(check.indexOf('pnpm build')).toBeLessThan(check.indexOf('pnpm test:smoke'))
    expect(read('.github/workflows/ci.yml')).toMatch(/run: pnpm test:smoke/)
    const runner = read('scripts/recipes.mjs')
    expect(runner).toContain('RECIPES.map((r) => r.file)')
    expect(runner).toContain('runRecipe(name, source, root)')
  })

  it('fail a recipe that throws, exits non-zero or prints other than its comments, naming it [048 S1-AC5]', () => {
    expect(runRecipe('ok.mjs', 'console.log([1, 2]) // [ 1, 2 ]\n', ROOT)).toEqual([])
    const thrown = runRecipe('throws.mjs', "throw new Error('x')\n", ROOT)
    expect(thrown).toHaveLength(1)
    expect(thrown[0]).toMatch(/^throws\.mjs: exited with 1\n[\s\S]*Error: x/)
    expect(runRecipe('exits.mjs', 'process.exitCode = 2\n', ROOT)).toEqual([
      'exits.mjs: exited with 2\n',
    ])
    expect(runRecipe('differs.mjs', 'console.log(1) // 2\n', ROOT)).toEqual([
      'differs.mjs:1: printed "1", comment says "2"',
    ])
  })

  it('start every recipe in table order from StackBlitz [048 S1-AC6]', () => {
    expect(pkg.scripts).toEqual({ start: FILES.map((f) => `node ${f}`).join(' && ') })
    expect(JSON.parse(read(`${RECIPES_DIR}/.stackblitzrc`))).toEqual({
      installDependencies: true,
      startCommand: 'npm start',
    })
  })

  it('use fixed data and Node 18 APIs only, and run in the Node 18 CI step [048 S1-AC7]', () => {
    for (const { file, source } of recipes) {
      const code = codeLines(source).join('\n')
      for (const [name, pattern] of FORBIDDEN)
        expect(code, `${file} uses ${name}`).not.toMatch(pattern)
    }
    expect(read('.github/workflows/ci.yml')).toMatch(
      /node-version: 18\n\s+- run: [^\n]*node scripts\/recipes\.mjs/,
    )
    const runner = read('scripts/recipes.mjs')
    expect(runner).toContain('fileURLToPath(import.meta.url)')
    expect(runner).not.toMatch(/import\.meta\.(dirname|filename)/)
  })
})

describe('the recipes page', () => {
  const page = read('docs/recipes.md')
  const rows = page
    .split('\n')
    .filter((line) => line.startsWith('| ') && !/^\| (Task|-)/.test(line))
    .map((line) =>
      line
        .slice(2, -2)
        .split(' | ')
        .map((cell) => cell.trim()),
    )
  const linked = rows.map(
    (row) => /^\[([^\]]+)\]\(\.\.\/examples\/recipes\/([^)]+)\)$/.exec(row[3] ?? '')?.[2],
  )

  it('is linked from the documentation index and from the README next to the playground, with no new section [048 S2-AC1]', () => {
    expect(read('docs/README.md')).toMatch(/\[Recipes\]\(recipes\.md\)/)
    const readme = read('README.md')
    const playground = readme.indexOf('tree/main/examples/playground)')
    const link = readme.indexOf('](docs/recipes.md)')
    expect(playground).toBeGreaterThan(0)
    expect(link).toBeGreaterThan(playground)
    expect(readme.slice(playground, link)).not.toMatch(/\n\n|\n#/)
    expect([...readme.matchAll(/^## (.+)$/gm)].map((m) => m[1])).toEqual(README_SECTIONS)
  })

  it('lists each recipe with its task, collection, time and file, the time as in the file [048 S2-AC1]', () => {
    expect(rows.map((row) => row.length)).toEqual(RECIPES.map(() => 4))
    expect(linked).toEqual(RECIPES.map((r) => r.file))
    for (const [i, recipe] of RECIPES.entries()) {
      const [task, collection, time] = rows[i] ?? []
      expect(task).toBe(recipe.task)
      for (const name of recipe.uses) expect(collection, recipe.file).toContain(`\`${name}\``)
      const source = recipes[i]?.source ?? ''
      expect(time, recipe.file).toBe(/^\/\/ Time: (.*)$/m.exec(source)?.[1])
      expect(time, recipe.file).toMatch(/^O\(/)
    }
    expect(page).not.toMatch(SPEED_WORDS)
    expect(page).not.toMatch(/```(ts|js|typescript|javascript)\b/)
  })

  it('links each recipe from the page of each collection it uses [048 S2-AC2]', () => {
    for (const recipe of RECIPES) {
      const uses = USES[recipe.file] ?? []
      const pages = [...new Set(uses.map((name) => PAGE_OF[name] ?? `no page for ${name}`))]
      expect([...recipe.pages].sort(), recipe.file).toEqual(pages.sort())
    }
    const pages = Object.values(PAGE_OF)
    for (const path of pages) {
      const text = read(path)
      const listed = RECIPES.filter((r) => (USES[r.file] ?? []).some((n) => PAGE_OF[n] === path))
      expect(listed.length, path).toBeGreaterThan(0)
      for (const recipe of listed) {
        expect(text, `${path} links ${recipe.file}`).toContain(
          `](../examples/recipes/${recipe.file})`,
        )
      }
    }
  })

  it('lists every recipe file and links only files that exist [048 S2-AC3]', () => {
    const files = readdirSync(join(ROOT, RECIPES_DIR)).filter((f) => f.endsWith('.mjs'))
    expect([...linked].sort()).toEqual(files.sort())
    for (const file of linked) expect(files, String(file)).toContain(file)
  })

  it('opens the recipes folder on main in StackBlitz [048 S2-AC4]', () => {
    expect(page).toContain(
      '[Open in StackBlitz](https://stackblitz.com/github/Kamlesh-62/javascript-collections-framework/tree/main/examples/recipes)',
    )
  })
})
