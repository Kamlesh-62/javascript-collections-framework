// Task: report the median of a sequence of numbers after each new number arrives.
// Uses: two PriorityQueues: a max-heap of the lower half and a min-heap of the upper half, kept
// within one element of each other, so the median is at the top of one or both.
// Time: O(log n) per number, O(1) to read the median.
// With Array, Map and Set only: keep one sorted array and splice each number into place (O(n)
// per number), or sort a copy every time the median is asked for (O(n log n)).
import { PriorityQueue, reverseOrder } from 'javascript-collections-framework'

const lower = new PriorityQueue({ comparator: reverseOrder() }) // largest on top
const upper = new PriorityQueue() // least on top

/** @param {number} value */
function add(value) {
  if (lower.isEmpty() || value <= lower.peek()) lower.add(value)
  else upper.add(value)
  // Rebalance so that lower has as many elements as upper, or one more.
  if (lower.size > upper.size + 1) upper.add(lower.poll())
  else if (upper.size > lower.size) lower.add(upper.poll())
}

function median() {
  return lower.size > upper.size ? lower.peek() : (lower.peek() + upper.peek()) / 2
}

const medians = []
for (const value of [5, 15, 1, 3, 8, 7]) {
  add(value)
  medians.push(median())
}
console.log(medians) // [ 5, 10, 5, 4, 5, 6 ]
console.log('values', lower.size + upper.size, 'median', median()) // values 6 median 6
