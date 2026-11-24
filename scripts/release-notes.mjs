// Prints the GitHub release notes for a version: its section of CHANGELOG.md with absolute links,
// the install command and the CDN snippet. Usage:
//   node scripts/release-notes.mjs <version> [--integrity sha384-<hash>]
// The snippet's hash is --integrity when given, else the README's for the version in package.json,
// else the snippet has no integrity attribute. Links point at GITHUB_SHA, else at HEAD.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { INTEGRITY } from './lib/cdn-snippet.mjs'
import { SHA, VERSION } from './lib/release-draft.mjs'
import { releaseNotes, repositoryOf } from './lib/release-notes.mjs'

const root = process.cwd()
/** @param {string} message @returns {never} */
function fail(message) {
  console.error(`release-notes: ${message}`)
  process.exit(1)
}

/** @type {string | undefined} */
let version
/** @type {string | undefined} */
let integrity
const args = process.argv.slice(2)
for (let i = 0; i < args.length; i++) {
  const arg = /** @type {string} */ (args[i])
  if (arg === '--integrity') {
    const value = args[++i]
    if (value === undefined || !INTEGRITY.test(value))
      fail(
        `--integrity must be sha384- followed by 64 base64 characters, got ${JSON.stringify(value ?? '')}`,
      )
    integrity = value
  } else if (arg.startsWith('-')) fail(`unknown flag ${arg}`)
  else if (version === undefined) version = arg
  else fail(`unexpected argument ${arg}; give one version`)
}
if (version === undefined) fail('give the version, as in: node scripts/release-notes.mjs 0.1.1')
if (!VERSION.test(version)) fail(`${JSON.stringify(version)} is not a version`)

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const repo = repositoryOf(String(pkg.repository?.url ?? ''))
if (repo === undefined) fail('package.json repository.url is not a GitHub repository URL')
const sha =
  process.env.GITHUB_SHA ??
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
if (!SHA.test(sha)) fail(`${JSON.stringify(sha)} is not a full commit SHA`)

const result = releaseNotes({
  changelog: readFileSync(join(root, 'CHANGELOG.md'), 'utf8'),
  readme: readFileSync(join(root, 'README.md'), 'utf8'),
  version,
  packageVersion: String(pkg.version),
  repo,
  sha,
  integrity,
})
if ('problem' in result) fail(result.problem)
process.stdout.write(result.notes)
