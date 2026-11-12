import { defineConfig } from 'tsdown'

// One source, three outputs, all ES2015 syntax:
//   dist/index.js         ESM          (import, bundlers, Node module-sync)
//   dist/index.cjs        CommonJS     (require on older Node, Jest)
//   dist/index.iife.js    IIFE, minified, global `JCF` (<script> from a CDN)
export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    target: 'es2015',
    platform: 'neutral',
    dts: true,
    sourcemap: true,
    clean: true,
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
