// Runs the recipes (examples/recipes/*.mjs) against the built package and checks that each line
// they print is the text of the result comment of its `console.log`. Each file is fed to Node from
// the repository root, so its import of the package by name resolves to this package's own build.
// Run after `pnpm build`; name files to run only those.
//   node scripts/recipes.mjs [top-k.mjs ...]

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RECIPES, RECIPES_DIR, runRecipe } from './lib/recipes.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const files = process.argv.length > 2 ? process.argv.slice(2) : RECIPES.map((r) => r.file)

/** @type {string[]} */
const problems = []
for (const file of files) {
  const name = `${RECIPES_DIR}/${file}`
  const source = readFileSync(join(root, RECIPES_DIR, file), 'utf8')
  problems.push(...runRecipe(name, source, root))
}
if (problems.length > 0) {
  for (const problem of problems) console.error(`recipes: ${problem}`)
  process.exit(1)
}
console.log(
  `recipes: ${files.length} of ${RECIPES.length} run against the build and print their comments`,
)
