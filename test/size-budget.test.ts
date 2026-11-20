import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  PACKED_REQUIRED,
  packageProblems,
  packedFileProblems,
  sourceExampleCount,
  tsdocProblems,
} from '../scripts/lib/package-size.mjs'
import {
  BUDGET_PATH,
  budgetFor,
  checkBudgets,
  formatBudgets,
  PERFORMANCE_PAGE,
  parseBudgets,
  parseUnpacked,
  renderSizeTable,
  TABLE_END,
  TABLE_START,
  tableIn,
  withTable,
} from '../scripts/lib/size-budget.mjs'
import { formatReport, parseReport } from '../scripts/lib/size-compare.mjs'
import { measureSizes, SIZE_REPORT_PATH, sizeReport } from '../scripts/lib/size-report.mjs'

/** A packed file list that passes the allowlist. */
const COMPLETE = [...PACKED_REQUIRED, 'package.json']

const ROOT = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const entry = (name: string, minified: number, gzip: number) => ({ name, minified, gzip })

describe('size budgets', () => {
  it('sets a budget at the gzipped size plus 10 %, rounded up to a multiple of 64 [039 S2-AC3]', () => {
    expect(budgetFor(400)).toBe(448)
    expect(budgetFor(101)).toBe(128)
    expect(budgetFor(33698)).toBe(37120)
    // An exact multiple stays exact: 640 + 10 % is 704, which is 11 × 64.
    expect(budgetFor(640)).toBe(704)
    expect(budgetFor(1)).toBe(64)
  })

  it('keeps one budget for the whole package and each export, each at or above its size [039 S2-AC3]', () => {
    const report = parseReport(read(SIZE_REPORT_PATH))
    const budgets = parseBudgets(read(BUDGET_PATH))
    expect([...budgets.keys()].sort()).toEqual(report.map((e) => e.name).sort())
    expect(budgets.get('*')).toBeDefined()
    // Budgets start at the formula's value and then change only by hand, so the committed sizes
    // may move within them; the formula itself is tested on its own above.
    for (const e of report) {
      const budget = budgets.get(e.name) ?? 0
      expect(e.gzip, e.name).toBeLessThanOrEqual(budget)
      expect(budget % 64, e.name).toBe(0)
    }
    expect(read(BUDGET_PATH)).toBe(formatBudgets(budgets, parseUnpacked(read(BUDGET_PATH))))
  })

  it('fails on an entry over its budget, an entry with no budget, and a budget for no entry [039 S2-AC3]', () => {
    const report = [entry('*', 900, 500), entry('a', 100, 80), entry('b', 60, 40)]
    expect(
      checkBudgets(
        report,
        new Map([
          ['*', 576],
          ['a', 128],
          ['b', 64],
        ]),
      ),
    ).toEqual({ ok: true, problems: [] })
    // At the budget is within it; one byte over is not.
    expect(checkBudgets([entry('a', 1, 128)], new Map([['a', 128]])).ok).toBe(true)

    const verdict = checkBudgets(
      report,
      new Map([
        ['*', 499],
        ['b', 64],
        ['gone', 64],
      ]),
    )
    expect(verdict.ok).toBe(false)
    expect(verdict.problems).toEqual([
      "'*' is 500 bytes gzipped, over its budget of 499 bytes",
      "'a' has no budget (by the formula: 128 bytes for 80 gzipped)",
      "the budget for 'gone' names no entry of the size report",
    ])
  })

  it('rejects a budget file that is not a map of positive integers [039 S2-AC3]', () => {
    expect(() => parseBudgets('{ "budgets": [] }')).toThrow(TypeError)
    expect(() => parseBudgets('{ "entries": {} }')).toThrow(TypeError)
    expect(() => parseBudgets('{ "budgets": { "a": 1.5 } }')).toThrow(
      "the budget of 'a' must be a positive integer",
    )
    expect(() => parseBudgets('{ "budgets": { "a": 0 } }')).toThrow(TypeError)
    const budgets = new Map([
      ['b', 128],
      ['*', 640],
      ['a', 64],
    ])
    expect(parseBudgets(formatBudgets(budgets))).toEqual(budgets)
    expect(formatBudgets(budgets)).toBe(
      '{\n  "budgets": {\n    "*": 640,\n    "a": 64,\n    "b": 128\n  }\n}\n',
    )
  })
})

