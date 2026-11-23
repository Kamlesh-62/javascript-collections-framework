// Storage for a hash map, one per key equality: a native `Map` (SameValueZero), a native `Map` from
// derived key to record (a `key` function), or seeded buckets of records (an equivalence). Every
// store keeps insertion order in native storage, so iteration is live exactly as a native `Map`'s
// is. A key's derived key or hash is computed once, when the mapping is stored, and reused for every
// later lookup by stored mapping.

import { type HashFunction, type KeyOf, type ProtocolMethods, protocolOf } from '../equality'
import type { CheckedEquivalence } from '../equivalence'
import { deriveKey } from '../key'
import type { HashEquality, Operation } from './hash-support'
import { type BucketEntry, BucketTable } from './hash-table'

/**
 * What `find` returns when no mapping matches. No key can be this object: it never leaves the
 * library.
 *
 * @internal
 */
export const MISSING: object = {}

/**
 * Storage for one key equality.
 *
 * A *probe* is what a key is found by — the key itself, its derived key, or its hash — computed
 * once per operation by `probe` (the only place `key` or `hash` runs) and reusable for a second
 * lookup. A *handle* is what the store's live iteration yields for one mapping; reading, writing
 * and removing by handle never call user code.
 *
 * @internal
 */
export interface MapStore<K, V> {
  readonly size: number
  /** Derives the probe of `key`: calls `key` or `hash` once. */
  probe(key: K, op: Operation): unknown
  /** Returns the handle of the mapping whose key equals `key`, or `MISSING`. */
  find(key: K, probe: unknown, op: Operation): unknown
  /** Appends a mapping for a key known to be absent; returns its handle. */
  insert(key: K, probe: unknown, value: V): unknown
  keyAt(handle: unknown): K
  valueAt(handle: unknown): V
  /** Writes the value of a stored mapping, keeping its key and position. */
  write(handle: unknown, value: V): void
  /** Whether the mapping `handle` stands for is still stored. */
  holds(handle: unknown): boolean
  /** The stored probe of a mapping, for finding it again without user calls. */
  probeAt(handle: unknown): unknown
  removeHandle(handle: unknown): void
  clear(): void
  /** A live iterator over the handles in insertion order. */
  handles(): Iterator<unknown>
  /** A test of stored handles against `keys`, under this store's equality. */
  lookup(keys: readonly K[], op: Operation): (handle: unknown) => boolean
  /** The hash of a stored key: by the given function, or the stored hash of a user equivalence. */
  keyHash(handle: unknown, hash: HashFunction): number
  copy(): MapStore<K, V>
  /**
   * The native `Map` that holds the mappings, when keys are compared with SameValueZero and no
   * user code runs on a lookup; `undefined` for the keyed and bucket stores. The engine uses it
   * directly on its hot paths.
   */
  nativeMap(): Map<K, V> | undefined
  /**
   * The key function and the native `Map` from derived key to record, for the keyed store;
   * `undefined` for the others. The engine reads through it on its keyed hot paths.
   */
  keyedMap(): KeyedMap<K, V> | undefined
}

class NativeMapStore<K, V> implements MapStore<K, V> {
  private readonly map: Map<K, V>

  constructor(map: Map<K, V>) {
    this.map = map
  }

  get size(): number {
    return this.map.size
  }

  probe(key: K): unknown {
    return key
  }

  find(key: K): unknown {
    return this.map.has(key) ? key : MISSING
  }

  insert(key: K, _probe: unknown, value: V): unknown {
    this.map.set(key, value)
    return key
  }

  keyAt(handle: unknown): K {
    return handle as K
  }

  valueAt(handle: unknown): V {
    return this.map.get(handle as K) as V
  }

  write(handle: unknown, value: V): void {
    this.map.set(handle as K, value)
  }

  holds(handle: unknown): boolean {
    return this.map.has(handle as K)
  }

  probeAt(handle: unknown): unknown {
    return handle
  }

  removeHandle(handle: unknown): void {
    this.map.delete(handle as K)
  }

