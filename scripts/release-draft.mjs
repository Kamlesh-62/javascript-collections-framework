// Run by the release workflow after the package is staged on npm: creates a draft GitHub release
// titled v<version> for the tag v<version> at GITHUB_SHA, with notes from CHANGELOG.md and the
// README's CDN snippet. Stops, changing nothing, when a release or draft for that tag exists.
// Publishing the draft, which creates the tag, is left to the maintainer.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { draftArgs, draftProblems, SHA, VERSION } from './lib/release-draft.mjs'
import { releaseNotes, repositoryOf } from './lib/release-notes.mjs'

const root = process.cwd()
/** @param {string} message @returns {never} */
function fail(message) {
  console.error(message)
  process.exit(1)
}

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const version = String(pkg.version)
const sha = process.env.GITHUB_SHA ?? ''
const repo = repositoryOf(String(pkg.repository?.url ?? ''))
// The version and commit reach a command line, so only plain versions and full SHAs pass.
if (!VERSION.test(version))
  fail(`release-draft: package.json has an unexpected version: ${version}`)
if (!SHA.test(sha))
  fail(`release-draft: GITHUB_SHA is not a full commit SHA: ${JSON.stringify(sha)}`)
if (repo === undefined) fail('release-draft: package.json repository.url is not a GitHub URL')
const tag = `v${version}`

/** @param {string[]} args */
const gh = (args) =>
  execFileSync('gh', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })

const releases = JSON.parse(
  gh(['release', 'list', '--json', 'tagName,name,isDraft', '--limit', '1000']),
)
const problems = draftProblems(releases, tag)
if (problems.length > 0) fail(problems.join('\n'))

const result = releaseNotes({
  changelog: readFileSync(join(root, 'CHANGELOG.md'), 'utf8'),
  readme: readFileSync(join(root, 'README.md'), 'utf8'),
  version,
  packageVersion: version,
  repo,
  sha,
  integrity: undefined,
})
if ('problem' in result) fail(`release-draft: ${result.problem}`)

const dir = mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), 'release-notes-'))
try {
  const notesFile = join(dir, 'notes.md')
  writeFileSync(notesFile, result.notes)
  console.log(gh(['release', 'create', ...draftArgs({ version, sha, notesFile })]).trim())
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log(`release-draft: drafted ${tag} at ${sha}; publish it after approving ${version} on npm`)
