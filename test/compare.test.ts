import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  CHART_PATH,
  CHART_TITLE,
  COLOURS,
  chartAlt,
  contrast,
  renderChart,
} from '../bench/lib/chart.mjs'
import {
  CHART_LINK,
  COMPARE_END,
  COMPARE_START,
  type CompareResult,
  compareFile,
  compareOrder,
  compareSectionProblems,
  disagreements,
  INSTALL,
  latestCompare,
  losses,
  NO_COMPARE_RUN,
  renderCompareSection,
  THIS,
  versionProblems,
  withCompareSection,
} from '../bench/lib/compare.mjs'
import { latestResult, RESULTS_DIR } from '../bench/lib/results.mjs'
import {
  CASES,
  THIS as CASES_THIS,
  compareCases,
  LIBRARIES,
  LOOKUPS,
  OPS,
  SIZES,
} from '../fixtures/competitors/cases.mjs'
import { speedClaims } from '../scripts/lib/speed-claims.mjs'
import * as lib from '../src/index'

const ROOT = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

/** The packages measured, as the fixture pins them. */
const PINS = {
  '@datastructures-js/deque': '1.0.8',
  '@datastructures-js/linked-list': '6.1.4',
  '@datastructures-js/priority-queue': '6.4.0',
  'js-sdsl': '4.4.2',
  mnemonist: '0.40.8',
}
const COMPARED = [...Object.keys(PINS), 'obliterator', '@datastructures-js/heap']

/** The text of one job of a workflow, from its key to the next job's key. */
function job(workflow: string, name: string): string {
  const start = workflow.indexOf(`\n  ${name}:\n`)
  expect(start, name).toBeGreaterThan(0)
  const next = workflow.slice(start + 1).search(/\n {2}[a-z-]+:\n/)
  return next < 0 ? workflow.slice(start) : workflow.slice(start, start + 1 + next)
}

// Stand-ins for the compared packages, built on this library's classes with the other libraries'
// method names, so the cases can run without installing them.
class OrderedMap {
  m = new lib.TreeMap<number, number>()
  setElement(k: number, v: number) {
    this.m.set(k, v)
  }
  getElementByKey(k: number) {
    return this.m.get(k)
  }
  reverseLowerBound(k: number) {
    const e = this.m.floorEntry(k)
    return { pointer: [e?.key, e?.value] }
  }
  eraseElementByKey(k: number) {
    return this.m.delete(k)
  }
  size() {
    return this.m.size
  }
  [Symbol.iterator]() {
    return this.m[Symbol.iterator]()
  }
}
class SdslPriorityQueue {
  q: lib.PriorityQueue<number>
  constructor(items: number[] = [], comparator?: (a: number, b: number) => number) {
    this.q = new lib.PriorityQueue(items, { comparator: comparator ?? ((a, b) => b - a) })
  }
  push(v: number) {
    this.q.add(v)
  }
  pop() {
    return this.q.poll()
  }
  top() {
    return this.q.peek()
  }
  size() {
    return this.q.size
  }
}
class SdslDeque {
  d: lib.ArrayDeque<number>
  constructor(items: number[] = []) {
    this.d = new lib.ArrayDeque(items)
  }
  pushBack(v: number) {
    this.d.push(v)
  }
  pushFront(v: number) {
    this.d.addFirst(v)
  }
  popFront() {
    return this.d.poll()
  }
  popBack() {
    return this.d.pop()
  }
  size() {
    return this.d.size
  }
}
class LinkList {
  l: lib.LinkedList<number>
  constructor(items: number[] = []) {
    this.l = new lib.LinkedList(items)
  }
  pushBack(v: number) {
    this.l.push(v)
  }
  popFront() {
    return this.l.poll()
  }
  size() {
    return this.l.size
  }
}
class Heap {
  q = new lib.PriorityQueue<number>()
  static from(items: number[]) {
    const h = new Heap()
    h.q = new lib.PriorityQueue(items)
    return h
  }
  push(v: number) {
    this.q.add(v)
  }
  pop() {
    return this.q.poll()
  }
  peek() {
    return this.q.peek()
  }
  get size() {
    return this.q.size
  }
}
class LRUMap {
  m: lib.LinkedHashMap<number, number>
  constructor(capacity: number) {
    this.m = new lib.LinkedHashMap({ accessOrder: true, maxSize: capacity })
  }
  set(k: number, v: number) {
    this.m.set(k, v)
  }
  get(k: number) {
    return this.m.get(k)
  }
  get size() {
    return this.m.size
  }
}
class MinPriorityQueue {
  q = new lib.PriorityQueue<number>()
  static fromArray(items: number[]) {
    const p = new MinPriorityQueue()
    p.q = new lib.PriorityQueue(items)
    return p
  }
  enqueue(v: number) {
    this.q.add(v)
  }
  dequeue() {
    return this.q.poll()
  }
  front() {
    return this.q.peek()
  }
  size() {
    return this.q.size
  }
}
class DoublyLinkedList {
  l = new lib.LinkedList<number>()
  insertLast(v: number) {
    this.l.push(v)
  }
  removeFirst() {
    const v = this.l.poll()
    return { getValue: () => v }
  }
  count() {
    return this.l.size
  }
}
const STUBS = {
  'js-sdsl': { OrderedMap, PriorityQueue: SdslPriorityQueue, Deque: SdslDeque, LinkList },
  mnemonist: { Heap, LRUMap },
  '@datastructures-js/priority-queue': { MinPriorityQueue },
  '@datastructures-js/deque': { Deque: SdslDeque },
  '@datastructures-js/linked-list': { DoublyLinkedList },
}

