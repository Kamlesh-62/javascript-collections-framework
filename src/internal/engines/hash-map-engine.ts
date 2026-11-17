// The engine behind `HashMap`. The public class holds one engine and delegates to it, so nothing
// here reaches the published types.
//
// The engine picks one store at construction and keeps it (see `map-stores.ts`). Every operation
// turns a `-0` key into `0`, derives the key's probe once, looks up before it writes, and records
// the change: `structural()` when a mapping is added or removed, `replaced()` when a value is
// written.

import { ConcurrentModificationError } from '../../errors/errors'
import type { Collection, Cursor } from '../../interfaces/collection'
import type { MapCollection, MapEntry } from '../../interfaces/map'
import type { SetCollection } from '../../interfaces/set'
import { requireFunction } from '../checks'
import type { HashFunction } from '../equality'
import { apply } from '../intrinsics'
import { LiveCursor, MappedLiveIterator } from '../iteration'
import { readPairs } from '../map-input'
import { AbstractMap } from '../skeletons/abstract-map'
import { MapEntryHandle } from '../views/map-entry'
import { HashMapEntrySet, HashMapKeySet, HashMapValues } from '../views/map-views'
import { type HashEquality, normalise, Operation } from './hash-support'
import { type MapStore, MISSING, newMapStore } from './map-stores'

/** A mapping a cursor has reached: its handle and the value it had then. */
type Reached<V> = readonly [unknown, V]

/**
 * A map whose keys are compared with SameValueZero, by derived key, or by an equivalence, kept in
 * insertion order with live iteration.
 *
 * @internal
 */
export class HashMapEngine<K, V> extends AbstractMap<K, V> {
  readonly store: MapStore<K, V>
  private readonly facade: MapCollection<K, V>
  private readonly equality: HashEquality<K>

  /**
   * @param facade - The public map, for identity and callbacks.
   * @param equality - How keys are compared.
   * @param store - The storage to use; a new empty one by default.
   */
  constructor(
    facade: MapCollection<K, V>,
    equality: HashEquality<K>,
    store: MapStore<K, V> = newMapStore<K, V>(equality),
  ) {
    super()
    this.facade = facade
    this.equality = equality
    this.store = store
  }

  get owner(): MapCollection<K, V> {
    return this.facade
  }

  get [Symbol.toStringTag](): string {
    return 'HashMap'
  }

  get size(): number {
    return this.store.size
  }

  handles(_where?: string): Iterator<unknown> {
    return this.store.handles()
  }

  keyAt(handle: unknown): K {
    return this.store.keyAt(handle)
  }

  valueAt(handle: unknown): V {
    return this.store.valueAt(handle)
  }

  keyHash(handle: unknown, hash: HashFunction): number {
    return this.store.keyHash(handle, hash)
  }

  /** Starts an operation whose errors name `where`. */
  operation(where: string): Operation {
    return new Operation(this.changes, where, 'map')
  }

  find(key: K, where: string): unknown {
    const op = this.operation(where)
    const normalised = normalise(key)
    return this.store.find(normalised, this.store.probe(normalised, op), op)
  }

  /** Throws when a callback of `where` added or removed mappings since `start`. */
  private checkCallback(start: number, where: string): void {
    if (this.changes.structure !== start) {
      throw new ConcurrentModificationError(`${where}: the map was changed by the callback`)
    }
  }

  /** Writes `value` to a stored mapping and returns the value it replaced. */
  overwrite(handle: unknown, value: V): V {
    const old = this.store.valueAt(handle)
    this.store.write(handle, value)
    this.changes.replaced()
    return old
  }

  /** Removes a stored mapping and returns its value. */
  removeAt(handle: unknown): V {
    const old = this.store.valueAt(handle)
    this.store.removeHandle(handle)
    this.changes.structural()
    return old
  }

