// Runs the code examples of `README.md` and `docs/*.md`. Each fenced block tagged `ts` or `js` is
// read with its page and line; the blocks of a page become one TypeScript module whose blocks are
// nested scopes, so a block sees, and may shadow, the names of the blocks before it. Every export
// of the package is in scope; imports from the package are type-checked and then dropped.
//
// A trailing comment on the line where a top-level statement ends states its result:
//
//   list.get(5) // throws IndexOutOfBoundsError      the statement throws that error
//   list.size // 3                                    the value equals a literal
//   new TreeSet([2, 1]) // TreeSet(2) {1, 2}          `String(value)` equals the printed form
//   list.set(0, 'a') // compile error; at run time, TypeError
//
// The stated result is the comment up to the first ` — `, `: ` or `; ` outside quotes and brackets;
// any other comment is prose. A block is skipped only when the marker
// `<!-- example: not run — <reason> -->` precedes its fence.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expect } from 'vitest'
import * as pkg from '../../src/index'
import { seeded } from './random'

/** The name the examples import the package by. */
export const PACKAGE = 'javascript-collections-framework'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const ENTRY = join(ROOT, 'src/index.ts')

/** A fenced code block of a docs page. */
export interface Block {
  /** The page, relative to the repository root: `docs/sets.md`. */
  readonly page: string
  /** The 1-based line of the opening fence. */
  readonly line: number
  readonly lang: 'ts' | 'js'
  /** The code, with the fence's indentation removed. */
  readonly code: string
  /** The reason of the skip marker before the fence, or `undefined` when the block runs. */
  readonly skip: string | undefined
}

/** The result a comment states. */
export type Expected =
  | { readonly kind: 'throws'; readonly error: string }
  | { readonly kind: 'compile-error'; readonly error: string }
  | { readonly kind: 'literal'; readonly source: string }
  | { readonly kind: 'printed'; readonly text: string }

const MARKER = /^\s*<!--\s*example:\s*not run\s*—\s*(.*?)\s*-->\s*$/
const FENCE = /^(\s*)```(\S*)\s*$/

/** The pages whose examples run: `README.md` and every `docs/*.md`, in that order. */
export function docPages(root: string = ROOT): string[] {
  const docs = readdirSync(join(root, 'docs'))
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => `docs/${name}`)
  return ['README.md', ...docs]
}

/** The `ts` and `js` blocks of one page's text. */
export function readPageBlocks(page: string, text: string): Block[] {
  const lines = text.split('\n')
  const out: Block[] = []
  let pending: { reason: string; line: number } | undefined
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    const marker = MARKER.exec(line)
    if (marker !== null) {
      const reason = marker[1] as string
      if (reason === '') throw new Error(`${page}:${i + 1}: the skip marker gives no reason`)
      pending = { reason, line: i + 1 }
      continue
    }
    const fence = FENCE.exec(line)
    if (fence === null) {
      if (pending !== undefined && line.trim() !== '')
        throw new Error(`${page}:${pending.line}: the skip marker is not followed by a code block`)
      continue
    }
    const indent = (fence[1] as string).length
    const lang = fence[2] as string
    const start = i
    const code: string[] = []
    for (i++; i < lines.length; i++) {
      const inner = lines[i] as string
      if (/^\s*```\s*$/.test(inner)) break
      code.push(inner.slice(Math.min(indent, inner.length - inner.trimStart().length)))
    }
    if (i === lines.length) throw new Error(`${page}:${start + 1}: the code block is not closed`)
    if (lang === 'ts' || lang === 'js') {
      out.push({ page, line: start + 1, lang, code: code.join('\n'), skip: pending?.reason })
    } else if (pending !== undefined) {
      throw new Error(`${page}:${pending.line}: the skip marker precedes a \`${lang}\` block`)
    }
    pending = undefined
  }
  if (pending !== undefined)
    throw new Error(`${page}:${pending.line}: the skip marker is not followed by a code block`)
  return out
}

