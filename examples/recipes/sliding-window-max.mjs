// Task: find the maximum of every window of k consecutive values in an array.
// Uses: ArrayDeque of indexes whose values decrease from front to back; the front is the maximum
// of the current window, and both ends are added to and removed from in O(1).
// Time: O(n) for n values: each index is added once and removed at most once.
// With Array, Map and Set only: scan each window (O(n k)), or use an array as the deque, where
// `shift` from the front costs O(n).
import { ArrayDeque } from 'javascript-collections-framework'

/**
 * The maximum of each window of `k` consecutive values of `values`.
 * @param {number[]} values
 * @param {number} k
 */
function windowMaxima(values, k) {
  const indexes = new ArrayDeque()
  const maxima = []
  values.forEach((value, i) => {
    // Drop the front index once it leaves the window.
    if (!indexes.isEmpty() && indexes.peek() <= i - k) indexes.poll()
    // Drop smaller values from the back: they can no longer be a maximum.
    while (!indexes.isEmpty() && values[indexes.peekLast()] <= value) indexes.pop()
    indexes.push(i)
    if (i >= k - 1) maxima.push(values[indexes.peek()])
  })
  return maxima
}

console.log(windowMaxima([1, 3, -1, -3, 5, 3, 6, 7], 3)) // [ 3, 3, 5, 5, 6, 7 ]
console.log(windowMaxima([9, 8, 7, 6], 2)) // [ 9, 8, 7 ]
console.log(windowMaxima([4, 2], 1)) // [ 4, 2 ]
