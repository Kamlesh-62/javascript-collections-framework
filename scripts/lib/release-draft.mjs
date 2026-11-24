// The draft GitHub release the release workflow creates after the package is staged on npm: it
// refuses when a release or draft for the tag exists, and builds the `gh release create` arguments.

/** A version as `package.json` holds it: `major.minor.patch` with an optional pre-release. */
export const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/
/** A full commit SHA. */
export const SHA = /^[0-9a-f]{40}$/

/**
 * @typedef {object} ReleaseEntry
 * @property {string} tagName
 * @property {string} name
 * @property {boolean} isDraft
 */

/**
 * The reasons not to create a draft for `tag`: each release, published or draft, whose tag or
 * title is `tag`.
 * @param {readonly ReleaseEntry[]} releases - From `gh release list --json tagName,name,isDraft`.
 * @param {string} tag
 * @returns {string[]}
 */
export function draftProblems(releases, tag) {
  return releases
    .filter((release) => release.tagName === tag || release.name === tag)
    .map(
      (release) =>
        `release-draft: a ${release.isDraft ? 'draft' : 'published'} release for ${tag} already exists (title ${JSON.stringify(release.name)}, tag ${release.tagName}); it was left unchanged`,
    )
}

/**
 * The arguments after `gh release create` for a draft titled and tagged `v<version>` at `sha`,
 * marked as a pre-release when the version has a `-`.
 * @param {{ version: string, sha: string, notesFile: string }} options
 * @returns {string[]}
 */
export function draftArgs({ version, sha, notesFile }) {
  const tag = `v${version}`
  return [
    tag,
    '--draft',
    '--target',
    sha,
    '--title',
    tag,
    '--notes-file',
    notesFile,
    ...(version.includes('-') ? ['--prerelease'] : []),
  ]
}