/** Every `ts` and `js` block of the pages under `root`, page by page. */
export function readBlocks(root: string = ROOT): Block[] {
  return docPages(root).flatMap((page) =>
    readPageBlocks(page, readFileSync(join(root, page), 'utf8')),
  )
}

// ── Result comments ──

const NATIVE_ERRORS = [
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'EvalError',
  'URIError',
  'AggregateError',
]

/** The error classes a comment may name: the package's and the native ones. */
export const ERROR_NAMES: ReadonlySet<string> = new Set([
  ...NATIVE_ERRORS,
  ...Object.keys(pkg).filter((name) => {
    const value = (pkg as Record<string, unknown>)[name]
    return typeof value === 'function' && value.prototype instanceof Error
  }),
])

/** The comment up to the first ` — `, `: ` or `; ` outside quotes and brackets. */
export function cutResult(comment: string): string {
  let quote: string | undefined
  let depth = 0
  for (let i = 0; i < comment.length; i++) {
    const c = comment[i] as string
    if (quote !== undefined) {
      if (c === '\\') i++
      else if (c === quote) quote = undefined
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if (c === '(' || c === '[' || c === '{') depth++
    else if ((c === ')' || c === ']' || c === '}') && depth > 0) depth--
    else if (depth === 0) {
      const rest = comment.slice(i)
      if (rest.startsWith(' — ') || rest.startsWith(': ') || rest.startsWith('; '))
        return comment.slice(0, i).trim()
    }
  }
  return comment.trim()
}

/** Whether `node` is one of the stated literals. */
function isLiteral(node: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(node)) return false
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.NullKeyword ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword
  )
    return true
  if (ts.isIdentifier(node)) return ['undefined', 'NaN', 'Infinity'].includes(node.text)
  if (ts.isPrefixUnaryExpression(node)) {
    const signed =
      node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken
    const operand = node.operand
    return (
      signed &&
      (ts.isNumericLiteral(operand) || (ts.isIdentifier(operand) && operand.text === 'Infinity'))
    )
  }
  if (ts.isArrayLiteralExpression(node))
    return node.elements.every((element) => !ts.isOmittedExpression(element) && isLiteral(element))
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.every(
      (property) =>
        ts.isPropertyAssignment(property) &&
        (ts.isIdentifier(property.name) ||
          ts.isStringLiteral(property.name) ||
          ts.isNumericLiteral(property.name)) &&
        isLiteral(property.initializer),
    )
  }
  return false
}

