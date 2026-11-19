import { defineConfig } from 'tsdown'

// One source, three outputs, all ES2015 syntax:
//   dist/index.js         ESM, one file per module (import, bundlers, Node module-sync);
//                         the other modules sit beside it under dist/, mirroring src/
//   dist/index.cjs        CommonJS, single file (require on older Node, Jest)
//   dist/index.iife.js    IIFE, single file, minified, global `JCF` (<script> from a CDN)
//   dist/index.d.ts       types for import, single file
//   dist/index.d.cts      types for require, single file
//
// The ES module build keeps one file per module so that bundlers which keep every class of a
// file they import (esbuild) still leave out the collections that are not imported.
export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: 'esm',
    unbundle: true,
    root: 'src',
    target: 'es2015',
    platform: 'neutral',
    dts: false,
    sourcemap: true,
    clean: true,
    fixedExtension: false,
  },
  {
    entry: { index: 'src/index.ts' },
    format: 'esm',
    target: 'es2015',
    platform: 'neutral',
    dts: { dtsOnly: true },
    clean: false,
    fixedExtension: false,
  },
  {
    entry: { index: 'src/index.ts' },
    format: 'cjs',
    target: 'es2015',
    platform: 'neutral',
    dts: true,
    sourcemap: true,
    clean: false,
    fixedExtension: false,
  },
  {
    entry: { index: 'src/index.ts' },
    format: 'iife',
    globalName: 'JCF',
    target: 'es2015',
    platform: 'browser',
    minify: true,
    sourcemap: true,
    clean: false,
    dts: false,
    outExtensions: () => ({ js: '.js' }),
  },
])
