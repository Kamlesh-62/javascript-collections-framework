import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  CDN,
  INTEGRITY,
  integrityOf,
  readSnippet,
  snippetFor,
  snippetHtml,
  snippetProblems,
  writeSnippet,
} from '../scripts/lib/cdn-snippet.mjs'

const ROOT = join(import.meta.dirname, '..')
const SCRIPT = join(ROOT, 'scripts', 'cdn-snippet.mjs')
const EMPTY = 'sha384-OLBgp1GsljhM2TJ+sbHjaiH9txEUvgdDTAzHv2P24donTt6/529l+9Ua0vFImLlb'
const ABC = 'sha384-ywB1P0WjXou1oD1pmsZQBycsMqsO3tFjGotgWkP/W+2AhgcroefMI1i67KE0yCWn'

/** A README with `install` as the body of its install section. */
const readmeWith = (install: string) =>
  `# pkg\n\nIntro <script src="${CDN}@9.9.9/dist/index.iife.js"></script>\n\n## Install\n\n\`\`\`sh\nnpm install pkg\n\`\`\`\n\nOr without a build step:\n\n${install}\n## Goals\n\nText.\n`
const element = (version: string, integrity: string) =>
  `<script src="${CDN}@${version}/dist/index.iife.js"\n        integrity="${integrity}" crossorigin="anonymous"></script>`
const fenced = (html: string) => `\`\`\`html\n${html}\n\`\`\`\n`

describe('the snippet hash', () => {
  it('is sha384- and the base64 SHA-384 digest of the bytes [046 S2-AC2]', () => {
    expect(integrityOf(new Uint8Array())).toBe(EMPTY)
    expect(integrityOf(new TextEncoder().encode('abc'))).toBe(ABC)
    expect(INTEGRITY.test(EMPTY)).toBe(true)
    expect(INTEGRITY.test('sha384-abc')).toBe(false)
    expect(INTEGRITY.test(`sha256-${EMPTY.slice(7)}`)).toBe(false)
  })
})

describe('reading the snippet', () => {
  it('finds the one CDN <script> in the install section, ignoring one elsewhere [046 S2-AC2]', () => {
    const readme = readmeWith(fenced(element('1.2.3', ABC)))
    const snippet = readSnippet(readme)
    expect(snippet).toMatchObject({ version: '1.2.3', integrity: ABC, crossorigin: true })
    if ('problems' in snippet) throw new Error('unreachable')
    expect(readme.slice(snippet.start, snippet.end)).toBe(element('1.2.3', ABC))
  })

  it('names the count when the install section holds none or two [046 S2-AC2]', () => {
    expect(readSnippet(readmeWith('No snippet.\n'))).toEqual({
      problems: [
        `README.md: the install section holds 0 <script> elements loading ${CDN}, expected exactly one`,
      ],
    })
    const two = readSnippet(
      readmeWith(fenced(`${element('1.2.3', ABC)}\n${element('1.2.3', ABC)}`)),
    )
    expect('problems' in two && two.problems[0]).toMatch(/holds 2 <script> elements/)
    expect(readSnippet('# pkg\n')).toEqual({ problems: ['README.md has no "## Install" section'] })
  })
})

describe('the snippet check', () => {
  it('passes a snippet with the version, a SHA-384 integrity value and crossorigin [046 S2-AC1] [046 S2-AC4]', () => {
    expect(snippetProblems(readmeWith(fenced(element('1.2.3', ABC))), '1.2.3')).toEqual([])
  })

  it('names a placeholder, a comment asking for the hash, another version and a missing or malformed integrity [046 S2-AC4]', () => {
    const placeholder = readmeWith(
      fenced(
        `<!-- Pin an exact version; add the integrity hash published with each release. -->\n${element('VERSION', 'sha384-…')}`,
      ),
    )
    expect(snippetProblems(placeholder, '1.2.3')).toEqual([
      'README.md: the install section holds "VERSION"',
      'README.md: the install section holds "…"',
      'README.md: the install section has a comment asking for the integrity hash',
      'README.md: the CDN snippet loads version VERSION, package.json has 1.2.3',
      `README.md: the CDN snippet's integrity "sha384-…" is not sha384- followed by 64 base64 characters`,
    ])
    expect(snippetProblems(readmeWith(fenced(element('1.2.2', ABC))), '1.2.3')).toEqual([
      'README.md: the CDN snippet loads version 1.2.2, package.json has 1.2.3',
    ])
    expect(
      snippetProblems(
        readmeWith(fenced(`<script src="${CDN}@1.2.3/dist/index.iife.js"></script>`)),
        '1.2.3',
      ),
    ).toEqual([
      'README.md: the CDN snippet has no integrity attribute',
      'README.md: the CDN snippet has no crossorigin="anonymous" attribute',
    ])
    expect(
      snippetProblems(readmeWith(fenced(element('1.2.3', `sha384-${'A'.repeat(63)}`))), '1.2.3'),
    ).toHaveLength(1)
    expect(snippetProblems(readmeWith('None.\n'), '1.2.3')).toHaveLength(1)
  })
})