describe('size table', () => {
  it('renders export, minified, gzipped and budget, the whole package first, columns aligned [039 S2-AC4]', () => {
    const table = renderSizeTable(
      [entry('b', 60, 40), entry('*', 900, 500), entry('a', 100, 80)],
      new Map([
        ['*', 576],
        ['b', 64],
      ]),
    )
    expect(table.split('\n')).toEqual([
      '| Export        | Minified (bytes) | Gzipped (bytes) | Budget, gzipped (bytes) |',
      '| ------------- | ---------------: | --------------: | ----------------------: |',
      '| Whole package |              900 |             500 |                     576 |',
      '| `a`           |              100 |              80 |                       — |',
      '| `b`           |               60 |              40 |                      64 |',
    ])
  })

  it('finds and replaces the text between the markers, and nothing else [039 S2-AC4]', () => {
    const page = `# Title\n\n${TABLE_START}\nold\n${TABLE_END}\n\nAfter.\n`
    expect(tableIn(page)).toBe('old')
    const updated = withTable(page, 'new\nrows')
    expect(updated).toBe(`# Title\n\n${TABLE_START}\nnew\nrows\n${TABLE_END}\n\nAfter.\n`)
    expect(tableIn(updated ?? '')).toBe('new\nrows')
    expect(tableIn('no markers')).toBeUndefined()
    expect(withTable(`${TABLE_END}\n${TABLE_START}`, 'x')).toBeUndefined()
  })

  it('is published in the performance page, linked from the docs index, matching the report and budgets [039 S2-AC4]', () => {
    expect(read('docs/README.md')).toContain('(performance.md)')
    const page = read(PERFORMANCE_PAGE)
    expect(tableIn(page)).toBe(
      renderSizeTable(parseReport(read(SIZE_REPORT_PATH)), parseBudgets(read(BUDGET_PATH))),
    )
    expect(page).toContain('10 %')
    expect(page).toContain('64 bytes')
  })
})

