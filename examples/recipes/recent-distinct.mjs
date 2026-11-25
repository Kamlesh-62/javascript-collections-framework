// Task: keep the most recent distinct items of a history, such as recently opened files, with the
// latest last and at most a fixed number of items.
// Uses: LinkedHashSet: `addLast` inserts an item at the end or moves a repeat there, and
// `removeFirst` drops the oldest item.
// Time: O(1) amortised average per item.
// With Array, Map and Set only: a Set keeps the first insertion's place, so a repeat must be
// deleted and added again, and the oldest item is read through an iterator; with an array, each
// repeat costs an O(n) search and splice.
import { LinkedHashSet } from 'javascript-collections-framework'

const LIMIT = 3
const recent = new LinkedHashSet()

/** @param {string} item */
function open(item) {
  recent.addLast(item)
  if (recent.size > LIMIT) recent.removeFirst()
}

for (const file of ['a.txt', 'b.txt', 'a.txt', 'c.txt']) open(file)
console.log(recent.toArray()) // [ 'b.txt', 'a.txt', 'c.txt' ]

open('d.txt')
console.log(recent.toArray()) // [ 'a.txt', 'c.txt', 'd.txt' ]
console.log(recent.getLast(), recent.reversed().toArray()) // d.txt [ 'd.txt', 'c.txt', 'a.txt' ]
