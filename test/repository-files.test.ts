import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

/** A field of an issue form's body, read line by line: its id, type and whether it is required. */
interface FormField {
  readonly id: string
  readonly type: string
  readonly required: boolean
}

/** Reads an issue form without a YAML parser: top-level keys at column 0, and the body's fields. */
function readForm(text: string): { keys: string[]; fields: FormField[] } {
  const lines = text.split('\n')
  const keys = lines.flatMap((l) => /^([a-z_]+):/.exec(l)?.[1] ?? [])
  const fields: FormField[] = []
  let current: { id: string; type: string; required: boolean } | undefined
  for (const line of lines) {
    const type = /^ {2}- type: (\w+)$/.exec(line)?.[1]
    if (type !== undefined) {
      if (current !== undefined && current.id !== '') fields.push(current)
      current = { id: '', type, required: false }
      continue
    }
    if (current === undefined) continue
    const id = /^ {4}id: (\S+)$/.exec(line)?.[1]
    if (id !== undefined) current.id = id
    if (/^ {6}required: true$/.test(line)) current.required = true
  }
  if (current !== undefined && current.id !== '') fields.push(current)
  return { keys, fields }
}

describe('issue forms', () => {
  it('ask a bug report for the version, runtime, reproduction, expected and actual result [042 S7-AC1] [042 S7-AC3]', () => {
    const form = readForm(read('.github/ISSUE_TEMPLATE/bug_report.yml'))
    expect(form.keys).toEqual(expect.arrayContaining(['name', 'description', 'body']))
    expect(form.fields).toEqual([
      { id: 'version', type: 'input', required: true },
      { id: 'runtime', type: 'input', required: true },
      { id: 'reproduction', type: 'textarea', required: true },
      { id: 'expected', type: 'textarea', required: true },
      { id: 'actual', type: 'textarea', required: true },
    ])
  })

  it('ask a feature request for the problem and the API, and the native counterpart if any [042 S7-AC1] [042 S7-AC3]', () => {
    const form = readForm(read('.github/ISSUE_TEMPLATE/feature_request.yml'))
    expect(form.keys).toEqual(expect.arrayContaining(['name', 'description', 'body']))
    expect(form.fields).toEqual([
      { id: 'problem', type: 'textarea', required: true },
      { id: 'api', type: 'textarea', required: true },
      { id: 'native', type: 'textarea', required: false },
    ])
  })

  it('turn off blank issues and link the security policy, the docs and the API reference [042 S7-AC1] [042 S7-AC3]', () => {
    const config = read('.github/ISSUE_TEMPLATE/config.yml')
    expect(config.split('\n')).toContain('blank_issues_enabled: false')
    const urls = [...config.matchAll(/^ {4}url: (\S+)$/gm)].map((m) => m[1])
    expect(urls).toEqual([
      'https://github.com/Kamlesh-62/javascript-collections-framework/security/policy',
      'https://github.com/Kamlesh-62/javascript-collections-framework/tree/main/docs',
      'https://kamlesh-62.github.io/javascript-collections-framework/',
    ])
  })

  it('are read field by field, whatever the order of keys inside a field [042 S7-AC3]', () => {
    const form = readForm(
      'name: x\nbody:\n  - type: input\n    validations:\n      required: true\n    id: a\n  - type: markdown\n    attributes:\n      value: hi\n',
    )
    expect(form).toEqual({
      keys: ['name', 'body'],
      fields: [{ id: 'a', type: 'input', required: true }],
    })
  })
})

describe('the contributing guide', () => {
  it('starts with a quick path of at most five commands, before the setup [042 S7-AC2]', () => {
    const guide = read('CONTRIBUTING.md')
    const headings = [...guide.matchAll(/^## (.+)$/gm)].map((m) => m[1])
    expect(headings.slice(0, 2)).toEqual(['Quick path', 'Setup'])
    const quick = guide.slice(guide.indexOf('## Quick path'), guide.indexOf('## Setup'))
    const commands = (/```sh\n([\s\S]*?)```/.exec(quick)?.[1] ?? '').trim().split('\n')
    expect(commands.length).toBeGreaterThan(0)
    expect(commands.length).toBeLessThanOrEqual(5)
    expect(commands[0]).toMatch(/^gh repo fork /)
    expect(commands.join('\n')).toContain('pnpm check')
    expect(commands.at(-1)).toContain('gh pr create')
  })
})
