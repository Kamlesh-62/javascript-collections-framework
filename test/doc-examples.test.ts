import { describe, expect, it } from 'vitest'
import {
  type Block,
  type BuiltPage,
  buildPage,
  cutResult,
  ExampleError,
  parseResult,
  readBlocks,
  readPageBlocks,
  runPage,
  typeCheck,
} from './support/doc-examples'
import { readExportDocs } from './support/tsdoc-bounds'

const exportNames = readExportDocs().map((d) => d.name)

/** One block of a fixture page. */
const block = (code: string, line = 1, page = 'docs/fixture.md'): Block => ({
  page,
  line,
  lang: 'ts',
  code,
  skip: undefined,
})

/** Builds, type-checks and runs a fixture page; returns its type errors. */
async function check(...codes: string[]): Promise<string[]> {
  const page = buildPage(
    codes.map((code, i) => block(code, i * 10 + 1)),
    exportNames,
  )
  const errors = typeCheck(new Map([['docs/fixture.md', page]])).get('docs/fixture.md') ?? []
  await runPage(page)
  return errors.map((e) => `${e.line}: ${e.message}`)
}

describe('result comments', () => {
  it('reads a stated throw, with or without the word throws [038 S1-AC4]', () => {
    expect(parseResult('// throws IndexOutOfBoundsError')).toEqual({
      kind: 'throws',
      error: 'IndexOutOfBoundsError',
    })
    expect(parseResult('// TypeError')).toEqual({ kind: 'throws', error: 'TypeError' })
    expect(parseResult('// throws RangeError — the index is negative')).toEqual({
      kind: 'throws',
      error: 'RangeError',
    })
    expect(parseResult('// NoSuchElementError: the queue is empty')).toEqual({
      kind: 'throws',
      error: 'NoSuchElementError',
    })
  })

  it('reads a compile error that throws at run time [038 S1-AC4]', () => {
    expect(parseResult('// compile error; at run time, TypeError')).toEqual({
      kind: 'compile-error',
      error: 'TypeError',
    })
    expect(
      parseResult('// compile error; at run time, UnsupportedOperationError — read-only'),
    ).toEqual({ kind: 'compile-error', error: 'UnsupportedOperationError' })
    expect(() => parseResult('// compile error; at run time, nothing')).toThrow(/no error class/)
  })

  it('reads every kind of literal [038 S1-AC4]', () => {
    for (const literal of [
      'undefined',
      'null',
      'true',
      'false',
      '3',
      '-1',
      '+2.5',
      '-0',
      'NaN',
      'Infinity',
      '-Infinity',
      "'a'",
      '"b"',
      '[]',
      "[1, 'a', [null, undefined]]",
      "{ a: 1, 'b': [true], 2: -Infinity }",
    ]) {
      expect(parseResult(`// ${literal}`), literal).toEqual({ kind: 'literal', source: literal })
    }
  })

  it('reads the printed form of a collection [038 S1-AC4]', () => {
    expect(parseResult('// TreeSet(3) {1, 2, 3}')).toEqual({
      kind: 'printed',
      text: 'TreeSet(3) {1, 2, 3}',
    })
    expect(parseResult("// HashMap(1) {'a' => 1}")).toEqual({
      kind: 'printed',
      text: "HashMap(1) {'a' => 1}",
    })
    expect(parseResult('// ArrayList(0) []')).toEqual({ kind: 'printed', text: 'ArrayList(0) []' })
  })

  it('cuts the result at the first separator outside quotes and brackets [038 S1-AC4]', () => {
    expect(cutResult('3 — the size')).toBe('3')
    expect(cutResult('true: found')).toBe('true')
    expect(cutResult('1; then 2')).toBe('1')
    expect(cutResult("'a: b' — a string")).toBe("'a: b'")
    expect(cutResult('{ a: 1 }; an object')).toBe('{ a: 1 }')
    expect(cutResult("['x; y', { k: 'v — w' }] — mixed")).toBe("['x; y', { k: 'v — w' }]")
    expect(cutResult('Map(1) {1 => 2}: printed')).toBe('Map(1) {1 => 2}')
    expect(parseResult("// 'a: b' — a string")).toEqual({ kind: 'literal', source: "'a: b'" })
  })

  it('treats every other comment as prose [038 S1-AC4]', () => {
    for (const prose of [
      '// list is [0, 3, 1, 2, 4]',
      '// natural order',
      '// fine',
      '// throws when empty',
      '// throws NotAnError',
      '// Error-prone',
      '// true for both',
      '// [1, 2] and more',
      '// 3 elements',
      '// x',
      '// n',
      '// SubList <stale>',
      '// TreeSet {1, 2}',
      '// { a: f() }',
      '// [1, 2 + 3]',
      `// \`template $\{x}\``,
      '// (1)',
      '// 1n',
    ]) {
      expect(parseResult(prose), prose).toBeUndefined()
    }
  })
})