const run = (
  r: Partial<CompareResult['cases'][number]['results'][number]> & { library: string },
) => ({
  name: 'X',
  hz: 1_000_000,
  rme: 2,
  ...r,
})

/** A comparison run with two cases at two sizes. */
const SAMPLE: CompareResult = {
  info: {
    date: '2026-11-24',
    node: 'v24.11.1',
    platform: 'linux',
    cpu: 'Test CPU <x> & co',
    cores: 4,
    memoryGb: 16,
    version: '0.1.1',
    order: 'this-first',
  },
  packages: { ...PINS },
  sizes: [1_000, 100_000],
  cases: [
    {
      case: 'Priority queue',
      operation: 'push',
      size: 1_000,
      results: [
        run({ library: THIS, name: 'PriorityQueue', hz: 2_000_000 }),
        run({ library: 'js-sdsl', name: 'PriorityQueue', hz: 4_000_000 }),
        run({ library: 'mnemonist', name: 'Heap', hz: 1_000_000 }),
      ],
    },
    {
      case: 'Priority queue',
      operation: 'push',
      size: 100_000,
      results: [
        run({ library: THIS, name: 'PriorityQueue', hz: 1_000_000, rme: 10 }),
        run({ library: 'js-sdsl', name: 'PriorityQueue', hz: 1_060_000, rme: 10 }),
        run({ library: 'mnemonist', name: 'Heap', hz: 100_000_000 }),
      ],
    },
    {
      case: 'Deque',
      operation: 'add at the front, take from the end',
      size: 100_000,
      results: [
        run({ library: THIS, name: 'ArrayDeque', hz: 4_000_000 }),
        run({ library: 'js-sdsl', name: 'Deque', hz: 8_000_000, rme: 150 }),
        run({ library: 'mnemonist', name: 'Heap', hz: 1_000 }),
      ],
    },
    {
      case: 'Deque',
      operation: 'add at the front, take from the end',
      size: 1_000,
      results: [
        run({ library: THIS, name: 'ArrayDeque', hz: 4_000_000 }),
        run({ library: 'js-sdsl', name: 'Deque', hz: 2_000_000 }),
      ],
    },
  ],
}

const temp: string[] = []
afterAll(() => {
  for (const dir of temp) rmSync(dir, { recursive: true, force: true })
})
function resultsDir(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'compare-'))
  temp.push(dir)
  mkdirSync(dir, { recursive: true })
  for (const f of files) {
    const date = f.slice(0, 10)
    writeFileSync(join(dir, f), JSON.stringify({ ...SAMPLE, info: { ...SAMPLE.info, date } }))
  }
  return dir
}

describe('the comparison fixture', () => {
  it('pins the five compared packages exactly in its own install, with the root protections and no install script allowed [047 S4-AC2]', () => {
    const pkg = JSON.parse(read('fixtures/competitors/package.json')) as {
      private: boolean
      dependencies?: unknown
      devDependencies: Record<string, string>
    }
    expect(pkg.private).toBe(true)
    expect(pkg.dependencies).toBeUndefined()
    expect(pkg.devDependencies).toEqual(PINS)
    const settings = [
      'minimumReleaseAge',
      'minimumReleaseAgeExclude',
      'trustPolicy',
      'blockExoticSubdeps',
      'strictDepBuilds',
      'allowBuilds',
      'saveExact',
    ]
    const pick = (text: string) =>
      Object.fromEntries(
        settings.map((key) => [
          key,
          text.match(new RegExp(`^${key}:\\s*([^#\\n]*)`, 'm'))?.[1]?.trim(),
        ]),
      )
    const root = read('pnpm-workspace.yaml')
    const fixture = read('fixtures/competitors/pnpm-workspace.yaml')
    expect(pick(fixture)).toEqual(pick(root))
    expect(pick(fixture).allowBuilds).toBe('{}')
    const ghsas = (text: string) => text.match(/GHSA-[\w-]+/g) ?? []
    expect(ghsas(fixture)).toEqual(ghsas(root))
    // The lockfile holds the five packages and their two dependencies, nothing else.
    const lock = read('fixtures/competitors/pnpm-lock.yaml')
    const packages = lock.slice(lock.indexOf('\npackages:\n'), lock.indexOf('\nsnapshots:\n'))
    const entries = [...packages.matchAll(/^ {2}'?(@?[^@\s']+)@([^':]+)'?:$/gm)].map(
      (m) => `${m[1]}@${m[2]}`,
    )
    expect(entries.sort()).toEqual(
      [
        ...Object.entries(PINS).map(([name, version]) => `${name}@${version}`),
        '@datastructures-js/heap@4.3.7',
        'obliterator@2.0.5',
      ].sort(),
    )
  })

  it('is never part of the root install, `pnpm check`, CI or the release workflow [047 S4-AC2]', () => {
    const rootPkg = read('package.json')
    const rootLock = read('pnpm-lock.yaml')
    const rootWorkspace = read('pnpm-workspace.yaml')
    for (const name of COMPARED) {
      const quoted = new RegExp(`["'/\\s]${name.replace('/', '\\/')}["'@:]`)
      expect(rootPkg, name).not.toMatch(quoted)
      expect(rootLock, name).not.toMatch(quoted)
    }
    expect(rootLock).not.toContain('fixtures/competitors')
    expect(rootWorkspace).not.toMatch(/^packages:/m)
    expect(rootWorkspace).not.toContain('competitors')
    const scripts = (JSON.parse(rootPkg) as { scripts: Record<string, string> }).scripts
    const checkScripts = (scripts.check ?? '')
      .split('&&')
      .map((s) => s.trim().replace(/^pnpm /, ''))
      .map((s) => scripts[s] ?? s)
    expect(checkScripts.join(' ')).not.toContain('fixtures/competitors')
    expect(checkScripts).not.toContain(scripts['bench:compare'])
    for (const workflow of ['ci.yml', 'release.yml']) {
      const text = read(`.github/workflows/${workflow}`)
      expect(text, workflow).not.toContain('fixtures/competitors')
      expect(text, workflow).not.toContain('bench:compare')
    }
  })
})

