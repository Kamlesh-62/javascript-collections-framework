import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CHART_PAGE_URL,
  CHART_RAW_URL,
  chartSize,
  contrast,
  README_CHART_END,
  README_CHART_START,
  readmeChartProblems,
  renderReadmeChart,
  updatedReadme,
} from '../bench/lib/chart.mjs'
import { latestCompare } from '../bench/lib/compare.mjs'
import { RESULTS_DIR } from '../bench/lib/results.mjs'
import { speedClaims } from '../scripts/lib/speed-claims.mjs'
import { readBlocks, readPageBlocks } from './support/doc-examples'
import {
  checkedEnvironments,
  frontElements,
  orderProblems,
  runtimesOf,
  uncommentedExpressions,
  unknownRuntimes,
} from './support/readme'

const ROOT = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

/** A README with the front elements and sections in order, built from parts that tests reorder. */
const FRONT = [
  '# pkg',
  '[![CI](https://ci.example/badge.svg)](https://ci.example)',
  '**JavaScript lacks things; this adds them.**',
  'Zero runtime dependencies · Runs on Node.js and Bun.',
  '```ts\nconst a = 1\na // 1\n```',
  '[Try it in your browser](https://play.example), or browse the [recipes](docs/recipes.md).',
  '> **Status: 0.x.**',
]
const SECTIONS = [
  'Install',
  'More examples',
  'Why this library?',
  'Available collections',
  'Goals',
  'Planned collections',
  'Documentation',
  'Security',
  'Contributing',
  'License',
]
const sample = (front: readonly string[] = FRONT, sections: readonly string[] = SECTIONS) =>
  `${front.join('\n\n')}\n\n${sections.map((s) => `## ${s}\n\nText.\n`).join('\n')}`
const swap = <T>(list: readonly T[], i: number, j: number): T[] => {
  const out = [...list]
  ;[out[i], out[j]] = [out[j] as T, out[i] as T]
  return out
}

describe('the order of the front page', () => {
  it('accepts the front elements and sections in order [049 S2-AC2]', () => {
    expect(frontElements(sample()).map((e) => e.kind)).toEqual([
      'title',
      'badges',
      'problem',
      'facts',
      'code',
      'try',
      'status',
    ])
    expect(orderProblems(sample())).toEqual([])
  })

  it('names the first front element out of place [049 S2-AC2]', () => {
    expect(orderProblems(sample(swap(FRONT, 3, 4)))).toEqual([
      'README.md:7: the code is out of place; expected the facts',
    ])
    expect(orderProblems(sample(swap(FRONT, 5, 6)))).toEqual([
      'README.md:14: the status is out of place; expected the try',
    ])
    expect(orderProblems(sample(FRONT.slice(0, 6)))).toEqual([
      'README.md: the status is missing before the first section',
    ])
  })

  it('names an element before the first section that the order does not list [049 S2-AC2]', () => {
    const front = [...FRONT.slice(0, 2), 'A typed collections framework.', ...FRONT.slice(2)]
    expect(orderProblems(sample(front))).toEqual([
      `README.md:5: "A typed collections framework." is not part of the front page's order`,
    ])
  })

  it('names the first section out of place [049 S2-AC2]', () => {
    expect(orderProblems(sample(FRONT, swap(SECTIONS, 3, 4)))).toEqual([
      'README.md: the section "Goals" is out of place; expected "Available collections"',
    ])
    expect(orderProblems(sample(FRONT, ['Quick start', ...SECTIONS]))).toEqual([
      'README.md: the section "Quick start" is out of place; expected "Install"',
    ])
    expect(orderProblems(sample(FRONT, SECTIONS.slice(0, -1)))).toEqual([
      'README.md: the section "License" is missing',
    ])
  })
})

