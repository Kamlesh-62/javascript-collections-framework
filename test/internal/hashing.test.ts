import { describe, expect, it } from 'vitest'
import { equals, equalsSymbol, hashCode, hashCodeSymbol, naturalOrder } from '../../src/index'
import { hashPrimitiveOrIdentity, setHashSeedForTesting } from '../../src/internal/hashing'
import { fixHashSeed, TEST_SEED } from '../support/hash-seed'

fixHashSeed()

// Hash values are not public, so checks that depend on particular values live here, against the
// internal hash function, under fixed seeds.
describe('internal hashing', () => {
  it('seeds numbers, bigints, strings and symbols: two seeds differ, and Aa and BB differ [003 S2-AC8]', () => {
    const shared = Symbol('shared')
    const sample: unknown[] = [
      '',
      'a',
      'Aa',
      'BB',
      'hello world',
      '😀',
      'x'.repeat(50),
      42.5,
      2n ** 70n,
      shared,
    ]
    setHashSeedForTesting(1)
    const first = sample.map((v) => hashPrimitiveOrIdentity(v))
    setHashSeedForTesting(2)
    const second = sample.map((v) => hashPrimitiveOrIdentity(v))
    for (let i = 0; i < sample.length; i++) expect(first[i], String(sample[i])).not.toBe(second[i])
    setHashSeedForTesting(TEST_SEED)
    expect(hashPrimitiveOrIdentity('Aa')).not.toBe(hashPrimitiveOrIdentity('BB'))
    expect(hashPrimitiveOrIdentity('AaAa')).not.toBe(hashPrimitiveOrIdentity('BBBB'))
  })

  it('reads every code unit of a string and gives distinct objects distinct identities [003 S4-AC2]', () => {
    const long = 'a'.repeat(10_000)
    expect(hashPrimitiveOrIdentity(`${long}b`)).not.toBe(hashPrimitiveOrIdentity(`${long}c`))
    expect(hashPrimitiveOrIdentity({})).not.toBe(hashPrimitiveOrIdentity({}))
  })

  it('runs no replaced WeakMap methods or Reflect.apply for identities, dates or protocol calls', () => {
    const object = {}
    const point = { [equalsSymbol]: () => true, [hashCodeSymbol]: () => 3 }
    const compare = naturalOrder<Date>()
    const before = [hashCode(object), hashCode(point)]
    let ran = 0
    const saved = { get: WeakMap.prototype.get, set: WeakMap.prototype.set, apply: Reflect.apply }
    let after: number[] = []
    let dateOrder = 0
    let same = false
    try {
      WeakMap.prototype.get = () => {
        ran++
        return undefined
      }
      WeakMap.prototype.set = function (this: WeakMap<object, unknown>) {
        ran++
        return this
      }
      Reflect.apply = () => {
        ran++
        return 0
      }
      after = [hashCode(object), hashCode(point), hashCode({})]
      dateOrder = compare(new Date(1), new Date(2))
      same = equals(point, { ...point })
    } finally {
      WeakMap.prototype.get = saved.get
      WeakMap.prototype.set = saved.set
      Reflect.apply = saved.apply
    }
    expect(ran).toBe(0)
    expect(after.slice(0, 2)).toEqual(before)
    expect(dateOrder).toBe(-1)
    expect(same).toBe(true)
  })
})