describe('the comparison checks', () => {
  it('stop on a pin that is not exact, a package that is not installed, or a different version [047 S1-AC2]', () => {
    expect(versionProblems(PINS, { ...PINS })).toEqual([])
    expect(
      versionProblems(
        { a: '1.0.0', b: '^2.0.0', c: '3.0.0', d: '4.0.0' },
        { a: '1.0.0', b: '2.0.0', d: '4.1.0' },
      ),
    ).toEqual([
      'b: pinned to ^2.0.0, which is not an exact version',
      `c: not installed, pinned 3.0.0; run \`${INSTALL}\``,
      'd: installed 4.1.0, pinned 4.0.0',
    ])
    expect(INSTALL).toBe('pnpm -C fixtures/competitors install --frozen-lockfile')
  })

  it('name the case, operation, size and library whose result differs from this library [047 S1-AC1]', () => {
    const check = (library: string, checksum: number, size = 1_000) => ({
      case: 'Deque',
      operation: 'add at the end',
      size,
      library,
      checksum,
    })
    expect(disagreements([check(THIS, 5), check('js-sdsl', 5), check('mnemonist', 5)])).toEqual([])
    expect(
      disagreements([
        check(THIS, 5),
        check('js-sdsl', 6),
        check('mnemonist', 5),
        check(THIS, 1, 100_000),
        check('mnemonist', 2, 100_000),
        check('js-sdsl', 1, 1_000_000),
      ]),
    ).toEqual([
      `Deque, add at the end, 1,000: js-sdsl returned 6, ${THIS} returned 5`,
      `Deque, add at the end, 100,000: mnemonist returned 2, ${THIS} returned 1`,
      `Deque, add at the end, 1,000,000: no result from ${THIS}`,
    ])
  })

  it('save a run as a dated compare file that the native tables never read [047 S1-AC6]', () => {
    expect(compareFile({ date: '2026-11-24', node: 'v24.11.1' })).toBe(
      `${RESULTS_DIR}/2026-11-24-compare-node-24.json`,
    )
    const dir = resultsDir([
      '2026-11-20-node-24.json',
      '2026-11-22-compare-node-24.json',
      '2026-11-25-compare-node-24.json',
    ])
    expect(latestResult(dir)?.file).toBe('2026-11-20-node-24.json')
    expect(latestCompare(dir)?.file).toBe('2026-11-25-compare-node-24.json')
    expect(latestCompare(dir)?.result.info.date).toBe('2026-11-25')
    expect(latestCompare(resultsDir(['2026-11-20-node-24.json']))).toBeUndefined()
    expect(latestCompare(join(dir, 'missing'))).toBeUndefined()
    expect(compareOrder([])).toBe('this-first')
    expect(compareOrder(['--reverse'])).toBe('this-last')
  })
})

