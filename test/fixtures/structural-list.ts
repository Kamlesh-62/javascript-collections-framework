// A test-only FailFastList with structural equality, to exercise the cycle guard and a fixed,
// hash-function-driven combination of member hashes.

import { equals, type HashFunction, hashCodeSymbol } from '../../src/index'
import { createGuard } from '../../src/internal/cycle'
import { FailFastList } from './fail-fast-list'

/** The fixture's member-hash combination (internal to the fixture; families define their own). */
export function combine(elements: unknown[], hash: HashFunction): number {
  let h = 1
  for (const element of elements) h = (Math.imul(31, h) + hash(element)) | 0
  return h
}

// One guard per operation, so an element's own code can compare or hash a list mid-operation.
const equalsGuard = createGuard()
const hashGuard = createGuard()

export class StructuralList<E> extends FailFastList<E> {
  override get [Symbol.toStringTag](): string {
    return 'StructuralList'
  }

  override equals(other: unknown): boolean {
    if (other === this) return true
    if (!(other instanceof StructuralList) || other.size !== this.size) return false
    return equalsGuard(
      this,
      () => false,
      () => {
        const mine = this.items
        const theirs = (other as StructuralList<unknown>).items
        for (let i = 0; i < mine.length; i++) if (!equals(mine[i], theirs[i])) return false
        return true
      },
    )
  }

  override [hashCodeSymbol](hash: HashFunction): number {
    return hashGuard(
      this,
      () => 0,
      () => combine(this.items, hash),
    )
  }
}
