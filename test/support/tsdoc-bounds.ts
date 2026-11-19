// Reads the `Time:` paragraph of every documented member exported from `src/index.ts`, and the list
// of runtime exports, with the TypeScript compiler API: classes (static and instance members),
// functions and consts. Aliases are resolved and overloads merged, so each member appears once.

import { fileURLToPath } from 'node:url'
import ts from 'typescript'

/** A documented member and the text of its `Time:` paragraph (`undefined` when it has none). */
export interface DocumentedBound {
  readonly member: string
  readonly time: string | undefined
}

const ENTRY = fileURLToPath(new URL('../../src/index.ts', import.meta.url))

/** The `Time:` paragraph of a JSDoc text, whitespace collapsed, or `undefined`. */
export function timeParagraph(text: string): string | undefined {
  const start = text.search(/(^|\s)Time:/)
  if (start < 0) return undefined
  const from = text.indexOf('Time:', start)
  const rest = text.slice(from)
  const end = rest.search(/\n\s*\n|\n\s*@/)
  const paragraph = end < 0 ? rest : rest.slice(0, end)
  return paragraph.replace(/\s+/g, ' ').trim()
}

/** The JSDoc text of a declaration: the comment body without its tags' structure. */
function docText(node: ts.Node): string {
  const parts: string[] = []
  for (const doc of ts.getJSDocCommentsAndTags(node)) {
    if (!ts.isJSDoc(doc)) continue
    const comment = ts.getTextOfJSDocComment(doc.comment)
    if (comment !== undefined) parts.push(comment)
  }
  return parts.join('\n\n')
}

function isInternal(node: ts.Node): boolean {
  return ts.getJSDocTags(node).some((tag) => tag.tagName.text === 'internal')
}

function memberName(member: ts.ClassElement, source: ts.SourceFile): string | undefined {
  const name = member.name
  if (name === undefined)
    return member.kind === ts.SyntaxKind.Constructor ? 'constructor' : undefined
  if (ts.isComputedPropertyName(name)) return `[${name.expression.getText(source)}]`
  if (ts.isPrivateIdentifier(name)) return undefined
  return name.getText(source)
}

function isHidden(member: ts.ClassElement): boolean {
  const flags = ts.getCombinedModifierFlags(member as ts.Declaration)
  return (flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) !== 0
}

function isStatic(member: ts.ClassElement): boolean {
  return (ts.getCombinedModifierFlags(member as ts.Declaration) & ts.ModifierFlags.Static) !== 0
}

/** Adds `time` to the entry for `key`, keeping the first paragraph found across overloads. */
function record(out: Map<string, string | undefined>, key: string, time: string | undefined): void {
  if (!out.has(key) || (out.get(key) === undefined && time !== undefined)) out.set(key, time)
}

/** The type checker and the resolved exports of `src/index.ts`. */
function readEntry(): {
  checker: ts.TypeChecker
  exports: Array<{ name: string; symbol: ts.Symbol }>
} {
  const program = ts.createProgram([ENTRY], {
    target: ts.ScriptTarget.ES2016,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
  })
  const checker = program.getTypeChecker()
  const entry = program.getSourceFile(ENTRY)
  if (entry === undefined) throw new Error(`tsdoc-bounds: cannot read ${ENTRY}`)
  const moduleSymbol = checker.getSymbolAtLocation(entry)
  if (moduleSymbol === undefined) throw new Error('tsdoc-bounds: src/index.ts is not a module')
  const exports = checker.getExportsOfModule(moduleSymbol).map((exported) => ({
    name: exported.getName(),
    symbol: exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported,
  }))
  return { checker, exports }
}

/** What a runtime export of `src/index.ts` is. */
export type ExportKind = 'class' | 'function' | 'const'

