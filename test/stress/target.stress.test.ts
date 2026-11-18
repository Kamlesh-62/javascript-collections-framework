import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ArrayList } from '../../src/index'
import { TARGET } from './target'

const built = (file: string) => fileURLToPath(new URL(`../../dist/${file}`, import.meta.url))

describe('the stress target', () => {
  it('runs the stress suites against the source, or against the built file the project names [033 S3-AC1]', async () => {
    if (TARGET === 'esm') {
      const esm = await import(pathToFileURL(built('index.js')).href)
      expect(ArrayList).toBe(esm.ArrayList)
    } else if (TARGET === 'cjs') {
      const cjs = createRequire(import.meta.url)(built('index.cjs'))
      expect(ArrayList).toBe(cjs.ArrayList)
    } else {
      expect(TARGET).toBe('src')
      // The alias matches only the public entry, so this path always loads the source module.
      const source = await import('../../src/collections/array-list')
      expect(ArrayList).toBe(source.ArrayList)
    }
  })
})
