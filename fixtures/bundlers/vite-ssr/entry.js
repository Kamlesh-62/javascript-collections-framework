// The server entry: imports one named collection and renders the result of one operation.
import { TreeMap } from 'javascript-collections-framework'

export function render() {
  const map = new TreeMap([
    [2, 'b'],
    [3, 'c'],
    [1, 'a'],
  ])
  return `<p>TreeMap ${[...map.keys()].join(',')}</p>`
}
