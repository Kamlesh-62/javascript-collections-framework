// The stress suites (`pnpm test:stress`, after `pnpm build`): the same files against the source and
// against each built file, plus the two builds loaded together. `pnpm test` never runs them.

import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const STRESS = ['test/stress/**/*.stress.test.ts']
const COPIES = 'test/stress/two-copies.stress.test.ts'
/** Only the public entry is redirected, so `src/internal` imports stay on the source. */
const ENTRY = /^(\.\.\/)+src\/index$/
/** Built files load as Node loads them for a user, without a transform. */
const server = { deps: { external: [/\/dist\//] } }

function build(name: 'esm' | 'cjs', file: string) {
  return {
    extends: true,
    resolve: { alias: [{ find: ENTRY, replacement: `${ROOT}dist/${file}` }] },
    test: {
      name,
      include: STRESS,
      exclude: [COPIES],
      env: { STRESS_TARGET: name },
      setupFiles: ['test/stress/require-build.ts'],
      server,
    },
  }
}

export default defineConfig({
  test: {
    // A hung run is stopped by the job's timeout; no test has a time limit of its own.
    testTimeout: 0,
    hookTimeout: 0,
    projects: [
      {
        extends: true,
        test: {
          name: 'src',
          include: STRESS,
          exclude: [COPIES],
          env: { STRESS_TARGET: 'src' },
        },
      },
      build('esm', 'index.js'),
      build('cjs', 'index.cjs'),
      {
        extends: true,
        test: {
          name: 'copies',
          include: [COPIES],
          setupFiles: ['test/stress/require-build.ts'],
          server,
        },
      },
    ],
  },
})
