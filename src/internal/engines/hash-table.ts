// Seeded hash buckets for values compared by an equivalence. Insertion order lives in a native
// `Set` of entries, so iterating the table has native live semantics (deleted entries not yet
// reached are skipped, added ones are visited, `clear` ends iteration); the bucket array is only an
// index, rebuilt on growth, shrinking and re-seeding without touching the order.

import { finish } from '../hashing'
import { random } from '../intrinsics'

/**
 * One stored value with the hash it was stored under. The hash is computed once, by the caller,
 * and reused on every growth, shrink and re-seed.
 *
 * @internal
 */
export interface BucketEntry<V> {
  readonly hash: number
  readonly value: V
}

/** The smallest bucket array, and the size `clear()` returns to. */
const MIN_BUCKETS = 8

/** The largest bucket array; past it chains simply grow longer. */
const MAX_BUCKETS = 1073741824 // 2^30

/** A chain longer than this may trigger one re-seed per growth step. */
const LONG_CHAIN = 8

function randomSeed(): number {
  return (random() * 4294967296) | 0
}

let seedSource: () => number = randomSeed

/**
 * Replaces the source of per-table seeds (or, with `undefined`, restores the random one). For
 * tests only: it makes bucket layout and re-seeding reproducible.
 *
 * @internal
 */
export function setBucketSeedSourceForTesting(source: (() => number) | undefined): void {
  seedSource = source === undefined ? randomSeed : source
}

function newBuckets<V>(count: number): Array<Array<BucketEntry<V>> | undefined> {
  const buckets: Array<Array<BucketEntry<V>> | undefined> = []
  for (let i = 0; i < count; i++) buckets.push(undefined)
  return buckets
}

function hasDistinctHashes<V>(chain: ReadonlyArray<BucketEntry<V>>): boolean {
  const first = (chain[0] as BucketEntry<V>).hash
  for (let i = 1; i < chain.length; i++)
    if ((chain[i] as BucketEntry<V>).hash !== first) return true
  return false
}

/**
 * A hash table of entries in power-of-two buckets whose index mixes the stored hash with a
 * per-table random seed, so the layout cannot be predicted from outside. The table never calls
 * user code: callers hash values once and pass a `matches` test to `find`.
 *
 * A chain longer than 8 after an insertion triggers a re-seed (a new seed and a rebuilt index)
 * only when the chain holds at least two different hashes and no re-seed has happened since the
 * last growth, so values that share one hash cannot cause endless re-seeding; they cost O(chain)
 * per operation instead.
 *
 * Time: `find`, `insert`, `remove` O(1) average, O(chain) worst; growth, shrinking and re-seeding
 * O(n), amortised O(1) per insertion; `clear` O(1); iteration O(1) per step.
 *
 * @internal
 */
export class BucketTable<V> {
  private buckets: Array<Array<BucketEntry<V>> | undefined> = newBuckets(MIN_BUCKETS)
  private mask = MIN_BUCKETS - 1
  private currentSeed: number = seedSource()
  private reseededSinceGrowth = false
  private readonly order: Set<BucketEntry<V>> = new Set()
  /** The number of times the bucket array has grown (read by tests). */
  growths = 0
  /** The number of re-seeds (read by tests). */
  reseeds = 0

  /** The number of entries. */
  get size(): number {
    return this.order.size
  }

  /** The current seed (read by tests). */
  get seed(): number {
    return this.currentSeed
  }

  /** The length of the bucket array (read by tests). */
  get capacity(): number {
    return this.buckets.length
  }

  /** The bucket index of `hash` under the current seed (read by tests). */
  indexOf(hash: number): number {
    return finish(hash ^ this.currentSeed) & this.mask
  }

  /** The length of the chain `hash` falls in (read by tests). */
  chainLength(hash: number): number {
    const chain = this.buckets[this.indexOf(hash)]
    return chain === undefined ? 0 : chain.length
  }

  /**
   * Returns the first entry stored under `hash` whose value `matches` accepts, or `undefined`.
   * `matches` runs only for entries with exactly that hash, in the order they were placed.
   */
  find(hash: number, matches: (value: V) => boolean): BucketEntry<V> | undefined {
    const chain = this.buckets[this.indexOf(hash)]
    if (chain === undefined) return undefined
    for (let i = 0; i < chain.length; i++) {
      const entry = chain[i] as BucketEntry<V>
      if (entry.hash === hash && matches(entry.value)) return entry
    }
    return undefined
  }

  /** Stores `value` under `hash` at the end of the order, without checking for an equal one. */
  insert(hash: number, value: V): BucketEntry<V> {
    const entry: BucketEntry<V> = { hash, value }
    this.order.add(entry)
    const length = this.buckets.length
    if (this.order.size > (length >>> 2) * 3 && length < MAX_BUCKETS) {
      this.growths++
      this.reseededSinceGrowth = false
      this.rebuild(length * 2)
    } else {
      this.place(entry)
    }
    const chain = this.buckets[this.indexOf(hash)] as Array<BucketEntry<V>>
    if (chain.length > LONG_CHAIN && !this.reseededSinceGrowth && hasDistinctHashes(chain)) {
      this.reseededSinceGrowth = true
      this.reseeds++
      this.currentSeed = seedSource()
      this.rebuild(this.buckets.length)
    }
    return entry
  }

  /** Returns whether `entry` is still stored. */
  contains(entry: BucketEntry<V>): boolean {
    return this.order.has(entry)
  }

  /** Removes `entry` by its stored hash; returns whether it was stored. */
  remove(entry: BucketEntry<V>): boolean {
    if (!this.order.delete(entry)) return false
    const index = this.indexOf(entry.hash)
    const chain = this.buckets[index] as Array<BucketEntry<V>>
    for (let i = 0; i < chain.length; i++) {
      if (chain[i] === entry) {
        chain.splice(i, 1)
        break
      }
    }
    if (chain.length === 0) this.buckets[index] = undefined
    const length = this.buckets.length
    if (length > MIN_BUCKETS && this.order.size < length >>> 3) this.rebuild(length >>> 1)
    return true
  }

  /** Removes every entry. Open iterators end, as a native `Set`'s do. */
  clear(): void {
    this.order.clear()
    this.buckets = newBuckets(MIN_BUCKETS)
    this.mask = MIN_BUCKETS - 1
  }

  /** A live iterator over the entries in insertion order. */
  entries(): IterableIterator<BucketEntry<V>> {
    return this.order.values()
  }

  /**
   * A new table with the same hashes and values in the same order, under its own seed. The
   * entries are laid out once at this table's capacity, without chain checks, so copying is O(n)
   * even when many entries share one hash. `clone`, when given, copies each value.
   */
  copy(clone?: (value: V) => V): BucketTable<V> {
    const table = new BucketTable<V>()
    for (const entry of this.order) {
      table.order.add({
        hash: entry.hash,
        value: clone === undefined ? entry.value : clone(entry.value),
      })
    }
    table.rebuild(this.buckets.length)
    return table
  }

  private place(entry: BucketEntry<V>): void {
    const index = this.indexOf(entry.hash)
    const chain = this.buckets[index]
    if (chain === undefined) this.buckets[index] = [entry]
    else chain.push(entry)
  }

  private rebuild(capacity: number): void {
    this.buckets = newBuckets(capacity)
    this.mask = capacity - 1
    for (const entry of this.order) this.place(entry)
  }
}