/** Every export of `src/index.ts` that exists at runtime (types left out), sorted by name. */
export function readRuntimeExports(): Array<{ readonly name: string; readonly kind: ExportKind }> {
  const out: Array<{ name: string; kind: ExportKind }> = []
  for (const { name, symbol } of readEntry().exports) {
    const declaration = symbol.getDeclarations()?.[0]
    if (declaration === undefined) continue
    if (ts.isClassDeclaration(declaration)) out.push({ name, kind: 'class' })
    else if (ts.isFunctionDeclaration(declaration)) out.push({ name, kind: 'function' })
    else if (ts.isVariableDeclaration(declaration)) out.push({ name, kind: 'const' })
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/** Every documented member exported from `src/index.ts`, sorted by name. */
export function readDocumentedBounds(): DocumentedBound[] {
  const { exports } = readEntry()
  const out = new Map<string, string | undefined>()
  for (const { name, symbol } of exports) {
    for (const declaration of symbol.getDeclarations() ?? []) {
      if (ts.isClassDeclaration(declaration)) {
        const source = declaration.getSourceFile()
        for (const member of declaration.members) {
          if (isHidden(member) || isInternal(member)) continue
          if (ts.isClassStaticBlockDeclaration(member) || ts.isSemicolonClassElement(member))
            continue
          const key = memberName(member, source)
          if (key === undefined) continue
          const full = isStatic(member) ? `${name}.static ${key}` : `${name}.${key}`
          let time = timeParagraph(docText(member))
          // A constructor without its own paragraph is bounded by the class's.
          if (time === undefined && key === 'constructor')
            time = timeParagraph(docText(declaration))
          record(out, full, time)
        }
      } else if (ts.isFunctionDeclaration(declaration)) {
        record(out, name, timeParagraph(docText(declaration)))
      } else if (ts.isVariableDeclaration(declaration)) {
        const statement = declaration.parent.parent
        record(out, name, timeParagraph(docText(statement)))
      }
    }
  }
  return [...out]
    .map(([member, time]) => ({ member, time }))
    .sort((a, b) => (a.member < b.member ? -1 : a.member > b.member ? 1 : 0))
}

/** What an export of `src/index.ts` is, types and interfaces included. */
export type ExportDocKind = 'class' | 'function' | 'const' | 'type' | 'interface'

/** The documentation of one export: its summary and whether it has an `@example`. */
export interface ExportDoc {
  readonly name: string
  readonly kind: ExportDocKind
  /** The first paragraph of the TSDoc, whitespace collapsed; `''` when absent. */
  readonly summary: string
  readonly hasExample: boolean
}

/** The first paragraph of a JSDoc text, whitespace collapsed, or `''`. */
export function summaryOf(text: string): string {
  return (text.trim().split(/\n\s*\n/)[0] ?? '').replace(/\s+/g, ' ').trim()
}

/** The node that carries the TSDoc of a declaration: a variable's statement, else itself. */
function docNode(declaration: ts.Declaration): ts.Node {
  return ts.isVariableDeclaration(declaration) ? declaration.parent.parent : declaration
}

function hasTag(node: ts.Node, name: string): boolean {
  for (const doc of ts.getJSDocCommentsAndTags(node)) {
    if (ts.isJSDoc(doc) && doc.tags?.some((tag) => tag.tagName.text === name)) return true
  }
  return false
}

function declarationKind(declaration: ts.Declaration): ExportDocKind | undefined {
  if (ts.isClassDeclaration(declaration)) return 'class'
  if (ts.isFunctionDeclaration(declaration)) return 'function'
  if (ts.isVariableDeclaration(declaration)) return 'const'
  if (ts.isInterfaceDeclaration(declaration)) return 'interface'
  if (ts.isTypeAliasDeclaration(declaration)) return 'type'
  return undefined
}

const KIND_RANK: readonly ExportDocKind[] = ['class', 'function', 'const', 'interface', 'type']

/**
 * Every export of `src/index.ts`, types and interfaces included, sorted by name. A name with
 * several declarations (overloads, merged declarations) takes the first summary found and has an
 * example when any declaration has one; its kind is the first of class, function, const,
 * interface and type among them.
 */
export function readExportDocs(): ExportDoc[] {
  const out: ExportDoc[] = []
  for (const { name, symbol } of readEntry().exports) {
    let kind: ExportDocKind | undefined
    let summary = ''
    let hasExample = false
    for (const declaration of symbol.getDeclarations() ?? []) {
      const k = declarationKind(declaration)
      if (k === undefined) continue
      if (kind === undefined || KIND_RANK.indexOf(k) < KIND_RANK.indexOf(kind)) kind = k
      const node = docNode(declaration)
      if (summary === '') summary = summaryOf(docText(node))
      if (hasTag(node, 'example')) hasExample = true
    }
    if (kind === undefined) throw new Error(`tsdoc-bounds: cannot classify the export ${name}`)
    out.push({ name, kind, summary, hasExample })
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

/**
 * The summary of every documented member exported from `src/index.ts`, keyed as the bound table
 * keys its rows (`ArrayList.get`, `ArrayList.static from`, `min`), sorted by key. Overloads share
 * a key and give the first summary found.
 */
export function readMemberSummaries(): Array<{ readonly key: string; readonly summary: string }> {
  const out = new Map<string, string>()
  const put = (key: string, summary: string) => {
    if (!out.has(key) || (out.get(key) === '' && summary !== '')) out.set(key, summary)
  }
  for (const { name, symbol } of readEntry().exports) {
    for (const declaration of symbol.getDeclarations() ?? []) {
      if (ts.isClassDeclaration(declaration)) {
        const source = declaration.getSourceFile()
        for (const member of declaration.members) {
          if (isHidden(member) || isInternal(member)) continue
          if (ts.isClassStaticBlockDeclaration(member) || ts.isSemicolonClassElement(member))
            continue
          const key = memberName(member, source)
          if (key === undefined) continue
          put(
            isStatic(member) ? `${name}.static ${key}` : `${name}.${key}`,
            summaryOf(docText(member)),
          )
        }
      } else if (ts.isFunctionDeclaration(declaration) || ts.isVariableDeclaration(declaration)) {
        put(name, summaryOf(docText(docNode(declaration))))
      }
    }
  }
  return [...out]
    .map(([key, summary]) => ({ key, summary }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}
