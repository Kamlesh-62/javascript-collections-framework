import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'
import { apiReport, REPORT_PATH } from '../scripts/lib/api-report.mjs'
import {
  exportedNames,
  firstDifference,
  lineDiff,
  normaliseDts,
  publishedInternals,
} from '../scripts/lib/normalise-dts.mjs'
import { COMPILERS, MODES, runMatrix, tsconfigFor } from '../scripts/lib/old-typescript.mjs'
import {
  compareSizes,
  formatChanges,
  formatReport,
  gzipTolerance,
  parseReport,
} from '../scripts/lib/size-compare.mjs'
import {
  bundleMinified,
  measureSizes,
  SIZE_REPORT_PATH,
  sizeReport,
} from '../scripts/lib/size-report.mjs'

// The API report tooling, tested on small declaration texts. The commands that read the build
// (scripts/api-report.mjs, scripts/size-report.mjs) are run by `pnpm check` and CI.

describe('API report normalisation', () => {
  it('sorts top-level declarations by code unit, keeping ties in source order [005 S1-AC1]', () => {
    const out = normaliseDts(
      [
        'export declare function b(): void;',
        'export declare function a(x: string): void;',
        'export declare function a(x: number): void;',
        'export declare function B(): void;',
      ].join('\n'),
    )
    expect(out).toBe(
      [
        'declare function B(): void;',
        'declare function a(x: string): void;',
        'declare function a(x: number): void;',
        'declare function b(): void;',
        'export { B, a, b };',
        '',
      ].join('\n'),
    )
  })

  it('lifts export modifiers into one sorted value list and one sorted type list [005 S1-AC1]', () => {
    const out = normaliseDts(
      [
        'interface Shape { readonly size: number }',
        'type Id = string;',
        'export declare const zeta: number;',
        'export declare class Alpha {}',
        'export type { Shape, Id };',
      ].join('\n'),
    )
    expect(out.split('\n').slice(-3)).toEqual([
      'export { Alpha, zeta };',
      'export type { Id, Shape };',
      '',
    ])
    expect(exportedNames('export interface I {}\nexport declare const v: 1;')).toEqual({
      values: ['v'],
      types: ['I'],
    })
  })

  it('keeps a renamed export as `local as exported` [005 S1-AC1]', () => {
    const text =
      'declare function f$1(): void;\ninterface I$1 {}\nexport { f$1 as f };\nexport type { I$1 as I };\n'
    expect(normaliseDts(text).split('\n').slice(-3)).toEqual([
      'export { f$1 as f };',
      'export type { I$1 as I };',
      '',
    ])
    expect(exportedNames(text)).toEqual({ values: ['f'], types: ['I'] })
    expect(publishedInternals(text)).toEqual([])
  })

  it('keeps class members and overloads in source order [005 S1-AC1]', () => {
    const out = normaliseDts(
      'export declare class C {\n  z(): void;\n  a(x: number): void;\n  a(x: string): void;\n}',
    )
    expect(out).toContain('    z(): void;\n    a(x: number): void;\n    a(x: string): void;')
  })

  it('removes comments but keeps a @deprecated marker on its declaration [005 S1-AC1]', () => {
    const out = normaliseDts(
      [
        '/** A summary. */',
        'export declare class C {',
        '  /** @deprecated Use `b`. */',
        '  a(): void; // trailing',
        '  // between',
        '  b(/* inline */ x: number): void;',
        '}',
        '/** @deprecated Use `C`. */',
        'export declare function old(): void;',
      ].join('\n'),
    )
    expect(out).toBe(
      [
        'declare class C {',
        '    /** @deprecated */',
        '    a(): void;',
        '    b(x: number): void;',
        '}',
        '/** @deprecated */',
        'declare function old(): void;',
        'export { C, old };',
        '',
      ].join('\n'),
    )
  })

  it('leaves comment-like text inside string and template literal types alone [005 S1-AC1]', () => {
    const text =
      "export type Url = `https://${string}//x`;\nexport type Path = '/* not a comment */';\n"
    expect(normaliseDts(text)).toBe(
      "type Path = '/* not a comment */';\ntype Url = `https://${string}//x`;\nexport type { Path, Url };\n",
    )
  })

  it('writes LF line endings and is stable when applied twice [005 S1-AC1]', () => {
    const crlf = 'export declare function f(): void;\r\nexport interface I {\r\n  a: 1\r\n}\r\n'
    const once = normaliseDts(crlf)
    expect(once).not.toContain('\r')
    expect(once.endsWith('\n')).toBe(true)
    expect(normaliseDts(once)).toBe(once)
  })
})

