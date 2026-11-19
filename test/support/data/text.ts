// A seeded multilingual text: tokens drawn from code-point pools (Latin, Cyrillic, CJK, astral
// emoji, combining marks) and a short hand-written sample, joined by U+0020. No locale data is
// used, so the text is the same on every engine.

import { integer, seeded } from '../random'
import { zipfIndex, zipfWeights } from './trace'

/** Inclusive code-point ranges of each pool. */
const POOLS: ReadonlyArray<readonly [number, number]> = [
  [0x61, 0x7a], // Latin small letters
  [0x41, 0x5a], // Latin capital letters
  [0xe0, 0xff], // Latin-1 letters, precomposed
  [0x430, 0x44f], // Cyrillic small letters
  [0x4e00, 0x4fff], // CJK ideographs
  [0x1f600, 0x1f64f], // emoji outside the Basic Multilingual Plane (surrogate pairs)
]

/** Combining marks, placed after a base letter. */
const MARKS: readonly [number, number] = [0x300, 0x36f]

/**
 * Hand-written words with the cases the pools make rare: a precomposed and a decomposed form of
 * the same letter, a modifier sequence, a joined emoji sequence and mixed scripts.
 */
export const SAMPLE: readonly string[] = [
  'café',
  'café',
  'naïve',
  'привет',
  '日本語',
  '\u{1f44d}\u{1f3fd}',
  '\u{1f468}‍\u{1f469}‍\u{1f467}',
  'Å',
  'Å',
  'z\u{1f600}ж',
]

function word(random: () => number): string {
  const [low, high] = POOLS[integer(random, 0, POOLS.length - 1)] as readonly [number, number]
  const length = integer(random, 1, 4)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += String.fromCodePoint(integer(random, low, high))
    if (low < 0x100 && integer(random, 0, 7) === 0) {
      out += String.fromCodePoint(integer(random, MARKS[0], MARKS[1]))
    }
  }
  return out
}

/** The distinct words a text of `tokens` tokens is drawn from: the sample, then seeded words. */
export function vocabulary(tokens: number, seed: number): string[] {
  const random = seeded(seed ^ 0x766f_6361)
  const size = Math.max(SAMPLE.length + 8, Math.min(20_000, Math.floor(tokens / 8)))
  const seen = new Set<string>(SAMPLE)
  const out = [...SAMPLE]
  while (out.length < size) {
    const w = word(random)
    if (!seen.has(w)) {
      seen.add(w)
      out.push(w)
    }
  }
  return out
}

/** A text of `tokens` words drawn with a skewed distribution, separated by single spaces. */
export function multilingualText(tokens: number, seed: number): string {
  const words = vocabulary(tokens, seed)
  // Shuffle the ranks so the frequent words come from every pool.
  const random = seeded(seed)
  for (let i = words.length - 1; i > 0; i--) {
    const j = integer(random, 0, i)
    const t = words[i] as string
    words[i] = words[j] as string
    words[j] = t
  }
  const weights = zipfWeights(words.length)
  const out: string[] = new Array(tokens)
  for (let i = 0; i < tokens; i++) out[i] = words[zipfIndex(weights, random)] as string
  return out.join(' ')
}
