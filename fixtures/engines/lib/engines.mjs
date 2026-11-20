// The engine checks: which engine archives are trusted (by SHA-256), what counts as a passed run,
// and the one script each engine runs. Nothing here downloads or runs a process, so every decision
// can be checked offline.

import { createHash } from 'node:crypto'

/**
 * @typedef {object} EngineEntry
 * @property {string} name - `quickjs`, `javascriptcore`, `spidermonkey` or `xs`.
 * @property {string} version
 * @property {string} url - The Linux x64 archive (or single binary) at that version.
 * @property {string} sha256 - Hex SHA-256 of the downloaded bytes.
 * @property {string} binary - The engine's path inside the unpacked archive.
 * @property {string[]} args - Arguments before the script path.
 * @property {Record<string, string>} [env] - Extra environment, relative paths from the unpacked
 *   directory (for example a library path).
 */

/**
 * @typedef {object} HermesEntry
 * @property {string} reactNative - The React Native release whose Hermes this is.
 * @property {string} tag - The Hermes tag that release pins.
 * @property {string} url - The source archive of that tag.
 * @property {string} sha256
 */

/** @typedef {{ engines: EngineEntry[], hermes: HermesEntry }} Engines */

const ENGINE_FIELDS = /** @type {const} */ (['name', 'version', 'url', 'sha256', 'binary'])
const HERMES_FIELDS = /** @type {const} */ (['reactNative', 'tag', 'url', 'sha256'])
const SHA256 = /^[0-9a-f]{64}$/

/**
 * Reads `engines.json`, checking that every entry is complete.
 * @param {string} text
 * @returns {Engines}
 */
export function readEngines(text) {
  const data = JSON.parse(text)
  if (!Array.isArray(data.engines)) throw new Error('engines.json: "engines" must be an array')
  for (const [i, entry] of data.engines.entries()) {
    for (const field of ENGINE_FIELDS) {
      if (typeof entry?.[field] !== 'string' || entry[field] === '')
        throw new Error(`engines.json: engines[${i}] has no ${field}`)
    }
    if (!SHA256.test(entry.sha256)) throw new Error(`engines.json: ${entry.name} has a malformed sha256`)
    if (!entry.url.startsWith('https://')) throw new Error(`engines.json: ${entry.name} url is not https`)
    if (!Array.isArray(entry.args)) throw new Error(`engines.json: ${entry.name} has no args array`)
  }
  for (const field of HERMES_FIELDS) {
    if (typeof data.hermes?.[field] !== 'string' || data.hermes[field] === '')
      throw new Error(`engines.json: hermes has no ${field}`)
  }
  if (!SHA256.test(data.hermes.sha256)) throw new Error('engines.json: hermes has a malformed sha256')
  if (!data.hermes.url.startsWith('https://')) throw new Error('engines.json: hermes url is not https')
  return data
}

/**
 * The hex SHA-256 of `bytes`.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Returns `bytes` when their SHA-256 is `expected`; otherwise throws before anything is unpacked.
 * @param {string} name - The engine, for the message.
 * @param {Uint8Array} bytes
 * @param {string} expected
 * @returns {Uint8Array}
 */
export function checkArchive(name, bytes, expected) {
  const actual = sha256(bytes)
  if (actual !== expected)
    throw new Error(`engines: ${name} archive SHA-256 is ${actual}, expected ${expected}`)
  return bytes
}

/** The last line of a passed smoke check. */
export const CLOSING = /^smoke: ok (\d+) collections, (\d+) errors$/m

/**
 * Whether an engine run passed: it exited with status 0 and printed the closing line. Some shells
 * exit 0 after an uncaught error, so the status alone proves nothing.
 * @param {{ status: number | null, stdout: string }} run
 * @returns {boolean}
 */
export function passed(run) {
  return run.status === 0 && CLOSING.test(run.stdout)
}

/**
 * One classic script for an engine shell: the script-tag build (which defines `JCF`), the smoke
 * check with its `export` keywords removed, and a runner that prints the closing line through
 * `print` or `console.log`, whichever the engine has.
 * @param {string} iife - The text of `dist/index.iife.js`.
 * @param {string} smokeSource - The text of `fixtures/bundlers/smoke/smoke.js`.
 * @returns {string}
 */
export function engineScript(iife, smokeSource) {
  const smoke = smokeSource.replace(/^export (const|function) /gm, '$1 ')
  if (/^\s*(export|import)\b/m.test(smoke))
    throw new Error('engines: the smoke check has an import or export the script cannot hold')
  return [
    iife,
    ';(function () {',
    smoke,
    `var out = typeof print === 'function' ? print : function (line) { console.log(line) }`,
    'try {',
    '  var counts = smoke(JCF)',
    "  out('smoke: ok ' + counts.collections + ' collections, ' + counts.errors + ' errors')",
    '} catch (error) {',
    "  out('smoke: failed: ' + (error && error.message ? error.message : String(error)))",
    '}',
    '})()',
    '',
  ].join('\n')
}
