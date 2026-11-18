// Read-only access to the storage behind the public classes, for internal tests against the source
// only: the engine fields are not public and their names may change with the engines.

import type { BucketTable } from '../../src/internal/engines/hash-table'

/** The engine a public class delegates to. */
export function engineOf(collection: object): Record<string, unknown> {
  return (collection as { engine: Record<string, unknown> }).engine
}

/** The buffer of an `ArrayDeque`. */
export function dequeBuffer(deque: object): unknown[] {
  return engineOf(deque).buffer as unknown[]
}

/** The backing array of an `ArrayList`. */
export function listItems(list: object): unknown[] {
  return engineOf(list).items as unknown[]
}

/** The heap array of a `PriorityQueue`. */
export function heapArray(queue: object): unknown[] {
  return engineOf(queue).heap as unknown[]
}

/** The bucket table of a `HashSet` or `HashMap` built with an `equivalence`. */
export function bucketTable(collection: object): BucketTable<unknown> {
  const store = engineOf(collection).store as { table?: BucketTable<unknown> }
  if (store.table === undefined) throw new Error('storage: the collection has no bucket table')
  return store.table
}

/** The bucket array of a bucket table. */
export function bucketsOf(table: BucketTable<unknown>): Array<unknown[] | undefined> {
  return (table as unknown as { buckets: Array<unknown[] | undefined> }).buckets
}

/** The longest chain in a bucket table. */
export function longestChain(table: BucketTable<unknown>): number {
  let longest = 0
  for (const chain of bucketsOf(table))
    if (chain !== undefined && chain.length > longest) longest = chain.length
  return longest
}

/**
 * Every object reachable from `root` through own properties, array slots and the entries of native
 * maps and sets, walked without recursion. Functions and the objects `stop` accepts are recorded
 * but not entered, so user values and callbacks are never walked into.
 */
export function reachable(root: object, stop: (value: object) => boolean): Set<object> {
  const seen = new Set<object>()
  const queue: object[] = [root]
  const visit = (value: unknown) => {
    if ((typeof value === 'object' && value !== null) || typeof value === 'function') {
      if (!seen.has(value as object)) {
        seen.add(value as object)
        if (typeof value === 'object' && !stop(value as object)) queue.push(value as object)
      }
    }
  }
  seen.add(root)
  while (queue.length > 0) {
    const current = queue.pop() as object
    if (current instanceof Map) {
      for (const [k, v] of current) {
        visit(k)
        visit(v)
      }
    } else if (current instanceof Set) {
      for (const v of current) visit(v)
    }
    for (const key of Reflect.ownKeys(current)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(current, key)
      if (descriptor !== undefined && 'value' in descriptor) visit(descriptor.value)
    }
  }
  return seen
}

/** Every array reachable from `root` (not entering `stop` objects), for size bounds. */
export function reachableArrays(root: object, stop: (value: object) => boolean): unknown[][] {
  const out: unknown[][] = []
  for (const value of reachable(root, stop)) if (Array.isArray(value)) out.push(value)
  return out
}
