// Compares two sequences element by element and reports only the first difference, so a mismatch
// in a large collection prints one index and two values instead of a diff of every element.

import { assert } from 'vitest'

/** Whether two elements are the same: `Object.is`, or arrays (pairs) of the same elements. */
export function sameElement(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (!sameElement(a[i], b[i])) return false
  return true
}

function show(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (Object.is(value, -0)) return '-0'
  if (Array.isArray(value)) return `[${value.map(show).join(', ')}]`
  return String(value)
}

/**
 * Fails, naming `at`, the first index where `ours` and `theirs` differ, both values there and both
 * lengths. Elements compare with `Object.is`; arrays (map pairs) compare element by element.
 */
export function expectSameSequence(
  ours: ArrayLike<unknown>,
  theirs: ArrayLike<unknown>,
  at: string,
): void {
  const length = Math.min(ours.length, theirs.length)
  for (let i = 0; i < length; i++) {
    if (!sameElement(ours[i], theirs[i])) {
      assert.fail(
        `${at}: index ${i}: got ${show(ours[i])}, reference has ${show(theirs[i])} (lengths ${ours.length} and ${theirs.length})`,
      )
    }
  }
  if (ours.length !== theirs.length) {
    const extra = ours.length > theirs.length ? ours[length] : theirs[length]
    assert.fail(
      `${at}: lengths differ: got ${ours.length}, reference has ${theirs.length} (first extra element ${show(extra)} at index ${length})`,
    )
  }
}
