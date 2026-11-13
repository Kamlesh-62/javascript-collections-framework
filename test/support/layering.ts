// The import-direction rules for src/, checked on the syntax tree.
//
//   index → collections, functions, errors, interfaces → internal
//   plus internal → errors at run time, and type-only imports of interfaces/ and functions/ anywhere.
//
// An import is an `import` declaration, an `export … from` declaration, `import x = require(…)` or a
// dynamic `import()`. It is type-only when written `import type` / `export type`, or when every name
// it brings in is marked `type`; type-only imports vanish from the JavaScript.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import ts from 'typescript'

export type Layer =
  | 'index'
  | 'interfaces'
  | 'errors'
  | 'functions'
  | 'collections'
  | 'internal'
  | 'engines'
  | 'other'

export type LayeringRule =
  | 'internal-imports-public'
  | 'interfaces-runtime-code'
  | 'engine-imports-outside-internal'
  | 'imports-index'
  | 'index-not-re-export'
  | 'errors-imports-public'
  | 'runtime-cycle'

export interface Violation {
  /** The file, relative to the checked root, with `/` separators. */
  readonly file: string
  readonly rule: LayeringRule
  /** What was found: the import specifier, the statement, or the files of a cycle. */
  readonly detail: string
}

interface ImportEdge {
  readonly specifier: string
  readonly target: string | undefined
  readonly typeOnly: boolean
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) return sourceFiles(full)
      return /\.ts$/.test(name) && !/\.d\.ts$/.test(name) ? [full] : []
    })
}

/** The layer of a file, from its path relative to `src/`. */
export function layerOf(pathInSrc: string): Layer {
  const parts = pathInSrc.split('/')
  if (parts.length === 1) return parts[0] === 'index.ts' ? 'index' : 'other'
  const [top, second] = parts
  if (top === 'internal') return second === 'engines' && parts.length > 2 ? 'engines' : 'internal'
  if (top === 'interfaces' || top === 'errors' || top === 'functions' || top === 'collections') {
    return top
  }
  return 'other'
}

function resolveImport(fromFile: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined
  const base = join(dirname(fromFile), specifier)
  const stripped = base.replace(/\.(js|mjs|cjs)$/, '')
  for (const candidate of [base, `${stripped}.ts`, join(stripped, 'index.ts')]) {
    if (/\.ts$/.test(candidate) && existsSync(candidate)) return candidate
  }
  return undefined
}

function allNamesTypeOnly(elements: ts.NodeArray<ts.ImportSpecifier | ts.ExportSpecifier>) {
  return elements.length > 0 && elements.every((element) => element.isTypeOnly)
}

function importsOf(file: string, source: ts.SourceFile): ImportEdge[] {
  const edges: ImportEdge[] = []
  const add = (specifier: string, typeOnly: boolean) =>
    edges.push({ specifier, target: resolveImport(file, specifier), typeOnly })

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause
      let typeOnly = false
      if (clause !== undefined) {
        const named = clause.namedBindings
        typeOnly =
          clause.isTypeOnly ||
          (clause.name === undefined &&
            named !== undefined &&
            ts.isNamedImports(named) &&
            allNamesTypeOnly(named.elements))
      }
      add(node.moduleSpecifier.text, typeOnly)
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = node.exportClause
      const typeOnly =
        node.isTypeOnly ||
        (clause !== undefined && ts.isNamedExports(clause) && allNamesTypeOnly(clause.elements))
      add(node.moduleSpecifier.text, typeOnly)
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      add(node.moduleReference.expression.text, node.isTypeOnly)
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      add(node.arguments[0].text, false)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return edges
}

function isTypeOnlyStatement(statement: ts.Statement): boolean {
  if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) return true
  if (ts.isEmptyStatement(statement)) return true
  if (ts.isImportDeclaration(statement)) {
    const clause = statement.importClause
    if (clause === undefined) return false
    const named = clause.namedBindings
    return (
      clause.isTypeOnly ||
      (clause.name === undefined &&
        named !== undefined &&
        ts.isNamedImports(named) &&
        allNamesTypeOnly(named.elements))
    )
  }
  if (ts.isExportDeclaration(statement)) {
    const clause = statement.exportClause
    return (
      statement.isTypeOnly ||
      (clause !== undefined && ts.isNamedExports(clause) && allNamesTypeOnly(clause.elements))
    )
  }
  return false
}