describe('the comparison cases', () => {
  const byName = (name: string) => CASES.find((c) => c.name === name)

  it('compare the five structures with the planned classes of each library [047 S1-AC3]', () => {
    expect(SIZES).toEqual([1_000, 100_000, 1_000_000])
    expect(CASES_THIS).toBe(THIS)
    expect(LIBRARIES).toEqual([
      { name: 'js-sdsl', packages: ['js-sdsl'] },
      { name: 'mnemonist', packages: ['mnemonist'] },
      {
        name: '@datastructures-js',
        packages: [
          '@datastructures-js/priority-queue',
          '@datastructures-js/deque',
          '@datastructures-js/linked-list',
        ],
      },
    ])
    const summary = CASES.map((c) => [
      c.name,
      c.ours.export,
      c.others.map((o) => `${o.package} ${o.export}`),
    ])
    expect(summary).toEqual([
      ['Sorted map', 'TreeMap', ['js-sdsl OrderedMap']],
      [
        'Priority queue',
        'PriorityQueue',
        [
          'js-sdsl PriorityQueue',
          'mnemonist Heap',
          '@datastructures-js/priority-queue MinPriorityQueue',
        ],
      ],
      ['Deque', 'ArrayDeque', ['js-sdsl Deque', '@datastructures-js/deque Deque']],
      ['LRU map', 'LinkedHashMap', ['mnemonist LRUMap']],
      [
        'Linked list',
        'LinkedList',
        ['js-sdsl LinkList', '@datastructures-js/linked-list DoublyLinkedList'],
      ],
    ])
    expect(byName('Sorted map')?.operations).toEqual([
      'insert',
      'get',
      'nearest key at or below',
      'iterate in order',
      'delete and insert again',
    ])
    expect(byName('Priority queue')?.operations).toEqual([
      'build from an array',
      'push',
      'poll all',
    ])
    expect(byName('Deque')?.operations).toEqual([
      'add at the end, take from the front',
      'add at the front, take from the end',
    ])
    expect(byName('LRU map')?.operations).toEqual(['set 2n keys, evicting n', 'get present keys'])
    expect(byName('Linked list')?.operations).toEqual([
      'add at the end',
      'add at the end, take from the front',
    ])
    for (const c of CASES) {
      for (const o of c.others) {
        const library = LIBRARIES.find((l) => l.name === o.library)
        expect(library?.packages, `${c.name} ${o.library}`).toContain(o.package)
        expect(STUBS[o.package as keyof typeof STUBS], o.package).toHaveProperty(o.export)
      }
      expect(lib, c.ours.export).toHaveProperty(c.ours.export)
    }
  })

  it('use this library with its defaults, and a comparator only where a default order is not ascending [047 S1-AC4]', () => {
    const options = CASES.map((c) => [c.name, c.ours.options])
    expect(options).toEqual([
      ['Sorted map', null],
      ['Priority queue', null],
      ['Deque', null],
      ['LRU map', '{ accessOrder: true, maxSize: n }'],
      ['Linked list', null],
    ])
    const comparators = CASES.flatMap((c) =>
      c.others.filter((o) => o.comparator !== 'default').map((o) => `${o.package} ${o.export}`),
    )
    expect(comparators).toEqual(['js-sdsl PriorityQueue'])
    const source = read('fixtures/competitors/cases.mjs')
    // The comparator appears only where js-sdsl's PriorityQueue is built.
    const uses = source.split('\n').filter((line) => line.includes('a - b)'))
    expect(uses.length).toBe(3)
    for (const line of uses) expect(line).toMatch(/new sdsl\.PriorityQueue\(/)
    // Every build copies its input once inside the timed work: this library's and js-sdsl's
    // constructors and mnemonist's Heap.from copy the array themselves (js-sdsl's copy argument is
    // left at its default), @datastructures-js is given a slice.
    expect(source.match(/new PriorityQueue\(keys\)/g)?.length).toBe(2)
    expect(source.match(/Heap\.from\(keys\)/g)?.length).toBe(2)
    expect(source.match(/MinPriorityQueue\.fromArray\(keys\.slice\(\)\)/g)?.length).toBe(2)
    expect(source).not.toMatch(/new sdsl\.PriorityQueue\([^)]*\),\s*false/)
    expect(source).not.toMatch(/fromArray\(keys\)/)
    // Only documented, public names: no member that starts with an underscore.
    expect(source).not.toMatch(/\.\s*_\w/)
  })

  it('do the planned number of elements or operations in each pass at every size [047 S1-AC3]', () => {
    for (const size of [10, 1_000, 30_000]) {
      const cases = compareCases(lib, STUBS, size)
      const reads = Math.min(size, LOOKUPS)
      const ops = Math.min(size, OPS)
      const expected: Record<string, number> = {
        'Sorted map insert': size,
        'Sorted map get': reads,
        'Sorted map nearest key at or below': reads,
        'Sorted map iterate in order': size,
        'Sorted map delete and insert again': ops,
        'Priority queue build from an array': size,
        'Priority queue push': size,
        'Priority queue poll all': size,
        'Deque add at the end, take from the front': ops,
        'Deque add at the front, take from the end': ops,
        'LRU map set 2n keys, evicting n': 2 * size,
        'LRU map get present keys': reads,
        'Linked list add at the end': size,
        'Linked list add at the end, take from the front': ops,
      }
      expect(Object.fromEntries(cases.map((c) => [`${c.case} ${c.operation}`, c.ops]))).toEqual(
        expected,
      )
      for (const c of cases) {
        expect(c.size).toBe(size)
        const info = CASES.find((i) => i.name === c.case)
        expect(info?.operations, c.case).toContain(c.operation)
        expect(c.sides.map((s) => s.library)).toEqual([
          THIS,
          ...(info?.others.map((o) => o.library) ?? []),
        ])
        expect(c.sides.map((s) => s.name)).toEqual([
          info?.ours.export,
          ...(info?.others.map((o) => o.export) ?? []),
        ])
        // Each side is its own function.
        expect(new Set(c.sides.map((s) => s.run)).size).toBe(c.sides.length)
      }
    }
  })

  it('return the same order-sensitive checksum from every library, and a different one when a library differs [047 S1-AC1]', () => {
    for (const size of [1, 7, 1_000, 12_000]) {
      const checks = compareCases(lib, STUBS, size).flatMap((c) =>
        c.sides.map((s) => ({
          case: c.case,
          operation: c.operation,
          size,
          library: s.library,
          checksum: s.run(s.setup()),
        })),
      )
      expect(disagreements(checks), String(size)).toEqual([])
    }
    // A queue that gives the greatest element first disagrees on every queue operation.
    class Greatest extends SdslPriorityQueue {
      constructor(items: number[] = []) {
        super(items)
      }
    }
    const broken = { ...STUBS, 'js-sdsl': { ...STUBS['js-sdsl'], PriorityQueue: Greatest } }
    const checks = compareCases(lib, broken, 100).flatMap((c) =>
      c.sides.map((s) => ({
        case: c.case,
        operation: c.operation,
        size: 100,
        library: s.library,
        checksum: s.run(s.setup()),
      })),
    )
    expect(disagreements(checks).map((p) => p.replace(/:.*/, ''))).toEqual([
      'Priority queue, build from an array, 100',
      'Priority queue, push, 100',
      'Priority queue, poll all, 100',
    ])
  })

  it('name every library without a counterpart in a case [047 S2-AC3]', () => {
    for (const c of CASES) {
      const present = new Set(c.others.map((o) => o.library))
      expect(c.noCounterpart, c.name).toEqual(
        LIBRARIES.map((l) => l.name).filter((name) => !present.has(name)),
      )
    }
  })
})