describe('API report comparison', () => {
  it('shows removed and added lines with line numbers, capped [005 S1-AC2]', () => {
    expect(lineDiff('a\nb\nc', 'a\nB\nc')).toBe('- 2: b\n+ 2: B')
    expect(lineDiff('same', 'same')).toBe('')
    const long = Array.from({ length: 1000 }, (_, i) => `line ${i}`)
    const changed = [...long]
    changed[700] = 'changed'
    expect(lineDiff(long.join('\n'), changed.join('\n'))).toBe('- 701: line 700\n+ 701: changed')
    const rewritten = long.map((line) => `${line}!`)
    const capped = lineDiff(
      [...long, ...long, ...long].join('\n'),
      [...rewritten, ...rewritten, ...rewritten].join('\n'),
    )
    expect(capped).toBe('- 1: line 0\n+ 1: line 0!\n… 3000 lines replaced by 3000 from line 1')
    const many = lineDiff('x0', Array.from({ length: 5 }, (_, i) => `x${i}`).join('\n'), 2)
    expect(many.split('\n')).toEqual(['+ 2: x1', '+ 3: x2', '… 2 more'])
  })

  it('reports the first line where the two declaration flavours differ [005 S1-AC5]', () => {
    expect(firstDifference('a\nb', 'a\nb')).toBeUndefined()
    expect(firstDifference('a\nb\nc', 'a\nx\nc')).toEqual({ line: 2, a: 'b', b: 'x' })
    expect(firstDifference('a', 'a\nb')).toEqual({ line: 2, a: '', b: 'b' })
  })
})

describe('published internals', () => {
  it('finds every @internal tag by line [005 S1-AC6]', () => {
    const text = 'export declare class C {\n  /** @internal */\n  x(): void;\n}'
    expect(publishedInternals(text)).toEqual(['line 2: @internal tag'])
  })

  it('finds a top-level declaration that is not exported [005 S1-AC6]', () => {
    const text = [
      'declare const helper: number;',
      'type Hidden = 1;',
      'interface Shown {}',
      'export declare function f(): Hidden;',
      'export type { Shown };',
    ].join('\n')
    expect(publishedInternals(text)).toEqual([
      "line 1: 'helper' is declared but not exported",
      "line 2: 'Hidden' is declared but not exported",
    ])
  })

  it('allows a unique symbol constant used only as a computed member key [005 S1-AC6]', () => {
    const keyOnly = [
      'declare const BRAND: unique symbol;',
      'export declare class E extends Error {',
      '  get [BRAND](): true;',
      '}',
    ].join('\n')
    expect(publishedInternals(keyOnly)).toEqual([])
    const usedElsewhere = [
      'declare const TAG: unique symbol;',
      'export declare const tag: typeof TAG;',
    ].join('\n')
    expect(publishedInternals(usedElsewhere)).toEqual([
      "line 1: 'TAG' is declared but not exported",
    ])
  })
})

