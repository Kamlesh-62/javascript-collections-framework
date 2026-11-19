import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { badgeColour, badgeSvg, floorPct, writeSiteCoverage } from '../scripts/site-coverage.mjs'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const work = mkdtempSync(join(tmpdir(), 'site-coverage-'))
afterAll(() => rmSync(work, { recursive: true, force: true }))

/** Writes a coverage summary and an HTML report with the given line coverage. */
function fixture(name: string, pct: number): { summary: string; report: string } {
  const report = join(work, name, 'coverage')
  mkdirSync(report, { recursive: true })
  const summary = join(report, 'coverage-summary.json')
  writeFileSync(summary, JSON.stringify({ total: { lines: { total: 10, covered: 9, pct } } }))
  writeFileSync(join(report, 'index.html'), '<html>report</html>')
  writeFileSync(join(report, 'base.css'), 'body {}')
  writeFileSync(join(report, 'coverage-final.json'), '{}')
  writeFileSync(join(report, 'clover.xml'), '<coverage/>')
  return { summary, report }
}

describe('the coverage badge', () => {
  it('shows the line coverage rounded down to one decimal place [038 S2-AC4]', () => {
    expect(floorPct(99.96)).toBe(99.9)
    expect(floorPct(100)).toBe(100)
    expect(floorPct(0)).toBe(0)
    expect(floorPct(4.35)).toBe(4.3)
    expect(floorPct(94.99)).toBe(94.9)
    expect(badgeSvg(99.96)).toContain('>99.9%</text>')
    expect(badgeSvg(100)).toContain('>100%</text>')
    expect(badgeSvg(0)).toContain('>0%</text>')
    expect(badgeSvg(99.96)).toContain('aria-label="coverage: 99.9%"')
    expect(() => badgeSvg(Number.NaN)).toThrow(RangeError)
    expect(() => badgeSvg(101)).toThrow(RangeError)
  })

  it('is green from 95, yellow from 90 and red below, and widens with its text [038 S2-AC4]', () => {
    expect(badgeColour(100)).toBe(badgeColour(95))
    expect(badgeColour(94.9)).toBe(badgeColour(90))
    expect(badgeColour(89.9)).toBe(badgeColour(0))
    expect(new Set([badgeColour(95), badgeColour(90), badgeColour(0)]).size).toBe(3)
    expect(badgeSvg(99.96)).toContain(`fill="${badgeColour(95)}"`)
    expect(badgeSvg(0)).toContain(`fill="${badgeColour(0)}"`)
    const width = (svg: string) => Number(/width="(\d+)"/.exec(svg)?.[1])
    expect(width(badgeSvg(100))).toBeGreaterThan(width(badgeSvg(0)))
  })

  it('is written with a JSON summary and a copy of the HTML report [038 S2-AC4]', () => {
    for (const [name, pct, lines] of [
      ['high', 99.96, 99.9],
      ['full', 100, 100],
      ['none', 0, 0],
    ] as const) {
      const { summary, report } = fixture(name, pct)
      const out = join(work, name, 'site', 'coverage')
      expect(writeSiteCoverage(summary, report, out)).toEqual({ lines })
      expect(readFileSync(join(out, 'badge.svg'), 'utf8')).toBe(badgeSvg(pct))
      expect(JSON.parse(readFileSync(join(out, 'coverage.json'), 'utf8'))).toEqual({ lines })
      expect(readFileSync(join(out, 'report', 'index.html'), 'utf8')).toBe('<html>report</html>')
      expect(existsSync(join(out, 'report', 'base.css'))).toBe(true)
      expect(existsSync(join(out, 'report', 'coverage-final.json'))).toBe(false)
      expect(existsSync(join(out, 'report', 'clover.xml'))).toBe(false)
    }
  })

  it('takes its figure from the json-summary coverage reporter [038 S2-AC4]', () => {
    const config = read('vitest.config.ts')
    expect(config).toContain("'json-summary'")
    const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>
    expect(scripts['docs:site']).toBe(
      'typedoc && node scripts/site-coverage.mjs coverage/coverage-summary.json coverage site/coverage',
    )
  })
})

describe('the site workflow', () => {
  const workflow = read('.github/workflows/ci.yml')
  /** The text of one job of the CI workflow. */
  const job = (name: string) => {
    const start = workflow.indexOf(`\n  ${name}:\n`)
    expect(start, name).toBeGreaterThan(0)
    const next = workflow.slice(start + 1).search(/\n {2}[a-z-]+:\n/)
    return next < 0 ? workflow.slice(start) : workflow.slice(start, start + 1 + next)
  }
  const jobs = [
    ...workflow.slice(workflow.indexOf('\njobs:\n')).matchAll(/\n {2}([a-z-]+):\n/g),
  ].map((m) => m[1] as string)

  it('builds the TypeDoc site with the coverage report on every run [038 S1-AC2]', () => {
    expect(workflow).toMatch(/\non:\n {2}push:\n {4}branches: \[main\]\n {2}pull_request:\n/)
    const site = job('site')
    expect(site).not.toContain('if:')
    expect(site).toContain('node-version: 24')
    expect(site).toMatch(/permissions:\n {6}contents: read\n {4}steps:/)
    expect(site).toContain('run: pnpm test:coverage')
    expect(site).toContain('run: pnpm docs:site')
    expect(site).toMatch(/uses: actions\/upload-pages-artifact@[0-9a-f]{40} # v\d/)
    expect(site).toContain('path: site/')
    // The job builds the deployed artifact, so it restores no dependency cache.
    expect(site).not.toContain('cache:')
    const config = JSON.parse(read('typedoc.json'))
    expect(config.entryPoints).toEqual(['src/index.ts'])
    expect(config.out).toBe('site')
    expect(config.treatWarningsAsErrors).toBe(true)
    expect(config.excludeInternal).toBe(true)
    expect(config.validation.notExported).toBe(true)
    // The docs pages are rendered on the site, so the README's links to them lead to pages.
    expect(config.projectDocuments).toContain('docs/*.md')
    expect(read('.gitignore').split('\n')).toContain('site/')
  })

  it('deploys only from a push to main, after every other job, with only the Pages permissions [038 S1-AC2]', () => {
    const deploy = job('deploy')
    expect(deploy).toContain("if: github.event_name == 'push' && github.ref == 'refs/heads/main'")
    const needs = /needs: \[([^\]]*)\]/.exec(deploy)?.[1]?.split(', ') ?? []
    // The pull-request job runs only on pull requests, so a push run never waits for it.
    const others = jobs.filter((name) => name !== 'deploy' && name !== 'pull-request')
    expect([...needs].sort()).toEqual([...others].sort())
    expect(deploy).toMatch(/permissions:\n {6}pages: write\n {6}id-token: write\n {4}environment:/)
    expect(deploy).toContain('name: github-pages')
    expect(deploy).toMatch(/uses: actions\/deploy-pages@[0-9a-f]{40} # v\d/)
    for (const name of others) {
      expect(job(name), name).not.toMatch(/pages: write|id-token: write/)
    }
    expect(workflow).toMatch(/\npermissions: \{\}\n/)
  })

  it('publishes the badge, the summary and the report from the Node 24 run [038 S2-AC4]', () => {
    const site = job('site')
    expect(site.indexOf('pnpm test:coverage')).toBeLessThan(site.indexOf('pnpm docs:site'))
    expect(site).toContain('node-version: 24')
  })
})
