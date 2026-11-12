// Checking a collection's `key` option and deriving keys from it.

import type { KeyOf } from './equality'
import { apply } from './intrinsics'

/**
 * Checks a collection's `key` option at construction: `undefined` means no key function; anything
 * else must be a function, read once here.
 *
 * Time: O(1).
 *
 * @param option - The `key` option as given.
 * @param where - The constructor to name in errors (`HashMap.constructor`).
 * @throws TypeError when the option is `null` or not a function.
 * @internal
 */
export function checkKey<T>(option: unknown, where: string): KeyOf<T> | undefined {
  if (option === undefined) return undefined
  if (typeof option !== 'function') throw new TypeError(`${where}: key is not a function`)
  return option as KeyOf<T>
}

/**
 * Derives the key of `value`: calls `key` once, with only the value, and lets its errors
 * propagate. The key is compared with SameValueZero by the caller (a native `Map`).
 *
 * Time: O(1) plus the key function.
 *
 * @param key - A key function accepted by {@link checkKey}.
 * @param value - The value to key.
 * @param where - The collection method to name in errors (`HashMap.set`).
 * @returns The key.
 * @throws TypeError when the key function returns an object or a function.
 * @internal
 */
export function deriveKey<T>(key: KeyOf<T>, value: T, where: string): unknown {
  const derived = apply(key, undefined, [value])
  if ((typeof derived === 'object' && derived !== null) || typeof derived === 'function') {
    throw new TypeError(`${where}: key function returned ${typeof derived}`)
  }
  return derived
}
