// The checks the release workflow runs after its approval and before it stages the package:
// each returns a reason to stop, and the facts they read are gathered by scripts/release-check.mjs.

/** The oldest npm with staged publishing (`npm stage publish`). */
export const MIN_NPM = '11.15.0'

/**
 * @typedef {object} ReleaseFacts
 * @property {string} name - The package name.
 * @property {string} version - The version in `package.json`.
 * @property {string} npmVersion - The output of `npm --version`.
 * @property {'published' | 'absent' | { error: string }} registry - From {@link registryState}.
 * @property {string} head - The commit being released.
 * @property {string} mainTip - The commit at the tip of `main` on the remote.
 * @property {string[]} changesets - From {@link pendingChangesets}.
 */

/**
 * Whether `version` is at least `minimum`, comparing `major.minor.patch` as numbers. A
 * pre-release of a version counts as lower than the version.
 * @param {string} version
 * @param {string} minimum
 * @returns {boolean}
 */
export function versionAtLeast(version, minimum) {
  const parse = (/** @type {string} */ v) => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?/.exec(v.trim())
    return match === null
      ? undefined
      : {
          parts: [Number(match[1]), Number(match[2]), Number(match[3])],
          pre: match[4] !== undefined,
        }
  }
  const a = parse(version)
  const b = parse(minimum)
  if (a === undefined || b === undefined) return false
  for (let i = 0; i < 3; i++) {
    const x = /** @type {number} */ (a.parts[i])
    const y = /** @type {number} */ (b.parts[i])
    if (x !== y) return x > y
  }
  return !a.pre || b.pre
}

/**
 * The names of the changesets not yet versioned: the `.md` files other than `README.md` whose
 * front matter names a package. An empty changeset (`---` twice) names none.
 * @param {ReadonlyMap<string, string>} files - Each file name in `.changeset/` and its text.
 * @returns {string[]}
 */
export function pendingChangesets(files) {
  /** @type {string[]} */
  const pending = []
  for (const [name, text] of files) {
    if (!name.endsWith('.md') || name === 'README.md') continue
    const front = /^---\r?\n([\s\S]*?)\r?\n?---/.exec(text)
    if (front !== null && /\S/.test(front[1] ?? '')) pending.push(name)
  }
  return pending.sort()
}

/**
 * Whether `version` of package `name` is on the registry, from the outcome of
 * `npm view <name>@<version> version --json`: the version printed means published; nothing
 * printed (the package has no such version) or `E404` (no such package) means absent; any
 * other failure is an error.
 * @param {string} name
 * @param {string} version
 * @param {(spec: string) => { ok: true, stdout: string } | { ok: false, stderr: string }} run
 * @returns {'published' | 'absent' | { error: string }}
 */
export function registryState(name, version, run) {
  const result = run(`${name}@${version}`)
  if (!result.ok) {
    if (/\bE404\b/.test(result.stderr)) return 'absent'
    return { error: result.stderr.trim() || 'npm view failed with no output' }
  }
  const out = result.stdout.trim()
  if (out === '') return 'absent'
  try {
    const value = JSON.parse(out)
    if (value === version || (Array.isArray(value) && value.includes(version))) return 'published'
  } catch {
    // Not JSON: reported below.
  }
  return { error: `npm view printed ${JSON.stringify(out)}, not the version ${version}` }
}

/**
 * Every reason the release must stop: an npm without staged publishing, a registry error, a
 * version already published, a commit that is not the tip of `main`, and changesets not yet
 * versioned.
 * @param {ReleaseFacts} facts
 * @returns {string[]}
 */
export function releaseProblems(facts) {
  /** @type {string[]} */
  const problems = []
  if (!versionAtLeast(facts.npmVersion, MIN_NPM))
    problems.push(
      `release: npm ${facts.npmVersion.trim()} is older than ${MIN_NPM}, which staged publishing needs`,
    )
  if (typeof facts.registry === 'object')
    problems.push(`release: the npm registry check failed: ${facts.registry.error}`)
  else if (facts.registry === 'published')
    problems.push(`release: ${facts.name}@${facts.version} is already published`)
  if (facts.head === '' || facts.head !== facts.mainTip)
    problems.push(
      `release: ${facts.head || '(unknown commit)'} is not the tip of main (${facts.mainTip || 'unknown'})`,
    )
  if (facts.changesets.length > 0)
    problems.push(
      `release: .changeset/ holds changesets not yet versioned: ${facts.changesets.join(', ')}`,
    )
  return problems
}