describe('API report command', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  /** A repository tree whose build declares `body` in both declaration flavours. */
  function tree(body: string | null, cjsBody: string | null = body): string {
    const root = mkdtempSync(join(tmpdir(), 'api-report-'))
    roots.push(root)
    mkdirSync(join(root, 'dist'))
    if (body !== null) writeFileSync(join(root, 'dist', 'index.d.ts'), body)
    if (cjsBody !== null) writeFileSync(join(root, 'dist', 'index.d.cts'), cjsBody)
    return root
  }
  const declarations = 'export declare function f(x: number): void;\n'

  it('compares the normalised build with the committed report [005 S1-AC1]', () => {
    const root = tree(declarations)
    expect(apiReport(root, 'update').ok).toBe(true)
    expect(apiReport(root, 'check')).toEqual({ ok: true, message: 'matches the committed report' })
    expect(readFileSync(join(root, REPORT_PATH), 'utf8')).toBe(normaliseDts(declarations))
  })

  it('fails with a diff and the update command when the build differs [005 S1-AC2]', () => {
    const root = tree(declarations)
    apiReport(root, 'update')
    writeFileSync(join(root, 'dist', 'index.d.ts'), 'export declare function f(x: string): void;\n')
    writeFileSync(
      join(root, 'dist', 'index.d.cts'),
      'export declare function f(x: string): void;\n',
    )
    const result = apiReport(root, 'check')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('- 1: declare function f(x: number): void;')
    expect(result.message).toContain('+ 1: declare function f(x: string): void;')
    expect(result.message).toContain('pnpm api:update')
  })

  it('rewrites a stale committed report from the build [005 S1-AC3]', () => {
    const root = tree(declarations)
    mkdirSync(join(root, 'api'))
    writeFileSync(join(root, REPORT_PATH), 'stale\n')
    expect(apiReport(root, 'check').ok).toBe(false)
    expect(apiReport(root, 'update')).toEqual({ ok: true, message: `wrote ${REPORT_PATH}` })
    expect(apiReport(root, 'check').ok).toBe(true)
  })

  it('fails in both modes, saying to build first, when the build is missing [005 S1-AC4]', () => {
    for (const mode of ['check', 'update'] as const) {
      expect(apiReport(tree(null), mode)).toEqual({
        ok: false,
        message: 'dist/index.d.ts is missing — run pnpm build first',
      })
      expect(apiReport(tree(declarations, null), mode)).toEqual({
        ok: false,
        message: 'dist/index.d.cts is missing — run pnpm build first',
      })
    }
  })

  it('fails when the CommonJS declarations normalise differently [005 S1-AC5]', () => {
    const root = tree(declarations, 'export declare function f(x: bigint): void;\n')
    const result = apiReport(root, 'update')
    expect(result.ok).toBe(false)
    expect(result.message).toContain(
      'dist/index.d.cts differs from dist/index.d.ts at report line 1',
    )
  })

  it('fails on a published @internal tag or an unexported declaration [005 S1-AC6]', () => {
    const tagged = tree('export declare class C {\n  /** @internal */\n  x(): void;\n}\n')
    expect(apiReport(tagged, 'update').message).toContain('line 2: @internal tag')
    const stray = tree('type Hidden = 1;\nexport declare function f(): Hidden;\n')
    expect(apiReport(stray, 'check').message).toContain("'Hidden' is declared but not exported")
  })
})

