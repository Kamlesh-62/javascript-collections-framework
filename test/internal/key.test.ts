import { describe, expect, it } from 'vitest'
import type { KeyOf } from '../../src/index'
import { checkKey, deriveKey } from '../../src/internal/key'

const message = (fn: () => unknown): string => {
  try {
    fn()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('expected a throw')
}

describe('keys', () => {
  it('derives primitive keys that compare with SameValueZero, as native Map keys do [003 S5-AC1]', () => {
    const byId = checkKey<{ id: unknown }>(
      (v: { id: unknown }) => v.id,
      'HashMap.constructor',
    ) as KeyOf<{ id: unknown }>
    const map = new Map<unknown, string>()
    map.set(deriveKey(byId, { id: Number.NaN }, 'HashMap.set'), 'nan')
    map.set(deriveKey(byId, { id: -0 }, 'HashMap.set'), 'zero')
    expect(map.get(deriveKey(byId, { id: Number.NaN }, 'HashMap.get'))).toBe('nan')
    expect(map.get(deriveKey(byId, { id: 0 }, 'HashMap.get'))).toBe('zero')
    const sym = Symbol('k')
    for (const key of ['s', 1, 1n, true, sym, null, undefined]) {
      expect(deriveKey(byId, { id: key }, 'HashMap.set')).toBe(key)
    }
  })

  it('calls the key function once with only the value, and lets its errors through [003 S5-AC2]', () => {
    const calls: unknown[][] = []
    const key = function (this: unknown, ...args: unknown[]) {
      calls.push([this, ...args])
      return 'k'
    }
    const checked = checkKey(key, 'HashMap.constructor') as KeyOf<number>
    expect(deriveKey(checked, 5, 'HashMap.set')).toBe('k')
    expect(calls).toEqual([[undefined, 5]])

    const failure = new Error('key failed')
    let caught: unknown
    try {
      deriveKey(
        () => {
          throw failure
        },
        1,
        'HashMap.set',
      )
    } catch (error) {
      caught = error
    }
    expect(caught).toBe(failure)
  })

  it('rejects a key function that returns an object or function, naming the method [003 S5-AC3]', () => {
    const returning = (result: unknown) => (() => result) as unknown as KeyOf<unknown>
    for (const bad of [{}, [1, 2], () => 1, new String('a'), new Date(0)]) {
      expect(() => deriveKey(returning(bad), 1, 'HashMap.set')).toThrow(TypeError)
    }
    expect(message(() => deriveKey(returning([1, 2]), 1, 'HashMap.set'))).toBe(
      'HashMap.set: key function returned object',
    )
  })

  it('rejects a null or non-function key option, naming the constructor; undefined means none [003 S5-AC4]', () => {
    for (const bad of [null, 1, 'id', {}]) {
      expect(() => checkKey(bad, 'HashMap.constructor')).toThrow(TypeError)
    }
    expect(message(() => checkKey(null, 'HashMap.constructor'))).toBe(
      'HashMap.constructor: key is not a function',
    )
    expect(checkKey(undefined, 'HashMap.constructor')).toBeUndefined()
  })
})
