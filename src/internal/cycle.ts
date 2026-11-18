// In-progress guards that keep equality, hashing and printing of self-containing collections from
// recursing forever. Each operation has its own guard, so user code running inside one operation
// (an element's `toString` that compares or hashes the collection) gets a real result from another.

import {
  createWeakMap,
  createWeakSet,
  weakMapGet,
  weakMapSet,
  weakSetAdd,
  weakSetDelete,
  weakSetHas,
} from './intrinsics'

/**
 * Runs `body` with `target` marked as in progress; if `target` is already in progress under the
 * same guard (a cycle), returns `onCycle()` instead. The mark is removed when `body` returns or
 * throws, and every mark is dropped when the outermost guarded call returns or throws.
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
  let depth = 0
  return <T>(target: object, onCycle: () => T, body: () => T): T => {
    if (inProgress === undefined) inProgress = createWeakSet<object>()
    if (weakSetHas(inProgress, target)) return onCycle()
    const marks = inProgress
    weakSetAdd(marks, target)
    depth++
    try {
      return body()
    } finally {
      depth--
      // The outermost call drops every mark with a plain assignment, which cannot fail. Removing
      // one mark is a call, and at the edge of the stack (unwinding a RangeError) it can itself
      // overflow; the mark it leaves behind is dropped here.
      if (depth === 0) inProgress = undefined
      else weakSetDelete(marks, target)
    }
  }
}

/** For each collection proven equal to others, each partner and both revisions at that time. */
let proven: WeakMap<object, WeakMap<object, readonly [number, number]>> | undefined
let comparisonDepth = 0

/** A collection's `revision`, which every change to its contents advances. */
function revisionOf(collection: object): number {
  return (collection as { readonly revision: number }).revision
}

/**
 * Whether `a` was found equal to `b` during the current outermost comparison, and neither has
 * changed since.
 */
function isProven(a: object, b: object): boolean {
  if (proven === undefined) return false
  const partners = weakMapGet(proven, a)
  const seen = partners === undefined ? undefined : weakMapGet(partners, b)
  return seen !== undefined && seen[0] === revisionOf(a) && seen[1] === revisionOf(b)
}

/**
 * Runs `compare` for the collections `a` and `b` and remembers a `true` result until the outermost
 * comparison returns, so a pair met again (either way round) and unchanged since is answered
 * without comparing again. Set and map equality check each member from both sides, so without
 * this, the work doubles at every level of nesting. The memory is dropped when the outermost call
 * returns or throws.
 *
 * Time: O(1) plus `compare` on a pair not yet proven equal.
 *
 * @internal
 */
export function rememberEqual(a: object, b: object, compare: () => boolean): boolean {
  if (isProven(a, b) || isProven(b, a)) return true
  if (comparisonDepth === 0) proven = createWeakMap()
  comparisonDepth++
  try {
    const result = compare()
    if (result && proven !== undefined) {
      let partners = weakMapGet(proven, a)
      if (partners === undefined) {
        partners = createWeakMap<object, readonly [number, number]>()
        weakMapSet(proven, a, partners)
      }
      weakMapSet(partners, b, [revisionOf(a), revisionOf(b)] as const)
    }
    return result
  } finally {
    comparisonDepth--
    if (comparisonDepth === 0) proven = undefined
  }
}
