import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CLOSING,
  checkArchive,
  engineScript,
  passed,
  readEngines,
  sha256,
} from '../fixtures/engines/lib/engines.mjs'
import { hermesTagUrl, URLS, updateEntry } from '../fixtures/engines/lib/update.mjs'
import * as lib from '../src/index'

const ROOT = join(import.meta.dirname, '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const ENGINES = ['quickjs', 'javascriptcore', 'spidermonkey', 'xs']

/** The text of one job of a workflow, from its key to the next job's key. */
function job(workflow: string, name: string): string {
  const start = workflow.indexOf(`\n  ${name}:\n`)
  expect(start, name).toBeGreaterThan(0)
  const next = workflow.slice(start + 1).search(/\n {2}[a-z-]+:\n/)
  return next < 0 ? workflow.slice(start) : workflow.slice(start, start + 1 + next)
}

describe('the pinned engines', () => {
  it('pin QuickJS, JavaScriptCore, SpiderMonkey and XS by version, https URL and SHA-256, and Hermes by React Native release and tag [040 S1-AC2]', () => {
    const { engines, hermes } = readEngines(read('fixtures/engines/engines.json'))
    expect(engines.map((e) => e.name)).toEqual(ENGINES)
    for (const e of engines) {
      expect(e.url, e.name).toBe(URLS[e.name as keyof typeof URLS](e.version))
      expect(e.url, e.name).toMatch(/linux|lin64|x86_64/)
    }
    expect(hermes.url).toBe(URLS.hermes(hermes.tag))
    expect(hermes.tag).toMatch(/^hermes-v\d+\.\d+\.\d+$/)
    expect(hermes.reactNative).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('refuse an incomplete or malformed entry [040 S1-AC4]', () => {
    const good = JSON.parse(read('fixtures/engines/engines.json'))
    const broken = (change: (d: typeof good) => void) => {
      const d = structuredClone(good)
      change(d)
      return () => readEngines(JSON.stringify(d))
    }
    expect(broken((d) => delete d.engines[0].sha256)).toThrow('engines[0] has no sha256')
    expect(broken((d) => (d.engines[1].sha256 = 'abc'))).toThrow(
      'javascriptcore has a malformed sha256',
    )
    expect(broken((d) => (d.engines[2].url = 'http://example.com/js.zip'))).toThrow(
      'spidermonkey url is not https',
    )
    expect(broken((d) => delete d.hermes.tag)).toThrow('hermes has no tag')
    expect(broken((d) => (d.engines = {}))).toThrow('"engines" must be an array')
  })
})

describe('the archive check', () => {
  it('passes the bytes whose SHA-256 is pinned and stops on any other, naming the engine and both sums [040 S1-AC4]', () => {
    const bytes = new TextEncoder().encode('engine archive')
    const sum = sha256(bytes)
    expect(sum).toMatch(/^[0-9a-f]{64}$/)
    expect(checkArchive('quickjs', bytes, sum)).toBe(bytes)
    const tampered = new TextEncoder().encode('engine archivf')
    expect(() => checkArchive('quickjs', tampered, sum)).toThrow(
      `engines: quickjs archive SHA-256 is ${sha256(tampered)}, expected ${sum}`,
    )
  })
})

describe('an engine run', () => {
  const line = 'smoke: ok 10 collections, 8 errors'

  it('passes only with exit status 0 and the closing line [040 S1-AC5]', () => {
    expect(passed({ status: 0, stdout: `${line}\n` })).toBe(true)
    expect(passed({ status: 0, stdout: `noise\n${line}\nmore\n` })).toBe(true)
    expect(passed({ status: 0, stdout: 'smoke: failed: boom\n' })).toBe(false)
    expect(passed({ status: 0, stdout: '' })).toBe(false)
    expect(passed({ status: 1, stdout: `${line}\n` })).toBe(false)
    expect(passed({ status: null, stdout: `${line}\n` })).toBe(false)
    expect(CLOSING.exec(line)?.slice(1)).toEqual(['10', '8'])
  })

  // The built script-tag file defines the global `JCF`; here a stand-in comment takes its place and
  // the sandbox provides `JCF` from the source, so the test needs no build. The nightly jobs run
  // the real script-tag build.
  const iife = '/* the script-tag build defines JCF here */'
  const smoke = read('fixtures/bundlers/smoke/smoke.js')
  /**
   * Runs an engine script in this realm (so the library's errors and the native ones are the same
   * classes), with `JCF` from the source and only the given output functions in scope.
   */
  const runScript = (script: string, output: { print?: unknown; console?: unknown }) =>
    new Function('JCF', 'print', 'console', script)(lib, output.print, output.console)

  it('runs one script: the script-tag build, the smoke check without exports, and a runner that prints through print or console.log [040 S1-AC3]', () => {
    const script = engineScript(iife, smoke)
    expect(script).not.toMatch(/^\s*(export|import)\b/m)
    expect(script.startsWith(iife)).toBe(true)
    let printed = ''
    runScript(script, { print: (s: string) => (printed += `${s}\n`) })
    expect(printed).toMatch(CLOSING)
    let logged = ''
    runScript(script, { console: { log: (s: string) => (logged += `${s}\n`) } })
    expect(logged).toBe(printed)
  })

  it('prints a failure line and no closing line when the check throws [040 S1-AC3] [040 S1-AC5]', () => {
    const failing = smoke.replace(
      'export function smoke(lib) {',
      "export function smoke(lib) {\n  throw new Error('boom')",
    )
    let printed = ''
    runScript(engineScript(iife, failing), { print: (s: string) => (printed += `${s}\n`) })
    expect(printed).toBe('smoke: failed: boom\n')
    expect(passed({ status: 0, stdout: printed })).toBe(false)
    expect(() => engineScript(iife, `import x from 'y'\n${smoke}`)).toThrow('import or export')
  })
})

describe('the update command', () => {
  const data = readEngines(read('fixtures/engines/engines.json'))
  const archive = new TextEncoder().encode('new archive')
  const fetched: string[] = []
  const fetchBytes = async (url: string) => {
    fetched.push(url)
    return archive
  }

  it('prints the new URL and SHA-256 of an engine version, offline with a given fetch [040 S1-AC6]', async () => {
    const { data: next, summary } = await updateEntry(
      data,
      'quickjs',
      '0.19.0',
      fetchBytes,
      async () => '',
    )
    const url = 'https://github.com/quickjs-ng/quickjs/releases/download/v0.19.0/qjs-linux-x86_64'
    expect(fetched).toContain(url)
    expect(summary).toBe(`quickjs: 0.18.0 → 0.19.0\n  url ${url}\n  sha256 ${sha256(archive)}`)
    expect(next.engines[0]).toMatchObject({
      version: '0.19.0',
      url,
      sha256: sha256(archive),
      binary: 'qjs-linux-x86_64',
    })
    expect(next.engines.slice(1)).toEqual(data.engines.slice(1))
    expect(data.engines[0]?.version).toBe('0.18.0')
    await expect(updateEntry(data, 'v8', '1', fetchBytes, async () => '')).rejects.toThrow(
      'no engine named v8',
    )
    await expect(updateEntry(data, 'xs', '1; rm', fetchBytes, async () => '')).rejects.toThrow(
      'unexpected version',
    )
  })

  it('resolves Hermes from a React Native version to the tag that release pins [040 S1-AC6]', async () => {
    const texts: string[] = []
    const { data: next, summary } = await updateEntry(
      data,
      'hermes',
      '0.89.0',
      fetchBytes,
      async (url) => {
        texts.push(url)
        return 'hermes-v270000000.0.1\n'
      },
    )
    expect(texts).toEqual([hermesTagUrl('0.89.0')])
    expect(next.hermes).toEqual({
      reactNative: '0.89.0',
      tag: 'hermes-v270000000.0.1',
      url: URLS.hermes('hermes-v270000000.0.1'),
      sha256: sha256(archive),
    })
    expect(summary).toContain('hermes-v260318099.0.5 → hermes-v270000000.0.1')
    await expect(
      updateEntry(data, 'hermes', '0.89.0', fetchBytes, async () => '<html>'),
    ).rejects.toThrow('unexpected Hermes tag')
  })

  it('writes engines.json only with --write [040 S1-AC6]', () => {
    const cli = read('fixtures/engines/update.mjs')
    expect(cli).toMatch(/if \(process\.argv\.includes\('--write'\)\) \{\n\s+writeFileSync\(file/)
    expect(cli.match(/writeFileSync\(file/g)).toHaveLength(1)
  })
})

describe('the nightly engine jobs', () => {
  it('run each engine as its own nightly job that never blocks pull requests [040 S1-AC8] [040 S1-AC2]', () => {
    const nightly = read('.github/workflows/nightly.yml')
    const engines = job(nightly, 'engines')
    expect(engines).toContain('fail-fast: false')
    expect(engines).toContain('engine: [quickjs, javascriptcore, spidermonkey, xs]')
    expect(engines).toMatch(/ENGINE: \$\{\{ matrix\.engine \}\}/)
    expect(engines).toContain('run: node fixtures/engines/run.mjs "$ENGINE"')
    expect(engines).not.toMatch(/run: .*\$\{\{/)
    for (const workflow of ['ci.yml', 'release.yml', 'workflow-lint.yml']) {
      expect(read(`.github/workflows/${workflow}`), workflow).not.toContain(
        'fixtures/engines/run.mjs',
      )
    }
  })
})

describe('the Cloudflare Workers check', () => {
  it('runs the smoke check on every change in a job the site deploy waits for [040 S1-AC1]', () => {
    const ci = read('.github/workflows/ci.yml')
    const workers = job(ci, 'workers')
    expect(workers).not.toContain('if:')
    expect(workers).toContain('run: pnpm build')
    expect(workers).toMatch(
      /working-directory: fixtures\/workers\n\s+run: pnpm install --frozen-lockfile/,
    )
    expect(workers).toContain('run: node fixtures/workers/run.mjs')
    expect(job(ci, 'deploy')).toMatch(/needs: \[[^\]]*\bworkers\b/)
    const run = read('fixtures/workers/run.mjs')
    expect(run).toContain("import { passed } from '../engines/lib/engines.mjs'")
    expect(run).toContain("readFileSync(join(root, 'fixtures', 'bundlers', 'smoke', 'smoke.js')")
    expect(JSON.parse(read('fixtures/workers/package.json')).devDependencies).toEqual({
      miniflare: '4.20260730.0',
    })
  })
})

describe('the React Native check', () => {
  it("bundles the smoke check with Metro and React Native's preset, at the React Native release whose Hermes it runs on [040 S1-AC7]", () => {
    const pkg = JSON.parse(read('fixtures/react-native/package.json'))
    const { hermes } = readEngines(read('fixtures/engines/engines.json'))
    expect(pkg.devDependencies['@react-native/babel-preset']).toBe(hermes.reactNative)
    expect(Object.keys(pkg.devDependencies).sort()).toEqual([
      '@babel/runtime',
      '@react-native/babel-preset',
      'javascript-collections-framework',
      'metro',
    ])
    expect(pkg.devDependencies['javascript-collections-framework']).toBe('link:../..')
    expect(read('fixtures/react-native/babel.config.cjs')).toContain(
      "'module:@react-native/babel-preset'",
    )
    const entry = read('fixtures/react-native/entry.js')
    expect(entry).toContain("from 'javascript-collections-framework'")
    expect(entry).toContain("from '../bundlers/smoke/smoke.js'")
    expect(entry).toMatch(
      /smoke: ok \$\{counts\.collections\} collections, \$\{counts\.errors\} errors/,
    )
    const run = read('fixtures/react-native/run.mjs')
    expect(run).toContain("import { passed } from '../engines/lib/engines.mjs'")
    expect(run).toMatch(/dev: false,\n\s+minify: true/)
  })

  it('runs nightly after building Hermes, never on pull requests, with both fixtures audited [040 S1-AC7] [040 S1-AC8]', () => {
    const nightly = read('.github/workflows/nightly.yml')
    const rn = job(nightly, 'react-native')
    // Hermes is built once a night, in this job, which also runs the plain smoke check on it.
    expect(rn.indexOf('run: node fixtures/engines/run.mjs hermes')).toBeLessThan(
      rn.indexOf('run: node fixtures/react-native/run.mjs'),
    )
    const audit = job(nightly, 'engine-fixtures-audit')
    expect(audit).toMatch(/working-directory: fixtures\/workers\n\s+run: pnpm audit/)
    expect(audit).toMatch(/working-directory: fixtures\/react-native\n\s+run: pnpm audit/)
    expect(read('.github/workflows/ci.yml')).not.toContain('fixtures/react-native')
  })
})
