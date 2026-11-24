// The README's `<script>` snippet: the one element in the "## Install" section that loads the
// script-tag build from jsDelivr, with the version in its `src` and the SHA-384 of that build in
// its `integrity` attribute.

import { createHash } from 'node:crypto'

/** The package name, as published on npm. */
export const PACKAGE = 'javascript-collections-framework'
/** The jsDelivr URL of the package, without a version. */
export const CDN = `https://cdn.jsdelivr.net/npm/${PACKAGE}`
/** The script-tag build, relative to the package root. */
export const IIFE = 'dist/index.iife.js'
/** A Subresource Integrity value for SHA-384: 48 bytes in base64, so 64 characters. */
export const INTEGRITY = /^sha384-[A-Za-z0-9+/]{64}$/

const escapeRegExp = (/** @type {string} */ text) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
const SRC = new RegExp(`\\ssrc="${escapeRegExp(CDN)}@([^/"]*)/${escapeRegExp(IIFE)}"`)

/**
 * The Subresource Integrity value of `bytes`: `sha384-` and the base64 SHA-384 digest.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function integrityOf(bytes) {
  return `sha384-${createHash('sha384').update(bytes).digest('base64')}`
}

/**
 * A `<script>` element loading `version` from the CDN; without `integrity`, it has no
 * `integrity` attribute.
 * @param {string} version
 * @param {string | undefined} integrity
 * @returns {string}
 */
export function snippetHtml(version, integrity) {
  const src = `<script src="${CDN}@${version}/${IIFE}"`
  return integrity === undefined
    ? `${src} crossorigin="anonymous"></script>`
    : `${src}\n        integrity="${integrity}" crossorigin="anonymous"></script>`
}

/**
 * The offsets of the README's "## Install" section, from its heading to the next `## ` heading
 * or the end of the text.
 * @param {string} readme
 * @returns {{ start: number, end: number } | undefined}
 */
export function installSection(readme) {
  const heading = /^## Install[ \t]*\r?$/m.exec(readme)
  if (heading === null) return undefined
  const start = heading.index
  const next = readme.slice(start + heading[0].length).search(/^## /m)
  return { start, end: next < 0 ? readme.length : start + heading[0].length + next }
}

/**
 * @typedef {object} Snippet
 * @property {string} version - The version in the `src` URL.
 * @property {string | undefined} integrity - The `integrity` value, if the attribute is present.
 * @property {boolean} crossorigin - Whether `crossorigin="anonymous"` is present.
 * @property {string} text - The element, from `<script` to `</script>`.
 * @property {number} start - The offset of the element in the README.
 * @property {number} end - The offset just past the element.
 */

/**
 * The one `<script>` element in the README's install section that loads the script-tag build from
 * the CDN, or the reasons it cannot be read: no install section, or a count other than one.
 * @param {string} readme
 * @returns {Snippet | { problems: string[] }}
 */
export function readSnippet(readme) {
  const section = installSection(readme)
  if (section === undefined) return { problems: ['README.md has no "## Install" section'] }
  const text = readme.slice(section.start, section.end)
  const found = [...text.matchAll(/<script\b([^>]*)>\s*<\/script>/g)].filter((m) =>
    (m[1] ?? '').includes(`src="${CDN}@`),
  )
  if (found.length !== 1)
    return {
      problems: [
        `README.md: the install section holds ${found.length} <script> elements loading ${CDN}, expected exactly one`,
      ],
    }
  const match = /** @type {RegExpExecArray} */ (found[0])
  const attributes = match[1] ?? ''
  const src = SRC.exec(attributes)
  if (src === null)
    return {
      problems: [`README.md: the CDN <script> does not load ${CDN}@<version>/${IIFE}`],
    }
  const integrity = /\sintegrity="([^"]*)"/.exec(attributes)
  const start = section.start + /** @type {number} */ (match.index)
  return {
    version: src[1] ?? '',
    integrity: integrity === null ? undefined : (integrity[1] ?? ''),
    crossorigin: /\scrossorigin="anonymous"/.test(attributes),
    text: match[0],
    start,
    end: start + match[0].length,
  }
}

/**
 * Every reason the README's snippet cannot be copied as it is for `version`: a placeholder, a
 * comment asking for a hash, another version, a missing or malformed `integrity`, a missing
 * `crossorigin`, or a snippet count other than one.
 * @param {string} readme
 * @param {string} version - The version in `package.json`.
 * @returns {string[]}
 */
export function snippetProblems(readme, version) {
  const snippet = readSnippet(readme)
  if ('problems' in snippet) return snippet.problems
  const section = /** @type {{ start: number, end: number }} */ (installSection(readme))
  const text = readme.slice(section.start, section.end)
  /** @type {string[]} */
  const problems = []
  if (text.includes('VERSION')) problems.push('README.md: the install section holds "VERSION"')
  if (text.includes('…')) problems.push('README.md: the install section holds "…"')
  if (/<!--[\s\S]*?integrity[\s\S]*?-->/i.test(text))
    problems.push('README.md: the install section has a comment asking for the integrity hash')
  if (snippet.version !== version)
    problems.push(
      `README.md: the CDN snippet loads version ${snippet.version}, package.json has ${version}`,
    )
  if (snippet.integrity === undefined)
    problems.push('README.md: the CDN snippet has no integrity attribute')
  else if (!INTEGRITY.test(snippet.integrity))
    problems.push(
      `README.md: the CDN snippet's integrity ${JSON.stringify(snippet.integrity)} is not sha384- followed by 64 base64 characters`,
    )
  if (!snippet.crossorigin)
    problems.push('README.md: the CDN snippet has no crossorigin="anonymous" attribute')
  return problems
}

/**
 * The README with the snippet's `src` version set to `version` and its `integrity` value set to
 * `integrity`; nothing else changes (an absent `integrity` attribute is added before `crossorigin`).
 * @param {string} readme
 * @param {string} version
 * @param {string} integrity
 * @returns {string}
 * @throws {Error} When the snippet cannot be read.
 */
export function writeSnippet(readme, version, integrity) {
  const snippet = readSnippet(readme)
  if ('problems' in snippet) throw new Error(snippet.problems.join('\n'))
  const text = snippet.text
    .replace(`${CDN}@${snippet.version}/`, `${CDN}@${version}/`)
    .replace(
      snippet.integrity === undefined ? /(\s)(crossorigin=|>)/ : /integrity="[^"]*"/,
      snippet.integrity === undefined
        ? `$1integrity="${integrity}" $2`
        : `integrity="${integrity}"`,
    )
  return readme.slice(0, snippet.start) + text + readme.slice(snippet.end)
}

/**
 * The README's snippet for `version` with `integrity`, for release notes: the element as the
 * README writes it, with the version and integrity value replaced (the attribute removed when
 * `integrity` is undefined), or {@link snippetHtml} when the README has no readable snippet.
 * @param {string} readme
 * @param {string} version
 * @param {string | undefined} integrity
 * @returns {string}
 */
export function snippetFor(readme, version, integrity) {
  const snippet = readSnippet(readme)
  if ('problems' in snippet) return snippetHtml(version, integrity)
  if (integrity !== undefined) {
    const written = writeSnippet(readme, version, integrity)
    return written.slice(snippet.start, written.length - (readme.length - snippet.end))
  }
  return snippet.text
    .replace(`${CDN}@${snippet.version}/`, `${CDN}@${version}/`)
    .replace(/\s+integrity="[^"]*"/, '')
}
