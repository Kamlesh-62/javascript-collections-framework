import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { packTarball } from '../scripts/lib/pack-tarball.mjs'
import {
  MIN_NPM,
  pendingChangesets,
  type ReleaseFacts,
  registryState,
  releaseProblems,
  tagState,
  versionAtLeast,
} from '../scripts/lib/release-check.mjs'
import { draftArgs, draftProblems, SHA, VERSION } from '../scripts/lib/release-draft.mjs'
import {
  absoluteLinks,
  changelogSection,
  releaseNotes,
  repositoryOf,
} from '../scripts/lib/release-notes.mjs'

const ROOT = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

/** The text of one job of a workflow, from its key to the next job's key. */
function job(workflow: string, name: string): string {
  const start = workflow.indexOf(`\n  ${name}:\n`)
  expect(start, name).toBeGreaterThan(0)
  const next = workflow.slice(start + 1).search(/\n {2}[a-z-]+:\n/)
  return next < 0 ? workflow.slice(start) : workflow.slice(start, start + 1 + next)
}

/** The `uses:` lines of a workflow, trimmed. */
const actions = (workflow: string) =>
  workflow
    .split('\n')
    .filter((line) => /^\s*-?\s*uses:/.test(line))
    .map((line) => line.replace(/^\s*-?\s*uses:\s*/, '').trim())

describe('the release workflow', () => {
  const workflow = read('.github/workflows/release.yml')
  const publish = job(workflow, 'publish')

  it('starts only by hand, stages the package in a job only on main in the npm-publish environment, with least privilege and no cache [037 S1-AC1]', () => {
    expect(workflow).toMatch(/^on:\n {2}workflow_dispatch:\n\n/m)
    expect(workflow).not.toMatch(
      /^ {2}(push|pull_request|pull_request_target|schedule|workflow_run):/m,
    )
    expect(workflow).toMatch(/^permissions: \{\}$/m)
    expect(workflow).toMatch(/^concurrency:\n {2}group: release\n {2}cancel-in-progress: false$/m)
    const jobs = [...workflow.slice(workflow.indexOf('\njobs:\n')).matchAll(/\n {2}([a-z-]+):\n/g)]
    expect(jobs.map((m) => m[1])).toEqual(['publish', 'draft'])
    expect(publish).toContain("if: github.ref == 'refs/heads/main'")
    expect(publish).toContain('environment: npm-publish')
    expect(publish).toMatch(/permissions:\n {6}contents: read\n {6}id-token: write\n {4}steps:/)
    expect(workflow).not.toMatch(/^\s*cache(-dependency-path)?:/m)
    expect(publish).toContain('package-manager-cache: false')
    expect(publish).toContain('persist-credentials: false')
  })

  it('uses only the Actions that CI already pins [037 S1-AC1]', () => {
    const pinned = new Set(actions(read('.github/workflows/ci.yml')))
    for (const action of actions(workflow)) expect(pinned, action).toContain(action)
  })

  it('installs from the lockfile, checks the release, then stages with provenance and no token, so prepublishOnly runs pnpm check once [037 S1-AC2] [046 S2-AC5]', () => {
    const runs = [...publish.matchAll(/^\s+(?:- )?run: (.+)$/gm)].map((m) => m[1])
    expect(runs).toEqual([
      'pnpm install --frozen-lockfile',
      'node scripts/release-check.mjs',
      'npm stage publish --provenance',
    ])
    expect(publish).toContain('node-version: 24')
    expect(workflow).not.toMatch(/NODE_AUTH_TOKEN|NPM_TOKEN|secrets\./)
    expect(runs.join('\n')).not.toMatch(/--ignore-scripts|--tag\b|pnpm check/)
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.scripts.prepublishOnly).toBe('pnpm check && node scripts/cdn-snippet.mjs --check')
    expect(pkg.scripts.prepublishOnly.match(/pnpm check\b/g)).toHaveLength(1)
    expect(pkg.scripts.check).toMatch(/\bpnpm build\b.*\bpnpm check:package\b.*\bpnpm size:check\b/)
  })
})

