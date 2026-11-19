// Shuffling lists of sizes 0, 1, 2 and a large size through `asList` and as an `ArrayList`, checked
// by the documented contract: a permutation, max(size − 1, 0) calls of `random`, and the same order
// for the same seed.

import { ArrayList, asList, shuffle } from '../../src/index'
import type { WorkloadSizes } from '../stress/config'
import { seeded } from '../support/random'
import { same, sameSequence } from './check'

/** A seeded `random` that counts its calls. */
function counting(seed: number): { random: () => number; calls: () => number } {
  const random = seeded(seed)
  let calls = 0
  return {
    random: () => {
      calls++
      return random()
    },
    calls: () => calls,
  }
}

export function run(sizes: WorkloadSizes, seed: number): void {
  for (const size of [0, 1, 2, 3, sizes.sorted]) {
    const input: number[] = []
    for (let i = 0; i < size; i++) input.push(i * 3 - size)
    const at = `size ${size}`

    const array = input.slice()
    const a = counting(seed)
    shuffle(asList(array), a.random)
    same(a.calls(), Math.max(size - 1, 0), `${at} asList random calls`)
    // A permutation: same multiset (the values are distinct, so sorted copies match).
    sameSequence(
      array.slice().sort((x, y) => x - y),
      input,
      `${at} permutation`,
    )

    const list = new ArrayList(input)
    const b = counting(seed)
    shuffle(list, b.random)
    same(b.calls(), Math.max(size - 1, 0), `${at} ArrayList random calls`)
    sameSequence(list, array, `${at} ArrayList order equals the asList order`)

    const again = input.slice()
    shuffle(asList(again), counting(seed).random)
    sameSequence(again, array, `${at} repeated run`)
  }
}
