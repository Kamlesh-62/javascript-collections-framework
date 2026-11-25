// Task: cache the results of a lookup, keeping at most a fixed number of entries and dropping the
// least recently used one when a new entry needs room.
// Uses: LinkedHashMap with `accessOrder`, so that a read moves an entry to the end, and `maxSize`,
// so that an insert past the limit evicts the entry at the front; `onEvict` reports it.
// Time: O(1) amortised average per read, insert and eviction.
// With Array, Map and Set only: a Map keeps insertion order, so each read must delete and re-set
// the key, and each insert must check the size and delete the first key by hand.
import { LinkedHashMap } from 'javascript-collections-framework'

const evicted = []
const cache = new LinkedHashMap({
  accessOrder: true,
  maxSize: 3,
  onEvict: (value, key) => evicted.push([key, value]),
})

/** @param {string} word */
function lookup(word) {
  const hit = cache.get(word)
  if (hit !== undefined) return hit
  const value = word.toUpperCase() // stands for a costly computation
  cache.set(word, value)
  return value
}

for (const word of ['red', 'green', 'blue', 'red', 'black', 'green']) lookup(word)

console.log([...cache.keys()]) // [ 'red', 'black', 'green' ]
console.log(evicted) // [ [ 'green', 'GREEN' ], [ 'blue', 'BLUE' ] ]
console.log(cache.size, cache.has('blue')) // 3 false
