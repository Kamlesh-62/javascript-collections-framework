// The app entry: imports the package as a React Native app would, runs the smoke check and prints
// its closing line through `print` (Hermes) or `console.log`.
import * as lib from 'javascript-collections-framework'
import { smoke } from '../bundlers/smoke/smoke.js'

const out =
  typeof print === 'function'
    ? print
    : (line) => {
        console.log(line)
      }
try {
  const counts = smoke(lib)
  out(`smoke: ok ${counts.collections} collections, ${counts.errors} errors`)
} catch (error) {
  out(`smoke: failed: ${error?.message ?? String(error)}`)
}
