// Task: keep the k largest values seen in a stream of numbers, without storing the whole stream.
// Uses: PriorityQueue, a min-heap of at most k values; its least value is the one to drop next.
// Time: O(n log k) for n values; O(k) memory.
// With Array, Map and Set only: keep a sorted array of k values and splice each new value into
// place (O(k) per value), or store every value and sort at the end (O(n log n), O(n) memory).
import { PriorityQueue } from 'javascript-collections-framework'

/**
 * The k largest values of `values`, largest first.
 * @param {Iterable<number>} values
 * @param {number} k
 */
function topK(values, k) {
  const heap = new PriorityQueue()
  for (const value of values) {
    heap.add(value)
    if (heap.size > k) heap.poll() // drop the least of the k + 1
  }
  const result = []
  while (!heap.isEmpty()) result.push(heap.poll())
  return result.reverse()
}

const readings = [12, 7, 31, 4, 25, 18, 31, 2, 9, 40]
console.log(topK(readings, 3)) // [ 40, 31, 31 ]
console.log(topK(readings, 1)) // [ 40 ]
console.log(topK([5, 1], 4)) // [ 5, 1 ]