describe('the comparison runner', () => {
  const runner = read('fixtures/competitors/compare.mjs')

  it('checks versions and agreement at every timed size before timing, and saves nothing on a difference [047 S1-AC1] [047 S1-AC2] [047 S1-AC3]', () => {
    const at = (text: string) => {
      const i = runner.indexOf(text)
      expect(i, text).toBeGreaterThan(0)
      return i
    }
    const versions = at('versionProblems(pins, installed)')
    const imports = at('await import(name)')
    const agreement = at('disagreements(checks)')
    const timing = at('measure(')
    const save = at('writeFileSync(')
    expect(versions).toBeLessThan(imports)
    expect(imports).toBeLessThan(agreement)
    expect(agreement).toBeLessThan(timing)
    expect(timing).toBeLessThan(save)
    expect(runner.slice(versions, agreement)).toMatch(/process\.exit\(1\)/)
    expect(runner.slice(agreement, timing)).toMatch(/process\.exit\(1\)/)
    // The agreement pass covers every size that is timed.
    expect(runner.slice(0, agreement)).toMatch(/for \(const size of sizes\)/)
    expect(runner).toContain("args.includes('--smoke')")
    expect(runner).toContain('compareOrder(args)')
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> })
      .scripts
    expect(scripts['bench:compare']).toBe('node fixtures/competitors/compare.mjs')
    expect(scripts['bench:chart']).toBe('node bench/chart.mjs')
  })

  it('records the date, Node.js, CPU, versions, order and every figure [047 S1-AC6]', () => {
    expect(runner).toMatch(/runInfo\(version\)/)
    expect(runner).toMatch(/\{ \.\.\.base, order \}/)
    expect(runner).toMatch(/JSON\.stringify\(\{ info, packages, sizes, cases \}/)
    expect(runner).toMatch(/hz: m\.hz \* c\.ops, rme: m\.rme/)
    expect(runner).toContain('compareFile(info)')
  })

  it('keeps every compared package out of the root: no file under bench, scripts or test imports one [047 S1-AC5]', () => {
    const names = COMPARED.map((n) => n.replace(/[/.]/g, '\\$&')).join('|')
    const importing = new RegExp(
      `(from\\s+|import\\s*\\(\\s*|require\\s*\\(\\s*)['"](${names})(/[^'"]*)?['"]`,
    )
    const files: string[] = []
    for (const dir of ['bench', 'scripts', 'test']) {
      for (const name of readdirSync(join(ROOT, dir), { recursive: true })) {
        const path = `${dir}/${String(name).split('\\').join('/')}`
        if (/\.(m?[jt]s|cjs)$/.test(path)) files.push(path)
      }
    }
    expect(files.length).toBeGreaterThan(20)
    for (const path of files) expect(read(path), path).not.toMatch(importing)
    // The cases import only the root harness and comparison helpers.
    const cases = read('fixtures/competitors/cases.mjs')
    expect([...cases.matchAll(/from '([^']+)'/g)].map((m) => m[1])).toEqual([
      '../../bench/lib/harness.mjs',
      '../../bench/lib/compare.mjs',
    ])
    expect(read('fixtures/competitors/compare.mjs')).toMatch(/for \(const name of packages\)/)
  })
})

