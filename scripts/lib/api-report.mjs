// The API report command's logic, for a given repository root, so it can be tested on a small tree.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { firstDifference, lineDiff, normaliseDts, publishedInternals } from './normalise-dts.mjs'

export const REPORT_PATH = 'api/javascript-collections-framework.api.d.ts'

/**
 * Checks the build's declarations against the committed report, or rewrites the report.
 * @param {string} root the repository root (holds dist/ and api/)
 * @param {'check' | 'update'} mode
 * @returns {{ ok: boolean, message: string }}
 */
export function apiReport(root, mode) {
  const esm = join(root, 'dist', 'index.d.ts')
  const cjs = join(root, 'dist', 'index.d.cts')
  const reportFile = join(root, REPORT_PATH)

  for (const [file, name] of [
    [esm, 'dist/index.d.ts'],
    [cjs, 'dist/index.d.cts'],
  ]) {
    if (!existsSync(/** @type {string} */ (file))) {
      return { ok: false, message: `${name} is missing — run pnpm build first` }
    }
  }

  const raw = readFileSync(esm, 'utf8')
  const internals = publishedInternals(raw)
  if (internals.length > 0) {
    return {
      ok: false,
      message:
        `dist/index.d.ts publishes what should stay internal:\n  ${internals.join('\n  ')}\n` +
        'Keep the member private without an @internal tag, or export the declaration.',
    }
  }

  const report = normaliseDts(raw)
  const cjsDifference = firstDifference(report, normaliseDts(readFileSync(cjs, 'utf8')))
  if (cjsDifference !== undefined) {
    return {
      ok: false,
      message:
        `dist/index.d.cts differs from dist/index.d.ts at report line ${cjsDifference.line}:\n` +
        `  .d.ts:  ${cjsDifference.a}\n  .d.cts: ${cjsDifference.b}`,
    }
  }

  if (mode === 'update') {
    mkdirSync(dirname(reportFile), { recursive: true })
    writeFileSync(reportFile, report)
    return { ok: true, message: `wrote ${REPORT_PATH}` }
  }

  if (!existsSync(reportFile)) {
    return { ok: false, message: 'no committed report — run pnpm api:update and commit it' }
  }
  const committed = readFileSync(reportFile, 'utf8').replace(/\r\n?/g, '\n')
  if (committed !== report) {
    return {
      ok: false,
      message:
        'the public type surface differs from the committed report (- committed, + build):\n' +
        `${lineDiff(committed, report)}\n` +
        'If the change is intended, update the report with: pnpm api:update\n' +
        'and add a changeset with the version bump the change needs.',
    }
  }
  return { ok: true, message: 'matches the committed report' }
}
