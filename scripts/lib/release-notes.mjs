// The notes of a GitHub release: the version's section of CHANGELOG.md with its relative links made
// absolute at the released commit, the install command, and the CDN snippet.

import { PACKAGE, readSnippet, snippetFor } from './cdn-snippet.mjs'

/** The `repository.url` form in `package.json` that release notes accept. */
export const REPOSITORY = /^git\+https:\/\/github\.com\/([\w.-]+\/[\w.-]+?)\.git$/

/**
 * The `owner/repo` of a `repository.url` such as `git+https://github.com/owner/repo.git`.
 * @param {string} url
 * @returns {string | undefined}
 */
export function repositoryOf(url) {
  return REPOSITORY.exec(url)?.[1]
}

/**
 * The lines after the line that is exactly `## <version>`, up to the next line starting `## ` or
 * the end of the text, with blank lines at both ends removed; undefined when no line matches.
 * @param {string} changelog
 * @param {string} version
 * @returns {string | undefined}
 */
export function changelogSection(changelog, version) {
  const lines = changelog.split(/\r?\n/)
  const heading = lines.indexOf(`## ${version}`)
  if (heading < 0) return undefined
  const next = lines.findIndex((line, i) => i > heading && line.startsWith('## '))
  const body = lines.slice(heading + 1, next < 0 ? undefined : next)
  while (body.length > 0 && (body[0] ?? '').trim() === '') body.shift()
  while (body.length > 0 && (body[body.length - 1] ?? '').trim() === '') body.pop()
  return body.join('\n')
}

/**
 * `markdown` with each relative link target made absolute under `base`: a target with no scheme
 * that does not start with `#` or `/` (so neither `/` nor `//`) becomes `<base>/<target>`, without
 * a leading `./`. Link text may span lines.
 * @param {string} markdown
 * @param {string} base - Such as `https://github.com/owner/repo/blob/<sha>`.
 * @returns {string}
 */
export function absoluteLinks(markdown, base) {
  return markdown.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (link, text, target) =>
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(target) || target.startsWith('#') || target.startsWith('/')
      ? link
      : `[${text}](${base}/${target.replace(/^\.\//, '')})`,
  )
}

/**
 * @typedef {object} NotesInput
 * @property {string} changelog - The text of `CHANGELOG.md`.
 * @property {string} readme - The text of `README.md` at the released commit.
 * @property {string} version - The version the notes are for.
 * @property {string} packageVersion - The version in `package.json`.
 * @property {string} repo - `owner/repo` on GitHub.
 * @property {string} sha - The full SHA of the released commit.
 * @property {string | undefined} integrity - A hash given by the caller, which wins over the README.
 */

/**
 * The notes for `version`: its changelog section with absolute links, then `### Install` with
 * the npm command, then `### CDN` with the snippet. The snippet's hash is `integrity` when given,
 * else the README's when `version` is the version in `package.json`, else none.
 * @param {NotesInput} input
 * @returns {{ notes: string } | { problem: string }}
 */
export function releaseNotes({ changelog, readme, version, packageVersion, repo, sha, integrity }) {
  const section = changelogSection(changelog, version)
  if (section === undefined)
    return { problem: `CHANGELOG.md has no '## ${version}' section for version ${version}` }
  let hash = integrity
  if (hash === undefined && version === packageVersion) {
    const snippet = readSnippet(readme)
    if (!('problems' in snippet)) hash = snippet.integrity
  }
  const notes = [
    absoluteLinks(section, `https://github.com/${repo}/blob/${sha}`),
    '',
    '### Install',
    '',
    '```sh',
    `npm install ${PACKAGE}@${version}`,
    '```',
    '',
    '### CDN',
    '',
    '```html',
    snippetFor(readme, version, hash),
    '```',
    '',
  ]
  return { notes: notes.join('\n') }
}
