// Run by the release workflow after its approval, right before it stages the package: stops the
// release, naming each reason, if npm cannot stage, the version is already published, the commit
// is not the tip of main, or changesets are waiting to be versioned.

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pendingChangesets, registryState, releaseProblems } from './lib/release-check.mjs'

const root = join(import.meta.dirname, '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const name = String(pkg.name)
const version = String(pkg.version)
// The name and version reach a command line, so only plain package names and versions pass.
if (!/^[a-z0-9][a-z0-9._-]*$/.test(name) || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`release: package.json has an unexpected name or version: ${name}@${version}`)
  process.exit(1)
}

/** @param {string} file @param {string[]} args */
const run = (file, args) =>
  execFileSync(file, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

const changesetDir = join(root, '.changeset')
const changesets = pendingChangesets(
  new Map(
    readdirSync(changesetDir).map((file) => [file, readFileSync(join(changesetDir, file), 'utf8')]),
  ),
)
const tip = /^([0-9a-f]{40})\s+refs\/heads\/main$/m.exec(
  run('git', ['ls-remote', 'origin', 'refs/heads/main']),
)

const problems = releaseProblems({
  name,
  version,
  npmVersion: run('npm', ['--version']),
  registry: registryState(name, version, (spec) => {
    try {
      return { ok: true, stdout: run('npm', ['view', spec, 'version', '--json']) }
    } catch (error) {
      return {
        ok: false,
        stderr: String(/** @type {{ stderr?: unknown }} */ (error).stderr ?? error),
      }
    }
  }),
  head: process.env.GITHUB_SHA ?? run('git', ['rev-parse', 'HEAD']).trim(),
  mainTip: tip?.[1] ?? '',
  changesets,
})

if (problems.length > 0) {
  for (const problem of problems) console.error(problem)
  process.exit(1)
}
console.log(
  `release: ${name}@${version} from ${process.env.GITHUB_SHA ?? 'HEAD'} is ready to stage`,
)
