import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { speedClaims } from '../scripts/lib/speed-claims.mjs'

const ROOT = join(import.meta.dirname, '..')

describe('speed claims in the docs', () => {
  it('are found in prose, but not in code or in the benchmarks section of the performance page [041 S1-AC5]', () => {
    const files = new Map([
      [
        'README.md',
        'Fast.\nIt is faster than a Map.\n```ts\nfaster() // not prose\n```\nAs fast as an array.\n',
      ],
      [
        'docs/performance.md',
        '# P\n\nSlower here is a claim.\n\n## Benchmarks\n\nBelow 1× the library is slower.\n\n## Other\n\nQuicker!\n',
      ],
      ['docs/other.md', '## Benchmarks\n\nfaster\n'],
    ])
    expect(speedClaims(files)).toEqual([
      'README.md:2: It is faster than a Map.',
      'README.md:6: As fast as an array.',
      'docs/other.md:3: faster',
      'docs/performance.md:3: Slower here is a claim.',
      'docs/performance.md:11: Quicker!',
    ])
  })

  it('appear nowhere in the README or the docs pages outside the recorded benchmarks [041 S1-AC5]', () => {
    const files = new Map<string, string>([
      ['README.md', readFileSync(join(ROOT, 'README.md'), 'utf8')],
    ])
    for (const name of readdirSync(join(ROOT, 'docs'), { recursive: true })) {
      const path = `docs/${String(name).split('\\').join('/')}`
      if (path.endsWith('.md')) files.set(path, readFileSync(join(ROOT, path), 'utf8'))
    }
    expect(files.size).toBeGreaterThan(5)
    expect(speedClaims(files)).toEqual([])
  })
})