describe('size command with budgets and the size table', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  const fakePack = () => ({ unpackedSize: 1000, files: COMPLETE })
  const build =
    "export const small = 1\nexport function large() { return 'x'.repeat(40) + String(small) }\n"
  const emptyPage = `# Performance\n\n${TABLE_START}\n${TABLE_END}\n`

  /** A tree with a build, a committed report of that build and a page with its table. */
  async function tree(budgets: (gzip: Map<string, number>) => Map<string, number>) {
    const root = mkdtempSync(join(tmpdir(), 'size-budget-'))
    roots.push(root)
    mkdirSync(join(root, 'dist'))
    mkdirSync(join(root, 'docs'))
    mkdirSync(join(root, 'api'))
    writeFileSync(join(root, 'dist', 'index.js'), build)
    writeFileSync(join(root, PERFORMANCE_PAGE), emptyPage)
    const measured = await measureSizes(root)
    if (!measured.ok) throw new Error(measured.message)
    const gzip = new Map(measured.entries.map((e) => [e.name, e.gzip]))
    writeFileSync(join(root, BUDGET_PATH), formatBudgets(budgets(gzip), 1088))
    writeFileSync(
      join(root, 'dist', 'index.d.ts'),
      '/** Summary. @example x */\nexport declare const small: 1\n',
    )
    expect((await sizeReport(root, 'update', undefined, fakePack)).ok).toBe(true)
    return root
  }
  const byFormula = (gzip: Map<string, number>) =>
    new Map([...gzip].map(([name, g]) => [name, budgetFor(g)]))

  it('passes when the report matches, every entry fits its budget and the table is current [039 S2-AC3]', async () => {
    const root = await tree(byFormula)
    expect(await sizeReport(root, 'check', undefined, fakePack)).toEqual({
      ok: true,
      message: 'matches the committed report (3 entries)',
    })
  })

  it('fails after the exact comparison on an entry over budget, with no budget, or a stale budget [039 S2-AC3]', async () => {
    const over = await tree((gzip) => {
      const budgets = byFormula(gzip)
      budgets.set('large', (gzip.get('large') ?? 0) - 1)
      return budgets
    })
    const overResult = await sizeReport(over, 'check', undefined, fakePack)
    expect(overResult.ok).toBe(false)
    expect(overResult.message).toContain(BUDGET_PATH)
    expect(overResult.message).toMatch(/'large' is \d+ bytes gzipped, over its budget/)

    const missing = await tree((gzip) => {
      const budgets = byFormula(gzip)
      budgets.delete('small')
      budgets.set('gone', 64)
      return budgets
    })
    const missingResult = await sizeReport(missing, 'check', undefined, fakePack)
    expect(missingResult.ok).toBe(false)
    expect(missingResult.message).toContain("'small' has no budget")
    expect(missingResult.message).toContain("the budget for 'gone' names no entry")

    // The exact comparison runs first: a changed build reports the size change, not the budget.
    writeFileSync(join(missing, 'dist', 'index.js'), `${build}export const extra = 2\n`)
    const changed = await sizeReport(missing, 'check', undefined, fakePack)
    expect(changed.message).toContain('pnpm size:update')
    expect(changed.message).not.toContain('budget')

    const root = await tree(byFormula)
    rmSync(join(root, BUDGET_PATH))
    expect(await sizeReport(root, 'check', undefined, fakePack)).toEqual({
      ok: false,
      message: `no budget file — add ${BUDGET_PATH}`,
    })
  })

  it('fails when the size table is stale or missing [039 S2-AC4]', async () => {
    const root = await tree(byFormula)
    const page = readFileSync(join(root, PERFORMANCE_PAGE), 'utf8')
    writeFileSync(join(root, PERFORMANCE_PAGE), page.replace('`small`', '`other`'))
    expect(await sizeReport(root, 'check', undefined, fakePack)).toEqual({
      ok: false,
      message: `the size table in ${PERFORMANCE_PAGE} is out of date — run pnpm size:update`,
    })
    writeFileSync(join(root, PERFORMANCE_PAGE), '# Performance\n')
    for (const mode of ['check', 'update'] as const) {
      expect((await sizeReport(root, mode, undefined, fakePack)).message).toBe(
        `${PERFORMANCE_PAGE} needs a size table between ${TABLE_START} and ${TABLE_END}`,
      )
    }
  })

  it('update rewrites the report and the table but leaves the budget file byte for byte [039 S2-AC3]', async () => {
    const root = await tree(byFormula)
    const stale = `{ "budgets": { "*": 64, "gone": 128 } }`
    writeFileSync(join(root, BUDGET_PATH), stale)
    writeFileSync(join(root, SIZE_REPORT_PATH), formatReport([entry('*', 1, 1)]))
    writeFileSync(join(root, PERFORMANCE_PAGE), emptyPage)
    expect(await sizeReport(root, 'update', undefined, fakePack)).toEqual({
      ok: true,
      message: `wrote ${SIZE_REPORT_PATH} (3 entries)`,
    })
    expect(readFileSync(join(root, BUDGET_PATH), 'utf8')).toBe(stale)
    const report = parseReport(readFileSync(join(root, SIZE_REPORT_PATH), 'utf8'))
    expect(report.map((e) => e.name)).toEqual(['*', 'large', 'small'])
    expect(tableIn(readFileSync(join(root, PERFORMANCE_PAGE), 'utf8'))).toBe(
      renderSizeTable(report, parseBudgets(stale)),
    )
    // The budgets still fail the check: update never makes them fit.
    expect((await sizeReport(root, 'check', undefined, fakePack)).ok).toBe(false)
  })

  it('update never writes the budget file, even when there is none [039 S2-AC3]', async () => {
    const root = await tree(byFormula)
    rmSync(join(root, BUDGET_PATH))
    expect((await sizeReport(root, 'update', undefined, fakePack)).ok).toBe(true)
    expect(() => readFileSync(join(root, BUDGET_PATH))).toThrow()
  })
})

