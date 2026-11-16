// Seeded hashing of primitives and identity hashes for objects.
//
// One seed per loaded copy of the library, chosen the first time a hash is needed, so loading the
// module does no work. Every built-in used here is a capture from `intrinsics.ts`, so replacing a
// built-in after the library has loaded runs no code inside hashing. Hash values are not part of
// the API: they differ between runs and between loaded copies.

import {
  bigintToString,
  charCodeAt,
  createScratchView,
  createWeakMap,
  getInt32,
  imul,
  random,
  setFloat64,
  toText,
  weakMapGet,
  weakMapSet,
} from './intrinsics'

let seed: number | undefined

function currentSeed(): number {
  if (seed === undefined) seed = (random() * 4294967296) | 0
  return seed
}

/**
 * Fixes the seed (or, with `undefined`, lets the next hash choose a new one). For tests only.
 *
 * @internal
 */
export function setHashSeedForTesting(value: number | undefined): void {
  seed = value === undefined ? undefined : value | 0
}

// Distinct starting points per kind, so equal bit patterns of different kinds rarely collide.
const NUMBER = 0x1b873593
const NOT_A_NUMBER = 0x2c1b3c6d
const STRING = 0x297a2d39
const BIGINT = 0x165667b1
const SYMBOL = 0x27d4eb2f
const TRUE = 0x61c88647
const FALSE = 0x7a646e4d
const NULL = 0x3c6ef372
const UNDEFINED = 0x5bd1e995
const IDENTITY = 0x68e31da4

/** One mixing round: folds `k` into `h`. */
function combine(h: number, k: number): number {
  let x = imul(k, 0xcc9e2d51)
  x = (x << 15) | (x >>> 17)
  x = imul(x, 0x1b873593)
  let y = h ^ x
  y = (y << 13) | (y >>> 19)
  return (imul(y, 5) + 0xe6546b64) | 0
}

/**
 * Final avalanche, so every input bit affects every output bit.
 *
 * @internal
 */
export function finish(h: number): number {
  let x = h ^ (h >>> 16)
  x = imul(x, 0x85ebca6b)
  x ^= x >>> 13
  x = imul(x, 0xc2b2ae35)
  return (x ^ (x >>> 16)) | 0
}

function hashText(text: string, kind: number): number {
  let h = currentSeed() ^ kind
  const length = text.length
  for (let i = 0; i < length; i++) h = combine(h, charCodeAt(text, i))
  return finish(h ^ length)
}

let scratch: DataView | undefined

function hashNumber(value: number): number {
  // biome-ignore lint/suspicious/noSelfCompare: value !== value is true only for NaN, without calling Number.isNaN
  if (value !== value) return finish(currentSeed() ^ NOT_A_NUMBER) // every NaN alike
  // Integers in the int32 range, including -0 (which `| 0` turns into 0), take the fast path.
  if ((value | 0) === value) return finish(combine(currentSeed() ^ NUMBER, value | 0))
  if (scratch === undefined) scratch = createScratchView()
  setFloat64(scratch, 0, value)
  return finish(
    combine(combine(currentSeed() ^ NUMBER, getInt32(scratch, 0)), getInt32(scratch, 4)),
  )
}

let identities: WeakMap<object, number> | undefined
let nextIdentity = 0

function hashIdentity(value: object): number {
  if (identities === undefined) identities = createWeakMap<object, number>()
  let id = weakMapGet(identities, value)
  if (id === undefined) {
    id = nextIdentity++
    weakMapSet(identities, value, id)
  }
  return finish(combine(currentSeed() ^ IDENTITY, id))
}

/**
 * Hashes a value without consulting the equality protocol: seeded hashes for primitives (numbers
 * after `-0` → `0` and every `NaN` → one value; strings by UTF-16 code units; bigints by their
 * hexadecimal digits; symbols by their description text), fixed hashes for booleans, `null` and
 * `undefined`, and identity hashes for objects, functions and classes.
 *
 * Time: O(1) for numbers, booleans, `null` and `undefined`; O(1) amortised for objects; O(length)
 * for strings and symbol descriptions; O(digits) for bigints.
 *
 * @internal
 */
export function hashPrimitiveOrIdentity(value: unknown): number {
  switch (typeof value) {
    case 'number':
      return hashNumber(value)
    case 'string':
      return hashText(value, STRING)
    case 'bigint':
      return hashText(
        (bigintToString as (self: bigint, radix?: number) => string)(value, 16),
        BIGINT,
      )
    case 'symbol':
      return hashText(toText(value), SYMBOL)
    case 'boolean':
      return finish(currentSeed() ^ (value ? TRUE : FALSE))
    case 'undefined':
      return finish(currentSeed() ^ UNDEFINED)
    default:
      return value === null ? finish(currentSeed() ^ NULL) : hashIdentity(value as object)
  }
}