describe('the comparison section', () => {
  const section = renderCompareSection(SAMPLE, 'ALT')

  it('shows one table per case with each figure, its spread and the ratio other ÷ this library, with the versions, date, Node.js and machine [047 S2-AC1]', () => {
    expect(section.split('\n')[0]).toBe(
      'Run on 2026-11-24 with Node.js v24.11.1 on linux, Test CPU <x> & co (4 cores, 16 GB), ' +
        'version 0.1.1 of the package, each case timed this library first. Compared packages: ' +
        '@datastructures-js/deque 1.0.8, @datastructures-js/linked-list 6.1.4, ' +
        '@datastructures-js/priority-queue 6.4.0, js-sdsl 4.4.2, mnemonist 0.40.8.',
    )
    expect(section).toContain('\n#### Priority queue\n')
    expect(section).toContain('\n#### Deque\n')
    expect(section).toContain('| Operation | Size | Library | Per second | Other ÷ this library |')
    expect(section).toContain(`| push | 1,000 | ${THIS} \`PriorityQueue\` | 2.00 M ±2 % | 1× |`)
    // Above 1× the other library has the higher figure.
    expect(section).toContain('| push | 1,000 | js-sdsl `PriorityQueue` | 4.00 M ±2 % | 2.0× |')
    expect(section).toContain('| push | 1,000 | mnemonist `Heap` | 1.00 M ±2 % | 0.50× |')
    expect(section).toContain('| push | 100,000 | mnemonist `Heap` | 100 M ±2 % | 100× |')
    // Every measured row is in a table.
    const rows = section.split('\n').filter((l) => /^\| [a-z]/.test(l))
    expect(rows.length).toBe(SAMPLE.cases.reduce((n, c) => n + c.results.length, 0))
    expect(
      renderCompareSection({ ...SAMPLE, info: { ...SAMPLE.info, order: 'this-last' } }),
    ).toContain('each case timed this library last.')
  })

  it('keeps an unstable row in its table without a ratio, and lists every higher median of another library after the tables [047 S2-AC2]', () => {
    expect(section).toContain(
      '| add at the front, take from the end | 100,000 | js-sdsl `Deque` | 8.00 M ±150 % | unstable |',
    )
    expect(
      losses(SAMPLE).map((l) => [
        l.case,
        l.operation,
        l.size,
        l.library,
        l.ratio,
        l.withinSpread,
        l.unstable,
      ]),
    ).toEqual([
      ['Priority queue', 'push', 1_000, 'js-sdsl', '2.0×', false, false],
      ['Priority queue', 'push', 100_000, 'js-sdsl', '1.1×', true, false],
      ['Priority queue', 'push', 100_000, 'mnemonist', '100×', false, false],
      ['Deque', 'add at the front, take from the end', 100_000, 'js-sdsl', 'unstable', true, true],
    ])
    const after = section.slice(section.lastIndexOf('|'))
    expect(after).toContain(
      [
        'Another library has a higher median in:',
        '',
        '- Priority queue, push, 1,000 (js-sdsl `PriorityQueue` 2.0×)',
        '- Priority queue, push, 100,000 (js-sdsl `PriorityQueue` 1.1×) (within spread)',
        '- Priority queue, push, 100,000 (mnemonist `Heap` 100×)',
        '- Deque, add at the front, take from the end, 100,000 (js-sdsl `Deque` unstable) (unstable)',
      ].join('\n'),
    )
    const none: CompareResult = {
      ...SAMPLE,
      cases: [
        {
          case: 'Deque',
          operation: 'x',
          size: 1_000,
          results: [run({ library: THIS }), run({ library: 'js-sdsl', hz: 1 })],
        },
      ],
    }
    expect(renderCompareSection(none)).toContain(
      'No other library has a higher median in this run.',
    )
    // A zero median on either side gives no ratio, in the table and in the chart.
    const zero: CompareResult = {
      ...SAMPLE,
      sizes: [100_000],
      cases: [
        {
          case: 'Deque',
          operation: 'x',
          size: 100_000,
          results: [run({ library: THIS }), run({ library: 'js-sdsl', name: 'Deque', hz: 0 })],
        },
      ],
    }
    expect(renderCompareSection(zero)).toContain(
      '| x | 100,000 | js-sdsl `Deque` | 0.00 ±2 % | unstable |',
    )
    expect(renderChart(zero)).not.toMatch(/fill="#0969da"/)
    expect(renderChart(zero)).toContain('>unstable<')
  })

  it('names a library with no counterpart under the case table [047 S2-AC3]', () => {
    const only: CompareResult = {
      ...SAMPLE,
      cases: [
        {
          case: 'Sorted map',
          operation: 'get',
          size: 1_000,
          results: [run({ library: THIS }), run({ library: 'js-sdsl' })],
        },
        {
          case: 'LRU map',
          operation: 'get',
          size: 1_000,
          results: [run({ library: THIS }), run({ library: 'mnemonist' })],
        },
      ],
    }
    const text = renderCompareSection(only)
    const sorted = text.slice(text.indexOf('#### Sorted map'), text.indexOf('#### LRU map'))
    expect(sorted).toContain('\nNo counterpart: mnemonist.\n')
    expect(sorted).not.toContain('mnemonist `')
    expect(text.slice(text.indexOf('#### LRU map'))).toContain('No counterpart: js-sdsl.')
    expect(section).not.toContain('No counterpart')
  })

  it('fails the check naming the first differing line or a version other than the pins, and shows the no-run line with no compare file [047 S2-AC4]', () => {
    const page = (text: string) =>
      `# P\n\n## Benchmarks\n\n${COMPARE_START}\n${text}\n${COMPARE_END}\n`
    expect(compareSectionProblems(page(section), SAMPLE, PINS, 'ALT')).toEqual([])
    // Table padding from the formatter is ignored.
    const padded = section.replace('| push | 1,000 |', '|  push   |  1,000 |')
    expect(compareSectionProblems(page(padded), SAMPLE, PINS, 'ALT')).toEqual([])
    const changed = section.replace('2.0×', '2.1×')
    const problems = compareSectionProblems(page(changed), SAMPLE, PINS, 'ALT')
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(
      /at its line \d+: expected ".*2\.0×.*", found ".*2\.1×.*"; run `pnpm bench:docs`$/,
    )
    expect(
      compareSectionProblems(page(section), SAMPLE, { ...PINS, 'js-sdsl': '4.4.3' }, 'ALT'),
    ).toEqual(['js-sdsl: the results file records 4.4.2, the fixture pins 4.4.3'])
    expect(compareSectionProblems(page(NO_COMPARE_RUN), undefined, PINS)).toEqual([])
    expect(compareSectionProblems(page(section), undefined, PINS)[0]).toMatch(
      /line 1: expected "No recorded run yet/,
    )
    expect(compareSectionProblems('# P\n', SAMPLE, PINS)).toEqual([
      `the page has no ${COMPARE_START} … ${COMPARE_END} section`,
    ])
    expect(withCompareSection(page('old'), 'new')).toBe(page('new'))
    expect(() => withCompareSection('# P\n', 'new')).toThrow(/needs/)
  })

  it('sits inside the benchmarks section of the performance page and shows the newest compare run [047 S2-AC1] [047 S2-AC4]', () => {
    const doc = read('docs/performance.md')
    const benchmarks = doc.indexOf('\n## Benchmarks\n')
    const heading = doc.indexOf('\n### Compared with other libraries\n')
    const start = doc.indexOf(COMPARE_START)
    const end = doc.indexOf(COMPARE_END)
    expect(benchmarks).toBeGreaterThan(0)
    expect(heading).toBeGreaterThan(benchmarks)
    expect(start).toBeGreaterThan(heading)
    expect(end).toBeGreaterThan(start)
    expect(doc.slice(benchmarks + 1, end)).not.toMatch(/\n## /)
    expect(doc.slice(end)).not.toMatch(/\n## /)
    const pins = (
      JSON.parse(read('fixtures/competitors/package.json')) as {
        devDependencies: Record<string, string>
      }
    ).devDependencies
    const latest = latestCompare(join(ROOT, RESULTS_DIR))?.result
    const alt = latest === undefined ? undefined : chartAlt(latest)
    expect(compareSectionProblems(doc, latest, pins, alt)).toEqual([])
  })

  it('a line naming another library with a speed word outside the benchmarks section is a speed claim [047 S2-AC5]', () => {
    const files = new Map([
      ['README.md', 'Faster than js-sdsl.\nUnlike mnemonist, it has views.\n'],
      [
        'docs/performance.md',
        '# P\n\nSlower than @datastructures-js.\n\n## Benchmarks\n\nmnemonist is faster here.\n',
      ],
    ])
    expect(speedClaims(files)).toEqual([
      'README.md:1: Faster than js-sdsl.',
      'docs/performance.md:3: Slower than @datastructures-js.',
    ])
  })
})

describe('the comparison chart', () => {
  const svg = renderChart(SAMPLE)

  it('is the same bytes for the same result, with one bar per other library and operation at 100,000 elements on a log scale centred on 1× [047 S3-AC1]', () => {
    expect(renderChart(structuredClone(SAMPLE))).toBe(svg)
    expect(CHART_PATH).toBe('docs/images/benchmarks.svg')
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" width="800"')).toBe(true)
    // Rows at 100,000: Priority queue push (js-sdsl 1.06×, mnemonist 100×), Deque (js-sdsl
    // unstable, mnemonist 0.00025×). The 1,000 rows are not drawn; this library has no row.
    const labels = [...svg.matchAll(/text-anchor="end">([^<]+)<\/text>/g)].map((m) => m[1])
    expect(labels).toEqual([
      'other library higher ▶',
      'js-sdsl PriorityQueue',
      '1.1×',
      'mnemonist Heap',
      '100×',
      'js-sdsl Deque',
      'unstable',
      'mnemonist Heap',
      '0.00025×',
    ])
    expect(svg).not.toContain(`${THIS} PriorityQueue`)
    // Bars: three (the unstable row has none). The axis maps log2 of the ratio from -3 to 3 onto
    // 320 to 700, so 1× is at 510; clamped ratios end at the axis ends.
    const bars = [
      ...svg.matchAll(
        /<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="14" fill="#0969da"\/>/g,
      ),
    ].map((m) => [Number(m[1]), Number(m[2])])
    expect(bars).toHaveLength(3)
    const centre = 510
    const [jsSdsl, mnemonist, low] = bars as [number[], number[], number[]]
    expect(jsSdsl[0]).toBe(centre)
    expect(jsSdsl[1]).toBeCloseTo((Math.log2(1.06) / 6) * 380, 0)
    expect(mnemonist).toEqual([centre, 190])
    expect(low).toEqual([320, 190])
    expect(svg).toMatch(/<line x1="510\.0" [^>]*stroke-dasharray/)
    expect(svg).toContain('>1/8×<')
    expect(svg).toContain('>8×<')
    // The caption carries the run.
    const caption = [...svg.matchAll(/<text x="12" y="\d+" fill="#1f2328">([^<]+)<\/text>/g)]
      .map((m) => m[1])
      .join(' ')
    for (const part of [
      '100,000 elements',
      '2026-11-24',
      'v24.11.1',
      'Test CPU &lt;x&gt; &amp; co',
      'js-sdsl 4.4.2',
      'mnemonist 0.40.8',
      '@datastructures-js/priority-queue 6.4.0',
    ]) {
      expect(caption, part).toContain(part)
    }
  })

  it('draws on an opaque background, with text and bars that contrast with it and a title and description from the run [047 S3-AC2]', () => {
    expect(svg).toContain('<rect x="0" y="0" width="800" height=')
    expect(svg).toMatch(/<rect x="0" y="0" width="800" height="\d+" fill="#ffffff"\/>/)
    const colours = new Set([...svg.matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/g)].map((m) => m[1]))
    expect([...colours].sort()).toEqual(
      [COLOURS.background, COLOURS.text, COLOURS.bar, COLOURS.line].sort(),
    )
    for (const colour of [COLOURS.text, COLOURS.bar, COLOURS.line]) {
      expect(contrast(colour, COLOURS.background), colour).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
    expect(() => contrast('red', '#ffffff')).toThrow(TypeError)
    expect(svg).toContain(`<title>${CHART_TITLE}</title>`)
    const desc = /<desc>([^<]+)<\/desc>/.exec(svg)?.[1] ?? ''
    expect(desc).toContain('2026-11-24')
    expect(desc).toContain('Priority queue, push, js-sdsl PriorityQueue 1.1×')
    expect(desc).toContain('Deque, add at the front, take from the end, js-sdsl Deque unstable')
    // Each bar's meaning is in its text label and its side of the 1× line, not in its colour.
    expect(svg).toContain(`◀ ${THIS} higher`)
    expect(svg).toContain('other library higher ▶')
  })

  it('is checked against the newest compare file by `pnpm bench:check`, and needs none without one [047 S3-AC3]', () => {
    const docs = read('bench/docs.mjs')
    expect(docs).toMatch(/readFileSync\(chartPath, 'utf8'\) !== renderChart\(compared\)/)
    expect(docs).toMatch(/if \(compared !== undefined\)/)
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> })
      .scripts
    expect(scripts['bench:check']).toBe('node bench/docs.mjs check')
    expect(scripts.check).toContain('pnpm bench:check')
    const latest = latestCompare(join(ROOT, RESULTS_DIR))?.result
    if (latest !== undefined) expect(read(CHART_PATH)).toBe(renderChart(latest))
  })

  it('is shown in the section with alt text that states the result [047 S3-AC4]', () => {
    const alt = chartAlt(SAMPLE)
    expect(alt).toBe(
      `Bar chart of each other library's median operations per second divided by ${THIS}'s, at ` +
        "100,000 elements, on a log scale centred on 1×. Rows where another library's median is " +
        'higher, 2 of 4: Priority queue push (js-sdsl 1.1×), Priority queue push (mnemonist 100×).',
    )
    const text = renderCompareSection(SAMPLE, alt)
    expect(text.split('\n')[2]).toBe(`![${alt}](${CHART_LINK})`)
    expect(CHART_LINK).toBe('images/benchmarks.svg')
    expect(renderCompareSection(SAMPLE)).not.toContain('![')
    expect(read('bench/docs.mjs')).toContain('renderCompareSection(compared, alt)')
  })
})

