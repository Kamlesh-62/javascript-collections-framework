import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { formatKb } from '../scripts/lib/badge.mjs'
import { parseReport } from '../scripts/lib/size-compare.mjs'
import { SIZE_REPORT_PATH } from '../scripts/lib/size-report.mjs'
import { readPageBlocks } from './support/doc-examples'

const ROOT = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const REPO = 'https://github.com/Kamlesh-62/javascript-collections-framework'
const SITE = 'https://kamlesh-62.github.io/javascript-collections-framework/'
const NPM = 'https://www.npmjs.com/package/javascript-collections-framework'
const STACKBLITZ =
  'https://stackblitz.com/github/Kamlesh-62/javascript-collections-framework/tree/main/examples/playground'

const readme = read('README.md')
/** The text of the `## <title>` section, up to the next `## `. */
function section(title: string): string {
  const start = readme.indexOf(`\n## ${title}\n`)
  expect(start, title).toBeGreaterThan(0)
  const end = readme.indexOf('\n## ', start + 1)
  return readme.slice(start + 1, end === -1 ? undefined : end)
}
const headings = [...readme.matchAll(/^## (.+)$/gm)].map((m) => m[1])
const quick = section('Quick start')
const why = section('Why this library?')
const blocks = readPageBlocks('README.md', readme)
const quickLine = readme.slice(0, readme.indexOf(quick)).split('\n').length
const quickBlocks = blocks.filter(
  (b) => b.line > quickLine && b.line < quickLine + quick.split('\n').length,
)

describe('the quick start', () => {
  it('comes after the badges, description and status note, before every other section [042 S1-AC1]', () => {
    expect(headings.slice(0, 3)).toEqual(['Quick start', 'Why this library?', 'Install'])
    const top = readme.slice(0, readme.indexOf('\n## '))
    expect(top).toContain('[![CI]')
    expect(top).toContain('A typed collections framework')
    expect(top).toContain('> **Status:')
  })

  it('shows one install command and a short example of a sorted map, a priority queue and an LRU cache [042 S1-AC1]', () => {
    const shell = [...quick.matchAll(/```sh\n([\s\S]*?)```/g)].map((m) => m[1]?.trim())
    expect(shell).toEqual(['npm install javascript-collections-framework'])
    const first = quickBlocks[0]
    expect(first?.lang).toBe('ts')
    const code = first?.code ?? ''
    expect(code.trimEnd().split('\n').length).toBeLessThanOrEqual(20)
    expect(code).toMatch(/^import \{[^}]*\} from 'javascript-collections-framework'/)
    expect(code).toContain('new TreeMap(')
    expect(code).toMatch(
      /\.(floorEntry|ceilingEntry|lowerEntry|higherEntry|headMap|tailMap|subMap)\(/,
    )
    expect(code).toContain('new PriorityQueue(')
    expect(code).toMatch(/new LinkedHashMap[^(]*\(\{ accessOrder: true, maxSize: \d+ \}\)/)
  })

  it('converts a collection to an array and round-trips it through JSON [042 S1-AC2]', () => {
    const code = quickBlocks[1]?.code ?? ''
    expect(code).toMatch(/\[\.\.\.\w+\]|Array\.from\(/)
    expect(code).toContain('JSON.stringify(')
    expect(code).toContain('JSON.parse(')
    expect(code).toMatch(/\.from\(JSON\.parse\(/)
  })

  it('runs with the documentation runner, a result comment on every expression [042 S1-AC3]', () => {
    expect(quickBlocks).toHaveLength(2)
    for (const block of quickBlocks) {
      expect(block.skip).toBeUndefined()
      const lines = block.code.split('\n')
      const file = ts.createSourceFile('quick.ts', block.code, ts.ScriptTarget.Latest, true)
      for (const statement of file.statements) {
        if (!ts.isExpressionStatement(statement)) continue
        const end = file.getLineAndCharacterOfPosition(statement.getEnd()).line
        expect(lines[end], lines[end]).toMatch(/\/\/ \S/)
      }
    }
  })

  it('links to the playground and to the page for developers coming from native JavaScript [042 S5-AC2]', () => {
    expect(quick).toContain(`(${STACKBLITZ})`)
    expect(read('docs/README.md')).toContain(`(${STACKBLITZ})`)
    expect(quick).toContain('(docs/coming-from-native.md)')
  })
})

describe('why this library', () => {
  const rows = why
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .map((l) =>
      l
        .slice(1, -1)
        .split('|')
        .map((c) => c.trim()),
    )

  it('compares this library, native collections and three libraries on eight points [042 S2-AC1]', () => {
    expect(why).toContain('JavaScript ships `Array`, `Map` and `Set`.')
    expect(rows[0]).toEqual([
      '',
      'This library',
      'Native `Array`/`Map`/`Set`',
      'mnemonist',
      'js-sdsl',
      '@datastructures-js',
    ])
    expect(rows.slice(2).map((r) => r[0])).toEqual([
      'Shared interfaces, interchangeable implementations',
      'Sorted maps and sets with range queries',
      'Live views (sub-lists, ranges, reversed)',
      'Value equality for keys',
      'LRU map',
      'Runtime dependencies',
      'TypeScript types',
      'Sorted map, else priority queue, min + gzip',
    ])
    for (const row of rows) expect(row).toHaveLength(6)
    for (const name of [
      'mnemonist',
      'js-sdsl',
      '@datastructures-js/priority-queue',
      '@datastructures-js/deque',
      '@datastructures-js/linked-list',
    ]) {
      expect(why).toContain(`[${name}](https://www.npmjs.com/package/${name})`)
    }
  })

  it('states when it was checked, each version, and when another choice is better [042 S2-AC2]', () => {
    expect(why).toMatch(/Checked on \d{4}-\d{2}-\d{2} against/)
    const versions = [...why.matchAll(/\]\(https:\/\/www\.npmjs\.com\/package\/[^)]+\)\s+(\S+)/g)]
    expect(versions).toHaveLength(5)
    for (const [, version] of versions) expect(version).toMatch(/^\d+\.\d+\.\d+[,.]?$/)
    const better = why.slice(why.indexOf('When another choice is better:'))
    const items = [...better.matchAll(/^- \*\*([^*]+)\*\*/gm)].map((m) => m[1])
    expect(items).toEqual([
      'Native `Array`, `Map` and `Set`',
      'mnemonist',
      'js-sdsl',
      '@datastructures-js',
    ])
  })

  it("states this library's sizes as the committed size report has them [042 S2-AC3]", () => {
    const report = new Map(parseReport(read(SIZE_REPORT_PATH)).map((e) => [e.name, e.gzip]))
    const figures = [...why.matchAll(/(\d+\.\d) kB \((?:`(\w+)`|(whole package))\)/g)]
    expect(figures.map((f) => f[2] ?? '*')).toEqual(
      expect.arrayContaining(['TreeMap', 'PriorityQueue', '*']),
    )
    for (const [text, figure, name] of figures) {
      const gzip = report.get(name ?? '*')
      expect(gzip, text).toBeDefined()
      expect(`${figure} kB`, `${text} — the size report has ${formatKb(gzip ?? 0)}`).toBe(
        formatKb(gzip ?? 0),
      )
    }
  })
})

describe('the README badges for the package', () => {
  it('show the npm version, the size and the dependency count, with absolute URLs [042 S3-AC1] [042 S3-AC3]', () => {
    const top = readme.slice(0, readme.indexOf('\n\n', readme.indexOf('[![')))
    const badges = [...top.matchAll(/\[!\[([^\]]+)\]\(([^)]+)\)\]\(([^)]+)\)/g)].map(
      ([, alt, image, link]) => ({ alt, image, link }),
    )
    expect(badges.slice(2)).toEqual([
      {
        alt: 'npm',
        image: 'https://img.shields.io/npm/v/javascript-collections-framework',
        link: NPM,
      },
      {
        alt: 'size',
        image: `${SITE}badges/size.svg`,
        link: `${REPO}/blob/main/docs/performance.md#bundle-size`,
      },
      {
        alt: 'dependencies',
        image: `${SITE}badges/dependencies.svg`,
        link: `${NPM}?activeTab=dependencies`,
      },
    ])
    expect(read('docs/performance.md')).toMatch(/^## Bundle size$/m)
  })
})
