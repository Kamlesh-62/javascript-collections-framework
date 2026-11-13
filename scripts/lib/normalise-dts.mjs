// Normalises a bundled declaration file into the committed API report, and checks it for members
// that should never be published. Pure functions: text in, text or findings out.
//
// The report is the declaration file re-printed by the TypeScript compiler, with:
//   - comments removed, except a `/** @deprecated */` marker on each deprecated declaration;
//   - `export` modifiers lifted into one `export { … }` and one `export type { … }` list;
//   - top-level declarations and exported names sorted by UTF-16 code unit, ties in source order;
//   - class members and overloads left in source order (an overload set's order is meaningful);
//   - LF line endings and a trailing newline.

import ts from 'typescript'

/** @param {string} a @param {string} b @returns {number} */
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

/** @param {ts.Node} node @returns {boolean} */
function hasExportModifier(node) {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  )
}

/** @param {ts.Node} node @returns {boolean} */
function isTypeDeclaration(node) {
  return ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
}

/**
 * The names a top-level statement declares.
 * @param {ts.Statement} statement
 * @returns {string[]}
 */
function declaredNames(statement) {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((d) =>
      ts.isIdentifier(d.name) ? [d.name.text] : [],
    )
  }
  if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isModuleDeclaration(statement)) &&
    statement.name !== undefined
  ) {
    return [statement.name.text]
  }
  return []
}

/** @param {string} text @returns {ts.SourceFile} */
function parse(text) {
  return ts.createSourceFile('index.d.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

/**
 * Every export of the file: the exported name, the local declaration it refers to (they differ for
 * `export { A$1 as A }`), and whether it is a type. Sorted by exported name, by code unit.
 * @param {string} text
 * @returns {{ exported: string, local: string, isType: boolean }[]}
 */
function exportTable(text) {
  const source = parse(text)
  /** @type {Map<string, boolean>} local name → is a type */
  const kinds = new Map()
  for (const statement of source.statements) {
    for (const name of declaredNames(statement)) {
      if (!kinds.has(name)) kinds.set(name, isTypeDeclaration(statement))
    }
  }
  /** @type {Map<string, { exported: string, local: string, isType: boolean }>} */
  const table = new Map()
  for (const statement of source.statements) {
    if (hasExportModifier(statement)) {
      for (const name of declaredNames(statement)) {
        table.set(name, { exported: name, local: name, isType: isTypeDeclaration(statement) })
      }
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier === undefined &&
      statement.exportClause !== undefined &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        const local = (element.propertyName ?? element.name).text
        const isType = statement.isTypeOnly || element.isTypeOnly || kinds.get(local) === true
        table.set(element.name.text, { exported: element.name.text, local, isType })
      }
    }
  }
  return [...table.values()].sort((a, b) => byCodeUnit(a.exported, b.exported))
}

/**
 * Every exported name: declared with `export`, or named in an `export { … }` / `export type { … }`
 * list. Values and types are listed apart, each sorted by code unit.
 * @param {string} text
 * @returns {{ values: string[], types: string[] }}
 */
export function exportedNames(text) {
  const table = exportTable(text)
  return {
    values: table.filter((e) => !e.isType).map((e) => e.exported),
    types: table.filter((e) => e.isType).map((e) => e.exported),
  }
}

/**
 * Replaces every comment with spaces of the same length (newlines kept), so positions in the
 * text do not move.
 * @param {string} text
 * @returns {string}
 */
function blankComments(text) {
  // Comments are found as the trivia around each token of the parsed tree, so text inside string
  // and template literal types is never mistaken for a comment.
  const source = parse(text)
  /** @type {Map<number, number>} comment start → end */
  const comments = new Map()
  /** @param {ts.Node} node */
  const visit = (node) => {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) {
      return
    }
    for (const range of [
      ...(ts.getLeadingCommentRanges(text, node.pos) ?? []),
      ...(ts.getTrailingCommentRanges(text, node.end) ?? []),
    ]) {
      comments.set(range.pos, range.end)
    }
    for (const child of node.getChildren(source)) visit(child)
  }
  visit(source)
  let out = ''
  let last = 0
  for (const [start, end] of [...comments].sort((x, y) => x[0] - y[0])) {
    out += text.slice(last, start) + text.slice(start, end).replace(/[^\n]/g, ' ')
    last = end
  }
  return out + text.slice(last)
}

/**
 * Ends of the nodes whose JSDoc carries `@deprecated`, keyed `kind:end`.
 * @param {ts.SourceFile} source
 * @returns {Set<string>}
 */
function deprecatedKeys(source) {
  /** @type {Set<string>} */
  const keys = new Set()
  /** @param {ts.Node} node */
  const visit = (node) => {
    if (ts.getJSDocDeprecatedTag(node) !== undefined) keys.add(`${node.kind}:${node.end}`)
    ts.forEachChild(node, visit)
  }
  visit(source)
  return keys
}

/**
 * The normalised API report of a bundled declaration file.
 * @param {string} text
 * @returns {string}
 */
