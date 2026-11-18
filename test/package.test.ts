import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// Structural rules for src/, checked on the syntax tree. Each rule exists because the package
// must run unchanged on ES2015 engines, edge runtimes, React Native and inside framework proxies,
// stay small and tree-shakeable, and never evaluate code from strings.

const ROOT = join(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.[cm]?tsx?$/.test(full) ? [full] : []
  })
}

const PLATFORM_GLOBALS = new Set([
  'process',
  'Buffer',
  'require',
  'module',
  'window',
  'document',
  'navigator',
  'globalThis',
  'global',
  'self',
])

/** Every violation in src/ as `file:line rule`. */
function violations(): string[] {
  const found: string[] = []
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8')
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
    const report = (node: ts.Node, rule: string) => {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
      found.push(`${relative(ROOT, file)}:${line + 1} ${rule}`)
    }
    // Triple-slash references pull platform types (node, dom) past `types: []` and `lib`.
    for (const ref of [...source.typeReferenceDirectives, ...source.libReferenceDirectives]) {
      const { line } = source.getLineAndCharacterOfPosition(ref.pos)
      found.push(
        `${relative(ROOT, file)}:${line + 1} uses a triple-slash reference to "${ref.fileName}"`,
      )
    }
    const visit = (node: ts.Node): void => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        !node.moduleSpecifier.text.startsWith('.')
      ) {
        report(node, `imports "${node.moduleSpecifier.text}" (only relative imports)`)
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        report(node, 'uses dynamic import()')
      }
      if (ts.isPrivateIdentifier(node)) report(node, `uses #private field ${node.text}`)
      if (ts.isClassStaticBlockDeclaration(node)) report(node, 'uses a static block')
      if (
        (ts.isFunctionDeclaration(node) ||
          ts.isMethodDeclaration(node) ||
          ts.isFunctionExpression(node)) &&
        node.asteriskToken
      ) {
        report(node, 'uses a generator function')
      }
      if (ts.isExportAssignment(node)) report(node, 'uses a default export')
      if (
        (ts.isExportSpecifier(node) || ts.isNamespaceExport(node)) &&
        node.name.getText(source) === 'default'
      ) {
        report(node, 'uses a default export')
      }
      if (
        ts.isBindingElement(node) &&
        node.dotDotDotToken &&
        ts.isObjectBindingPattern(node.parent)
      ) {
        report(
          node,
          'uses object rest (lowered to large helpers at ES2015; copy properties instead)',
        )
      }
      if (ts.isSpreadAssignment(node)) {
        report(
          node,
          'uses object spread (lowered to large helpers at ES2015; assign properties instead)',
        )
      }
      if (
        ts.isPropertyDeclaration(node) &&
        node.initializer &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)
      ) {
        report(
          node,
          'uses a static field initializer (runs after the class and blocks tree-shaking)',
        )
      }
      if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) {
        report(node, 'uses import.meta')
      }
      if (ts.isIdentifier(node) && (node.text === 'eval' || node.text === 'Function')) {
        // Any value use: eval(s), (0, eval)(s), const e = eval, Function(s)(), new Function(s).
        // The type `Function` and member names are fine.
        const parent = node.parent as ts.Node & { name?: ts.Node }
        const isTypeOrName =
          ts.isTypeReferenceNode(parent) ||
          ts.isExpressionWithTypeArguments(parent) ||
          (parent.name === node && !ts.isShorthandPropertyAssignment(parent))
        if (!isTypeOrName) report(node, `uses ${node.text} (code from strings is never evaluated)`)
      }
      if (ts.isIdentifier(node) && PLATFORM_GLOBALS.has(node.text)) {
        // A member or property *name* (`o.window`, `get process()`, `{ window: number }`) is not a
        // use of the global; a shorthand property (`{ globalThis }`) is.
        const parent = node.parent as ts.Node & { name?: ts.Node }
        const isName =
          !ts.isShorthandPropertyAssignment(parent) &&
          (parent.name === node || (ts.isQualifiedName(parent) && parent.right === node))
        if (!isName) report(node, `uses platform global "${node.text}"`)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return found
}

describe('source rules', () => {
  it('src/ follows the portability rules (relative imports, no #private, static blocks, generators, default exports, object spread, static initializers, platform globals, eval)', () => {
    expect(violations()).toEqual([])
  })

  it('package.json declares no runtime dependencies', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    expect(pkg.dependencies ?? {}).toEqual({})
    expect(pkg.peerDependencies ?? {}).toEqual({})
    expect(pkg.optionalDependencies ?? {}).toEqual({})
  })

  it('keeps the framework test apps out of the root install and the published files', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    const devDependencies = Object.keys(pkg.devDependencies ?? {})
    for (const name of ['react', 'react-dom', 'vue', 'svelte', 'jsdom']) {
      expect(devDependencies).not.toContain(name)
    }
    const files: string[] = pkg.files ?? []
    expect(files.length).toBeGreaterThan(0)
    expect(
      files.some((entry) => entry.startsWith('fixtures') || entry === '*' || entry === '.'),
    ).toBe(false)
    const workspace = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8')
    expect(workspace).not.toMatch(/^packages:/m)
  })

  it('package.json has no install-time scripts', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) {
      expect(pkg.scripts?.[hook]).toBeUndefined()
    }
  })
})

describe('workflow and install hardening', () => {
  const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

  it('every workflow starts with no permissions, pins actions to a full SHA and keeps no credentials', () => {
    const dir = join(ROOT, '.github', 'workflows')
    for (const file of readdirSync(dir).filter((name) => name.endsWith('.yml'))) {
      const text = read(join('.github', 'workflows', file))
      expect(text, file).toMatch(/^permissions: \{\}$/m)
      for (const line of text.split('\n').filter((l) => /^\s*-?\s*uses:/.test(l))) {
        expect(line, `${file}: ${line.trim()}`).toMatch(/@[0-9a-f]{40}\b/)
      }
      const checkouts = text.split('actions/checkout@').length - 1
      const persisted = text.split('persist-credentials: false').length - 1
      expect(persisted, file).toBe(checkouts)
    }
  })

  it('the framework test apps keep the root install protections and audit exceptions', () => {
    const settings = [
      'minimumReleaseAge',
      'trustPolicy',
      'blockExoticSubdeps',
      'strictDepBuilds',
      'allowBuilds',
      'saveExact',
    ]
    const pick = (text: string) =>
      Object.fromEntries(
        settings.map((key) => [
          key,
          text.match(new RegExp(`^${key}:\\s*([^#\\n]*)`, 'm'))?.[1]?.trim(),
        ]),
      )
    const root = read('pnpm-workspace.yaml')
    const fixture = read('fixtures/frameworks/pnpm-workspace.yaml')
    expect(pick(fixture)).toEqual(pick(root))
    const ghsas = (text: string) => text.match(/GHSA-[\w-]+/g) ?? []
    expect(ghsas(fixture)).toEqual(ghsas(root))
  })
})
