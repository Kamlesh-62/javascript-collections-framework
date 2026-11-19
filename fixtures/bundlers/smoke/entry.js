// The ES module page's entry: the smoke check over the package as a bundler resolves it.
import * as lib from 'javascript-collections-framework'
import { smoke } from './smoke.js'

try {
  window.smokeResult = smoke(lib)
} catch (error) {
  window.smokeResult = { error: String(error) }
}
