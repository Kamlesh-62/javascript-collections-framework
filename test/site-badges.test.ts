import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { flatBadge, formatKb, textWidth } from '../scripts/lib/badge.mjs'
import { parseReport } from '../scripts/lib/size-compare.mjs'
import { SIZE_REPORT_PATH } from '../scripts/lib/size-report.mjs'
import {
  DEPENDENCY_FIELDS,
  dependenciesBadge,
  sizeBadge,
  writeSiteBadges,
} from '../scripts/site-badges.mjs'

const ROOT = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const work = mkdtempSync(join(tmpdir(), 'site-badges-'))
afterAll(() => rmSync(work, { recursive: true, force: true }))

describe('badge drawing', () => {
  it('draws a label and a value, each as wide as its text [042 S3-AC2]', () => {
    const svg = flatBadge('size', '1.0 kB', '#123456')
    expect(svg).toContain('aria-label="size: 1.0 kB"')
    expect(svg).toContain('fill="#123456"')
    expect(svg).toContain(`width="${textWidth('size') + 10 + textWidth('1.0 kB') + 10}"`)
  })

  it('writes sizes in kB of 1000 bytes, rounded up to one decimal place [042 S3-AC3]', () => {
    expect(formatKb(33698)).toBe('33.7 kB')
    expect(formatKb(33600)).toBe('33.6 kB')
    expect(formatKb(33601)).toBe('33.7 kB')
    expect(formatKb(6000)).toBe('6.0 kB')
    expect(formatKb(1)).toBe('0.1 kB')
    expect(formatKb(0)).toBe('0.0 kB')
    expect(() => formatKb(1.5)).toThrow(RangeError)
    expect(() => formatKb(-1)).toThrow(RangeError)
  })
})

describe('the size and dependencies badges', () => {
  it('shows the whole package gzipped size from the committed size report [042 S3-AC3]', () => {
    const report = parseReport(read(SIZE_REPORT_PATH))
    const whole = report.find((e) => e.name === '*')
    expect(whole).toBeDefined()
    expect(sizeBadge(report)).toContain(`>${formatKb(whole?.gzip ?? 0)}</text>`)
    expect(() => sizeBadge([{ name: 'ArrayList', minified: 1, gzip: 1 }])).toThrow(
      'no whole-package entry',
    )
  })

  it('says 0 dependencies, and fails naming any dependency of any kind [042 S3-AC2]', () => {
    expect(dependenciesBadge(JSON.parse(read('package.json')))).toContain('>0</text>')
    expect(dependenciesBadge({ dependencies: {}, peerDependencies: {} })).toContain('>0</text>')
    expect(DEPENDENCY_FIELDS).toEqual([
      'dependencies',
      'optionalDependencies',
      'peerDependencies',
      'bundleDependencies',
    ])
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      expect(() => dependenciesBadge({ [field]: { left: '1.0.0' } })).toThrow(
        `package.json has ${field} entry 'left'`,
      )
    }
    expect(() => dependenciesBadge({ bundleDependencies: ['left'] })).toThrow(
      "bundleDependencies entry 'left'",
    )
    expect(() => dependenciesBadge({ bundleDependencies: true })).toThrow('bundleDependencies')
  })

  it('are written by the site build, which the site job uploads whole [042 S3-AC2]', () => {
    const out = join(work, 'badges')
    writeSiteBadges(ROOT, out)
    expect(readFileSync(join(out, 'size.svg'), 'utf8')).toContain('min+gzip')
    expect(readFileSync(join(out, 'dependencies.svg'), 'utf8')).toContain('dependencies: 0')
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.scripts['docs:site']).toContain('node scripts/site-badges.mjs site/badges')
    expect(read('.github/workflows/ci.yml')).toMatch(
      /upload-pages-artifact@\S+[^\n]*\n\s+with:\n\s+path: site\//,
    )

    const bad = join(work, 'bad')
    mkdirSync(join(bad, 'api'), { recursive: true })
    writeFileSync(join(bad, 'package.json'), JSON.stringify({ dependencies: { x: '1' } }))
    writeFileSync(join(bad, SIZE_REPORT_PATH), read(SIZE_REPORT_PATH))
    expect(() => writeSiteBadges(bad, join(bad, 'out'))).toThrow("dependencies entry 'x'")
  })
})
