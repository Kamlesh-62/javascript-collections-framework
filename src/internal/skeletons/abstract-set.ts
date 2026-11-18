// The skeleton every set extends: live iteration, `{}` brackets, the native `Set` reading methods,
// and equality and hashing by members, whatever the insertion order.

import type { SetCollection } from '../../interfaces/set'
import { isBranded, SET_COLLECTION_BRAND } from '../brand'
import { createGuard, rememberEqual } from '../cycle'
import { type HashFunction, hashCodeSymbol } from '../equality'
import { apply } from '../intrinsics'
import { MappedLiveIterator } from '../iteration'
import { AbstractCollection } from './abstract-collection'

// One guard per operation, so a member's own code can compare or hash a set mid-operation.
const equalsGuard = /*#__PURE__*/ createGuard()
const hashGuard = /*#__PURE__*/ createGuard()

function pair<E>(element: E): [E, E] {
  return [element, element]
}

/**
 * Base class of every set.
 *
 * Subclasses implement `size`, `[Symbol.iterator]`, `add`, `cursor`, `[Symbol.toStringTag]`,
 * `owner`, `hasMember` (membership naming the calling method in errors) and `memberHashes` (the
 * order-independent sum of the members' hashes).
 *
 * @internal
 */
export abstract class AbstractSet<E> extends AbstractCollection<E> implements SetCollection<E> {
  /** `live` by default, as native `Set`; sorted sets, which have no native twin, are `fail-fast`. */
  protected readonly iterationMode: 'fail-fast' | 'live' = 'live'

  /** The public set handed to `forEach` callbacks: the object the caller holds. */
  abstract get owner(): SetCollection<E>

  /** Returns whether a member equals `element`; errors name `${className}.${method}`. */
  protected abstract hasMember(element: E, method: string): boolean

  /** Returns the 32-bit sum of the members' hashes, as this set's equality defines them. */
  protected abstract memberHashes(hash: HashFunction): number

  /** Marks every set for `isSetCollection`, across loaded copies. */
  get [SET_COLLECTION_BRAND](): true {
    return true
  }

  protected override brackets(): readonly [string, string] {
    return ['{', '}']
  }

  override has(element: E): boolean {
    return this.hasMember(element, 'has')
  }

  keys(): IterableIterator<E> {
    return this[Symbol.iterator]()
  }

  values(): IterableIterator<E> {
    return this[Symbol.iterator]()
  }

  entries(): IterableIterator<[E, E]> {
    return new MappedLiveIterator<E, [E, E]>(this[Symbol.iterator](), pair)
  }

  override forEach(
    action: (element: E, same: E, set: SetCollection<E>) => void,
    thisArg?: unknown,
  ): void {
    this.requireFunction(action, 'forEach', 'action')
    const owner = this.owner
    for (const element of this) apply(action, thisArg, [element, element, owner])
  }

  /**
   * Equal when `other` is a set of the same size, every member of this set is in `other` and
   * every member of `other` is in this set, so the result is the same both ways round even when
   * the two sets compare members differently.
   */
  override equals(other: unknown): boolean {
    if (other === this || other === this.owner) return true
    if (!isBranded(other, SET_COLLECTION_BRAND)) return false
    const that = other as SetCollection<unknown>
    if (that.size !== this.size) return false
    return rememberEqual(this.owner, that, () =>
      equalsGuard(
        this,
        () => false,
        () => {
          for (const element of this) if (!that.has(element)) return false
          for (const element of that) if (!this.hasMember(element as E, 'equals')) return false
          return true
        },
      ),
    )
  }

  override [hashCodeSymbol](hash: HashFunction): number {
    return hashGuard(
      this,
      () => 0,
      () => this.memberHashes(hash),
    )
  }
}
