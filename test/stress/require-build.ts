// Stops a build run early, with the fix, when the package has not been built.

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

for (const file of ['index.js', 'index.cjs']) {
  const path = fileURLToPath(new URL(`../../dist/${file}`, import.meta.url))
  if (!existsSync(path)) {
    throw new Error(`stress: dist/${file} is missing — run pnpm build first`)
  }
}