describe('reading blocks', () => {
  it('reads ts and js fences with their page and line, indented ones included [038 S1-AC5]', () => {
    const text = [
      '# Page',
      '```ts',
      'const a = 1',
      '```',
      '```sh',
      'pnpm test',
      '```',
      '- item',
      '  ```js',
      '  const b = 2',
      '    nested()',
      '  ```',
    ].join('\n')
    expect(readPageBlocks('docs/p.md', text)).toEqual([
      { page: 'docs/p.md', line: 2, lang: 'ts', code: 'const a = 1', skip: undefined },
      {
        page: 'docs/p.md',
        line: 9,
        lang: 'js',
        code: 'const b = 2\n  nested()',
        skip: undefined,
      },
    ])
  })

  it('skips a block only after a marker with a reason [038 S1-AC5]', () => {
    const text = ['<!-- example: not run — needs a browser -->', '', '```ts', 'x()', '```'].join(
      '\n',
    )
    expect(readPageBlocks('docs/p.md', text)[0]?.skip).toBe('needs a browser')
    expect(() =>
      readPageBlocks('docs/p.md', '<!-- example: not run —  -->\n```ts\nx()\n```'),
    ).toThrow(/no reason/)
    expect(() =>
      readPageBlocks('docs/p.md', '<!-- example: not run — why -->\nText.\n```ts\nx()\n```'),
    ).toThrow(/not followed by a code block/)
    expect(() =>
      readPageBlocks('docs/p.md', '<!-- example: not run — why -->\n```sh\nx\n```'),
    ).toThrow(/precedes a `sh` block/)
    expect(() => readPageBlocks('docs/p.md', '```ts\nx()\n')).toThrow(/not closed/)
  })
})