describe('the release check', () => {
  const clean: ReleaseFacts = {
    name: 'pkg',
    version: '0.1.1',
    npmVersion: '11.19.1\n',
    registry: 'absent',
    head: 'a'.repeat(40),
    mainTip: 'a'.repeat(40),
    changesets: [],
    changelogSection: true,
    tagExists: false,
  }

  it('passes a clean release [037 S1-AC3]', () => {
    expect(releaseProblems(clean)).toEqual([])
  })

  it('stops on a published version, a commit behind main and pending changesets, naming each [037 S1-AC3]', () => {
    expect(releaseProblems({ ...clean, registry: 'published' })).toEqual([
      'release: pkg@0.1.1 is already published',
    ])
    expect(releaseProblems({ ...clean, mainTip: 'b'.repeat(40) })).toEqual([
      `release: ${'a'.repeat(40)} is not the tip of main (${'b'.repeat(40)})`,
    ])
    expect(releaseProblems({ ...clean, mainTip: '' })).toHaveLength(1)
    expect(releaseProblems({ ...clean, changesets: ['a.md', 'b.md'] })).toEqual([
      'release: .changeset/ holds changesets not yet versioned: a.md, b.md',
    ])
    expect(
      releaseProblems({
        ...clean,
        npmVersion: '11.6.2',
        registry: 'published',
        mainTip: 'b'.repeat(40),
        changesets: ['a.md'],
      }),
    ).toHaveLength(4)
  })

  it('counts a changeset only when its front matter names a package [037 S1-AC3]', () => {
    expect(
      pendingChangesets(
        new Map([
          ['README.md', '---\n"pkg": patch\n---\n'],
          ['config.json', '{}'],
          ['empty.md', '---\n---\n'],
          ['empty-crlf.md', '---\r\n---\r\n'],
          ['z-patch.md', "---\n'pkg': patch\n---\n\nFixes a thing.\n"],
          ['a-minor.md', '---\r\n"pkg": minor\r\n---\r\n\r\nAdds a thing.\r\n'],
        ]),
      ),
    ).toEqual(['a-minor.md', 'z-patch.md'])
  })

  it('stops when npm cannot stage or the registry check fails [037 S1-AC5]', () => {
    expect(MIN_NPM).toBe('11.15.0')
    expect(releaseProblems({ ...clean, npmVersion: '11.6.2\n' })).toEqual([
      'release: npm 11.6.2 is older than 11.15.0, which staged publishing needs',
    ])
    expect(releaseProblems({ ...clean, registry: { error: 'ETIMEDOUT' } })).toEqual([
      'release: the npm registry check failed: ETIMEDOUT',
    ])
    expect(versionAtLeast('11.15.0', MIN_NPM)).toBe(true)
    expect(versionAtLeast('11.19.1', MIN_NPM)).toBe(true)
    expect(versionAtLeast('12.0.0', MIN_NPM)).toBe(true)
    expect(versionAtLeast('11.14.9', MIN_NPM)).toBe(false)
    expect(versionAtLeast('11.6.2', MIN_NPM)).toBe(false)
    expect(versionAtLeast('11.15.0-pre.1', MIN_NPM)).toBe(false)
    expect(versionAtLeast('not a version', MIN_NPM)).toBe(false)
  })

  it('reads the registry: the version printed is published, nothing or E404 is absent, anything else is an error [037 S1-AC3] [037 S1-AC5]', () => {
    const specs: string[] = []
    const ok = (stdout: string) => (spec: string) => {
      specs.push(spec)
      return { ok: true as const, stdout }
    }
    const fail = (stderr: string) => () => ({ ok: false as const, stderr })
    expect(registryState('pkg', '0.1.0', ok('"0.1.0"\n'))).toBe('published')
    expect(specs).toEqual(['pkg@0.1.0'])
    expect(registryState('pkg', '0.1.1', ok(''))).toBe('absent')
    expect(
      registryState('pkg', '0.1.1', fail('npm error code E404\nnpm error 404 Not Found')),
    ).toBe('absent')
    expect(registryState('pkg', '0.1.1', fail('npm error code ETIMEDOUT'))).toEqual({
      error: 'npm error code ETIMEDOUT',
    })
    expect(registryState('pkg', '0.1.1', fail(''))).toEqual({
      error: 'npm view failed with no output',
    })
    expect(registryState('pkg', '0.1.1', ok('"0.1.0"'))).toEqual({
      error: 'npm view printed "\\"0.1.0\\"", not the version 0.1.1',
    })
  })
})

