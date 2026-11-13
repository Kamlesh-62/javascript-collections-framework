/**
 * A stable sort that behaves the same on every engine.
 *
 * `Array.prototype.sort` is stable only since ES2019, and engines older than that are supported,
 * so lists sort with this bottom-up merge sort instead. It never recurses, works on a copy, and
 * makes at most `n·⌈log₂ n⌉` comparisons, whatever the comparator returns.
 *
 * @internal
 * @packageDocumentation
 */

/**
 * Returns a new array with the elements of `items` in the order `compare` gives, keeping equal
 * elements in their original order. `items` is not changed. An error thrown by `compare` or by
 * `afterCall` propagates and nothing is returned.
 *
 * Time: O(n log n), at most `n·⌈log₂ n⌉` calls of `compare` for `n ≥ 2` and none for `n < 2`;
 * O(n) extra space.
 *
 * @param items - The elements to sort.
 * @param compare - Returns a negative number, zero or a positive number; any result that is not
 *   positive keeps the left element first.
 * @param afterCall - Called after every call of `compare` (to check that the list did not change).
 * @returns The sorted copy.
 * @internal
 */
export function stableSort<T>(
  items: readonly T[],
  compare: (a: T, b: T) => number,
  afterCall: () => void,
): T[] {
  const n = items.length
  let from: T[] = []
  for (let i = 0; i < n; i++) from.push(items[i] as T)
  if (n < 2) return from
  let to: T[] = new Array<T>(n)
  for (let width = 1; width < n; width *= 2) {
    for (let start = 0; start < n; start += 2 * width) {
      const middle = start + width < n ? start + width : n
      const end = start + 2 * width < n ? start + 2 * width : n
      let left = start
      let right = middle
      let out = start
      while (left < middle && right < end) {
        const a = from[left] as T
        const b = from[right] as T
        const order = compare(a, b)
        afterCall()
        if (order > 0) {
          to[out++] = b
          right++
        } else {
          to[out++] = a
          left++
        }
      }
      while (left < middle) to[out++] = from[left++] as T
      while (right < end) to[out++] = from[right++] as T
    }
    const swap = from
    from = to
    to = swap
  }
  return from
}