  /** Maps `key` to `value`; returns the previous value, or `MISSING` when the key was absent. */
  setValue(key: K, value: V, where: string): unknown {
    const op = this.operation(where)
    const normalised = normalise(key)
    const probe = this.store.probe(normalised, op)
    const handle = this.store.find(normalised, probe, op)
    if (handle !== MISSING) return this.overwrite(handle, value)
    this.store.insert(normalised, probe, value)
    this.changes.structural()
    return MISSING
  }

  put(key: K, value: V): V | undefined {
    const old = this.setValue(key, value, 'HashMap.put')
    return old === MISSING ? undefined : (old as V)
  }

  /** Sets every mapping of `entries` after reading and checking them all. */
  putAll(entries: unknown): void {
    const pairs = readPairs<K, V>(entries, 'HashMap.putAll')
    for (const pair of pairs) this.setValue(pair[0], pair[1], 'HashMap.putAll')
  }

  /** Removes the mapping of `key`; returns its value, or `MISSING`. */
  removeKey(key: K, where: string): unknown {
    const handle = this.find(key, where)
    return handle === MISSING ? MISSING : this.removeAt(handle)
  }

  replace(key: K, value: V): V | undefined {
    const handle = this.find(key, 'HashMap.replace')
    return handle === MISSING ? undefined : this.overwrite(handle, value)
  }

  getOrInsert(key: K, value: V): V {
    const op = this.operation('HashMap.getOrInsert')
    const normalised = normalise(key)
    const probe = this.store.probe(normalised, op)
    const handle = this.store.find(normalised, probe, op)
    if (handle !== MISSING) return this.store.valueAt(handle)
    this.store.insert(normalised, probe, value)
    this.changes.structural()
    return value
  }

  getOrInsertComputed(key: K, fn: (key: K) => V): V {
    const where = 'HashMap.getOrInsertComputed'
    requireFunction(fn, where, 'fn')
    const normalised = normalise(key)
    const op = this.operation(where)
    const probe = this.store.probe(normalised, op)
    const handle = this.store.find(normalised, probe, op)
    if (handle !== MISSING) return this.store.valueAt(handle)
    const value = apply(fn, undefined, [normalised]) as V
    // The callback may have changed the map: look again, with the probe already derived.
    const again = this.operation(where)
    const now = this.store.find(normalised, probe, again)
    if (now !== MISSING) {
      this.overwrite(now, value)
    } else {
      this.store.insert(normalised, probe, value)
      this.changes.structural()
    }
    return value
  }