describe('the nightly comparison job', () => {
  it('builds, installs the fixture frozen, runs every case once with no timing and audits it [047 S4-AC1]', () => {
    const nightly = read('.github/workflows/nightly.yml')
    const text = job(nightly, 'competitors')
    expect(text).toMatch(/permissions:\n {6}contents: read\n/)
    expect(text).toContain('persist-credentials: false')
    // Only the Actions CI already pins, at the same commits.
    const ci = read('.github/workflows/ci.yml')
    const uses = [...text.matchAll(/uses: (\S+)/g)].map((m) => m[1] as string)
    expect(uses.length).toBe(3)
    for (const action of uses) expect(ci, action).toContain(`uses: ${action}`)
    expect(text).toContain('node-version: 24')
    const steps = [
      'run: pnpm install --frozen-lockfile',
      'run: pnpm build',
      'working-directory: fixtures/competitors\n        run: pnpm install --frozen-lockfile',
      'run: node fixtures/competitors/compare.mjs --smoke',
      'working-directory: fixtures/competitors\n        run: pnpm audit',
    ]
    let at = -1
    for (const step of steps) {
      const next = text.indexOf(step, at + 1)
      expect(next, step).toBeGreaterThan(at)
      at = next
    }
    expect(text).not.toContain('secrets.')
    expect(nightly.slice(0, nightly.indexOf('\non:'))).toContain('fixtures/competitors/')
    // The smoke run saves nothing and times nothing.
    const runner = read('fixtures/competitors/compare.mjs')
    const smokeExit = runner.indexOf('if (smoke) {')
    expect(smokeExit).toBeGreaterThan(0)
    expect(smokeExit).toBeLessThan(runner.indexOf('measure('))
    expect(runner.slice(smokeExit, runner.indexOf('measure('))).toContain('process.exit(0)')
  })
})