describe('writing the snippet', () => {
  it('changes only the version in src and the integrity value [046 S2-AC2]', () => {
    const before = readmeWith(fenced(element('1.2.2', ABC)))
    const after = writeSnippet(before, '1.2.3', EMPTY)
    expect(after).toBe(before.replace(element('1.2.2', ABC), element('1.2.3', EMPTY)))
    expect(after).toContain(`Intro <script src="${CDN}@9.9.9/dist/index.iife.js"></script>`)
    expect(writeSnippet(after, '1.2.3', EMPTY)).toBe(after)
  })

  it('adds an integrity attribute that is missing, and refuses a section without one snippet [046 S2-AC2]', () => {
    const bare = readmeWith(
      fenced(`<script src="${CDN}@1.2.2/dist/index.iife.js" crossorigin="anonymous"></script>`),
    )
    expect(snippetProblems(writeSnippet(bare, '1.2.3', ABC), '1.2.3')).toEqual([])
    expect(() => writeSnippet(readmeWith('None.\n'), '1.2.3', ABC)).toThrow(/holds 0 <script>/)
  })

  it('gives release notes the README element for another version, with or without a hash [046 S1-AC5]', () => {
    const readme = readmeWith(fenced(element('1.2.3', ABC)))
    expect(snippetFor(readme, '1.2.3', ABC)).toBe(element('1.2.3', ABC))
    expect(snippetFor(readme, '1.0.0', EMPTY)).toBe(element('1.0.0', EMPTY))
    expect(snippetFor(readme, '1.0.0', undefined)).toBe(
      `<script src="${CDN}@1.0.0/dist/index.iife.js" crossorigin="anonymous"></script>`,
    )
    expect(snippetFor('# pkg\n', '1.0.0', ABC)).toBe(snippetHtml('1.0.0', ABC))
    expect(snippetHtml('1.0.0', undefined)).not.toContain('integrity')
  })
})

describe('the snippet command', () => {
  const dirs: string[] = []
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  })

  /** A package folder with a README, a package.json at `version` and, unless `build` is false, a build. */
  function fixture(readme: string, version: string, build = true): string {
    const dir = mkdtempSync(join(tmpdir(), 'cdn-snippet-'))
    dirs.push(dir)
    writeFileSync(join(dir, 'README.md'), readme)
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version }))
    if (build) {
      mkdirSync(join(dir, 'dist'))
      writeFileSync(join(dir, 'dist', 'index.iife.js'), 'abc')
    }
    return dir
  }
  const run = (dir: string, args: string[] = []) => {
    try {
      const stdout = execFileSync(process.execPath, [SCRIPT, ...args], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      return { status: 0, out: stdout }
    } catch (error) {
      const e = error as { status: number; stderr: string }
      return { status: e.status, out: e.stderr }
    }
  }

  it('writes the version and the hash of the build, and the check then passes [046 S2-AC2]', () => {
    const before = readmeWith(fenced(element('1.2.2', EMPTY)))
    const dir = fixture(before, '1.2.3')
    expect(run(dir).status).toBe(0)
    const after = readFileSync(join(dir, 'README.md'), 'utf8')
    expect(after).toBe(before.replace(element('1.2.2', EMPTY), element('1.2.3', ABC)))
    expect(run(dir, ['--check'])).toEqual({
      status: 0,
      out: `cdn-snippet: README.md loads 1.2.3 with ${ABC}\n`,
    })
  })

  it('with --check, writes nothing and fails showing both hashes when the snippet differs [046 S2-AC2] [046 S2-AC5]', () => {
    const before = readmeWith(fenced(element('1.2.3', EMPTY)))
    const dir = fixture(before, '1.2.3')
    const result = run(dir, ['--check'])
    expect(result.status).toBe(1)
    expect(result.out).toContain(`README.md: 1.2.3 ${EMPTY}`)
    expect(result.out).toContain(`build:     1.2.3 ${ABC}`)
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toBe(before)
  })

  it('fails naming a missing build, a snippet count other than one, or an unknown argument [046 S2-AC2]', () => {
    const readme = readmeWith(fenced(element('1.2.3', ABC)))
    expect(run(fixture(readme, '1.2.3', false))).toEqual({
      status: 1,
      out: 'cdn-snippet: dist/index.iife.js is missing; run pnpm build first\n',
    })
    const none = run(fixture(readmeWith('None.\n'), '1.2.3'))
    expect(none.status).toBe(1)
    expect(none.out).toMatch(/holds 0 <script> elements/)
    expect(run(fixture(readme, '1.2.3'), ['--fix'])).toEqual({
      status: 1,
      out: 'cdn-snippet: unknown argument --fix\n',
    })
  })

  it('runs as pnpm cdn:snippet, and before packing as part of prepublishOnly [046 S2-AC5]', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    expect(pkg.scripts['cdn:snippet']).toBe('node scripts/cdn-snippet.mjs')
    expect(pkg.scripts.prepublishOnly).toBe('pnpm check && node scripts/cdn-snippet.mjs --check')
    expect(pkg.files).toContain('dist')
  })
})
