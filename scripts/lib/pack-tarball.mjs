// Packs the package into a tarball in a directory of its own. npm sets `npm_config_dry_run=true`
// for the lifecycle scripts of `npm publish --dry-run`, and a dry-run `npm pack` writes nothing;
// the type check needs a real tarball, so the setting is forced off for this one command.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Packs the package in `root` into `dir` without running any script, whatever the npm dry-run
 * setting in `env`, and returns the tarball's path.
 * @param {string} root - The package directory.
 * @param {string} dir - An existing directory that receives the tarball.
 * @param {NodeJS.ProcessEnv} [env] - The environment npm runs with; it is copied, not changed.
 * @returns {string}
 */
export function packTarball(root, dir, env = process.env) {
  const windows = process.platform === 'win32'
  /** @type {NodeJS.ProcessEnv} */
  const packEnv = { ...env, npm_config_dry_run: 'false' }
  // The arguments are constants and a directory this script created; on Windows the npm shim is
  // a .cmd file, which needs a shell, so the directory is quoted.
  const destination = windows ? `"${dir}"` : dir
  const out = execFileSync(
    windows ? 'npm.cmd' : 'npm',
    ['pack', '--pack-destination', destination, '--ignore-scripts', '--json'],
    {
      cwd: root,
      encoding: 'utf8',
      env: packEnv,
      shell: windows,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const [result] = JSON.parse(out)
  const tarball = join(dir, result.filename)
  if (!existsSync(tarball)) throw new Error(`npm pack wrote no tarball to ${dir}`)
  return tarball
}
