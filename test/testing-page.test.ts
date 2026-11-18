import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as config from './stress/config'
import { grouped, renderCountsTable } from './support/counts-table'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const page = read('docs/testing.md')
const START = '<!-- counts:start -->'
const END = '<!-- counts:end -->'

/** The page without its counts table. */
const prose = page.slice(0, page.indexOf(START)) + page.slice(page.indexOf(END) + END.length)

describe('the testing page', () => {
  it('is linked from the README and the documentation index [033 S4-AC1]', () => {
    expect(read('README.md')).toContain('(docs/testing.md)')
    expect(read('docs/README.md')).toContain('(testing.md)')
    expect(read('docs/compatibility.md')).toContain('(testing.md)')
  })

  it('describes each kind of test, how to run it and how to replay a failing seed [033 S4-AC1]', () => {
    for (const kind of [
      'Shared contract suites',
      'Reference comparisons',
      'Scale',
      'Deep random runs',
      'The built package',
      'Two loaded copies',
      'Frameworks',
      'Runtimes',
    ]) {
      expect(page, kind).toContain(`**${kind}.**`)
    }
    expect(page).toContain('## Running the tests')
    expect(page).toContain('pnpm test:stress --project src')
    expect(page).toContain('## Replaying a failure')
    expect(page).toContain('test/stress/regressions.ts')
  })

  it('is written in the library’s own voice, with no planning references [033 S4-AC1]', () => {
    expect(page).not.toMatch(/\[\d{3} S\d+-AC\d+\]/)
    expect(page).not.toMatch(/\bspecs?\b|\bAC\d/i)
    expect(page).not.toMatch(/\b(I|we|our)\b/)
  })

  it('shows exactly the counts in the stress configuration, and its prose repeats none of them [033 S4-AC2]', () => {
    const start = page.indexOf(START)
    const end = page.indexOf(END)
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    expect(page.slice(start + START.length, end).trim()).toBe(renderCountsTable(config))
    const counts = [
      ...Object.values(config.SCALE),
      ...Object.values(config.DEEP),
      ...Object.values(config.FAST),
      ...Object.values(config.NIGHTLY),
      config.RUNS.length,
    ]
    // Single digits also appear in formulas and ordinary prose; every larger count must not.
    for (const n of counts.filter((c) => c >= 10)) {
      for (const text of new Set([String(n), grouped(n)])) {
        expect(prose, `the prose repeats ${text}`).not.toMatch(
          new RegExp(`(^|[^\\w.,])${text}($|[^\\w,])`),
        )
      }
    }
  })

  it('lists what is not tested and links the nightly workflow, whose stress job runs the suites with the configured timeout [033 S4-AC3]', () => {
    const notTested = page.slice(page.indexOf('## What is not tested'))
    expect(notTested).toMatch(/garbage collection/)
    expect(notTested).toMatch(/\*\*Speed\.\*\*/)
    expect(notTested).toMatch(/\*\*Engines and runtimes outside CI\.\*\*/)
    expect(page).toContain('(../.github/workflows/nightly.yml)')
    const workflow = read('.github/workflows/nightly.yml')
    const job = workflow.slice(workflow.indexOf('\n  stress:'))
    expect(job).toContain(`timeout-minutes: ${config.NIGHTLY.timeoutMinutes}\n`)
    expect(job).toContain('run: pnpm build')
    expect(job).toContain('run: pnpm test:stress')
  })
})
