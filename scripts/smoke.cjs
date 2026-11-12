// Loads the CommonJS build. `require('javascript-collections-framework')` resolves to the ESM
// file on Node 20.19+/22.12+ (module-sync), so the .cjs file is also required directly to
// prove it loads on every runtime.
const byName = require('javascript-collections-framework')
const cjsFile = require('../dist/index.cjs')
if (typeof byName !== 'object' || typeof cjsFile !== 'object')
  throw new Error('smoke: CommonJS entry did not load')
if (Object.keys(byName).sort().join() !== Object.keys(cjsFile).sort().join()) {
  throw new Error('smoke: the ESM and CommonJS builds export different names')
}
console.log(
  `smoke: require() works on ${process.versions.node ? `node ${process.versions.node}` : 'this runtime'}`,
)