/** The literal `text` stands for, as an expression, or `undefined` when it is not one. */
function literalOf(text: string): string | undefined {
  const source = ts.createSourceFile('r.ts', `(${text}\n)`, ts.ScriptTarget.Latest, true)
  const diagnostics =
    (source as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics ?? []
  if (diagnostics.length > 0 || source.statements.length !== 1) return undefined
  const statement = source.statements[0] as ts.Statement
  if (!ts.isExpressionStatement(statement)) return undefined
  const expression = statement.expression
  if (!ts.isParenthesizedExpression(expression)) return undefined
  return isLiteral(expression.expression) ? text : undefined
}

const PRINTED = /^[A-Z][A-Za-z]*\(\d+\)(?: .*)?$/

/** The result a trailing comment states, or `undefined` when the comment is prose. */
export function parseResult(comment: string): Expected | undefined {
  const text = comment.replace(/^\/\/\s?/, '').trim()
  const compile = /^compile error; at run time, (.*)$/.exec(text)
  if (compile !== null) {
    const error = cutResult(compile[1] as string)
    if (!ERROR_NAMES.has(error))
      throw new Error(`the compile-error comment names no error class: ${comment}`)
    return { kind: 'compile-error', error }
  }
  const result = cutResult(text)
  const thrown = /^(?:throws )?([A-Za-z]+)$/.exec(result)
  if (thrown !== null && ERROR_NAMES.has(thrown[1] as string))
    return { kind: 'throws', error: thrown[1] as string }
  const literal = literalOf(result)
  if (literal !== undefined) return { kind: 'literal', source: literal }
  if (PRINTED.test(result)) return { kind: 'printed', text: result }
  return undefined
}

// ── Page builder ──

/** A generated module for one page. */
export interface BuiltPage {
  /** The module the type check reads: the blocks as written, package imports moved to the top. */
  readonly typeSource: string
  /** The module that runs: every top-level statement located and its stated result checked. */
  readonly runSource: string
  /** The page line a line of either source comes from (1-based both ways). */
  readonly lineOf: (
    generatedLine: number,
    source: 'type' | 'run',
  ) => {
    page: string
    line: number
  }
  /** The number of checked results. */
  readonly checks: number
}

/** A source being written line by line, each line tied to a page line. */
class Writer {
  readonly lines: string[] = []
  readonly origins: Array<{ page: string; line: number }> = []
  write(text: string, page: string, line: number): void {
    const parts = text.split('\n')
    for (let i = 0; i < parts.length; i++) {
      this.lines.push(parts[i] as string)
      this.origins.push({ page, line: line + i })
    }
  }
}

/** The trailing `//` comment on the line where `statement` ends, if any. */
function trailingComment(code: string, statement: ts.Statement): string | undefined {
  const ranges = ts.getTrailingCommentRanges(code, statement.end) ?? []
  const first = ranges[0]
  if (first === undefined || first.kind !== ts.SyntaxKind.SingleLineCommentTrivia) return undefined
  return code.slice(first.pos, first.end)
}

/** The expression a result applies to, and how to put the check back into the statement. */
function checkedTarget(
  statement: ts.Statement,
): { expression: ts.Expression; wrap: (call: string) => string } | undefined {
  const source = statement.getSourceFile()
  if (ts.isExpressionStatement(statement)) {
    return { expression: statement.expression, wrap: (call) => `${call};` }
  }
  if (ts.isVariableStatement(statement)) {
    const list = statement.declarationList
    const constOrLet = list.flags & (ts.NodeFlags.Const | ts.NodeFlags.Let)
    const declaration = list.declarations[0]
    if (
      constOrLet === 0 ||
      list.declarations.length !== 1 ||
      declaration === undefined ||
      !ts.isIdentifier(declaration.name) ||
      declaration.initializer === undefined
    )
      return undefined
    const head = source.text.slice(statement.getStart(source), declaration.initializer.getStart())
    return { expression: declaration.initializer, wrap: (call) => `${head}${call};` }
  }
  return undefined
}

/** The root name of an expression such as `list`, `this.list` or `a.b[0]`, if any. */
function rootName(node: ts.Expression): string | undefined {
  let current: ts.Expression = node
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current))
    current = current.expression
  return ts.isIdentifier(current) ? current.text : undefined
}

/** The `shuffle(list)` calls under `node` that pass no random generator. */
function unseededShuffles(node: ts.Node): ts.CallExpression[] {
  const out: ts.CallExpression[] = []
  const visit = (child: ts.Node): void => {
    if (
      ts.isCallExpression(child) &&
      ts.isIdentifier(child.expression) &&
      child.expression.text === 'shuffle' &&
      child.arguments.length < 2
    )
      out.push(child)
    ts.forEachChild(child, visit)
  }
  visit(node)
  return out
}

/** Whether `node` mentions the identifier `name`. */
function mentions(node: ts.Node, names: ReadonlySet<string>): boolean {
  if (ts.isIdentifier(node) && names.has(node.text)) return true
  return ts.forEachChild(node, (child) => mentions(child, names) || undefined) === true
}

function containsAwait(node: ts.Node): boolean {
  if (ts.isAwaitExpression(node)) return true
  if (ts.isFunctionLike(node)) return false
  return ts.forEachChild(node, containsAwait) === true
}

/**
 * Builds the type-check and run modules of one page from its blocks (skipped blocks left out).
 * `exportNames` are the package's exports, all imported at the top of both modules.
 *
 * @throws Error when a block imports anything other than the package, renames an import, or
 *   exports anything.
 */
