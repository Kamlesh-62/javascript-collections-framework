// Builds the fixtures with each bundler's Node.js API, in production mode. `mode: 'app'` builds an
// entry as an application (minified where the bundler minifies); `mode: 'shake'` builds a single
// import for the tree-shaking check, with dead code removed but names and whitespace kept.

import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..')

/** The package's ES module build, as an `import` resolves it. */
const LIBRARY = fileURLToPath(import.meta.resolve('javascript-collections-framework'))

/** @param {string} dir */
function fresh(dir) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * webpack 5: production mode; for the shake build, its minifier with mangling off and the output
 * beautified, so dead code is removed and names stay.
 * @param {string} entry @param {string} outDir @param {'app' | 'shake'} mode
 */
export async function webpackBuild(entry, outDir, mode) {
  const { default: webpack } = await import('webpack')
  const compiler = webpack({
    mode: 'production',
    target: ['web', 'es2015'],
    entry,
    output: { path: fresh(outDir), filename: 'main.js' },
    optimization:
      mode === 'shake'
        ? {
            minimizeOptions: {
              javascript: { compress: { passes: 2 }, mangle: false, format: { beautify: true } },
            },
          }
        : {},
  })
  await new Promise((resolve, reject) => {
    compiler.run((error, stats) => {
      compiler.close(() => {})
      if (error) reject(error)
      else if (stats?.hasErrors()) reject(new Error(stats.toString('errors-only')))
      else resolve(undefined)
    })
  })
  return join(outDir, 'main.js')
}

/**
 * Rspack: production mode; for the shake build, its SWC minifier with mangling off and the
 * output not compressed into one line.
 * @param {string} entry @param {string} outDir @param {'app' | 'shake'} mode
 */
export async function rspackBuild(entry, outDir, mode) {
  const { rspack } = await import('@rspack/core')
  const compiler = rspack({
    mode: 'production',
    target: ['web', 'es2015'],
    entry: { main: entry },
    output: { path: fresh(outDir), filename: 'main.js' },
    optimization:
      mode === 'shake'
        ? {
            minimizer: [
              new rspack.SwcJsMinimizerRspackPlugin({
                minimizerOptions: {
                  compress: { passes: 2 },
                  mangle: false,
                  minify: false,
                  format: { beautify: true, comments: false },
                },
              }),
            ],
          }
        : {},
  })
  await new Promise((resolve, reject) => {
    compiler.run((error, stats) => {
      compiler.close(() => {})
      if (error) reject(error)
      else if (stats?.hasErrors()) reject(new Error(stats.toString('errors-only')))
      else resolve(undefined)
    })
  })
  return join(outDir, 'main.js')
}

/**
 * Vite, client: a production build of an HTML page (`app`), or of one module as a library
 * without minifying (`shake`). Returns the output folder for `app`, the bundle for `shake`.
 * @param {string} entry @param {string} outDir @param {'app' | 'shake'} mode
 */
export async function viteBuild(entry, outDir, mode) {
  const { build } = await import('vite')
  if (mode === 'app') {
    await build({
      configFile: false,
      logLevel: 'warn',
      root: dirname(entry),
      base: './',
      build: { outDir: fresh(outDir), emptyOutDir: true },
    })
    return outDir
  }
  await build({
    configFile: false,
    logLevel: 'warn',
    root: FIXTURES,
    build: {
      outDir: fresh(outDir),
      minify: false,
      lib: { entry, formats: ['es'], fileName: () => 'main.js' },
    },
  })
  return join(outDir, 'main.js')
}

/**
 * Vite, server: an SSR build with the library bundled in, not left as an import.
 * @param {string} entry @param {string} outDir
 */
export async function viteSsrBuild(entry, outDir) {
  const { build } = await import('vite')
  await build({
    configFile: false,
    logLevel: 'warn',
    root: dirname(entry),
    ssr: { noExternal: true },
    build: {
      outDir: fresh(outDir),
      ssr: entry,
      rollupOptions: { output: { entryFileNames: 'server.mjs' } },
    },
  })
  return join(outDir, 'server.mjs')
}

/**
 * esbuild: a bundle for browsers, minified (`app`) or not (`shake`).
 * @param {string} entry @param {string} outDir @param {'app' | 'shake'} mode
 */
export async function esbuildBuild(entry, outDir, mode) {
  const esbuild = await import('esbuild')
  const outfile = join(fresh(outDir), 'main.js')
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: mode === 'app' ? 'iife' : 'esm',
    platform: 'browser',
    target: 'es2015',
    minify: mode === 'app',
    define: { 'process.env.NODE_ENV': '"production"' },
    outfile,
    logLevel: 'silent',
  })
  return outfile
}

/**
 * Rollup: tree-shaken, the package resolved by a small plugin to its ES module build (no
 * resolver plugin is installed).
 * @param {string} entry @param {string} outDir @param {'app' | 'shake'} mode
 */
export async function rollupBuild(entry, outDir, mode) {
  const { rollup } = await import('rollup')
  const bundle = await rollup({
    input: entry,
    treeshake: true,
    plugins: [
      {
        name: 'library',
        resolveId: (source) => (source === 'javascript-collections-framework' ? LIBRARY : null),
      },
    ],
  })
  const file = join(fresh(outDir), 'main.js')
  await bundle.write({ file, format: mode === 'app' ? 'iife' : 'es' })
  await bundle.close()
  return file
}

/**
 * Next.js: a production build of the app in `dir`.
 * @param {string} dir
 */
export function nextBuild(dir) {
  return run(process.execPath, [nextCli(), 'build'], dir)
}

/** The Next.js command-line entry of the installed package. */
export function nextCli() {
  return fileURLToPath(import.meta.resolve('next/dist/bin/next'))
}

/**
 * Runs a command, rejecting with its output when it fails.
 * @param {string} command @param {string[]} args @param {string} cwd
 */
export function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve(output) : reject(new Error(`${command} ${args.join(' ')}:\n${output}`)),
    )
  })
}
