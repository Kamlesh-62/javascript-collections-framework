import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BUDGET_PATH,
  budgetFor,
  checkBudgets,
  formatBudgets,
  PERFORMANCE_PAGE,
  parseBudgets,
  renderSizeTable,
  TABLE_END,
  TABLE_START,
  tableIn,
  withTable,
} from '../scripts/lib/size-budget.mjs'
import { formatReport, parseReport } from '../scripts/lib/size-compare.mjs'
import { measureSizes, SIZE_REPORT_PATH, sizeReport } from '../scripts/lib/size-report.mjs'

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
    expect(read(BUDGET_PATH)).toBe(formatBudgets(budgets))
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
    writeFileSync(join(root, BUDGET_PATH), formatBudgets(budgets(gzip)))
    expect((await sizeReport(root, 'update')).ok).toBe(true)
    return root
  }
  const byFormula = (gzip: Map<string, number>) =>
    new Map([...gzip].map(([name, g]) => [name, budgetFor(g)]))

  it('passes when the report matches, every entry fits its budget and the table is current [039 S2-AC3]', async () => {
    const root = await tree(byFormula)
    expect(await sizeReport(root, 'check')).toEqual({
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
    const overResult = await sizeReport(over, 'check')
    expect(overResult.ok).toBe(false)
    expect(overResult.message).toContain(BUDGET_PATH)
    expect(overResult.message).toMatch(/'large' is \d+ bytes gzipped, over its budget/)

    const missing = await tree((gzip) => {
      const budgets = byFormula(gzip)
      budgets.delete('small')
      budgets.set('gone', 64)
      return budgets
    })
    const missingResult = await sizeReport(missing, 'check')
    expect(missingResult.ok).toBe(false)
    expect(missingResult.message).toContain("'small' has no budget")
    expect(missingResult.message).toContain("the budget for 'gone' names no entry")

    // The exact comparison runs first: a changed build reports the size change, not the budget.
    writeFileSync(join(missing, 'dist', 'index.js'), `${build}export const extra = 2\n`)
    const changed = await sizeReport(missing, 'check')
    expect(changed.message).toContain('pnpm size:update')
    expect(changed.message).not.toContain('budget')

    const root = await tree(byFormula)
    rmSync(join(root, BUDGET_PATH))
    expect(await sizeReport(root, 'check')).toEqual({
      ok: false,
      message: `no budget file — add ${BUDGET_PATH}`,
    })
  })

  it('fails when the size table is stale or missing [039 S2-AC4]', async () => {
    const root = await tree(byFormula)
    const page = readFileSync(join(root, PERFORMANCE_PAGE), 'utf8')
    writeFileSync(join(root, PERFORMANCE_PAGE), page.replace('`small`', '`other`'))
    expect(await sizeReport(root, 'check')).toEqual({
      ok: false,
      message: `the size table in ${PERFORMANCE_PAGE} is out of date — run pnpm size:update`,
    })
    writeFileSync(join(root, PERFORMANCE_PAGE), '# Performance\n')
    for (const mode of ['check', 'update'] as const) {
      expect((await sizeReport(root, mode)).message).toBe(
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
    expect(await sizeReport(root, 'update')).toEqual({
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
    expect((await sizeReport(root, 'check')).ok).toBe(false)
  })

  it('update never writes the budget file, even when there is none [039 S2-AC3]', async () => {
    const root = await tree(byFormula)
    rmSync(join(root, BUDGET_PATH))
    expect((await sizeReport(root, 'update')).ok).toBe(true)
    expect(() => readFileSync(join(root, BUDGET_PATH))).toThrow()
  })
})