export function normaliseDts(text) {
  const unified = text.replace(/\r\n?/g, '\n')
  const deprecated = deprecatedKeys(parse(unified))
  const source = parse(blankComments(unified))
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })

  /** @param {ts.Node} node */
  const mark = (node) => {
    if (deprecated.has(`${node.kind}:${node.end}`)) {
      ts.addSyntheticLeadingComment(
        node,
        ts.SyntaxKind.MultiLineCommentTrivia,
        '* @deprecated ',
        true,
      )
    }
    ts.forEachChild(node, mark)
  }
  mark(source)

  /** @type {{ key: string, text: string }[]} */
  const declarations = []
  /** @type {string[]} */
  const others = []
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier === undefined) continue
    let printed = printer.printNode(ts.EmitHint.Unspecified, statement, source)
    if (hasExportModifier(statement))
      printed = printed.replace(/^((?:\/\*\* @deprecated \*\/\n)?)export /, '$1')
    const names = declaredNames(statement)
    if (names.length === 0) others.push(printed)
    else declarations.push({ key: names[0] ?? '', text: printed })
  }
  declarations.sort((a, b) => byCodeUnit(a.key, b.key))
  others.sort(byCodeUnit)

  const table = exportTable(unified)
  /** @param {{ exported: string, local: string }} e */
  const specifier = (e) => (e.local === e.exported ? e.exported : `${e.local} as ${e.exported}`)
  const values = table.filter((e) => !e.isType).map(specifier)
  const types = table.filter((e) => e.isType).map(specifier)
  const parts = [...declarations.map((d) => d.text), ...others]
  if (values.length > 0) parts.push(`export { ${values.join(', ')} };`)
  if (types.length > 0) parts.push(`export type { ${types.join(', ')} };`)
  return `${parts.join('\n')}\n`
}

/**
 * Members and declarations that must never be published: any `@internal` tag, and any top-level
 * declaration that is not an exported name, except a `unique symbol` constant used only as a
 * computed member key.
 * @param {string} text
 * @returns {string[]} one message per finding, in file order
 */
export function publishedInternals(text) {
  /** @type {string[]} */
  const findings = []
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  lines.forEach((line, i) => {
    if (line.includes('@internal')) findings.push(`line ${i + 1}: @internal tag`)
  })

  const source = parse(text)
  const exported = new Set(exportTable(text).map((e) => e.local))

  /** @type {Map<string, boolean>} name → every use is a computed member key */
  const keyOnly = new Map()
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const d of statement.declarationList.declarations) {
      const unique =
        d.type !== undefined &&
        ts.isTypeOperatorNode(d.type) &&
        d.type.operator === ts.SyntaxKind.UniqueKeyword
      if (ts.isIdentifier(d.name) && unique) keyOnly.set(d.name.text, true)
    }
  }
  /** @param {ts.Node} node */
  const visit = (node) => {
    if (ts.isIdentifier(node) && keyOnly.has(node.text)) {
      const parent = node.parent
      const isDeclaration = ts.isVariableDeclaration(parent) && parent.name === node
      const isKey = ts.isComputedPropertyName(parent)
      if (!isDeclaration && !isKey) keyOnly.set(node.text, false)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)

  for (const statement of source.statements) {
    for (const name of declaredNames(statement)) {
      if (exported.has(name) || keyOnly.get(name) === true) continue
      const line = source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1
      findings.push(`line ${line}: '${name}' is declared but not exported`)
    }
  }
  return findings
}

/**
 * The first line where two texts differ, or `undefined` when they are equal.
 * @param {string} a
 * @param {string} b
 * @returns {{ line: number, a: string, b: string } | undefined}
 */
export function firstDifference(a, b) {
  if (a === b) return undefined
  const left = a.split('\n')
  const right = b.split('\n')
  for (let i = 0; ; i++) {
    if (left[i] !== right[i]) return { line: i + 1, a: left[i] ?? '', b: right[i] ?? '' }
  }
}

/**
 * A line diff from `before` to `after`: `- ` removed, `+ ` added, with line numbers, at most
 * `limit` lines (then `… N more`). Longest-common-subsequence based, so moved blocks read as
 * removed and added.
 * @param {string} before
 * @param {string} after
 * @param {number} [limit]
 * @returns {string}
 */
export function lineDiff(before, after, limit = 200) {
  const allBefore = before.split('\n')
  const allAfter = after.split('\n')
  // Only the window between the first and the last differing line is compared, so the cost is
  // quadratic in the size of the change, not of the report.
  let head = 0
  while (head < allBefore.length && head < allAfter.length && allBefore[head] === allAfter[head]) {
    head++
  }
  let tail = 0
  while (
    tail < allBefore.length - head &&
    tail < allAfter.length - head &&
    allBefore[allBefore.length - 1 - tail] === allAfter[allAfter.length - 1 - tail]
  ) {
    tail++
  }
  const a = allBefore.slice(head, allBefore.length - tail)
  const b = allAfter.slice(head, allAfter.length - tail)
  const n = a.length
  const m = b.length
  if (n * m > 4_000_000) {
    // A change this large is better read in the file itself; bound the work and the memory.
    return `- ${head + 1}: ${a[0] ?? ''}\n+ ${head + 1}: ${b[0] ?? ''}\n… ${n} lines replaced by ${m} from line ${head + 1}`
  }
  const lcs = new Int32Array((n + 1) * (m + 1))
  const at = (/** @type {number} */ i, /** @type {number} */ j) => i * (m + 1) + j
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[at(i, j)] =
        a[i] === b[j]
          ? (lcs[at(i + 1, j + 1)] ?? 0) + 1
          : Math.max(lcs[at(i + 1, j)] ?? 0, lcs[at(i, j + 1)] ?? 0)
    }
  }
  /** @type {string[]} */
  const out = []
  let i = 0
  let j = 0
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      i++
      j++
    } else if (i < n && (j === m || (lcs[at(i + 1, j)] ?? 0) >= (lcs[at(i, j + 1)] ?? 0))) {
      out.push(`- ${head + i + 1}: ${a[i]}`)
      i++
    } else {
      out.push(`+ ${head + j + 1}: ${b[j]}`)
      j++
    }
  }
  if (out.length <= limit) return out.join('\n')
  return `${out.slice(0, limit).join('\n')}\n… ${out.length - limit} more`
}