describe('the package check under npm publish --dry-run', () => {
  const dirs: string[] = []
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  })

  it('packs a real tarball into a directory of its own even when npm is in dry-run mode [037 S2-AC2]', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pack-tarball-'))
    dirs.push(dir)
    const tarball = packTarball(ROOT, dir, { ...process.env, npm_config_dry_run: 'true' })
    expect(tarball.startsWith(dir)).toBe(true)
    expect(tarball).toMatch(/javascript-collections-framework-\d+\.\d+\.\d+\.tgz$/)
    expect(existsSync(tarball)).toBe(true)
  }, 60_000)

  it('runs the type check on that tarball, and CI runs it in dry-run mode on Linux, macOS and Windows [037 S2-AC2]', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.scripts['check:package']).toBe('publint --strict && node scripts/check-types.mjs')
    const script = read('scripts/check-types.mjs')
    expect(script).toContain('packTarball(')
    expect(script).toContain('rmSync(dir')
    const ci = job(read('.github/workflows/ci.yml'), 'publish-dry-run')
    expect(ci).toContain('os: [ubuntu-latest, macos-latest, windows-latest]')
    expect(ci).toMatch(/runs-on: \$\{\{ matrix\.os \}\}/)
    expect(ci).toMatch(
      /run: pnpm build\n {6}- run: pnpm check:package\n {8}env:\n {10}npm_config_dry_run: "true"/,
    )
  })
})