// The first type check builds a compiler program over the package: allow for a loaded machine.
describe('building and running a page', { timeout: 30_000 }, () => {
  it('runs each block in the scope of the blocks before it, a later one shadowing [038 S1-AC3]', async () => {
    expect(
      await check(
        'const list = new ArrayList([1, 2])\nlist.size // 2',
        'list.add(3)\nlist.size // 3',
        "const list = 'shadowed'\nlist // 'shadowed'",
      ),
    ).toEqual([])
  })

  it('puts every export in scope and type-checks imports before dropping them [038 S1-AC3]', async () => {
    expect(
      await check(
        "import { TreeSet, type Comparator } from 'javascript-collections-framework'\n" +
          'const c: Comparator<number> = (a, b) => b - a\n' +
          'new TreeSet([1, 2], { comparator: c }) // TreeSet(2) {2, 1}\n' +
          'new HashSet([1]).size // 1',
      ),
    ).toEqual([])
    const errors = await check(
      "import { NoSuchExport } from 'javascript-collections-framework'\nconst x = 1",
    )
    expect(errors.join('\n')).toMatch(/^2: .*NoSuchExport/)
  })

  it('refuses an import of anything but the package [038 S1-AC5]', () => {
    expect(() => buildPage([block("import { ref } from 'vue'\nref(1)")], exportNames)).toThrow(
      /imports vue, not the package/,
    )
  })

  it('reports type errors at their page line [038 S1-AC3]', async () => {
    const page = buildPage(
      [block('const a = 1', 3), block("const n: number = 'text'", 9)],
      exportNames,
    )
    const errors = typeCheck(new Map([['docs/fixture.md', page]])).get('docs/fixture.md')
    expect(errors?.map((e) => e.line)).toEqual([10])
  })

  it('fails when a stated literal, printed form or throw differs [038 S1-AC3]', async () => {
    await expect(check('new ArrayList([1]).size // 2')).rejects.toThrow(
      /docs\/fixture.md:2: .*expected/,
    )
    await expect(check('new ArrayList([1]) // ArrayList(1) [2]')).rejects.toThrow(
      /printed "ArrayList\(1\) \[1\]", not "ArrayList\(1\) \[2\]"/,
    )
    await expect(check('new ArrayList([1]).get(0) // throws RangeError')).rejects.toThrow(
      /expected a throw of RangeError, but it returned 1/,
    )
    await expect(check('new ArrayList([]).getFirst() // throws TypeError')).rejects.toThrow(
      /but it threw NoSuchElementError/,
    )
    await expect(check('new ArrayList([1]).toArray() // [1, 2]')).rejects.toThrow(ExampleError)
    // A collection is never equal to an array.
    await expect(check('new ArrayList([1]) // [1]')).rejects.toThrow(ExampleError)
  })

  it('fails at the line of a throw no comment states [038 S1-AC3]', async () => {
    await expect(check('const a = 1\n\nnew ArrayList().get(0)')).rejects.toThrow(
      /docs\/fixture.md:4: the example threw IndexOutOfBoundsError/,
    )
  })

  it('checks literals with Object.is for primitives and strict equality otherwise [038 S1-AC4]', async () => {
    expect(
      await check(
        'Number.NaN // NaN',
        '0 * -1 // -0',
        'void 0 // undefined',
        "({ a: [1, 'x'] }) // { a: [1, 'x'] }",
        'const s = new HashSet([1]).size // 1\ns // 1',
      ),
    ).toEqual([])
    await expect(check('0 // -0')).rejects.toThrow(ExampleError)
    await expect(check('({ a: 1, b: undefined }) // { a: 1 }')).rejects.toThrow(ExampleError)
  })

  it('checks a statement after a leading semicolon, and awaits where the code awaits [038 S1-AC4]', async () => {
    expect(
      await check(';[1, 2].length // 2', 'await Promise.resolve(4) // 4', 'let x = 5 // 5'),
    ).toEqual([])
  })

  it('treats comments of nested statements and of other statements as prose [038 S1-AC4]', async () => {
    expect(
      await check(
        'for (const x of [1]) {\n  x // 2\n}',
        'if (true) 1 // 3',
        'const [a] = [1] // 2',
        'function f() {} // 4',
      ),
    ).toEqual([])
  })

  it('checks a compile error: the line must fail to type-check and must throw [038 S1-AC4]', async () => {
    expect(
      await check(
        'const list = listOf(1)\nlist.add(2) // compile error; at run time, UnsupportedOperationError',
      ),
    ).toEqual([])
    const unused = await check(
      'const list = new ArrayList([1])\nlist.size + 1 // compile error; at run time, TypeError',
    ).catch((error: unknown) => (error as Error).message)
    expect(String(unused)).toMatch(/expected a throw of TypeError/)
    const page = buildPage(
      [
        block(
          'const list = new ArrayList([1])\nlist.add(2) // compile error; at run time, TypeError',
        ),
      ],
      exportNames,
    )
    const errors = typeCheck(new Map([['docs/fixture.md', page]])).get('docs/fixture.md')
    expect(errors?.map((e) => e.message).join('\n')).toMatch(/Unused '@ts-expect-error'/)
  })

  it('runs each page with seeded randomness, restoring Math.random afterwards [038 S1-AC3]', async () => {
    const nativeRandom = Math.random
    const results: unknown[] = []
    const code =
      'const list = new ArrayList([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])\n' +
      'shuffle(list)\n' +
      'globalThis.__doc_result = [list.toArray(), Math.random()]'
    for (let i = 0; i < 2; i++) {
      await runPage(buildPage([block(code)], exportNames))
      results.push((globalThis as Record<string, unknown>).__doc_result)
    }
    delete (globalThis as Record<string, unknown>).__doc_result
    expect(results[0]).toEqual(results[1])
    const [order] = results[0] as [number[], number]
    expect(order).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(Math.random).toBe(nativeRandom)
    await expect(
      runPage(buildPage([block('new ArrayList().get(0)')], exportNames)),
    ).rejects.toThrow()
    expect(Math.random).toBe(nativeRandom)
  })

  it('refuses a stated result that depends on a shuffle without a generator [038 S1-AC3]', () => {
    const build = (code: string) => () => buildPage([block(code)], exportNames)
    expect(build('const l = new ArrayList([1, 2])\nshuffle(l) // undefined')).toThrow(
      /docs\/fixture.md:3: a stated result depends on shuffle\(list\) without a random generator/,
    )
    expect(build('const l = new ArrayList([1, 2])\nshuffle(l)\nl.toArray() // [2, 1]')).toThrow(
      /docs\/fixture.md:4: a stated result depends on shuffle/,
    )
    expect(build('const l = new ArrayList([1, 2])\nshuffle(l)\nl.size // 2')).toThrow(/shuffle/)
    expect(
      build('const l = new ArrayList([1, 2])\nshuffle(l, () => 0.5)\nl.toArray() // [1, 2]'),
    ).not.toThrow()
    expect(build('const l = new ArrayList([1, 2])\nshuffle(l)\nmax([1, 3]) // 3')).not.toThrow()
  })

  it('runs with a require limited to the package [038 S1-AC5]', async () => {
    const page: BuiltPage = {
      ...buildPage([block('const a = 1')], exportNames),
      runSource: "const fs = require('node:fs')\nexport async function page() {}",
    }
    await expect(runPage(page)).rejects.toThrow(/only the package, not node:fs/)
  })
})