describe('the packed package', () => {
  const pack = (unpackedSize: number, files: string[] = COMPLETE) => ({
    unpackedSize,
    files,
  })
  const docs = '/** Summary. @example x */\nexport declare const a: 1\n'

  it('has no source map and no built file pointing to one [042 S4-AC1]', () => {
    expect(packageProblems(pack(10), new Map([['dist/index.js', 'x']]), docs, 64)).toEqual([])
    expect(
      packageProblems(
        pack(10, [...COMPLETE, 'dist/index.js.map', 'dist/a/b.js.map']),
        new Map([
          ['dist/index.js', 'x\n//# sourceMappingURL=index.js.map\n'],
          ['dist/index.cjs', 'x\n//@ sourceMappingURL=index.cjs.map'],
          ['dist/ok.js', 'const sourceMappingURL = 1'],
        ]),
        docs,
        64,
      ),
    ).toEqual([
      'the package contains the source map dist/a/b.js.map',
      'the package contains the source map dist/index.js.map',
      'dist/index.cjs has a sourceMappingURL comment',
      'dist/index.js has a sourceMappingURL comment',
    ])
  })

  it('keeps its unpacked size within the budget, and reports both figures [042 S4-AC2]', () => {
    expect(packageProblems(pack(64), new Map(), docs, 64)).toEqual([])
    expect(packageProblems(pack(65), new Map(), docs, 64)).toEqual([
      'the package is 65 bytes unpacked, over its budget of 64 bytes',
    ])
  })

  it('keeps the TSDoc in its type declarations [042 S4-AC3]', () => {
    const documented =
      '/**\n * Returns one.\n *\n * @example\n * one() // 1\n */\nexport declare function one(): 1;\n'
    expect(tsdocProblems(documented, 1)).toEqual([])
    expect(tsdocProblems('export declare function one(): 1;\n', 0)).toEqual([
      'dist/index.d.ts: one has no summary and @example',
    ])
    expect(tsdocProblems('/** Returns one. */\nexport declare class One {}\n', 0)).toEqual([
      'dist/index.d.ts: One has no summary and @example',
    ])
    expect(tsdocProblems('/**\n * @example x\n */\nexport declare const one: 1;\n', 0)).toEqual([
      'dist/index.d.ts: one has no summary and @example',
    ])
    expect(tsdocProblems(documented, 2)).toEqual([
      'dist/index.d.ts has 1 @example tags, fewer than the 2 in src/',
    ])
    expect(packageProblems(pack(1), new Map(), undefined, 64)).toEqual([
      'dist/index.d.ts is missing',
    ])
  })

  it('finds every export of the built declarations documented, when built [042 S4-AC3]', () => {
    const file = join(ROOT, 'dist', 'index.d.ts')
    if (!existsSync(file)) return
    expect(tsdocProblems(readFileSync(file, 'utf8'), sourceExampleCount(ROOT))).toEqual([])
  })

  it('records the unpacked budget beside the bundle budgets, set by the same formula [042 S4-AC2]', () => {
    const text = read(BUDGET_PATH)
    const unpacked = parseUnpacked(text)
    expect(unpacked).toBeDefined()
    expect((unpacked ?? 0) % 64).toBe(0)
    expect(parseUnpacked('{ "budgets": {} }')).toBeUndefined()
    expect(() => parseUnpacked('{ "budgets": {}, "unpacked": 0 }')).toThrow(TypeError)
    expect(() => parseUnpacked('{ "budgets": {}, "unpacked": 1.5 }')).toThrow(
      '"unpacked" must be a positive integer',
    )
    expect(formatBudgets(new Map([['*', 64]]), 128)).toBe(
      '{\n  "budgets": {\n    "*": 64\n  },\n  "unpacked": 128\n}\n',
    )
  })
})

