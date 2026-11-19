import { defineConfig } from 'vitest/config'

// Node.js side of the fixtures: the smoke check's sanity run, the bundler builds and the
// tree-shaking check. The browser runs use browser/vitest.config.ts.
export default defineConfig({
  test: {
    include: ['*.test.ts', 'smoke/*.node.test.ts'],
    exclude: ['node_modules/**', '**/.out/**'],
    testTimeout: 120_000,
    hookTimeout: 300_000,
  },
})
