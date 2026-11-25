// Task: merge several arrays, each sorted in ascending order, into one sorted array.
// Uses: PriorityQueue holding the next unread value of each array; the least one is taken next.
// Time: O(n log k) for n values in k arrays.
// With Array, Map and Set only: concatenate and sort (O(n log n)), or scan the k heads for the
// least value at every step (O(n k)).
import { PriorityQueue } from 'javascript-collections-framework'

/**
 * The values of `arrays`, each sorted in ascending order, as one sorted array.
 * @param {number[][]} arrays
 */
function mergeSorted(arrays) {
  // Each entry is [value, array index, index of the value in that array].
  const heads = new PriorityQueue({ comparator: (a, b) => a[0] - b[0] })
  arrays.forEach((array, i) => {
    if (array.length > 0) heads.add([array[0], i, 0])
  })
  const merged = []
  while (!heads.isEmpty()) {
    const [value, i, j] = heads.poll()
    merged.push(value)
    if (j + 1 < arrays[i].length) heads.add([arrays[i][j + 1], i, j + 1])
  }
  return merged
}

console.log(mergeSorted([[1, 4, 9], [2, 10], [5]])) // [ 1, 2, 4, 5, 9, 10 ]
console.log(mergeSorted([[], [7, 8], [1]])) // [ 1, 7, 8 ]
console.log(mergeSorted([])) // []
