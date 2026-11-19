// Imports one named collection and reports the result of one operation.
import { TreeMap } from 'javascript-collections-framework'

const map = new TreeMap([
  [2, 'b'],
  [3, 'c'],
  [1, 'a'],
])
const result = `TreeMap ${[...map.keys()].join(',')}`
globalThis.fixtureResult = result
console.log(result)