export function buildPage(blocks: readonly Block[], exportNames: readonly string[]): BuiltPage {
  const typed = new Writer()
  const run = new Writer()
  const first = blocks[0]
  const page = first === undefined ? '' : first.page
  const all = exportNames.join(', ')
  typed.write(`import { ${all} } from '${PACKAGE}'`, page, 0)
  run.write(`import { ${all} } from '${PACKAGE}'`, page, 0)
  const imports: Array<{ text: string; line: number }> = []
  const body = new Writer()
  run.write('export async function page() {', page, 0)
  let checks = 0
  // Lists shuffled without a generator: their order holds only under the runner's seed.
  const shuffled = new Set<string>()
  let blockIndex = 0
  for (const block of blocks) {
    blockIndex++
    const code = block.code
    const source = ts.createSourceFile(
      `${block.page}.ts`,
      code,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    )
    const at = (pos: number) => block.line + 1 + source.getLineAndCharacterOfPosition(pos).line
    // Type source: the block as written, line for line, imports blanked and moved to the top.
    const typedLines = code.split('\n')
    const expectError = new Set<number>()
    body.write('{', block.page, block.line)
    run.write('{', block.page, block.line)
    for (const statement of source.statements) {
      const start = statement.getStart(source)
      const line = at(start)
      if (ts.isImportDeclaration(statement) || ts.isImportEqualsDeclaration(statement)) {
        const specifier = ts.isImportDeclaration(statement)
          ? (statement.moduleSpecifier as ts.StringLiteral).text
          : undefined
        if (specifier !== PACKAGE)
          throw new Error(
            `${block.page}:${line}: the example imports ${specifier ?? 'a module'}, not the package; mark the block as not run`,
          )
        const clause = (statement as ts.ImportDeclaration).importClause
        const named = clause?.namedBindings
        if (
          clause === undefined ||
          clause.name !== undefined ||
          named === undefined ||
          !ts.isNamedImports(named)
        )
          throw new Error(
            `${block.page}:${line}: only named imports from the package are supported`,
          )
        const renamed: string[] = []
        for (const element of named.elements) {
          if (element.propertyName !== undefined)
            throw new Error(`${block.page}:${line}: renamed imports are not supported`)
          const name = element.name.text
          renamed.push(`${element.isTypeOnly ? 'type ' : ''}${name} as __b${blockIndex}_${name}`)
        }
        imports.push({
          text: `import ${clause.isTypeOnly ? 'type ' : ''}{ ${renamed.join(', ')} } from '${PACKAGE}'`,
          line,
        })
        const from = source.getLineAndCharacterOfPosition(start).line
        const to = source.getLineAndCharacterOfPosition(statement.end).line
        for (let l = from; l <= to; l++) typedLines[l] = ''
        continue
      }
      if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement))
        throw new Error(`${block.page}:${line}: examples cannot export`)
      const text = code.slice(start, statement.end)
      const comment = trailingComment(code, statement)
      const expected = comment === undefined ? undefined : parseResult(comment)
      const target = expected === undefined ? undefined : checkedTarget(statement)
      const where = JSON.stringify(`${block.page}:${line}`)
      if (
        target !== undefined &&
        (unseededShuffles(target.expression).length > 0 || mentions(target.expression, shuffled))
      )
        throw new Error(
          `${block.page}:${line}: a stated result depends on shuffle(list) without a random generator; pass a seeded one or state no result`,
        )
      for (const call of unseededShuffles(statement)) {
        const list = call.arguments[0]
        const name = list === undefined ? undefined : rootName(list)
        if (name !== undefined) shuffled.add(name)
      }
      if (expected === undefined || target === undefined) {
        run.write(`;__at(${where});`, block.page, line)
        run.write(text, block.page, line)
        continue
      }
      checks++
      if (expected.kind === 'compile-error')
        expectError.add(source.getLineAndCharacterOfPosition(start).line)
      const expression = code.slice(target.expression.getStart(source), target.expression.end)
      const isAsync = containsAwait(target.expression)
      const thunk = `${isAsync ? 'async ' : ''}() => (\n${expression}\n)`
      let call: string
      switch (expected.kind) {
        case 'throws':
        case 'compile-error':
          call = `__check.throws(${thunk}, ${JSON.stringify(expected.error)}, ${where})`
          break
        case 'literal':
          call = `__check.equal(${thunk}, (${expected.source}), ${where})`
          break
        case 'printed':
          call = `__check.printed(${thunk}, ${JSON.stringify(expected.text)}, ${where})`
          break
      }
      if (isAsync) call = `(await ${call})`
      run.write(`;__at(${where});`, block.page, line)
      run.write(target.wrap(call), block.page, line)
    }
    // A thunk's lines shift the run source against the page; the mapping above keeps the start.
    typedLines.forEach((text, index) => {
      if (expectError.has(index))
        body.write('// @ts-expect-error', block.page, block.line + 1 + index)
      body.write(text, block.page, block.line + 1 + index)
    })
  }
  for (const block of blocks) {
    body.write('}', block.page, block.line)
    run.write('}', block.page, block.line)
  }
  run.write('}', page, 0)
  for (const i of imports) typed.write(i.text, page, i.line)
  typed.write('export async function page() {', page, 0)
  typed.lines.push(...body.lines)
  typed.origins.push(...body.origins)
  typed.write('}', page, 0)
  const lineOf = (generatedLine: number, which: 'type' | 'run') => {
    const origins = which === 'type' ? typed.origins : run.origins
    const origin = origins[generatedLine - 1]
    return origin === undefined ? { page, line: 0 } : origin
  }
  return { typeSource: typed.lines.join('\n'), runSource: run.lines.join('\n'), lineOf, checks }
}

