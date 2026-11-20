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
  versionAtLeast,
} from '../scripts/lib/release-check.mjs'

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

  it('starts only by hand, runs one job only on main in the npm-publish environment, with least privilege and no cache [037 S1-AC1]', () => {
    expect(workflow).toMatch(/^on:\n {2}workflow_dispatch:\n\n/m)
    expect(workflow).not.toMatch(
      /^ {2}(push|pull_request|pull_request_target|schedule|workflow_run):/m,
    )
    expect(workflow).toMatch(/^permissions: \{\}$/m)
    expect(workflow).toMatch(/^concurrency:\n {2}group: release\n {2}cancel-in-progress: false$/m)
    const jobs = [...workflow.slice(workflow.indexOf('\njobs:\n')).matchAll(/\n {2}([a-z-]+):\n/g)]
    expect(jobs.map((m) => m[1])).toEqual(['publish'])
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

  it('installs from the lockfile, checks the release, then stages with provenance and no token, so prepublishOnly runs pnpm check once [037 S1-AC2]', () => {
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
    expect(pkg.scripts.prepublishOnly).toBe('pnpm check')
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