describe('the draft release job', () => {
  const workflow = read('.github/workflows/release.yml')
  const draft = job(workflow, 'draft')

  it('runs on main after the package is staged, with contents: write only, checking out the verified commit without credentials [046 S1-AC4]', () => {
    expect(draft).toContain('needs: publish')
    expect(draft).toContain("if: github.ref == 'refs/heads/main'")
    expect(draft).toMatch(/permissions:\n {6}contents: write\n {4}steps:/)
    expect(draft).not.toContain('environment:')
    expect(draft).toMatch(
      /with:\n {10}ref: \$\{\{ github\.sha \}\}\n {10}persist-credentials: false/,
    )
    expect(draft).toContain('package-manager-cache: false')
    expect(draft).toContain('node-version: 24')
    const runs = [...draft.matchAll(/^\s+(?:- )?run: (.+)$/gm)].map((m) => m[1])
    expect(runs).toEqual(['node scripts/release-draft.mjs'])
    expect(draft).toMatch(
      /run: node scripts\/release-draft\.mjs\n {8}env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}\n {10}GH_REPO: \$\{\{ github\.repository \}\}\n?$/,
    )
    expect(workflow.match(/GH_TOKEN/g)).toHaveLength(1)
  })

  it('leaves no job with both write permissions, and the draft script imports only Node built-ins [046 S1-AC4]', () => {
    expect(job(workflow, 'publish')).not.toContain('contents: write')
    expect(draft).not.toContain('id-token')
    for (const file of [
      'scripts/release-draft.mjs',
      'scripts/lib/release-draft.mjs',
      'scripts/lib/release-notes.mjs',
      'scripts/lib/cdn-snippet.mjs',
    ]) {
      const text = read(file)
      const imports = [...text.matchAll(/\bfrom\s+'([^']+)'|^\s*import\s+'([^']+)'/gm)].map(
        (m) => m[1] ?? m[2],
      )
      for (const source of imports) expect(source, file).toMatch(/^(node:|\.\/)/)
      expect(text, file).not.toMatch(/\bimport\s*\(|\brequire\s*\(/)
    }
  })

  it('creates the draft titled and tagged v<version> at the full commit, a pre-release for a - version [046 S1-AC4]', () => {
    const sha = 'a'.repeat(40)
    expect(draftArgs({ version: '0.2.0', sha, notesFile: '/tmp/n.md' })).toEqual([
      'v0.2.0',
      '--draft',
      '--target',
      sha,
      '--title',
      'v0.2.0',
      '--notes-file',
      '/tmp/n.md',
    ])
    expect(draftArgs({ version: '1.0.0-rc.1', sha, notesFile: 'n.md' }).at(-1)).toBe('--prerelease')
    expect(SHA.test(sha)).toBe(true)
    expect(SHA.test('a'.repeat(7))).toBe(false)
    expect(VERSION.test('1.0.0-rc.1')).toBe(true)
    expect(VERSION.test('1.0.0; rm -rf')).toBe(false)
    const script = read('scripts/release-draft.mjs')
    expect(script).toContain("'--json', 'tagName,name,isDraft'")
    expect(script).toContain('process.env.GITHUB_SHA')
  })

  it('stops, changing nothing, when a published or draft release has the tag or the title [046 S1-AC3]', () => {
    expect(
      draftProblems([{ tagName: 'v0.1.1', name: 'v0.1.1', isDraft: false }], 'v0.2.0'),
    ).toEqual([])
    expect(
      draftProblems([{ tagName: 'v0.2.0', name: 'v0.2.0', isDraft: false }], 'v0.2.0'),
    ).toEqual([
      'release-draft: a published release for v0.2.0 already exists (title "v0.2.0", tag v0.2.0); it was left unchanged',
    ])
    expect(draftProblems([{ tagName: 'v0.2.0', name: 'Other', isDraft: true }], 'v0.2.0')).toEqual([
      'release-draft: a draft release for v0.2.0 already exists (title "Other", tag v0.2.0); it was left unchanged',
    ])
    expect(
      draftProblems([{ tagName: 'untagged-1', name: 'v0.2.0', isDraft: true }], 'v0.2.0'),
    ).toHaveLength(1)
    const script = read('scripts/release-draft.mjs')
    expect(script.indexOf('draftProblems(')).toBeLessThan(script.indexOf("'release', 'create'"))
  })
})

describe('the release check of the changelog and the tag', () => {
  const clean: ReleaseFacts = {
    name: 'pkg',
    version: '0.2.0',
    npmVersion: '11.19.1',
    registry: 'absent',
    head: 'a'.repeat(40),
    mainTip: 'a'.repeat(40),
    changesets: [],
    changelogSection: true,
    tagExists: false,
  }

  it('stops when CHANGELOG.md has no section for the version, naming it [046 S1-AC1]', () => {
    expect(releaseProblems({ ...clean, changelogSection: false })).toEqual([
      "release: CHANGELOG.md has no '## 0.2.0' section",
    ])
    const script = read('scripts/release-check.mjs')
    expect(script).toContain("changelogSection(readFileSync(join(root, 'CHANGELOG.md')")
  })

  it('stops when the tag exists on origin or the lookup fails, naming the tag or the error [046 S1-AC2]', () => {
    expect(releaseProblems({ ...clean, tagExists: true })).toEqual([
      'release: tag v0.2.0 already exists on origin',
    ])
    expect(releaseProblems({ ...clean, tagExists: { error: 'fatal: no remote' } })).toEqual([
      'release: the lookup of tag v0.2.0 failed: fatal: no remote',
    ])
    const refs: string[] = []
    const ok = (stdout: string) => (ref: string) => {
      refs.push(ref)
      return { ok: true as const, stdout }
    }
    expect(tagState('v0.2.0', ok(''))).toBe(false)
    expect(refs).toEqual(['refs/tags/v0.2.0'])
    expect(tagState('v0.2.0', ok(`${'b'.repeat(40)}\trefs/tags/v0.2.0\n`))).toBe(true)
    expect(tagState('v0.2.0', () => ({ ok: false as const, stderr: 'fatal: x\n' }))).toEqual({
      error: 'fatal: x',
    })
    expect(tagState('v0.2.0', () => ({ ok: false as const, stderr: '' }))).toEqual({
      error: 'git ls-remote failed with no output',
    })
    expect(read('scripts/release-check.mjs')).toContain("['ls-remote', '--tags', 'origin', ref]")
  })
})

describe('the changelog section', () => {
  const changelog =
    '# pkg\n\n## 0.1.10\n\nTen.\n\n## 0.1.1\n\n### Patch\n\n- One.\n\n## 0.1.0\n\nZero.\n'

  it('is the lines after the exact "## <version>" line up to the next "## " or the end [046 S1-AC1]', () => {
    expect(changelogSection(changelog, '0.1.10')).toBe('Ten.')
    expect(changelogSection(changelog, '0.1.1')).toBe('### Patch\n\n- One.')
    expect(changelogSection(changelog, '0.1.0')).toBe('Zero.')
    expect(changelogSection(changelog, '0.1')).toBeUndefined()
    expect(changelogSection(changelog, '0.1.2')).toBeUndefined()
    expect(changelogSection('## 0x1x0\n\nX.\n', '0.1.0')).toBeUndefined()
    expect(changelogSection('## 0.1.0 \n\nX.\n', '0.1.0')).toBeUndefined()
    expect(changelogSection('## 0.1.0\r\n\r\nX.\r\n', '0.1.0')).toBe('X.')
  })
})

describe('the release notes', () => {
  const base = `https://github.com/owner/repo/blob/${'c'.repeat(40)}`
  const hash = `sha384-${'A'.repeat(64)}`
  const other = `sha384-${'B'.repeat(64)}`
  const cdn = 'https://cdn.jsdelivr.net/npm/javascript-collections-framework'
  const readme = `# pkg\n\n## Install\n\n\`\`\`html\n<script src="${cdn}@0.2.0/dist/index.iife.js"\n        integrity="${hash}" crossorigin="anonymous"></script>\n\`\`\`\n`
  const changelog =
    '# pkg\n\n## 0.2.0\n\n- See [the docs](docs/a.md) and [b](./b.md#x).\n\n## 0.1.0\n\nOld.\n'
  const input = {
    changelog,
    readme,
    version: '0.2.0',
    packageVersion: '0.2.0',
    repo: 'owner/repo',
    sha: 'c'.repeat(40),
    integrity: undefined as string | undefined,
  }

  it('makes relative links absolute at the commit, link text across lines included, and leaves others [046 S1-AC5]', () => {
    const real = changelogSection(read('CHANGELOG.md'), '0.1.0') ?? ''
    expect(absoluteLinks(real, base)).toContain(
      `[how this library is\n  tested](${base}/docs/testing.md)`,
    )
    expect(absoluteLinks('[a](docs/x.md) [b](./y.md#h)', base)).toBe(
      `[a](${base}/docs/x.md) [b](${base}/y.md#h)`,
    )
    const kept = '[a](#anchor) [b](/root) [c](//host/x) [d](https://e.org/) [f](mailto:a@b.c)'
    expect(absoluteLinks(kept, base)).toBe(kept)
  })

  it('lays out the section without its heading, the install command, then the README snippet [046 S1-AC5]', () => {
    expect(releaseNotes(input)).toEqual({
      notes: [
        `- See [the docs](${base}/docs/a.md) and [b](${base}/b.md#x).`,
        '',
        '### Install',
        '',
        '```sh',
        'npm install javascript-collections-framework@0.2.0',
        '```',
        '',
        '### CDN',
        '',
        '```html',
        `<script src="${cdn}@0.2.0/dist/index.iife.js"`,
        `        integrity="${hash}" crossorigin="anonymous"></script>`,
        '```',
        '',
      ].join('\n'),
    })
    expect(repositoryOf('git+https://github.com/owner/repo.git')).toBe('owner/repo')
    expect(repositoryOf('https://example.com/owner/repo.git')).toBeUndefined()
  })

  it('takes the hash from --integrity, else from the README for the current version, else none [046 S1-AC6]', () => {
    const notes = (over: Partial<typeof input> & { integrity?: string }) => {
      const result = releaseNotes({ ...input, ...over })
      return 'notes' in result ? result.notes : result.problem
    }
    expect(notes({ integrity: other })).toContain(`integrity="${other}"`)
    expect(notes({ version: '0.1.0' })).toContain(
      `<script src="${cdn}@0.1.0/dist/index.iife.js" crossorigin="anonymous"></script>`,
    )
    expect(notes({ version: '0.1.0', integrity: other })).toContain(
      `@0.1.0/dist/index.iife.js"\n        integrity="${other}"`,
    )
    expect(notes({ version: '0.3.0' })).toBe(
      "CHANGELOG.md has no '## 0.3.0' section for version 0.3.0",
    )
  })
})

describe('the release notes command', () => {
  const sha = 'd'.repeat(40)
  const run = (args: string[]) => {
    try {
      const out = execFileSync(process.execPath, ['scripts/release-notes.mjs', ...args], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_SHA: sha },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      return { status: 0, out }
    } catch (error) {
      const e = error as { status: number; stderr: string }
      return { status: e.status, out: e.stderr }
    }
  }
  const pkg = JSON.parse(read('package.json'))

  it('prints only the notes, with the README hash for the current version [046 S1-AC6]', () => {
    const result = run([pkg.version])
    expect(result.status).toBe(0)
    const integrity = /integrity="([^"]+)"/.exec(read('README.md'))?.[1]
    expect(result.out).toContain(`integrity="${integrity}"`)
    expect(result.out).toMatch(
      /\n### Install\n\n```sh\nnpm install javascript-collections-framework@/,
    )
    expect(result.out.startsWith('### ')).toBe(true)
    expect(pkg.scripts['release:notes']).toBe('node scripts/release-notes.mjs')
  })

  it('prints an older version without a hash, or with the one given [046 S1-AC6]', () => {
    const plain = run(['0.1.0'])
    expect(plain.status).toBe(0)
    expect(plain.out).not.toContain('integrity=')
    expect(plain.out).toContain(
      `[how this library is\n  tested](https://github.com/${repositoryOf(pkg.repository.url)}/blob/${sha}/docs/testing.md)`,
    )
    const given = `sha384-${'C'.repeat(64)}`
    expect(run(['0.1.0', '--integrity', given]).out).toContain(`integrity="${given}"`)
  })

  it('fails naming the version with no section, a missing version, an unknown flag or a malformed hash [046 S1-AC6]', () => {
    expect(run(['9.9.9'])).toEqual({
      status: 1,
      out: "release-notes: CHANGELOG.md has no '## 9.9.9' section for version 9.9.9\n",
    })
    expect(run([])).toEqual({
      status: 1,
      out: 'release-notes: give the version, as in: node scripts/release-notes.mjs 0.1.1\n',
    })
    expect(run(['0.1.0', '--sha', 'x'])).toEqual({
      status: 1,
      out: 'release-notes: unknown flag --sha\n',
    })
    expect(run(['0.1.0', '--integrity', 'sha384-abc'])).toEqual({
      status: 1,
      out: 'release-notes: --integrity must be sha384- followed by 64 base64 characters, got "sha384-abc"\n',
    })
    expect(run(['0.1.0', '--integrity']).status).toBe(1)
    expect(run(['not-a-version']).status).toBe(1)
  })
})

