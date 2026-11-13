// The TypeScript versions and module settings the consumer check runs, and the compiler options
// every run uses. Shared by scripts/old-typescript.mjs and its tests.

/** Each compiler: its label, its major version and its command-line entry under node_modules. */
export const COMPILERS = [
  { label: '5.0', major: 5, bin: 'typescript-5.0/bin/tsc' },
  { label: '5.4', major: 5, bin: 'typescript-5.4/bin/tsc' },
  { label: '5.9', major: 5, bin: 'typescript-5.9/bin/tsc' },
  { label: '6.0', major: 6, bin: 'typescript/bin/tsc' },
  { label: '7.0', major: 7, bin: 'typescript-7.0/bin/tsc' },
]

/** Each module setting: the consumer file it compiles and the compiler options it adds. */
export const MODES = [
  { label: 'bundler', file: 'consumer.ts', module: 'esnext', resolution: 'bundler', below: 99 },
  { label: 'node16 ESM', file: 'consumer.mts', module: 'node16', resolution: 'node16', below: 99 },
  { label: 'node16 CJS', file: 'consumer.cts', module: 'node16', resolution: 'node16', below: 99 },
  { label: 'node10', file: 'consumer.ts', module: 'commonjs', resolution: 'node10', below: 6 },
]

/**
 * The tsconfig for one module setting: strict, library declarations checked, ES2016 library only.
 * @param {(typeof MODES)[number]} mode
 */
export function tsconfigFor(mode) {
  return {
    compilerOptions: {
      target: 'es2016',
      lib: ['es2016'],
      module: mode.module,
      moduleResolution: mode.resolution,
      strict: true,
      skipLibCheck: false,
      noEmit: true,
      types: [],
    },
    files: [mode.file],
  }
}

/** @typedef {(typeof COMPILERS)[number]} Compiler */
/** @typedef {(typeof MODES)[number]} Mode */
/** @typedef {{ status: 'ok' | 'fail' | 'missing', output: string }} RunResult */

/**
 * Runs every compiler × mode it supports through `run`, and collects the table and the failures.
 * Any failing or missing compiler fails the whole check.
 * @param {(compiler: Compiler, mode: Mode) => RunResult} run
 * @returns {{ ok: boolean, table: string, failures: string[] }}
 */
export function runMatrix(run) {
  /** @type {string[]} */
  const failures = []
  const rows = [['TypeScript', ...MODES.map((m) => m.label)]]
  for (const compiler of COMPILERS) {
    const row = [compiler.label]
    for (const mode of MODES) {
      if (compiler.major >= mode.below) {
        row.push('—')
        continue
      }
      const result = run(compiler, mode)
      if (result.status === 'ok') {
        row.push('ok')
      } else if (result.status === 'missing') {
        row.push('missing')
        failures.push(`TypeScript ${compiler.label} is not installed (${compiler.bin})`)
      } else {
        row.push('FAIL')
        failures.push(`TypeScript ${compiler.label}, ${mode.label}:\n${result.output}`)
      }
    }
    rows.push(row)
  }
  const widths = (rows[0] ?? []).map((_, c) => Math.max(...rows.map((r) => (r[c] ?? '').length)))
  const table = rows
    .map((row) =>
      row
        .map((cell, c) => cell.padEnd(widths[c] ?? 0))
        .join('  ')
        .trimEnd(),
    )
    .join('\n')
  return { ok: failures.length === 0, table, failures }
}
