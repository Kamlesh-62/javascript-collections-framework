// Edit this file and run `npm start` to try the library.
import { LinkedHashMap, PriorityQueue, TreeMap } from 'javascript-collections-framework'

// A sorted map: keys stay in order, with nearest-match and range queries.
const bookings = new TreeMap([
  [900, 'stand-up'],
  [1030, 'review'],
  [1400, 'planning'],
])
console.log('booking at or before 11:00:', bookings.floorEntry(1100)?.value)
console.log('morning bookings:', bookings.headMap(1200).toJSON())

// A priority queue: the smallest element comes out first.
const tasks = new PriorityQueue([5, 1, 3])
console.log('next task:', tasks.poll())

// An LRU cache: reading a key makes it recent; the least recently used key is evicted.
const cache = new LinkedHashMap({ accessOrder: true, maxSize: 2 })
cache.set('a', 1).set('b', 2)
cache.get('a')
cache.set('c', 3)
console.log('cache keys:', [...cache.keys()])