describe('size report', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  /** A repository tree whose build is `code` (or no build). */
  function tree(code: string | null): string {
    const root = mkdtempSync(join(tmpdir(), 'size-report-'))
    roots.push(root)
    mkdirSync(join(root, 'dist'))
    if (code !== null) writeFileSync(join(root, 'dist', 'index.js'), code)
    return root
  }
  const build =
    "export const small = 1\nexport function large() { return 'x'.repeat(40) + String(small) }\n"
  const entry = (name: string, minified: number, gzip: number) => ({ name, minified, gzip })

  it('measures the whole package and each runtime export alone, minified and gzipped [005 S6-AC1]', async () => {
    const result = await measureSizes(tree(build))
    if (!result.ok) throw new Error(result.message)
    expect(result.entries.map((e) => e.name)).toEqual(['*', 'large', 'small'])
    const [whole, large, small] = result.entries
    expect(small?.minified).toBeLessThan(large?.minified ?? 0)
    expect(large?.minified).toBeLessThanOrEqual(whole?.minified ?? 0)
    for (const e of result.entries) expect(e.gzip).toBeGreaterThan(0)

    // The recorded counts are those of the minified bundle and its level-9 gzip.
    const root = tree(build)
    const entryFile = join(root, 'entry.mjs')
    writeFileSync(
      entryFile,
      `export { small } from ${JSON.stringify(join(root, 'dist', 'index.js'))}\n`,
    )
    const code = await bundleMinified(entryFile)
    expect(code.trim()).not.toContain('\n')
    expect(code).not.toMatch(/\/\*|\/\//)
    expect(small).toEqual({
      name: 'small',
      minified: Buffer.byteLength(code, 'utf8'),
      gzip: gzipSync(code, { level: 9 }).length,
    })
  })

  it('fails on a changed minified size, a gzipped size outside the tolerance, or an added or removed export [005 S6-AC2]', () => {
    const committed = [entry('*', 1000, 500), entry('a', 100, 80), entry('gone', 10, 10)]
    const measured = [entry('*', 1000, 516), entry('a', 101, 80), entry('new', 20, 20)]
    expect(gzipTolerance(500)).toBe(16)
    expect(gzipTolerance(4000)).toBe(40)
    expect(gzipTolerance(1650)).toBe(16.5)
    expect(compareSizes([entry('*', 1, 1650)], [entry('*', 1, 1667)])[0]?.reason).toBe(
      'gzipped size',
    )
    expect(compareSizes([entry('*', 1, 1650)], [entry('*', 1, 1666)])).toEqual([])
    const changes = compareSizes(committed, measured)
    expect(changes.map((c) => [c.name, c.reason])).toEqual([
      ['a', 'minified size'],
      ['gone', 'removed'],
      ['new', 'added'],
    ])
    expect(compareSizes([entry('*', 1000, 500)], [entry('*', 1000, 517)])[0]?.reason).toBe(
      'gzipped size',
    )
    const table = formatChanges(changes).split('\n')
    expect(table[0]).toMatch(/^export\s+committed\s+new\s+difference\s+why$/)
    expect(table[1]).toMatch(/^a\s+100 \/ 80\s+101 \/ 80\s+\+1 \/ 0\s+minified size$/)
  })

  it('names the update command when the build differs from the committed report [005 S6-AC2]', async () => {
    const root = tree(build)
    await sizeReport(root, 'update')
    writeFileSync(join(root, 'dist', 'index.js'), `${build}export const extra = 2\n`)
    const result = await sizeReport(root, 'check')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('extra')
    expect(result.message).toContain('added')
    expect(result.message).toContain('pnpm size:update')
  })

  it('rewrites a stale committed report from the build [005 S6-AC3]', async () => {
    const root = tree(build)
    mkdirSync(join(root, 'api'))
    writeFileSync(join(root, SIZE_REPORT_PATH), formatReport([entry('*', 1, 1)]))
    expect((await sizeReport(root, 'check')).ok).toBe(false)
    expect((await sizeReport(root, 'update')).message).toBe(`wrote ${SIZE_REPORT_PATH} (3 entries)`)
    expect(await sizeReport(root, 'check')).toEqual({
      ok: true,
      message: 'matches the committed report (3 entries)',
    })
    const names = parseReport(readFileSync(join(root, SIZE_REPORT_PATH), 'utf8')).map((e) => e.name)
    expect(names).toEqual(['*', 'large', 'small'])
  })

  it('fails naming the entry when bundling it twice gives different sizes [005 S6-AC4]', async () => {
    let calls = 0
    const unstable = async () => (++calls === 4 ? 'xx' : 'x')
    const result = await sizeReport(tree(build), 'check', unstable)
    expect(result).toEqual({
      ok: false,
      message: "bundling 'large' twice gave different minified sizes (1 and 2 bytes)",
    })
    const first = await measureSizes(tree(build))
    const second = await measureSizes(tree(build))
    expect(second).toEqual(first)
  })

  it('fails in both modes, saying to build first, when the build is missing [005 S6-AC5]', async () => {
    for (const mode of ['check', 'update'] as const) {
      expect(await sizeReport(tree(null), mode)).toEqual({
        ok: false,
        message: 'dist/index.js is missing — run pnpm build first',
      })
    }
  })
})

