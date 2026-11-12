import { describe, expect, it } from 'vitest'
import {
  type Equivalence,
  equalsSymbol,
  hashCodeSymbol,
  sameValueZeroEquivalence,
  valueEquivalence,
} from '../../src/index'
import { checkEquivalence } from '../../src/internal/equivalence'
import { fixHashSeed } from '../support/hash-seed'

fixHashSeed()

const message = (fn: () => unknown): string => {
  try {
    fn()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('expected a throw')
}

describe('checkEquivalence', () => {
  it('reads equals and hash once, calls them with this set to the equivalence, and rejects bad options [003 S3-AC3]', () => {
    let reads = 0
    const receivers: unknown[] = []
    class CaseInsensitive {
      get equals() {
        reads++
        return function (this: unknown, a: string, b: string) {
          receivers.push(this)
          return a.toLowerCase() === b.toLowerCase()
        }
      }
      get hash() {
        reads++
        return function (this: unknown, s: string) {
          receivers.push(this)
          return s.toLowerCase().length
        }
      }
    }
    const option = new CaseInsensitive()
    const checked = checkEquivalence(option, 'HashSet.constructor')
    expect(reads).toBe(2)
    expect(checked.equals('A', 'a', 'HashSet.add')).toBe(true)
    expect(checked.equals('A', 'b', 'HashSet.add')).toBe(false)
    expect(checked.hash('AbC', 'HashSet.add')).toBe(3)
    expect(reads).toBe(2)
    expect(receivers).toEqual([option, option, option])

    for (const bad of [
      null,
      1,
      'x',
      () => 1,
      {},
      { equals: () => true },
      { hash: () => 1 },
      { equals: 1, hash: () => 1 },
    ]) {
      expect(() => checkEquivalence(bad, 'HashSet.constructor')).toThrow(TypeError)
    }
    expect(message(() => checkEquivalence(null, 'HashSet.constructor'))).toBe(
      'HashSet.constructor: equivalence must be an object with equals and hash functions',
    )
    // Omitted means the default (SameValueZero).
    const fallback = checkEquivalence(undefined, 'HashSet.constructor')
    expect(fallback.equals(Number.NaN, Number.NaN, 'HashSet.add')).toBe(true)
    expect(fallback.equals({}, {}, 'HashSet.add')).toBe(false)
  })

  it('rejects a non-boolean from equals, naming the collection method [003 S3-AC4]', () => {
    const compareStyle: Equivalence<{ id: number }> = {
      // The compare-style mistake: 0 (falsy) when the ids are equal.
      equals: ((a: { id: number }, b: { id: number }) => a.id - b.id) as never,
      hash: (v) => v.id,
    }
    const checked = checkEquivalence(compareStyle, 'HashMap.constructor')
    expect(() => checked.equals({ id: 1 }, { id: 1 }, 'HashMap.get')).toThrow(TypeError)
    expect(message(() => checked.equals({ id: 1 }, { id: 1 }, 'HashMap.get'))).toBe(
      'HashMap.get: equivalence.equals returned 0',
    )
  })

  it('rejects a non-finite hash, naming the method, and reduces finite ones with ToInt32 [003 S3-AC5]', () => {
    const returning = (result: unknown) =>
      checkEquivalence({ equals: () => true, hash: () => result }, 'HashMap.constructor')
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, '1', null, undefined, 1n]) {
      expect(() => returning(bad).hash('x', 'HashMap.set')).toThrow(TypeError)
    }
    expect(message(() => returning(Number.NaN).hash('x', 'HashMap.set'))).toBe(
      'HashMap.set: equivalence.hash returned NaN',
    )
    expect(returning(2 ** 32 + 7.9).hash('x', 'HashMap.set')).toBe(7)
  })

  it('routes the built-in equivalences so protocol errors, nested ones included, name the method [003 S3-AC6]', () => {
    const checked = checkEquivalence(valueEquivalence, 'HashSet.constructor')
    const badEquals = { [equalsSymbol]: () => 1, [hashCodeSymbol]: () => 1 }
    expect(message(() => checked.equals(badEquals, { ...badEquals }, 'HashSet.add'))).toBe(
      'HashSet.add: [equalsSymbol] returned 1',
    )
    const half = { [equalsSymbol]: () => true }
    expect(message(() => checked.hash(half, 'HashSet.add'))).toBe(
      'HashSet.add: object implements [equalsSymbol] without [hashCodeSymbol]',
    )
    // A nested value hashed through the passed function also names the collection method.
    const outer = {
      [equalsSymbol]: () => true,
      [hashCodeSymbol]: (hash: (v: unknown) => number) => hash(half),
    }
    expect(message(() => checked.hash(outer, 'HashSet.add'))).toBe(
      'HashSet.add: object implements [equalsSymbol] without [hashCodeSymbol]',
    )
    // sameValueZeroEquivalence is recognised too: no protocol, so no protocol errors.
    const plain = checkEquivalence(sameValueZeroEquivalence, 'HashSet.constructor')
    expect(() => plain.hash(half, 'HashSet.add')).not.toThrow()
    // An equivalence object from elsewhere (not recognised) is treated as a custom one.
    const lookalike = { equals: valueEquivalence.equals, hash: valueEquivalence.hash }
    const custom = checkEquivalence(lookalike, 'HashSet.constructor')
    expect(message(() => custom.hash(half, 'HashSet.add'))).toBe(
      'hashCode: object implements [equalsSymbol] without [hashCodeSymbol]',
    )
  })
})
