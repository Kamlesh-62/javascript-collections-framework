import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The library is linked from the repository root, two folders up, so the build reads from there.
const repository = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

export default {
  turbopack: { root: repository },
  outputFileTracingRoot: repository,
}
