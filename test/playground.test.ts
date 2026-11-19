import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

describe('the playground', () => {
  const pkg = JSON.parse(read('examples/playground/package.json'))
  const source = read('examples/playground/index.mjs')

  it('depends on the latest release of the package and nothing else [042 S5-AC1] [042 S5-AC3]', () => {
    expect(pkg.dependencies).toEqual({ 'javascript-collections-framework': 'latest' })
    for (const field of [
      'devDependencies',
      'optionalDependencies',
      'peerDependencies',
      'bundleDependencies',
    ]) {
      expect(pkg[field], field).toBeUndefined()
    }
    expect(pkg.type).toBe('module')
    expect(pkg.scripts).toEqual({ start: 'node index.mjs' })
    expect(JSON.parse(read('examples/playground/.stackblitzrc'))).toEqual({
      installDependencies: true,
      startCommand: 'npm start',
    })
  })

  it('imports only collections every release has had: TreeMap, PriorityQueue, LinkedHashMap [042 S5-AC1] [042 S5-AC3]', () => {
    const imports = [...source.matchAll(/^import\s+(?:\{([^}]*)\}\s+from\s+)?'([^']+)'/gm)]
    expect(imports.map((m) => m[2])).toEqual(['javascript-collections-framework'])
    const names = (imports[0]?.[1] ?? '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .sort()
    expect(names).toEqual(['LinkedHashMap', 'PriorityQueue', 'TreeMap'])
    expect(source).not.toMatch(/\bimport\s*\(|\brequire\s*\(/)
  })

  it('runs against the build in the smoke check [042 S5-AC3]', () => {
    const scripts = JSON.parse(read('package.json')).scripts as Record<string, string>
    const check = scripts.check ?? ''
    expect(scripts['test:smoke']).toContain('node scripts/playground.mjs')
    expect(check).toContain('pnpm build && ')
    expect(check.indexOf('pnpm build')).toBeLessThan(check.indexOf('pnpm test:smoke'))
    const ci = read('.github/workflows/ci.yml')
    expect(ci.match(/run: pnpm test:smoke/g)?.length).toBeGreaterThanOrEqual(2)
    expect(read('scripts/playground.mjs')).toContain("'examples', 'playground', 'index.mjs'")
  })
})
