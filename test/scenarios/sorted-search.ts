// Searching a sorted array of numbers through `asList`, with probes that include absent and
// duplicated keys, then rotating and reversing it, against array-based results.

import { asList, binarySearch, reverse, rotate, sortedIndex } from '../../src/index'
import type { WorkloadSizes } from '../stress/config'
import { integer, seeded } from '../support/random'
import { same, sameSequence } from './check'

/** Probes per run. */
const PROBES = 500

function lowerBound(array: readonly number[], key: number): number {
  let low = 0
  let high = array.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if ((array[mid] as number) < key) low = mid + 1
    else high = mid
  }
  return low
}

export function run(sizes: WorkloadSizes, seed: number): void {
  const random = seeded(seed)
  // Even values with runs of duplicates; odd values are absent.
  const array: number[] = new Array(sizes.sorted)
  let value = -2 * integer(random, 0, 50)
  for (let i = 0; i < array.length; i++) {
    if (integer(random, 0, 3) !== 0) value += 2 * integer(random, 1, 3)
    array[i] = value
  }
  const copy = array.slice()
  const list = asList(array)
  const first = array[0] as number
  const last = array[array.length - 1] as number

  const probes: number[] = [first, last, first - 1, last + 1, first - 2, last + 2]
  for (let p = 0; p < PROBES; p++) {
    probes.push(
      integer(random, 0, 1) === 0
        ? (array[integer(random, 0, array.length - 1)] as number) // present, often duplicated
        : integer(random, first - 3, last + 3),
    )
  }
  for (const key of probes) {
    const lower = lowerBound(copy, key)
    const found = lower < copy.length && copy[lower] === key ? lower : -1
    same(binarySearch(list, key), found, `binarySearch(${key})`)
    same(sortedIndex(list, key), lower, `sortedIndex(${key})`)
    same(copy.indexOf(key), found, `reference first index of ${key}`)
  }

  const distance = integer(random, -array.length, array.length)
  const shift = ((distance % copy.length) + copy.length) % copy.length
  const rotated = copy.slice(copy.length - shift).concat(copy.slice(0, copy.length - shift))
  rotate(list, distance)
  sameSequence(array, rotated, `rotate(${distance})`)
  reverse(list)
  sameSequence(array, rotated.slice().reverse(), 'reverse')
  reverse(list)
  rotate(list, -distance)
  sameSequence(array, copy, 'reverse and rotate back')
}