  clear(): void {
    this.map.clear()
  }

  handles(): Iterator<unknown> {
    return this.map.keys()
  }

  lookup(keys: readonly K[]): (handle: unknown) => boolean {
    const set = new Set<unknown>(keys)
    return (handle) => set.has(handle)
  }

  keyHash(handle: unknown, hash: HashFunction): number {
    return hash(handle)
  }

  copy(): MapStore<K, V> {
    return new NativeMapStore(new Map(this.map))
  }

  nativeMap(): Map<K, V> {
    return this.map
  }

  keyedMap(): undefined {
    return undefined
  }
}

/**
 * A mapping stored under its derived key.
 *
 * @internal
 */
export interface KeyedRecord<K, V> {
  readonly derived: unknown
  readonly key: K
  value: V
}

/**
 * The keyed store's key function and its native `Map` from derived key to record.
 *
 * @internal
 */
export interface KeyedMap<K, V> {
  readonly key: KeyOf<K>
  readonly map: Map<unknown, KeyedRecord<K, V>>
}

class KeyedMapStore<K, V> implements MapStore<K, V>, KeyedMap<K, V> {
  readonly key: KeyOf<K>
  readonly map: Map<unknown, KeyedRecord<K, V>>

  constructor(key: KeyOf<K>, map: Map<unknown, KeyedRecord<K, V>>) {
    this.key = key
    this.map = map
  }

  get size(): number {
    return this.map.size
  }

  probe(key: K, op: Operation): unknown {
    return op.after(deriveKey(this.key, key, op.where))
  }

  find(_key: K, probe: unknown): unknown {
    const record = this.map.get(probe)
    return record === undefined ? MISSING : record
  }

  insert(key: K, probe: unknown, value: V): unknown {
    const record: KeyedRecord<K, V> = { derived: probe, key, value }
    this.map.set(probe, record)
    return record
  }

  keyAt(handle: unknown): K {
    return (handle as KeyedRecord<K, V>).key
  }

  valueAt(handle: unknown): V {
    return (handle as KeyedRecord<K, V>).value
  }

  write(handle: unknown, value: V): void {
    ;(handle as KeyedRecord<K, V>).value = value
  }

  holds(handle: unknown): boolean {
    return this.map.get((handle as KeyedRecord<K, V>).derived) === handle
  }

  probeAt(handle: unknown): unknown {
    return (handle as KeyedRecord<K, V>).derived
  }

  removeHandle(handle: unknown): void {
    if (this.holds(handle)) this.map.delete((handle as KeyedRecord<K, V>).derived)
  }

  clear(): void {
    this.map.clear()
  }

  handles(): Iterator<unknown> {
    return this.map.values()
  }

  lookup(keys: readonly K[], op: Operation): (handle: unknown) => boolean {
    const derived = new Set<unknown>()
    for (const key of keys) derived.add(this.probe(key, op))
    return (handle) => derived.has((handle as KeyedRecord<K, V>).derived)
  }

  keyHash(handle: unknown, hash: HashFunction): number {
    return hash((handle as KeyedRecord<K, V>).derived)
  }

  nativeMap(): undefined {
    return undefined
  }

  keyedMap(): KeyedMap<K, V> {
    return this
  }

  copy(): MapStore<K, V> {
    const map = new Map<unknown, KeyedRecord<K, V>>()
    for (const record of this.map.values()) {
      map.set(record.derived, { derived: record.derived, key: record.key, value: record.value })
    }
    return new KeyedMapStore(this.key, map)
  }
}

/** A mapping in a bucket entry, which keeps its hash. */
interface BucketRecord<K, V> {
  readonly key: K
  value: V
}

/** The probe of the bucket store: the hash, and the key's protocol methods when already read. */
interface BucketProbe {
  readonly hash: number
  readonly methods: ProtocolMethods | undefined
}

type Bucketed<K, V> = BucketEntry<BucketRecord<K, V>>