// ── The docs pages ──

const blocks = readBlocks()
const pages = new Map<string, Block[]>()
for (const b of blocks) {
  if (b.skip !== undefined) continue
  const list = pages.get(b.page) ?? []
  list.push(b)
  pages.set(b.page, list)
}
const built = new Map<string, BuiltPage>()
const buildErrors = new Map<string, unknown>()
for (const [page, list] of pages) {
  try {
    built.set(page, buildPage(list, exportNames))
  } catch (error) {
    buildErrors.set(page, error)
  }
}
let typeErrors: ReturnType<typeof typeCheck> | undefined
const typeErrorsOf = (page: string) => {
  typeErrors ??= typeCheck(built)
  return typeErrors.get(page) ?? []
}

describe('the docs examples', { timeout: 30_000 }, () => {
  it('finds the examples of the README and every docs page [038 S1-AC3]', () => {
    expect(blocks.length).toBeGreaterThan(80)
    expect(pages.size).toBeGreaterThan(15)
  })

  for (const [page, list] of pages) {
    it(`${page}: ${list.length} block${list.length === 1 ? '' : 's'} type-check and run as stated [038 S1-AC3]`, async () => {
      if (buildErrors.has(page)) throw buildErrors.get(page)
      const page_ = built.get(page) as BuiltPage
      const errors = typeErrorsOf(page).map((e) => `${e.page}:${e.line}: ${e.message}`)
      expect(errors, 'type errors').toEqual([])
      await runPage(page_)
    })
  }

  for (const b of blocks) {
    if (b.skip === undefined) continue
    it.skip(`${b.page}:${b.line} is not run: ${b.skip} [038 S1-AC5]`, () => {})
  }

  it('marks the framework recipes and the multi-runtime block as not run [038 S1-AC5]', () => {
    const skipped = blocks.filter((b) => b.skip !== undefined)
    expect(skipped.filter((b) => b.page === 'docs/frameworks.md').length).toBeGreaterThan(0)
    for (const b of skipped.filter((s) => s.page === 'docs/frameworks.md'))
      expect(b.skip).toMatch(/test\/frameworks\//)
    expect(skipped.some((b) => b.page === 'docs/compatibility.md' && b.lang === 'js')).toBe(true)
  })
})