describe('old TypeScript consumers', () => {
  const ROOT = join(import.meta.dirname, '..')
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    devDependencies: Record<string, string>
    scripts: Record<string, string>
  }

  it('checks TypeScript 5.0, 5.4, 5.9, 6.0 and 7.0, each pinned exactly, strict with library declarations checked [005 S3-AC1]', () => {
    expect(COMPILERS.map((c) => c.label)).toEqual(['5.0', '5.4', '5.9', '6.0', '7.0'])
    const pinned: Record<string, string> = {
      '5.0': pkg.devDependencies['typescript-5.0'] ?? '',
      '5.4': pkg.devDependencies['typescript-5.4'] ?? '',
      '5.9': pkg.devDependencies['typescript-5.9'] ?? '',
      '6.0': pkg.devDependencies.typescript ?? '',
      '7.0': pkg.devDependencies['typescript-7.0'] ?? '',
    }
    for (const [label, spec] of Object.entries(pinned)) {
      expect(spec, label).toMatch(
        new RegExp(`^(npm:typescript@)?${label.replace('.', '\\.')}\\.\\d+$`),
      )
    }
    for (const mode of MODES) {
      expect(tsconfigFor(mode).compilerOptions).toMatchObject({
        strict: true,
        skipLibCheck: false,
        lib: ['es2016'],
        types: [],
      })
    }
  })

  it('passes only when every compiler reports no errors, and fails on an error or a missing compiler [005 S3-AC1]', () => {
    const allOk = runMatrix(() => ({ status: 'ok', output: '' }))
    expect(allOk.ok).toBe(true)
    expect(allOk.table.split('\n')[0]).toMatch(
      /^TypeScript\s+bundler\s+node16 ESM\s+node16 CJS\s+node10$/,
    )
    const oneError = runMatrix((compiler, mode) =>
      compiler.label === '5.0' && mode.label === 'node10'
        ? { status: 'fail', output: "consumer.ts(1,1): error TS2307: Cannot find module 'x'." }
        : { status: 'ok', output: '' },
    )
    expect(oneError.ok).toBe(false)
    expect(oneError.failures).toEqual([
      "TypeScript 5.0, node10:\nconsumer.ts(1,1): error TS2307: Cannot find module 'x'.",
    ])
    const missing = runMatrix((compiler) =>
      compiler.label === '7.0' ? { status: 'missing', output: '' } : { status: 'ok', output: '' },
    )
    expect(missing.ok).toBe(false)
    expect(missing.failures[0]).toBe('TypeScript 7.0 is not installed (typescript-7.0/bin/tsc)')
  })

  it('checks bundler, node16 as ESM and as CommonJS, and node10 below TypeScript 6 [005 S3-AC2]', () => {
    expect(MODES.map((m) => [m.label, m.file, m.resolution, m.below])).toEqual([
      ['bundler', 'consumer.ts', 'bundler', 99],
      ['node16 ESM', 'consumer.mts', 'node16', 99],
      ['node16 CJS', 'consumer.cts', 'node16', 99],
      ['node10', 'consumer.ts', 'node10', 6],
    ])
    const runs = COMPILERS.flatMap((c) => MODES.filter((m) => c.major < m.below).map(() => 1))
    expect(runs.length).toBe(18)
  })

  /** The names `use-all.ts` imports from the package. */
  function consumerImports(): Set<string> {
    const file = join(ROOT, 'test', 'consumers', 'use-all.ts')
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest)
    const names = new Set<string>()
    for (const statement of source.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text === 'javascript-collections-framework'
      ) {
        const named = statement.importClause?.namedBindings
        if (named !== undefined && ts.isNamedImports(named)) {
          for (const element of named.elements) names.add(element.name.text)
        }
      }
    }
    return names
  }

  it('keeps a consumer that imports and uses every exported name [005 S3-AC3]', () => {
    const text = readFileSync(join(ROOT, 'test', 'consumers', 'use-all.ts'), 'utf8')
    for (const name of consumerImports()) {
      const uses = text.split(new RegExp(`\\b${name}\\b`)).length - 1
      expect(uses, name).toBeGreaterThanOrEqual(2) // imported once, used at least once
    }
  })

  it('fails naming each exported name of the committed report the consumer does not use [005 S3-AC4]', () => {
    const report = readFileSync(join(ROOT, REPORT_PATH), 'utf8')
    const { values, types } = exportedNames(report)
    const imported = consumerImports()
    const missing = [...values, ...types].filter((name) => !imported.has(name))
    expect(missing).toEqual([])
    expect(values.length + types.length).toBeGreaterThanOrEqual(31) // discovery found the exports
  })
})