function cloneRecord<K, V>(record: BucketRecord<K, V>): BucketRecord<K, V> {
  return { key: record.key, value: record.value }
}

class BucketMapStore<K, V> implements MapStore<K, V> {
  private readonly equivalence: CheckedEquivalence
  private readonly builtIn: boolean
  private readonly table: BucketTable<BucketRecord<K, V>>

  constructor(
    equivalence: CheckedEquivalence,
    builtIn: boolean,
    table: BucketTable<BucketRecord<K, V>>,
  ) {
    this.equivalence = equivalence
    this.builtIn = builtIn
    this.table = table
  }

  get size(): number {
    return this.table.size
  }

  probe(key: K, op: Operation): unknown {
    // The protocol methods of the key are read once per operation, for the built-in equivalence.
    const methods = this.builtIn ? protocolOf(key) : undefined
    const probe: BucketProbe = {
      hash: op.after(this.equivalence.hash(key, op.where, methods)),
      methods,
    }
    return probe
  }

  find(key: K, probe: unknown, op: Operation): unknown {
    const { hash, methods } = probe as BucketProbe
    const equivalence = this.equivalence
    const entry = this.table.find(hash, (stored) =>
      op.after(equivalence.equals(key, stored.key, op.where, methods)),
    )
    return entry === undefined ? MISSING : entry
  }

  insert(key: K, probe: unknown, value: V): unknown {
    return this.table.insert((probe as BucketProbe).hash, { key, value })
  }

  keyAt(handle: unknown): K {
    return (handle as Bucketed<K, V>).value.key
  }

  valueAt(handle: unknown): V {
    return (handle as Bucketed<K, V>).value.value
  }

  write(handle: unknown, value: V): void {
    ;(handle as Bucketed<K, V>).value.value = value
  }

  holds(handle: unknown): boolean {
    return this.table.contains(handle as Bucketed<K, V>)
  }

  probeAt(handle: unknown): unknown {
    const probe: BucketProbe = { hash: (handle as Bucketed<K, V>).hash, methods: undefined }
    return probe
  }

  removeHandle(handle: unknown): void {
    this.table.remove(handle as Bucketed<K, V>)
  }

  clear(): void {
    this.table.clear()
  }

  handles(): Iterator<unknown> {
    return this.table.entries()
  }

  lookup(keys: readonly K[], op: Operation): (handle: unknown) => boolean {
    const argument = new BucketTable<K>()
    for (const key of keys) argument.insert((this.probe(key, op) as BucketProbe).hash, key)
    const equivalence = this.equivalence
    return (handle) => {
      const entry = handle as Bucketed<K, V>
      return (
        argument.find(entry.hash, (key) =>
          op.after(equivalence.equals(entry.value.key, key, op.where)),
        ) !== undefined
      )
    }
  }

  keyHash(handle: unknown, hash: HashFunction): number {
    const entry = handle as Bucketed<K, V>
    return this.builtIn ? hash(entry.value.key) : entry.hash
  }

  nativeMap(): undefined {
    return undefined
  }

  keyedMap(): undefined {
    return undefined
  }

  copy(): MapStore<K, V> {
    return new BucketMapStore(this.equivalence, this.builtIn, this.table.copy(cloneRecord))
  }
}

/**
 * Returns a store over `map`, a native `Map` compared with SameValueZero.
 *
 * @internal
 */
export function nativeMapStore<K, V>(map: Map<K, V>): MapStore<K, V> {
  return new NativeMapStore(map)
}

/**
 * Returns a new empty store for `equality`.
 *
 * @internal
 */
export function newMapStore<K, V>(equality: HashEquality<K>): MapStore<K, V> {
  switch (equality.kind) {
    case 'native':
      return new NativeMapStore(new Map<K, V>())
    case 'keyed':
      return new KeyedMapStore(equality.key, new Map<unknown, KeyedRecord<K, V>>())
    default:
      return new BucketMapStore(
        equality.equivalence,
        equality.builtIn,
        new BucketTable<BucketRecord<K, V>>(),
      )
  }
}
