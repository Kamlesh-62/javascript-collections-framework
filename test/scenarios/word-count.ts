// Word counting over a seeded multilingual text, with a hash map and a sorted map keyed by word,
// against a native `Map` and a code-unit sort.

import { asList, frequency, HashMap, max, min, sortedIndex, TreeMap } from '../../src/index'
import type { WorkloadSizes } from '../stress/config'
import { multilingualText } from '../support/data/text'
import { integer, seeded } from '../support/random'
import { same, sameSequence } from './check'

/** Probes of `frequency` and `sortedIndex` per run. */
const PROBES = 24

export function run(sizes: WorkloadSizes, seed: number): void {
  const text = multilingualText(sizes.words, seed)
  // Words are the tokens split on U+0020 only: no case folding, no normalisation.
  const words = text.split(' ')
  same(words.length, sizes.words, 'tokens')

  const reference = new Map<string, number>()
  const hash = new HashMap<string, number>()
  const tree = new TreeMap<string, number>()
  for (const w of words) {
    reference.set(w, (reference.get(w) ?? 0) + 1)
    hash.merge(w, 1, (n, one) => n + one)
    tree.set(w, (tree.get(w) ?? 0) + 1)
  }

  same(hash.size, reference.size, 'HashMap size')
  same(tree.size, reference.size, 'TreeMap size')
  for (const [w, n] of reference) {
    same(hash.get(w), n, `HashMap count of ${JSON.stringify(w)}`)
    same(tree.get(w), n, `TreeMap count of ${JSON.stringify(w)}`)
  }
  // Insertion order, as native `Map`.
  sameSequence(hash.keys(), [...reference.keys()], 'HashMap keys')

  // `Array.prototype.sort` without a comparator orders strings by UTF-16 code units.
  const sortedKeys = [...reference.keys()].sort()
  sameSequence(tree.keys(), sortedKeys, 'TreeMap keys')
  same(min(hash.keys()), sortedKeys[0], 'min')
  same(max(hash.keys()), sortedKeys[sortedKeys.length - 1], 'max')

  const random = seeded(seed ^ 0x7072_6f62)
  const list = asList(words)
  const sortedList = asList(sortedKeys)
  for (let i = 0; i < PROBES; i++) {
    const present = sortedKeys[integer(random, 0, sortedKeys.length - 1)] as string
    // Absent: a present word with a character added, or a decomposed form.
    const absent = `${present}̀${i}`
    same(
      frequency(list, present),
      reference.get(present),
      `frequency of ${JSON.stringify(present)}`,
    )
    if (!reference.has(absent)) {
      same(frequency(list, absent), 0, `frequency of ${JSON.stringify(absent)}`)
    }
    for (const w of [present, absent]) {
      let lower = 0
      while (lower < sortedKeys.length && (sortedKeys[lower] as string) < w) lower++
      same(sortedIndex(sortedList, w), lower, `sortedIndex of ${JSON.stringify(w)}`)
    }
  }
}