describe('where the checks run', () => {
  const ROOT = join(import.meta.dirname, '..')
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
  const steps = (pkg.scripts.check ?? '').split('&&').map((step) => step.trim())
  const runsAfterBuild = (step: string) => steps.indexOf(step) > steps.indexOf('pnpm build')
  const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8')
  /** The text of one job in ci.yml, from its key to the next job's key. */
  const job = (name: string) => {
    const start = ci.indexOf(`\n  ${name}:\n`)
    const next = ci.slice(start + 1).search(/\n {2}[a-z-]+:\n/)
    return next === -1 ? ci.slice(start) : ci.slice(start, start + 1 + next)
  }
  /** The `run:` step of the check job that runs only on Node 24. */
  const node24 = () => {
    const text = job('check')
    const at = text.indexOf('if: matrix.node == 24')
    return at === -1
      ? ''
      : text.slice(at, text.indexOf('\n\n', at) === -1 ? undefined : text.indexOf('\n\n', at))
  }

  it('runs the API report check after the build in pnpm check and in the Node 24 CI leg [005 S1-AC7]', () => {
    expect(pkg.scripts['api:check']).toBe('node scripts/api-report.mjs check')
    expect(steps).toContain('pnpm api:check')
    expect(runsAfterBuild('pnpm api:check')).toBe(true)
    expect(node24()).toContain('pnpm api:check')
  })

  it('runs the old TypeScript consumers in CI on every pull request [005 S3-AC5]', () => {
    expect(ci).toMatch(/\non:\n(?:.*\n)*? {2}pull_request:/)
    expect(node24()).toContain('pnpm test:consumers')
    expect(runsAfterBuild('pnpm test:consumers')).toBe(true)
  })

  it('runs the two-copy check after the build, in pnpm check and every CI leg, not in pnpm test [005 S4-AC3]', () => {
    expect(runsAfterBuild('pnpm test:copies')).toBe(true)
    expect(job('check')).toContain('- run: pnpm test:copies')
    expect(job('check')).not.toMatch(/if:[^\n]*\n[^\n]*test:copies/)
    expect(pkg.scripts.test).toBe('vitest run')
    expect(pkg.scripts['test:copies']).toBe('node scripts/two-copies.mjs')
  })

  it('runs the size check after the build in pnpm check, the Node 24 CI leg and the Windows job [005 S6-AC6]', () => {
    expect(runsAfterBuild('pnpm size:check')).toBe(true)
    expect(node24()).toContain('pnpm size:check')
    const windows = job('windows')
    expect(windows.indexOf('pnpm size:check')).toBeGreaterThan(windows.indexOf('pnpm build'))
  })
})

