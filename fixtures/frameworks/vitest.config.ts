import { defineConfig } from 'vitest/config'

export default defineConfig({
  // The apps run in a browser-like DOM, so packages resolve to their browser builds (Svelte's
  // `mount` exists only there).
  resolve: { conditions: ['browser'] },
  test: {
    environment: 'jsdom',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.compiled/**'],
  },
})
