// The inverse of the library's final hash avalanche (the 32-bit finaliser `finish`), so tests can
// craft hashes that land in a chosen bucket under a known seed.

/** The inverse of an odd 32-bit multiplier, modulo 2^32 (Newton's iteration). */
function inverse(a: number): number {
  let x = a
  for (let i = 0; i < 5; i++) x = Math.imul(x, 2 - Math.imul(a, x))
  return x | 0
}

const M1 = 0x85ebca6b
const M2 = 0xc2b2ae35
const M1_INVERSE = inverse(M1)
const M2_INVERSE = inverse(M2)

/** The same steps as `finish` in the library's hashing module. */
export function fmix(h: number): number {
  let x = h ^ (h >>> 16)
  x = Math.imul(x, M1)
  x ^= x >>> 13
  x = Math.imul(x, M2)
  return (x ^ (x >>> 16)) | 0
}

/** The hash `h` with `fmix(h) === value`. */
export function fmixInverse(value: number): number {
  let x = value ^ (value >>> 16)
  x = Math.imul(x, M2_INVERSE)
  x ^= (x >>> 13) ^ (x >>> 26)
  x = Math.imul(x, M1_INVERSE)
  return (x ^ (x >>> 16)) | 0
}
