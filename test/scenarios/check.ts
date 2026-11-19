// Cheap assertions for the workloads, which compare many values: each failure names where it
// happened and both values.

import { assert } from 'vitest'

/** Fails unless `actual` is `expected` (`Object.is`). */
export function same(actual: unknown, expected: unknown, at: string): void {
  if (!Object.is(actual, expected)) {
    assert.fail(`${at}: got ${String(actual)}, reference has ${String(expected)}`)
  }
}

/** Fails unless both sequences hold the same values (`Object.is`) in the same order. */
export function sameSequence(
  actual: Iterable<unknown>,
  expected: readonly unknown[],
  at: string,
): void {
  const values = [...actual]
  same(values.length, expected.length, `${at} length`)
  for (let i = 0; i < expected.length; i++) {
    if (!Object.is(values[i], expected[i])) same(values[i], expected[i], `${at}[${i}]`)
  }
}
