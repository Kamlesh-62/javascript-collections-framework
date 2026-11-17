// The set a map backs: its members are the map's keys. Adding goes through the map's
// `getOrInsert`; reading, iterating and removing go through the map's key set, so the map's key
// equality, order, eviction and iteration mode apply unchanged.

import type { Cursor } from '../../interfaces/collection'
import type { MapCollection } from '../../interfaces/map'
import type { SetCollection } from '../../interfaces/set'
import { type HashFunction, hashCodeSymbol } from '../equality'
import { apply } from '../intrinsics'
import { AbstractSet } from '../skeletons/abstract-set'

/**
 * A live set over a map's keys; every member maps to `true` when added through the set.
 *
 * @internal
 */
export class SetFromMap<E> extends AbstractSet<E> {
  private readonly map: MapCollection<E, boolean>
  private readonly members: SetCollection<E>

  constructor(map: MapCollection<E, boolean>) {
    super()
    this.map = map
    this.members = map.keySet()
  }

  get owner(): SetCollection<E> {
    return this
  }

  get [Symbol.toStringTag](): string {
    return 'SetFromMap'
  }

  get size(): number {
    return this.map.size
  }

  override isEmpty(): boolean {
    return this.map.isEmpty()
  }

  override get revision(): number {
    return this.map.revision
  }

  [Symbol.iterator](): IterableIterator<E> {
    return this.members[Symbol.iterator]()
  }

  cursor(): Cursor<E> {
    return this.members.cursor()
  }

  protected hasMember(element: E, _method: string): boolean {
    return this.members.has(element)
  }

  add(element: E): this {
    this.map.getOrInsert(element, true)
    return this
  }

  /** Adds one element at a time; `true` when some element was absent just before its add. */
  override addAll(elements: Iterable<E>): boolean {
    const items = this.readAll(elements, 'addAll')
    const map = this.map
    let added = false
    for (const item of items) {
      if (!map.has(item)) added = true
      map.getOrInsert(item, true)
    }
    return added
  }

  override delete(element: E): boolean {
    return this.members.delete(element)
  }

  override clear(): void {
    this.members.clear()
  }

  override forEach(
    action: (element: E, same: E, set: SetCollection<E>) => void,
    thisArg?: unknown,
  ): void {
    this.requireFunction(action, 'forEach', 'action')
    this.members.forEach((element) => {
      apply(action, thisArg, [element, element, this])
    })
  }

  override removeIf(predicate: (element: E) => unknown): boolean {
    this.requireFunction(predicate, 'removeIf', 'predicate')
    return this.members.removeIf(predicate)
  }

  override removeAll(elements: Iterable<E>): boolean {
    return this.members.removeAll(this.readAll(elements, 'removeAll'))
  }

  override retainAll(elements: Iterable<E>): boolean {
    return this.members.retainAll(this.readAll(elements, 'retainAll'))
  }

  protected memberHashes(hash: HashFunction): number {
    return this.members[hashCodeSymbol](hash)
  }
}