describe('the release instructions', () => {
  const pkg = JSON.parse(read('package.json'))
  const contributing = read('CONTRIBUTING.md')
  const start = contributing.indexOf('\n## Releases\n')
  const end = contributing.indexOf('\n## ', start + 1)
  const releases = contributing.slice(start, end < 0 ? undefined : end)

  it('versions with one command that bumps, builds and writes the snippet, named in CONTRIBUTING.md [046 S2-AC3]', () => {
    expect(pkg.scripts['release:version']).toBe(
      'changeset version && pnpm build && pnpm cdn:snippet',
    )
    expect(contributing).toContain('\n## Releases\n')
    expect(releases).toContain('pnpm release:version')
    expect(releases).toMatch(/from that merge commit, with no other merge in between/)
  })

  it('says the maintainer publishes the draft after the npm approval, and how to recover from a rejection or a failed draft job [046 S1-AC7]', () => {
    const approve = releases.indexOf('npm stage approve')
    const publish = releases.indexOf('publishes the draft')
    expect(approve).toBeGreaterThan(0)
    expect(publish).toBeGreaterThan(approve)
    expect(releases).toMatch(
      /only\s+then publishes the draft from the Releases page, which creates the tag/,
    )
    expect(releases).toMatch(/npm stage reject <id>`, delete the draft[\s\S]*bump the version/)
    expect(releases).toContain('gh release delete v<version>')
    expect(releases).toContain('gh run rerun <run-id> --failed')
  })
})
