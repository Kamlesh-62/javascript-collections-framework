import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The stress suites run in `pnpm test:stress` (vitest.stress.config.ts).
    exclude: [...configDefaults.exclude, 'test/stress/**'],
    // A few tests build collections of a million elements or a 1 MB string; on a loaded machine
    // they can pass the 5-second default. Tests never measure time, so a longer limit changes no
    // result, only how long a stuck test takes to report.
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // json-summary gives the figure of the coverage badge (scripts/site-coverage.mjs).
      reporter: ['text', 'html', 'clover', 'json', 'json-summary'],
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
})
