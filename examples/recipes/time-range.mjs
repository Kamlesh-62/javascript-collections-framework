// Task: list the events of a log that fall inside a time range, and keep the list current as
// events are added.
// Uses: TreeMap from time to event: `subMap`, `headMap` and `tailMap` are live views of a key
// range, so a view made once shows later events in its range.
// Time: O(log n + m) to list the m events of a range among n events; O(log n) per added event.
// With Array, Map and Set only: keep an array sorted by time, splice each event into place (O(n))
// and binary-search both ends of the range by hand, again after every change.
import { TreeMap } from 'javascript-collections-framework'

// Times as "HH:MM" strings, which sort in time order.
const log = new TreeMap([
  ['09:15', 'deploy'],
  ['07:50', 'backup'],
  ['12:30', 'alert'],
  ['10:05', 'restart'],
  ['16:40', 'report'],
])

const morning = log.subMap('08:00', '12:00') // 08:00 up to, not including, 12:00
console.log([...morning.values()]) // [ 'deploy', 'restart' ]

log.set('11:20', 'scale up')
console.log([...morning.values()]) // [ 'deploy', 'restart', 'scale up' ]

console.log(morning.size, morning.firstEntry().key) // 3 09:15
console.log([...log.headMap('09:00').keys()]) // [ '07:50' ]
console.log([...log.tailMap('12:30', { inclusive: false }).values()]) // [ 'report' ]