// ── Type check ──

/** The compiler options the examples are checked with: user code, strict, any recent runtime. */
export const EXAMPLE_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
  types: [],
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  paths: { [PACKAGE]: [ENTRY] },
}

/** A type error in a page, located at its line. */
export interface PageTypeError {
  readonly page: string
  readonly line: number
  readonly message: string
}

/**
 * Type-checks every built page in one in-memory program and returns the errors of each page,
 * located at the page line they come from.
 */
// The library and `lib` files are parsed once and shared by every check in a test run.
const parsed = new Map<string, ts.SourceFile>()
let previous: ts.Program | undefined

export function typeCheck(pages: ReadonlyMap<string, BuiltPage>): Map<string, PageTypeError[]> {
  const files = new Map<string, string>()
  const fileOf = (page: string) => join(ROOT, `${page}.example.ts`)
  for (const [page, built] of pages) files.set(fileOf(page), built.typeSource)
  const host = ts.createCompilerHost(EXAMPLE_OPTIONS)
  const getSourceFile = host.getSourceFile.bind(host)
  const fileExists = host.fileExists.bind(host)
  const readFile = host.readFile.bind(host)
  host.getSourceFile = (fileName, language, onError, create) => {
    const text = files.get(fileName)
    if (text !== undefined)
      return ts.createSourceFile(fileName, text, language, true, ts.ScriptKind.TS)
    let file = parsed.get(fileName)
    if (file === undefined) {
      file = getSourceFile(fileName, language, onError, create)
      if (file !== undefined) parsed.set(fileName, file)
    }
    return file
  }
  host.fileExists = (fileName) => files.has(fileName) || fileExists(fileName)
  host.readFile = (fileName) => files.get(fileName) ?? readFile(fileName)
  const program = ts.createProgram([...files.keys()], EXAMPLE_OPTIONS, host, previous)
  previous = program
  const out = new Map<string, PageTypeError[]>()
  for (const [page, built] of pages) {
    const file = program.getSourceFile(fileOf(page))
    if (file === undefined) throw new Error(`doc-examples: ${page} is not in the program`)
    const errors: PageTypeError[] = []
    for (const d of [
      ...program.getSyntacticDiagnostics(file),
      ...program.getSemanticDiagnostics(file),
    ]) {
      const line = d.start === undefined ? 1 : file.getLineAndCharacterOfPosition(d.start).line + 1
      const origin = built.lineOf(line, 'type')
      errors.push({
        page: origin.page,
        line: origin.line,
        message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
      })
    }
    out.set(page, errors)
  }
  return out
}

// ── Run ──

