import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The stress suites run in `pnpm test:stress` (vitest.stress.config.ts).
    exclude: [...configDefaults.exclude, 'test/stress/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
})
