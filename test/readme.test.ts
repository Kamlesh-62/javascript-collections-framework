import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatKb } from '../scripts/lib/badge.mjs'
import { CDN, readSnippet, snippetProblems } from '../scripts/lib/cdn-snippet.mjs'
import { parseReport } from '../scripts/lib/size-compare.mjs'
import { SIZE_REPORT_PATH } from '../scripts/lib/size-report.mjs'
import { readPageBlocks } from './support/doc-examples'
import { uncommentedExpressions } from './support/readme'

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
const why = section('Why this library?')
const more = section('More examples')
const blocks = readPageBlocks('README.md', readme)
/** The README's blocks whose first line lies in `text`, a part of the README. */
function blocksIn(text: string) {
  const first = readme.slice(0, readme.indexOf(text)).split('\n').length
  return blocks.filter((b) => b.line >= first && b.line < first + text.split('\n').length)
}
const top = readme.slice(0, readme.indexOf('\n## '))
const openingBlocks = blocksIn(top)
const moreBlocks = blocksIn(more)

describe('the first examples', () => {
  it('open with a sorted map and a priority queue before any section, install comes first, and an LRU cache follows in More examples [042 S1-AC1]', () => {
    expect(headings.slice(0, 2)).toEqual(['Install', 'More examples'])
    expect(top).toContain('[![CI]')
    expect(top).toContain('> **Status:')
    const shell = [...section('Install').matchAll(/```sh\n([\s\S]*?)```/g)].map((m) => m[1]?.trim())
    expect(shell[0]?.split('\n')[0]).toBe('npm install javascript-collections-framework')
    const opening = openingBlocks[0]?.code ?? ''
    expect(opening).toMatch(/^import \{[^}]*\} from 'javascript-collections-framework'/)
    expect(opening).toMatch(/new TreeMap(<[^>]*>)?\(/)
    expect(opening).toMatch(
      /\.(floorEntry|ceilingEntry|lowerEntry|higherEntry|headMap|tailMap|subMap)\(/,
    )
    expect(opening).toContain('new PriorityQueue(')
    const lru = moreBlocks[0]?.code ?? ''
    expect(lru.trimEnd().split('\n').length).toBeLessThanOrEqual(20)
    expect(lru).toMatch(/new LinkedHashMap[^(]*\(\{ accessOrder: true, maxSize: \d+ \}\)/)
  })

  it('convert a collection to an array and round-trip it through JSON [042 S1-AC2]', () => {
    const code = moreBlocks[1]?.code ?? ''
    expect(code).toMatch(/\[\.\.\.\w+\]|Array\.from\(/)
    expect(code).toContain('JSON.stringify(')
    expect(code).toContain('JSON.parse(')
    expect(code).toMatch(/\.from\(JSON\.parse\(/)
  })

  it('run with the documentation runner, a result comment on every expression [042 S1-AC3]', () => {
    expect(openingBlocks).toHaveLength(1)
    expect(moreBlocks).toHaveLength(2)
    for (const block of [...openingBlocks, ...moreBlocks]) {
      expect(block.skip).toBeUndefined()
      expect(uncommentedExpressions(block.code)).toEqual([])
    }
  })

  it('link to the playground and to the page for developers coming from native JavaScript [042 S5-AC2]', () => {
    const tryIt = top.slice(top.indexOf('[Try it in your browser]('))
    expect(tryIt).toContain(`[Try it in your browser](${STACKBLITZ})`)
    expect(read('docs/README.md')).toContain(`(${STACKBLITZ})`)
    expect(tryIt).toContain('(docs/coming-from-native.md)')
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

describe('the CDN snippet', () => {
  const version = JSON.parse(read('package.json')).version

  it('loads the version in package.json with a SHA-384 integrity value and crossorigin, with no placeholder [046 S2-AC1] [046 S2-AC4]', () => {
    expect(snippetProblems(readme, version)).toEqual([])
    const snippet = readSnippet(readme)
    expect(snippet).toMatchObject({ version, crossorigin: true })
    expect(section('Install')).toContain(`<script src="${CDN}@${version}/dist/index.iife.js"`)
  })
})
