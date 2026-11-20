// Checks the published types with are-the-types-wrong on a real tarball of the package, packed
// into a temporary directory, so the check also runs inside `npm publish --dry-run`.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { packTarball } from './lib/pack-tarball.mjs'

const root = join(import.meta.dirname, '..')
const cli = join(root, 'node_modules', '@arethetypeswrong', 'cli')
const bin = JSON.parse(readFileSync(join(cli, 'package.json'), 'utf8')).bin.attw
const dir = mkdtempSync(join(tmpdir(), 'check-types-'))
let code = 0
try {
  const tarball = packTarball(root, dir)
  execFileSync(process.execPath, [join(cli, bin), tarball], { stdio: 'inherit' })
} catch (error) {
  code = typeof error?.status === 'number' ? error.status : 1
  if (typeof error?.status !== 'number') console.error(`check-types: ${error?.message ?? error}`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
process.exitCode = code