describe('the runtimes on the front page', () => {
  const cells = checkedEnvironments(read('docs/compatibility.md'))

  it('reads the environments of the four checked tiers of the compatibility page [049 S1-AC3]', () => {
    expect(cells).toHaveLength(4)
    expect(cells[0]).toContain('Node.js 22')
    expect(cells[1]).toContain('Bun')
    expect(cells[2]).toContain('Chrome')
    expect(cells[3]).toContain('Cloudflare Workers')
    expect(cells.join(' ')).not.toContain('Electron')
  })

  it('splits the list after "Runs on" on commas and a final "and" [049 S1-AC3]', () => {
    expect(
      runtimesOf('Zero runtime dependencies · Runs on Node.js, Bun,\nDeno and Cloudflare Workers.'),
    ).toEqual(['Node.js', 'Bun', 'Deno', 'Cloudflare Workers'])
    expect(runtimesOf('Zero runtime dependencies.')).toEqual([])
  })

  it('names a runtime that no checked tier lists, such as a targeted one or a generic word [049 S1-AC3]', () => {
    expect(unknownRuntimes(['Node.js', 'Safari', 'browsers', 'edge runtimes'], cells)).toEqual([
      'Safari',
      'browsers',
      'edge runtimes',
    ])
    expect(unknownRuntimes(['node.js'], cells)).toEqual(['node.js'])
  })
})