describe('versioning page', () => {
  it('is linked from the README and the docs index [005 S5-AC2]', () => {
    const root = join(import.meta.dirname, '..')
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toContain('(docs/versioning.md)')
    expect(readFileSync(join(root, 'docs', 'README.md'), 'utf8')).toContain('(versioning.md)')
    expect(readFileSync(join(root, 'docs', 'versioning.md'), 'utf8')).toMatch(/^# Versioning\n/)
  })
})

describe('published shape of the lists', () => {
  const root = new URL('..', import.meta.url)
  const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

  it('the API report shows public classes with no protected members [006 S9-AC1]', () => {
    const report = read('api/javascript-collections-framework.api.d.ts')
    expect(report).toContain('declare class ArrayList<E> implements List<E>')
    expect(report).not.toMatch(/\bprotected\b/)
    expect(report).not.toMatch(
      /AbstractList|AbstractCollection|ArrayListEngine|SubList|ReversedList/,
    )
    const start = report.indexOf('declare class ArrayList')
    const classBody = report.slice(start, report.indexOf('\n}', start))
    expect(classBody.match(/\bprivate\b[^;]*;/g)).toEqual(['private readonly engine;'])
  })

  it('the size report records ArrayList imported alone [006 S9-AC3]', () => {
    const report = JSON.parse(read('api/javascript-collections-framework.size.json')) as {
      entries: Array<{ name: string; minified: number; gzip: number }>
    }
    const entry = report.entries.find((e) => e.name === 'ArrayList')
    expect(entry).toBeDefined()
    expect(entry?.minified).toBeGreaterThan(0)
    expect(entry?.gzip).toBeGreaterThan(0)
  })
})

describe('published shape of the deques', () => {
  const root = new URL('..', import.meta.url)
  const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

  it('the API report shows ArrayDeque with no protected members [008 S7-AC3]', () => {
    const report = read('api/javascript-collections-framework.api.d.ts')
    expect(report).toContain('declare class ArrayDeque<E> implements Deque<E>')
    expect(report).not.toMatch(/AbstractDeque|ArrayDequeEngine|ReversedDeque\b(?!\()/)
    const start = report.indexOf('declare class ArrayDeque')
    const body = report.slice(start, report.indexOf('\n}', start))
    expect(body.match(/\bprivate\b[^;]*;/g)).toEqual(['private readonly engine;'])
    expect(body).not.toMatch(/\bprotected\b/)
  })

  it('the size report records ArrayDeque imported alone [008 S7-AC4]', () => {
    const report = JSON.parse(read('api/javascript-collections-framework.size.json')) as {
      entries: Array<{ name: string; minified: number; gzip: number }>
    }
    const entry = report.entries.find((e) => e.name === 'ArrayDeque')
    expect(entry?.minified).toBeGreaterThan(0)
    expect(entry?.gzip).toBeGreaterThan(0)
  })
})

describe('published shape of LinkedList', () => {
  const root = new URL('..', import.meta.url)
  const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

  it('the API report shows LinkedList with no protected members and LinkedListNode as a type [007 S6-AC3]', () => {
    const report = read('api/javascript-collections-framework.api.d.ts')
    expect(report).toContain('declare class LinkedList<E> implements Deque<E>')
    expect(report).not.toMatch(/LinkedListEngine|\bListNode\b|NodeWalker|DequeWalker/)
    const start = report.indexOf('declare class LinkedList')
    const body = report.slice(start, report.indexOf('\n}', start))
    expect(body.match(/\bprivate\b[^;]*;/g)).toEqual(['private readonly engine;'])
    expect(body).not.toMatch(/\bprotected\b/)
    const node = report.slice(report.indexOf('interface LinkedListNode<E>'))
    const members = node.slice(0, node.indexOf('\n}')).match(/^ {4}(?:readonly )?(\w+)/gm)
    expect(members?.map((m) => m.trim().replace('readonly ', ''))).toEqual([
      'value',
      'next',
      'previous',
    ])
    expect(report).not.toMatch(/declare class LinkedListNode/)
  })

  it('the size report records LinkedList imported alone [007 S6-AC4]', () => {
    const report = JSON.parse(read('api/javascript-collections-framework.size.json')) as {
      entries: Array<{ name: string; minified: number; gzip: number }>
    }
    const entry = report.entries.find((e) => e.name === 'LinkedList')
    expect(entry?.minified).toBeGreaterThan(0)
    expect(entry?.gzip).toBeGreaterThan(0)
  })
})
