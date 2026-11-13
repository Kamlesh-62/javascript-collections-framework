import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkLayering, formatViolations, type LayeringRule } from './support/layering'

// The import direction of src/: index → collections, functions, errors, interfaces → internal,
// plus internal → errors at run time and type-only imports of interfaces/ and functions/ anywhere.
// Each rule is proven on a planted tree under test/fixtures/layering/<case>/src.

const ROOT = join(import.meta.dirname, '..')
const FIXTURES = join(import.meta.dirname, 'fixtures', 'layering')

const planted = (name: string) => checkLayering(join(FIXTURES, name))

/** The rule each planted tree must break, and nothing else it may break. */
const PLANTED: Record<string, LayeringRule> = {
  'internal-imports-functions': 'internal-imports-public',
  'internal-imports-collections-type': 'internal-imports-public',
  'interfaces-runtime-code': 'interfaces-runtime-code',
  'interfaces-runtime-import': 'interfaces-runtime-code',
  'engine-imports-outside-internal': 'engine-imports-outside-internal',
  'engine-imports-package': 'engine-imports-outside-internal',
  'imports-index': 'imports-index',
  'index-not-re-export': 'index-not-re-export',
  'errors-imports-functions': 'errors-imports-public',
  'errors-imports-collections': 'errors-imports-public',
  'runtime-cycle': 'runtime-cycle',
  'runtime-cycle-three': 'runtime-cycle',
}

describe('layering', () => {
  it('src/ follows every layering rule', () => {
    const violations = checkLayering(ROOT)
    expect(formatViolations(violations)).toBe('')
  })

  it('allows every permitted direction: internal → errors, type-only imports, a type-only cycle', () => {
    expect(formatViolations(planted('allowed'))).toBe('')
  })

  it('fails a runtime import of functions/, or any import of collections/, from internal/, naming the file and import [005 S2-AC1]', () => {
    expect(planted('internal-imports-functions')).toEqual([
      {
        file: 'internal/a.ts',
        rule: 'internal-imports-public',
        detail: "imports '../functions/f'",
      },
    ])
    expect(planted('internal-imports-collections-type')).toEqual([
      {
        file: 'internal/a.ts',
        rule: 'internal-imports-public',
        detail: "imports '../collections/c'",
      },
    ])
  })

  it('fails runtime code in interfaces/ [005 S2-AC2]', () => {
    expect(planted('interfaces-runtime-code')).toEqual([
      {
        file: 'interfaces/i.ts',
        rule: 'interfaces-runtime-code',
        detail: 'export const defaultValue = 1',
      },
    ])
    expect(planted('interfaces-runtime-import')).toEqual([
      {
        file: 'interfaces/i.ts',
        rule: 'interfaces-runtime-code',
        detail: "import '../internal/setup'",
      },
    ])
  })

  it('fails a runtime import from an engine to outside internal/ and errors/ [005 S2-AC3]', () => {
    const rules = planted('engine-imports-outside-internal').map((v) => v.rule)
    expect(rules).toContain('engine-imports-outside-internal')
    expect(planted('engine-imports-outside-internal')).toContainEqual({
      file: 'internal/engines/engine.ts',
      rule: 'engine-imports-outside-internal',
      detail: "imports '../../functions/f'",
    })
    expect(planted('engine-imports-package')).toEqual([
      {
        file: 'internal/engines/engine.ts',
        rule: 'engine-imports-outside-internal',
        detail: "imports 'node:fs'",
      },
    ])
  })

  it('fails any file in src/ that imports index.ts [005 S2-AC4]', () => {
    expect(planted('imports-index')).toEqual([
      { file: 'functions/g.ts', rule: 'imports-index', detail: "imports '../index'" },
    ])
  })

  it('fails anything in index.ts other than re-exports [005 S2-AC5]', () => {
    expect(planted('index-not-re-export')).toEqual([
      { file: 'index.ts', rule: 'index-not-re-export', detail: 'export const version = 1' },
    ])
  })

  it('fails a runtime import of functions/ or collections/ from errors/ [005 S2-AC6]', () => {
    expect(planted('errors-imports-functions')).toEqual([
      { file: 'errors/e.ts', rule: 'errors-imports-public', detail: "imports '../functions/f'" },
    ])
    expect(planted('errors-imports-collections')).toEqual([
      { file: 'errors/e.ts', rule: 'errors-imports-public', detail: "imports '../collections/c'" },
    ])
  })

  it('fails a runtime import cycle, naming its files [005 S2-AC7]', () => {
    expect(planted('runtime-cycle')).toEqual([
      {
        file: 'internal/a.ts',
        rule: 'runtime-cycle',
        detail: 'internal/a.ts → internal/b.ts → internal/a.ts',
      },
    ])
    // The printed path follows the real imports (a → c → b), not the files' alphabetical order.
    expect(planted('runtime-cycle-three')).toEqual([
      {
        file: 'internal/a.ts',
        rule: 'runtime-cycle',
        detail: 'internal/a.ts → internal/c.ts → internal/b.ts → internal/a.ts',
      },
    ])
  })

  it('proves every rule with a planted tree, and has no unexplained tree [005 S2-AC8]', () => {
    const trees = readdirSync(FIXTURES).sort()
    expect(trees).toEqual(['allowed', ...Object.keys(PLANTED)].sort())
    const proven = new Set<LayeringRule>()
    for (const [tree, rule] of Object.entries(PLANTED)) {
      const rules = planted(tree).map((v) => v.rule)
      expect(rules, tree).toContain(rule)
      proven.add(rule)
    }
    const every: LayeringRule[] = [
      'internal-imports-public',
      'interfaces-runtime-code',
      'engine-imports-outside-internal',
      'imports-index',
      'index-not-re-export',
      'errors-imports-public',
      'runtime-cycle',
    ]
    expect([...proven].sort()).toEqual([...every].sort())
  })
})