/** Strongly connected components of size > 1 (or with a self-edge), found without recursion. */
function cycles(graph: Map<string, string[]>): string[][] {
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const found: string[][] = []
  let counter = 0

  for (const start of graph.keys()) {
    if (index.has(start)) continue
    const work: { node: string; next: number }[] = [{ node: start, next: 0 }]
    index.set(start, counter)
    low.set(start, counter)
    counter++
    stack.push(start)
    onStack.add(start)

    while (work.length > 0) {
      const frame = work[work.length - 1] as { node: string; next: number }
      const targets = graph.get(frame.node) ?? []
      if (frame.next < targets.length) {
        const target = targets[frame.next++] as string
        if (!index.has(target)) {
          index.set(target, counter)
          low.set(target, counter)
          counter++
          stack.push(target)
          onStack.add(target)
          work.push({ node: target, next: 0 })
        } else if (onStack.has(target)) {
          low.set(frame.node, Math.min(low.get(frame.node) as number, index.get(target) as number))
        }
        continue
      }
      work.pop()
      const parent = work[work.length - 1]
      if (parent !== undefined) {
        low.set(
          parent.node,
          Math.min(low.get(parent.node) as number, low.get(frame.node) as number),
        )
      }
      if (low.get(frame.node) === index.get(frame.node)) {
        const component: string[] = []
        let member: string
        do {
          member = stack.pop() as string
          onStack.delete(member)
          component.push(member)
        } while (member !== frame.node)
        const selfEdge = (graph.get(frame.node) ?? []).includes(frame.node)
        if (component.length > 1 || selfEdge) found.push(component.sort())
      }
    }
  }
  return found
}

/**
 * One real import path around a cycle: from the cycle's first file (by name) through runtime
 * imports back to it, found breadth-first within the cycle's files.
 */
function cyclePath(component: string[], graph: Map<string, string[]>): string[] {
  const members = new Set(component)
  const start = component[0] as string
  const parent = new Map<string, string>()
  const queue = [start]
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head] as string
    for (const target of graph.get(node) ?? []) {
      if (!members.has(target)) continue
      if (target === start) {
        const path = [node]
        while (path[0] !== start) path.unshift(parent.get(path[0] as string) as string)
        return [...path, start]
      }
      if (!parent.has(target)) {
        parent.set(target, node)
        queue.push(target)
      }
    }
  }
  return [...component, start]
}

/**
 * Checks the layering rules on `root/src` and returns every violation, sorted by file then rule.
 * An empty array means the tree follows the rules.
 */
export function checkLayering(root: string): Violation[] {
  const src = join(root, 'src')
  const violations: Violation[] = []
  const graph = new Map<string, string[]>()
  const rel = (file: string) => relative(src, file).split(sep).join('/')

  for (const file of sourceFiles(src)) {
    const path = rel(file)
    const layer = layerOf(path)
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest)
    const report = (rule: LayeringRule, detail: string) =>
      violations.push({ file: path, rule, detail })
    const runtimeTargets: string[] = []

    for (const edge of importsOf(file, source)) {
      const target = edge.target === undefined ? undefined : rel(edge.target)
      const targetLayer = target === undefined ? 'other' : layerOf(target)
      const quoted = `imports '${edge.specifier}'`
      if (!edge.typeOnly && edge.target !== undefined) runtimeTargets.push(edge.target)

      if (targetLayer === 'index') report('imports-index', quoted)
      if (layer === 'internal' || layer === 'engines') {
        if (targetLayer === 'collections' || targetLayer === 'index') {
          report('internal-imports-public', quoted)
        } else if (targetLayer === 'functions' && !edge.typeOnly) {
          report('internal-imports-public', quoted)
        }
      }
      if (layer === 'engines' && !edge.typeOnly) {
        if (targetLayer !== 'internal' && targetLayer !== 'engines' && targetLayer !== 'errors') {
          report('engine-imports-outside-internal', quoted)
        }
      }
      if (
        layer === 'errors' &&
        !edge.typeOnly &&
        (targetLayer === 'functions' || targetLayer === 'collections')
      ) {
        report('errors-imports-public', quoted)
      }
    }
    graph.set(file, runtimeTargets)

    if (layer === 'interfaces') {
      for (const statement of source.statements) {
        if (!isTypeOnlyStatement(statement)) {
          report('interfaces-runtime-code', statement.getText(source).split('\n')[0] ?? '')
        }
      }
    }
    if (layer === 'index') {
      for (const statement of source.statements) {
        if (!(ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined)) {
          report('index-not-re-export', statement.getText(source).split('\n')[0] ?? '')
        }
      }
    }
  }

  for (const component of cycles(graph)) {
    const path = cyclePath(component, graph).map(rel)
    violations.push({ file: path[0] as string, rule: 'runtime-cycle', detail: path.join(' → ') })
  }

  return violations.sort((a, b) =>
    a.file === b.file ? (a.rule < b.rule ? -1 : a.rule > b.rule ? 1 : 0) : a.file < b.file ? -1 : 1,
  )
}

/** One line per violation: `<file>: <rule> — <detail>`. */
export function formatViolations(violations: readonly Violation[]): string {
  return violations.map((v) => `${v.file}: ${v.rule} — ${v.detail}`).join('\n')
}
