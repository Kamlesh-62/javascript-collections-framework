// Tree-shaking: each bundler bundles a single import, and the bundle holds exactly the internal
// engines that import needs, found by their class names.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  esbuildBuild,
  FIXTURES,
  rollupBuild,
  rspackBuild,
  viteBuild,
  webpackBuild,
} from './scripts/build.mjs'
import { ENGINES, EXPECTED, enginesIn } from './scripts/engines.mjs'

const BUNDLERS: Array<[string, (entry: string, out: string, mode: 'shake') => Promise<string>]> = [
  ['Rollup', rollupBuild],
  ['Vite', viteBuild],
  ['esbuild', esbuildBuild],
  ['webpack', webpackBuild],
  ['Rspack', rspackBuild],
]

describe('engine search', () => {
  it('finds the engines whose class names appear, in table order [039 S2-AC2]', () => {
    expect(enginesIn('class LinkedHashTable {} class BucketTable$1 {}')).toEqual([
      'BucketTable',
      'LinkedHashTable',
    ])
    expect(enginesIn('class ArrayList {}')).toEqual([])
    expect(Object.keys(EXPECTED)).toEqual([
      'ArrayList',
      'TreeMap',
      'PriorityQueue',
      'HashMap',
      'LinkedHashMap',
    ])
  })
})

describe('tree-shaking', () => {
  for (const [bundler, build] of BUNDLERS) {
    for (const [entry, engines] of Object.entries(EXPECTED)) {
      it(`${bundler}: a bundle of ${entry} alone holds exactly ${engines.join(' and ') || 'no engine'} [039 S2-AC2]`, async () => {
        const out = join(FIXTURES, 'shake', '.out', bundler, entry)
        const file = await build(join(FIXTURES, 'shake', `${entry}.js`), out, 'shake')
        const code = readFileSync(file, 'utf8')
        expect(code, `${bundler} ${entry}: the import itself is missing`).toContain(entry)
        expect(enginesIn(code), `${bundler} ${entry}`).toEqual(
          ENGINES.filter((name) => engines.includes(name)),
        )
      })
    }
  }
})