/** Thrown when a stated result differs or an unstated throw happens. */
export class ExampleError extends Error {
  override name = 'ExampleError'
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

function errorClass(name: string): unknown {
  const fromPackage = (pkg as Record<string, unknown>)[name]
  return fromPackage ?? (globalThis as Record<string, unknown>)[name]
}

/** The checks a run source calls. */
export const checks = {
  throws(fn: () => unknown, name: string, where: string): unknown {
    const fail = (got: string) =>
      new ExampleError(`${where}: expected a throw of ${name}, but ${got}`)
    const verify = (error: unknown) => {
      const type = errorClass(name)
      if (typeof type !== 'function' || !(error instanceof (type as new () => Error)))
        throw fail(`it threw ${describeError(error)}`)
      return undefined
    }
    let value: unknown
    try {
      value = fn()
    } catch (error) {
      return verify(error)
    }
    if (value instanceof Promise) {
      return value.then(
        () => {
          throw fail('it returned')
        },
        (error: unknown) => verify(error),
      )
    }
    throw fail(`it returned ${String(value)}`)
  },
  equal(fn: () => unknown, expected: unknown, where: string): unknown {
    const compare = (value: unknown) => {
      try {
        if (expected === null || typeof expected !== 'object') expect(value).toBe(expected)
        else expect(value).toStrictEqual(expected)
      } catch (error) {
        throw new ExampleError(`${where}: ${(error as Error).message}`)
      }
      return value
    }
    const value = fn()
    return value instanceof Promise && fn.constructor.name === 'AsyncFunction'
      ? value.then(compare)
      : compare(value)
  },
  printed(fn: () => unknown, text: string, where: string): unknown {
    const compare = (value: unknown) => {
      const printed = String(value)
      if (printed !== text)
        throw new ExampleError(
          `${where}: printed ${JSON.stringify(printed)}, not ${JSON.stringify(text)}`,
        )
      return value
    }
    const value = fn()
    return value instanceof Promise && fn.constructor.name === 'AsyncFunction'
      ? value.then(compare)
      : compare(value)
  },
}

/** The seed of the random numbers a page run sees. */
export const EXAMPLE_SEED = 0x5eed

/**
 * A `require` that returns the package, with `shuffle` drawing from `random` when no generator is
 * passed (the package reads `Math.random` once, when it loads), and refuses every other module.
 */
function limitedRequire(random: () => number): (name: string) => unknown {
  const examplePackage = {
    ...pkg,
    shuffle: (list: Parameters<typeof pkg.shuffle>[0], given?: () => number) =>
      pkg.shuffle(list, given === undefined ? random : given),
  }
  return (name) => {
    if (name === PACKAGE) return examplePackage
    throw new Error(`doc-examples: an example may import only the package, not ${name}`)
  }
}

/**
 * Transpiles a built page to CommonJS and runs it. An unstated throw is reported with the page
 * line of the statement that threw; a stated result that differs throws an `ExampleError`.
 */
export async function runPage(built: BuiltPage): Promise<void> {
  const output = ts.transpileModule(built.runSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const module = { exports: {} as { page?: () => Promise<void> } }
  let location = ''
  const at = (where: string) => {
    location = where
  }
  // Every page sees the same seeded numbers, from `Math.random` and from a plain `shuffle(list)`,
  // so a run is repeatable. The seeds of the hash tables are taken when the package loads and are
  // not seeded here; examples state no result that depends on them, nor on an unseeded shuffle
  // (`buildPage` refuses one).
  const random = seeded(EXAMPLE_SEED)
  const factory = new Function('exports', 'require', 'module', '__at', '__check', output)
  factory(module.exports, limitedRequire(random), module, at, checks)
  const run = module.exports.page
  if (run === undefined) throw new Error('doc-examples: the page module has no page function')
  const nativeRandom = Math.random
  Math.random = random
  try {
    await run()
  } catch (error) {
    if (error instanceof ExampleError) throw error
    throw new ExampleError(`${location}: the example threw ${describeError(error)}`)
  } finally {
    Math.random = nativeRandom
  }
}
