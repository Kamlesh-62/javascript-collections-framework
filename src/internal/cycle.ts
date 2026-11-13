// In-progress guards that keep equality, hashing and printing of self-containing collections from
// recursing forever. Each operation has its own guard, so user code running inside one operation
// (an element's `toString` that compares or hashes the collection) gets a real result from another.

import { createWeakSet, weakSetAdd, weakSetDelete, weakSetHas } from './intrinsics'

/**
 * Runs `body` with `target` marked as in progress; if `target` is already in progress under the
 * same guard (a cycle), returns `onCycle()` instead. The mark is removed when `body` returns or
 * throws.
 *
 * @internal
 */
export type Guard = <T>(target: object, onCycle: () => T, body: () => T) => T

/**
 * Returns a new guard with its own in-progress set, created on first use.
 *
 * Time: O(1); each guarded call is O(1) plus `body`.
 *
 * @internal
 */
export function createGuard(): Guard {
  let inProgress: WeakSet<object> | undefined
  return <T>(target: object, onCycle: () => T, body: () => T): T => {
    if (inProgress === undefined) inProgress = createWeakSet<object>()
    if (weakSetHas(inProgress, target)) return onCycle()
    weakSetAdd(inProgress, target)
    try {
      return body()
    } finally {
      weakSetDelete(inProgress, target)
    }
  }
}
