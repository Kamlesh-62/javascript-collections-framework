// Checks of the README's front page: the order of what comes before the first `##` section and of
// the sections themselves, the runtimes the facts paragraph names, and the result comments of its
// examples.

import ts from 'typescript'

/** The kinds of element the README shows before its first `##` section, in their order. */
export const FRONT_ORDER = ['title', 'badges', 'problem', 'facts', 'code', 'try', 'status'] as const

export type FrontKind = (typeof FRONT_ORDER)[number]

/** The README's `##` sections, in their order. */
export const SECTION_ORDER = [
  'Install',
  'More examples',
  'Why this library?',
  'Available collections',
  'Goals',
  'Planned collections',
  'Documentation',
  'Security',
  'Contributing',
  'License',
] as const

/** The start of the facts paragraph, and the words before its list of runtimes. */
export const FACTS_START = 'Zero runtime dependencies'
export const RUNS_ON = 'Runs on '
/** The start of the paragraph linking the playground. */
export const TRY_START = '[Try it in your browser]('

/** The rows of the compatibility table whose environments are checked. */
export const CHECKED_TIERS = [
  'Tested',
  'Loaded',
  'Browser and bundler checked',
  'Engine checked',
] as const

export interface FrontElement {
  kind: FrontKind | 'unlisted'
  /** The element's first line, counted from 1. */
  line: number
  text: string
}

function kindOf(text: string): FrontKind | 'unlisted' {
  if (text.startsWith('# ')) return 'title'
  if (text.split('\n').every((l) => l.startsWith('[!['))) return 'badges'
  if (text.startsWith('```ts\n')) return 'code'
  if (text.startsWith('**') && text.endsWith('**')) return 'problem'
  if (text.startsWith(FACTS_START)) return 'facts'
  if (text.startsWith(TRY_START)) return 'try'
  if (text.startsWith('> **Status:')) return 'status'
  return 'unlisted'
}

/** The README's elements before its first `##` section: paragraphs and fenced blocks. */
export function frontElements(readme: string): FrontElement[] {
  const lines = readme.split('\n')
  const out: FrontElement[] = []
  let block: string[] = []
  let first = 0
  const flush = () => {
    if (block.length > 0) {
      const text = block.join('\n')
      out.push({ kind: kindOf(text), line: first + 1, text })
    }
    block = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    if (line.startsWith('## ')) break
    if (line.startsWith('```')) {
      flush()
      first = i
      block.push(line)
      for (i++; i < lines.length; i++) {
        block.push(lines[i] as string)
        if ((lines[i] as string).startsWith('```')) break
      }
      flush()
      continue
    }
    if (line.trim() === '') {
      flush()
      continue
    }
    if (block.length === 0) first = i
    block.push(line)
  }
  flush()
  return out
}

/**
 * The first element before the first `##` section, or the first `##` section, that is out of
 * the README's order, or the first element the order does not list; empty when in order.
 */
export function orderProblems(readme: string): string[] {
  const elements = frontElements(readme)
  const unlisted = elements.find((e) => e.kind === 'unlisted')
  if (unlisted !== undefined) {
    const first = unlisted.text.split('\n')[0] as string
    return [`README.md:${unlisted.line}: "${first}" is not part of the front page's order`]
  }
  const kinds = elements.map((e) => e.kind)
  for (let i = 0; i < Math.max(kinds.length, FRONT_ORDER.length); i++) {
    if (kinds[i] !== FRONT_ORDER[i]) {
      const element = elements[i]
      return element === undefined
        ? [`README.md: the ${FRONT_ORDER[i]} is missing before the first section`]
        : [
            `README.md:${element.line}: the ${element.kind} is out of place; expected the ${FRONT_ORDER[i] ?? 'first section'}`,
          ]
    }
  }
  const headings = [...readme.matchAll(/^## (.+)$/gm)].map((m) => m[1] as string)
  for (let i = 0; i < Math.max(headings.length, SECTION_ORDER.length); i++) {
    if (headings[i] !== SECTION_ORDER[i]) {
      return headings[i] === undefined
        ? [`README.md: the section "${SECTION_ORDER[i]}" is missing`]
        : [
            `README.md: the section "${headings[i]}" is out of place; expected "${SECTION_ORDER[i] ?? 'no further section'}"`,
          ]
    }
  }
  return []
}

/** The runtimes the facts paragraph lists after "Runs on", split on commas and a final "and". */
export function runtimesOf(facts: string): string[] {
  const at = facts.indexOf(RUNS_ON)
  if (at < 0) return []
  const list = facts
    .slice(at + RUNS_ON.length)
    .replace(/\s+/g, ' ')
    .replace(/\.\s*$/, '')
  return list
    .split(/, | and /)
    .map((name) => name.trim())
    .filter((name) => name !== '')
}

/** The Environments cells of the compatibility table's checked tiers. */
export function checkedEnvironments(compatibility: string): string[] {
  const cells: string[] = []
  for (const line of compatibility.split('\n')) {
    const cols = line.split('|').map((c) => c.trim())
    const tier = /^\*\*(.+)\*\*$/.exec(cols[1] ?? '')?.[1]
    if (tier !== undefined && (CHECKED_TIERS as readonly string[]).includes(tier))
      cells.push(cols[2] ?? '')
  }
  return cells
}

/** Each runtime that no checked Environments cell names, case-sensitively. */
export function unknownRuntimes(runtimes: readonly string[], cells: readonly string[]): string[] {
  return runtimes.filter((name) => !cells.some((cell) => cell.includes(name)))
}

/** The last line of each top-level expression statement in `code` that has no result comment. */
export function uncommentedExpressions(code: string): string[] {
  const lines = code.split('\n')
  const file = ts.createSourceFile('example.ts', code, ts.ScriptTarget.Latest, true)
  const missing: string[] = []
  for (const statement of file.statements) {
    if (!ts.isExpressionStatement(statement)) continue
    const end = file.getLineAndCharacterOfPosition(statement.getEnd()).line
    if (!/\/\/ \S/.test(lines[end] ?? '')) missing.push(lines[end] ?? '')
  }
  return missing
}
