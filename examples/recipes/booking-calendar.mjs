// Task: accept a booking only when it does not overlap a booking already made. A booking runs from
// its start up to, but not including, its end.
// Uses: TreeMap from start to end: `floorEntry` finds the booking starting at or before the new
// start, `ceilingEntry` the one starting at or after it; only those two can overlap.
// Time: O(log n) per booking for n bookings.
// With Array, Map and Set only: compare with every booking (O(n)), or keep a sorted array,
// binary-search it by hand and splice each booking into place (O(n)).
import { TreeMap } from 'javascript-collections-framework'

const bookings = new TreeMap()

/**
 * Books [start, end) and returns true, or returns false when it overlaps a booking.
 * @param {number} start
 * @param {number} end
 */
function book(start, end) {
  const before = bookings.floorEntry(start)
  if (before !== undefined && before.value > start) return false
  const after = bookings.ceilingEntry(start)
  if (after !== undefined && after.key < end) return false
  bookings.set(start, end)
  return true
}

// Times as hours and minutes: 930 is 9:30.
const requests = [
  [900, 1000],
  [1000, 1030],
  [930, 1100],
  [1100, 1200],
  [1045, 1115],
  [1030, 1100],
]
const accepted = requests.map(([start, end]) => book(start, end))
console.log(accepted) // [ true, true, false, true, false, true ]
console.log([...bookings.keys()]) // [ 900, 1000, 1030, 1100 ]
console.log(bookings.lastEntry().toJSON()) // [ 1100, 1200 ]