describe('the packed file list', () => {
  it('holds only allowlisted files and every required build file, naming each that breaks the rule [037 S2-AC1]', () => {
    expect(
      packedFileProblems([
        ...COMPLETE,
        'README.md',
        'LICENSE',
        'CHANGELOG.md',
        'dist/collections/tree-map.js',
        'dist/internal/engines/red-black-tree.js',
      ]),
    ).toEqual([])
    expect(
      packedFileProblems([
        'dist/index.js',
        'src/index.ts',
        '.env',
        'dist/data.json',
        'package.json',
      ]),
    ).toEqual([
      'the package contains .env, which is not in the allowlist of published files',
      'the package contains dist/data.json, which is not in the allowlist of published files',
      'the package contains src/index.ts, which is not in the allowlist of published files',
      'the package does not contain dist/index.cjs',
      'the package does not contain dist/index.d.cts',
      'the package does not contain dist/index.d.ts',
      'the package does not contain dist/index.iife.js',
    ])
    // Source maps have their own message.
    expect(packedFileProblems([...COMPLETE, 'dist/index.js.map'])).toEqual([])
  })

  it('is checked by the size command [037 S2-AC1]', () => {
    expect(
      packageProblems(
        { unpackedSize: 1, files: [...COMPLETE, 'test/a.test.ts'] },
        new Map(),
        '/** Summary. @example x */\nexport declare const a: 1\n',
        64,
      ),
    ).toEqual([
      'the package contains test/a.test.ts, which is not in the allowlist of published files',
    ])
  })
})

describe('size command with the package check', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  async function tree(unpacked: number | undefined, files: string[], script: string) {
    const root = mkdtempSync(join(tmpdir(), 'size-pack-'))
    roots.push(root)
    for (const dir of ['dist', 'docs', 'api']) mkdirSync(join(root, dir))
    writeFileSync(join(root, 'dist', 'index.js'), script)
    writeFileSync(
      join(root, 'dist', 'index.d.ts'),
      '/** Summary. @example x */\nexport declare const a: 1\n',
    )
    writeFileSync(join(root, PERFORMANCE_PAGE), `# P\n\n${TABLE_START}\n${TABLE_END}\n`)
    const measured = await measureSizes(root)
    if (!measured.ok) throw new Error(measured.message)
    const budgets = new Map(measured.entries.map((e) => [e.name, budgetFor(e.gzip)]))
    writeFileSync(join(root, BUDGET_PATH), formatBudgets(budgets, unpacked))
    const fake = () => ({ unpackedSize: 2000, files })
    expect((await sizeReport(root, 'update', undefined, fake)).ok).toBe(true)
    return { root, fake }
  }

  it('fails with both figures over the unpacked budget, and asks for one when it is missing [042 S4-AC2]', async () => {
    const over = await tree(1984, COMPLETE, 'export const a = 1\n')
    expect(await sizeReport(over.root, 'check', undefined, over.fake)).toEqual({
      ok: false,
      message:
        'the packed package fails its checks:\n  the package is 2000 bytes unpacked, over its budget of 1984 bytes',
    })
    const none = await tree(undefined, COMPLETE, 'export const a = 1\n')
    const result = await sizeReport(none.root, 'check', undefined, none.fake)
    expect(result.ok).toBe(false)
    expect(result.message).toContain(
      `no unpacked-size budget in ${BUDGET_PATH} — add "unpacked": ${budgetFor(2000)}`,
    )
    const fits = await tree(2048, COMPLETE, 'export const a = 1\n')
    expect((await sizeReport(fits.root, 'check', undefined, fits.fake)).ok).toBe(true)
  })

  it('reports a failed npm pack as a result, not a crash [042 S4-AC2]', async () => {
    const { root } = await tree(2048, COMPLETE, 'export const a = 1\n')
    const broken = () => {
      throw new Error('npm: not found')
    }
    expect(await sizeReport(root, 'check', undefined, broken)).toEqual({
      ok: false,
      message: 'npm pack --dry-run failed: npm: not found',
    })
  })

  it('fails on a packed source map or a sourceMappingURL comment [042 S4-AC1]', async () => {
    const maps = await tree(2048, [...COMPLETE, 'dist/index.js.map'], 'export const a = 1\n')
    writeFileSync(
      join(maps.root, 'dist', 'index.cjs'),
      'exports.a = 1\n//# sourceMappingURL=index.cjs.map\n',
    )
    const result = await sizeReport(maps.root, 'check', undefined, maps.fake)
    expect(result.message).toContain('the package contains the source map dist/index.js.map')
    expect(result.message).toContain('dist/index.cjs has a sourceMappingURL comment')
  })
})
