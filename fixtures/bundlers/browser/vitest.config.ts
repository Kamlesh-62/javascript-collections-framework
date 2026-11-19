// Runs the smoke pages and the shared contract pairs in Chromium, Firefox and WebKit through
// Vitest browser mode, against the built package.

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '..')
const repository = join(fixtures, '..', '..')
const require = createRequire(join(fixtures, 'package.json'))

export default defineConfig({
  root: fixtures,
  resolve: {
    alias: [
      // The library's own contract suites import the source; here they get the built package.
      { find: /^(\.\.\/)+src\/index$/, replacement: 'javascript-collections-framework' },
      { find: /^node:util$/, replacement: join(fixtures, 'browser', 'node-util.ts') },
    ],
  },
  server: { fs: { allow: [repository] } },
  test: {
    include: ['smoke/*.browser.test.ts', 'browser/*.browser.test.ts'],
    globalSetup: ['browser/global-setup.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
    },
  },
})