  compute(
    key: K,
    fn: (value: V | undefined, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined {
    const where = 'HashMap.compute'
    requireFunction(fn, where, 'fn')
    const normalised = normalise(key)
    const op = this.operation(where)
    const probe = this.store.probe(normalised, op)
    const handle = this.store.find(normalised, probe, op)
    const start = this.changes.structure
    const old = handle === MISSING ? undefined : this.store.valueAt(handle)
    const result = apply(fn, undefined, [old, normalised, this.facade]) as V | undefined
    this.checkCallback(start, where)
    if (result === undefined) {
      if (handle !== MISSING) this.removeAt(handle)
    } else if (handle !== MISSING) {
      this.overwrite(handle, result)
    } else {
      this.store.insert(normalised, probe, result)
      this.changes.structural()
    }
    return result
  }

  computeIfPresent(
    key: K,
    fn: (value: V, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined {
    const where = 'HashMap.computeIfPresent'
    requireFunction(fn, where, 'fn')
    const normalised = normalise(key)
    const handle = this.find(normalised, where)
    if (handle === MISSING) return undefined
    const start = this.changes.structure
    const result = apply(fn, undefined, [this.store.valueAt(handle), normalised, this.facade]) as
      | V
      | undefined
    this.checkCallback(start, where)
    if (result === undefined) this.removeAt(handle)
    else this.overwrite(handle, result)
    return result
  }

  merge(
    key: K,
    value: V,
    fn: (old: V, value: V, key: K, map: MapCollection<K, V>) => V | undefined,
  ): V | undefined {
    const where = 'HashMap.merge'
    requireFunction(fn, where, 'fn')
    const normalised = normalise(key)
    const op = this.operation(where)
    const probe = this.store.probe(normalised, op)
    const handle = this.store.find(normalised, probe, op)
    if (handle === MISSING) {
      this.store.insert(normalised, probe, value)
      this.changes.structural()
      return value
    }
    const start = this.changes.structure
    const result = apply(fn, undefined, [
      this.store.valueAt(handle),
      value,
      normalised,
      this.facade,
    ]) as V | undefined
    this.checkCallback(start, where)
    if (result === undefined) this.removeAt(handle)
    else this.overwrite(handle, result)
    return result
  }

  replaceAll(fn: (value: V, key: K, map: MapCollection<K, V>) => V): void {
    const where = 'HashMap.replaceAll'
    requireFunction(fn, where, 'fn')
    const start = this.changes.structure
    const handles = this.store.handles()
    for (let step = handles.next(); step.done !== true; step = handles.next()) {
      const handle = step.value
      const result = apply(fn, undefined, [
        this.store.valueAt(handle),
        this.store.keyAt(handle),
        this.facade,
      ]) as V
      this.checkCallback(start, where)
      this.overwrite(handle, result)
    }
  }

  clear(): void {
    if (this.store.size === 0) return
    this.store.clear()
    this.changes.structural()
  }

  /**
   * Returns the handle of the mapping `handle` stood for: `handle` itself while stored, otherwise a
   * mapping with an equal key found by the stored probe (no `key` or `hash` call), or `MISSING`.
   */
  relocate(handle: unknown, key: K, probe: unknown, where: string): unknown {
    if (this.store.holds(handle)) return handle
    return this.store.find(key, probe, this.operation(where))
  }

  /** Removes a mapping by handle, or by its stored probe when that handle is gone. */
  removeHandle(handle: unknown, where: string): void {
    const found = this.relocate(handle, this.store.keyAt(handle), this.store.probeAt(handle), where)
    if (found !== MISSING) this.removeAt(found)
  }

  /** Removes the mappings `doomed` accepts, deciding all of them first; returns whether any. */
  removeWhere(doomed: (handle: unknown) => boolean): boolean {
    const chosen: unknown[] = []
    const handles = this.store.handles()
    for (let step = handles.next(); step.done !== true; step = handles.next()) {
      if (doomed(step.value)) chosen.push(step.value)
    }
    if (chosen.length === 0) return false
    for (const handle of chosen) this.store.removeHandle(handle)
    this.changes.structural()
    return true
  }

  /**
   * A live cursor over the mappings, projected by `project` from the handle and the value read
   * when the mapping was reached (so a mapping deleted after `hasNext()` still yields its value);
   * removal is by stored mapping.
   */
  cursor<E>(project: (handle: unknown, value: V) => E, where: string): Cursor<E> {
    return new LiveCursor<E, Reached<V>>(
      new MappedLiveIterator(
        this.store.handles(),
        (handle): Reached<V> => [handle, this.valueAt(handle)],
      ),
      (reached) => this.removeHandle(reached[0], where),
      where,
      (reached) => project(reached[0], reached[1]),
    )
  }

  /** A new entry for a stored mapping; `value` is its value when known (a reached mapping). */
  entryAt(handle: unknown, value: V = this.valueAt(handle)): MapEntry<K, V> {
    return new MapEntryHandle(this, handle, this.store.probeAt(handle), value)
  }

  keySet(): SetCollection<K> {
    return new HashMapKeySet(this)
  }

  entrySet(): SetCollection<MapEntry<K, V>> {
    return new HashMapEntrySet(this)
  }

  valueCollection(): Collection<V> {
    return new HashMapValues(this)
  }

  /** A new engine for `facade` with the same equality and the same stored keys and hashes. */
  copy(facade: MapCollection<K, V>): HashMapEngine<K, V> {
    return new HashMapEngine(facade, this.equality, this.store.copy())
  }
}
