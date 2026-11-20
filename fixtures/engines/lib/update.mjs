// Moves an engine in engines.json to a new version: builds its download URL, downloads it, and
// reports the new URL and SHA-256 for review. The download and the lookup of the Hermes tag are
// passed in, so the logic runs offline in tests.

import { sha256 } from './engines.mjs'

/** Each engine's Linux x64 download for a version. */
export const URLS = {
  quickjs: (/** @type {string} */ v) =>
    `https://github.com/quickjs-ng/quickjs/releases/download/v${v}/qjs-linux-x86_64`,
  javascriptcore: (/** @type {string} */ v) =>
    `https://webkitgtk.org/jsc-built-products/x86_64/release/${v}.zip`,
  spidermonkey: (/** @type {string} */ v) =>
    `https://archive.mozilla.org/pub/firefox/releases/${v}/jsshell/jsshell-linux-x86_64.zip`,
  xs: (/** @type {string} */ v) =>
    `https://github.com/Moddable-OpenSource/moddable/releases/download/${v}/xst-lin64.zip`,
  hermes: (/** @type {string} */ tag) =>
    `https://github.com/facebook/hermes/archive/refs/tags/${tag}.tar.gz`,
}

/** Where React Native records the Hermes tag it ships, at a React Native version. */
export const hermesTagUrl = (/** @type {string} */ reactNative) =>
  `https://raw.githubusercontent.com/facebook/react-native/v${reactNative}/packages/react-native/sdks/.hermesv1version`

/**
 * engines.json with `name` moved to `version`, and a summary of the change.
 * @param {import('./engines.mjs').Engines} data
 * @param {string} name - An engine name, or `hermes` (then `version` is a React Native version).
 * @param {string} version
 * @param {(url: string) => Promise<Uint8Array>} fetchBytes
 * @param {(url: string) => Promise<string>} fetchText
 * @returns {Promise<{ data: import('./engines.mjs').Engines, summary: string }>}
 */
export async function updateEntry(data, name, version, fetchBytes, fetchText) {
  if (!/^[0-9A-Za-z.@_-]+$/.test(version)) throw new Error(`update: unexpected version ${version}`)
  if (name === 'hermes') {
    const tag = (await fetchText(hermesTagUrl(version))).trim()
    if (!/^hermes-v[0-9.]+$/.test(tag)) throw new Error(`update: unexpected Hermes tag ${JSON.stringify(tag)}`)
    const url = URLS.hermes(tag)
    const hermes = { reactNative: version, tag, url, sha256: sha256(await fetchBytes(url)) }
    return {
      data: { ...data, hermes },
      summary: `hermes: React Native ${data.hermes.reactNative} → ${version}, ${data.hermes.tag} → ${tag}\n  url ${url}\n  sha256 ${hermes.sha256}`,
    }
  }
  const template = URLS[/** @type {keyof typeof URLS} */ (name)]
  const index = data.engines.findIndex((e) => e.name === name)
  if (template === undefined || index < 0) throw new Error(`update: no engine named ${name}`)
  const old = /** @type {import('./engines.mjs').EngineEntry} */ (data.engines[index])
  const url = template(version)
  const entry = { ...old, version, url, sha256: sha256(await fetchBytes(url)) }
  const engines = data.engines.map((e, i) => (i === index ? entry : e))
  return {
    data: { ...data, engines },
    summary: `${name}: ${old.version} → ${version}\n  url ${url}\n  sha256 ${entry.sha256}`,
  }
}