describe('the README front page', () => {
  const readme = read('README.md')
  const elements = frontElements(readme)
  const element = (kind: string) => elements.find((e) => e.kind === kind)?.text ?? ''
  const blocks = readPageBlocks('README.md', readme)
  const opening = blocks.find((b) => b.line === elements.find((e) => e.kind === 'code')?.line)

  it('opens with one bold sentence on the sorted map, the priority queue and value-compared object keys JavaScript lacks [049 S1-AC1]', () => {
    const problem = element('problem').replace(/\s+/g, ' ')
    expect(problem).toMatch(/^\*\*[^*]+\*\*$/)
    expect(
      problem
        .slice(2, -2)
        .match(/[.;!?](\s|$)/g)
        ?.filter((m) => m.startsWith('.')),
    ).toEqual(['.'])
    expect(problem).toContain('JavaScript has no sorted map, no priority queue')
    expect(problem).toContain('`{ x: 1, y: 2 }` as a `Map` key compared by value')
    expect(problem).toContain('this library adds them')
  })

  it('follows it with one paragraph naming zero dependencies, bundled types and the runtimes [049 S1-AC2]', () => {
    const facts = element('facts')
    expect(facts).toMatch(/^Zero runtime dependencies/)
    expect(facts).toContain('TypeScript types included')
    expect(facts.replace(/\s+/g, ' ')).toMatch(/Runs on [^,]+(, [^,]+)* and [^,.]+\.$/)
    expect(runtimesOf(facts).length).toBeGreaterThan(3)
  })

  it('names only runtimes that a checked tier of the compatibility page lists [049 S1-AC3]', () => {
    const cells = checkedEnvironments(read('docs/compatibility.md'))
    expect(unknownRuntimes(runtimesOf(element('facts')), cells)).toEqual([])
  })

  it('shows a nearest-key query, a poll, a value-keyed lookup and the native Map result in at most 15 lines [049 S1-AC4]', () => {
    const code = opening?.code ?? ''
    expect(opening?.lang).toBe('ts')
    expect(code.trimEnd().split('\n').length).toBeLessThanOrEqual(15)
    expect(code).toMatch(/^import \{[^}]*\} from 'javascript-collections-framework'/)
    expect(code).toMatch(/new TreeMap(<[^>]*>)?\(/)
    expect(code).toMatch(/\.(floorEntry|ceilingEntry|lowerEntry|higherEntry|floorKey|ceilingKey)\(/)
    expect(code).toMatch(/new PriorityQueue\(/)
    expect(code).toMatch(/\.poll\(\)/)
    expect(code).toMatch(/new HashMap<[^>]+>\(\{ key: /)
    const lines = code.split('\n')
    const get = lines.find((l) => /^\w+\.get\(\{/.test(l)) ?? ''
    const set = lines.find((l) => /^\w+\.set\(\{/.test(l)) ?? ''
    const key = (l: string) => /\.(?:get|set)\((\{[^}]*\})/.exec(l)?.[1]
    expect(key(get)).toBeDefined()
    expect(key(get)).toBe(key(set))
    expect(get).toMatch(/\/\/ '[^']+'/)
    const native = lines.at(-1) ?? ''
    expect(native).toMatch(/^new Map\(.*\)\.get\(\{.*\}\) \/\/ undefined/)
    expect(key(native)).toBe(key(get))
  })

  it('runs the opening block with a result comment on every top-level expression [049 S1-AC5]', () => {
    const run = readBlocks().find((b) => b.page === 'README.md' && b.line === opening?.line)
    expect(run).toBeDefined()
    expect(run?.skip).toBeUndefined()
    expect(uncommentedExpressions(opening?.code ?? '')).toEqual([])
  })

  it('shows the front elements and sections in order, the "Try it" paragraph linking the playground, recipes, benchmarks and native page [049 S2-AC1]', () => {
    expect(orderProblems(readme)).toEqual([])
    const tryIt = element('try')
    const links = [...tryIt.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1])
    expect(links).toEqual([
      'https://stackblitz.com/github/Kamlesh-62/javascript-collections-framework/tree/main/examples/playground',
      'docs/recipes.md',
      'docs/performance.md#benchmarks',
      'docs/coming-from-native.md',
    ])
    expect(read('docs/performance.md')).toMatch(/^## Benchmarks$/m)
    const install = readme.slice(readme.indexOf('## Install'), readme.indexOf('## More examples'))
    expect(install).toContain('<script src="https://cdn.jsdelivr.net/npm/')
    const more = readme.slice(readme.indexOf('## More examples'), readme.indexOf('## Why'))
    expect(more).toMatch(/new LinkedHashMap[^(]*\(\{ accessOrder: true/)
    expect(more).toContain('JSON.parse(')
  })

  it('fails the order check on the real README with any element moved [049 S2-AC2]', () => {
    const lines = readme.split('\n')
    const status = elements.find((e) => e.kind === 'status')
    const moved = [
      ...lines.slice(0, (status?.line ?? 1) - 1),
      'An extra paragraph.',
      '',
      ...lines.slice((status?.line ?? 1) - 1),
    ].join('\n')
    expect(orderProblems(moved)).toEqual([
      `README.md:${status?.line}: "An extra paragraph." is not part of the front page's order`,
    ])
  })

  it('runs every More examples block with a result comment on every top-level expression [049 S2-AC3]', () => {
    const start = readme.slice(0, readme.indexOf('## More examples')).split('\n').length
    const end = readme.slice(0, readme.indexOf('## Why this library?')).split('\n').length
    const more = blocks.filter((b) => b.line > start && b.line < end)
    expect(more).toHaveLength(2)
    for (const block of more) {
      expect(block.skip).toBeUndefined()
      expect(uncommentedExpressions(block.code)).toEqual([])
    }
  })

  it('shows the chart in Why this library?, before when another choice is better, from the newest run [049 S2-AC4]', () => {
    const why = readme.slice(readme.indexOf('## Why this library?'), readme.indexOf('## Available'))
    const start = why.indexOf(README_CHART_START)
    expect(start).toBeGreaterThan(why.search(/Checked on \d{4}-\d{2}-\d{2}/))
    expect(why.indexOf(README_CHART_END)).toBeLessThan(
      why.indexOf('When another choice is better:'),
    )
    const latest = latestCompare(join(ROOT, RESULTS_DIR))?.result
    expect(latest).toBeDefined()
    if (latest === undefined) return
    const chart = renderReadmeChart(latest)
    expect(why).toContain(`${README_CHART_START}\n${chart}\n${README_CHART_END}`)
    expect(chart).toContain(`](${CHART_RAW_URL})](${CHART_PAGE_URL})`)
    expect(chart).toContain(`at ${chartSize(latest).toLocaleString('en-US')} elements`)
    expect(chart).toMatch(/another library's median is higher in \d+ of \d+ rows/)
    expect(speedClaims(new Map([['README.md', chart]]))).toEqual([])
  })

  it('keeps the chart in step with the newest run through bench:docs and bench:check [049 S2-AC5]', () => {
    const latest = latestCompare(join(ROOT, RESULTS_DIR))?.result
    expect(readmeChartProblems(readme, latest)).toEqual([])
    const stale = readme.replace(/higher in \d+ of/, 'higher in 0 of')
    expect(readmeChartProblems(stale, latest)).toHaveLength(1)
    expect(updatedReadme(stale, latest)).toBe(readme)
    expect(updatedReadme(stale, undefined)).toBe(stale)
    const docs = read('bench/docs.mjs')
    expect(docs).toContain('updatedReadme(readme, compared)')
    expect(docs).toContain('writeFileSync(readmePath, ')
    expect(docs).toContain('...readmeChartProblems(readme, compared)')
  })
})

describe('the package metadata', () => {
  const pkg = JSON.parse(read('package.json')) as { description: string; keywords: string[] }

  it('describes the structures, the languages and the zero dependencies in one sentence [049 S3-AC1]', () => {
    for (const phrase of [
      'Sorted maps and sets',
      'priority queues',
      'deques',
      'LRU maps',
      'value-keyed maps and sets',
      'JavaScript',
      'TypeScript',
      'zero dependencies',
    ])
      expect(pkg.description).toContain(phrase)
    expect(pkg.description.match(/\.(\s|$)/g)).toHaveLength(1)
  })

  it('keeps the earlier keywords and adds the search terms for heaps, LRU caches and ordered collections [049 S3-AC2]', () => {
    expect(pkg.keywords).toEqual(
      expect.arrayContaining([
        'collections',
        'data-structures',
        'list',
        'set',
        'map',
        'queue',
        'deque',
        'treemap',
        'linkedlist',
        'priority-queue',
        'typescript',
        'sorted-map',
        'data-structure',
        'heap',
        'lru',
        'lru-cache',
        'sorted-set',
        'ordered-map',
        'value-equality',
        'leetcode',
      ]),
    )
    expect(new Set(pkg.keywords).size).toBe(pkg.keywords.length)
  })
})

describe('the social preview image', () => {
  const svg = read('docs/images/social-preview.svg')
  const attr = (tag: string, name: string) => new RegExp(` ${name}="([^"]*)"`).exec(tag)?.[1]
  const texts = [...svg.matchAll(/<text([^>]*)>([^<]*)<\/text>/g)].map((m) => ({
    tag: m[1] ?? '',
    text: m[2] ?? '',
  }))

  it('is 1280 by 640 on an opaque background, with large sans-serif text that contrasts with it [049 S3-AC3]', () => {
    const root = /<svg[^>]*>/.exec(svg)?.[0] ?? ''
    expect(attr(root, 'width')).toBe('1280')
    expect(attr(root, 'height')).toBe('640')
    expect(svg).not.toContain('<style')
    const background = /<rect[^>]*>/.exec(svg)?.[0] ?? ''
    expect([attr(background, 'x'), attr(background, 'y')]).toEqual(['0', '0'])
    expect([attr(background, 'width'), attr(background, 'height')]).toEqual(['1280', '640'])
    const fill = attr(background, 'fill') ?? ''
    expect(fill).toMatch(/^#[0-9a-f]{6}$/i)
    expect(texts.length).toBeGreaterThan(1)
    for (const { tag, text } of texts) {
      expect(Number(attr(tag, 'font-size')), text).toBeGreaterThanOrEqual(48)
      expect(attr(tag, 'font-family'), text).toMatch(/,\s*sans-serif$/)
      const colour = attr(tag, 'fill') ?? ''
      expect(colour, text).toMatch(/^#[0-9a-f]{6}$/i)
      expect(contrast(colour, fill), text).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('shows the package name and the line naming TreeMap, PriorityQueue and the LRU map [049 S3-AC3]', () => {
    const shown = texts.map((t) => t.text)
    expect(shown[0]).toBe('javascript-collections-framework')
    expect(shown.slice(1).join(' ')).toBe('TreeMap · PriorityQueue · LRU map for JavaScript')
  })
})
