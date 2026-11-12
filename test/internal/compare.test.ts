import { describe, expect, it } from 'vitest'
import type { Comparator } from '../../src/index'
import { guardedCompare } from '../../src/internal/compare'

describe('guardedCompare', () => {
  it('throws TypeError naming the collection method for a non-number or NaN result [002 S4-AC1]', () => {
    for (const bad of [Number.NaN, '1', undefined, null, 1n, {}, true]) {
      const comparator = (() => bad) as unknown as Comparator<number>
      expect(() => guardedCompare(comparator, 1, 2, 'TreeMap.put')).toThrow(TypeError)
    }
    let message = ''
    try {
      guardedCompare(() => Number.NaN, 1, 2, 'TreeMap.put')
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toBe('TreeMap.put: comparator returned NaN')
  })

  it('lets an error thrown by the comparator propagate unchanged [002 S4-AC2]', () => {
    const failure = new Error('comparator failed')
    let caught: unknown
    try {
      guardedCompare(
        () => {
          throw failure
        },
        1,
        2,
        'TreeMap.put',
      )
    } catch (error) {
      caught = error
    }
    expect(caught).toBe(failure)
  })

  it('returns only the sign of the result, calling the comparator once [002 S4-AC3]', () => {
    let calls = 0
    const scaled: Comparator<number> = (a, b) => {
      calls++
      return (a - b) * 1e6
    }
    expect(guardedCompare(scaled, 1, 2, 'TreeMap.put')).toBe(-1)
    expect(guardedCompare(scaled, 5, 2, 'TreeMap.put')).toBe(1)
    expect(
      Object.is(
        guardedCompare(() => -0, 1, 1, 'TreeMap.put'),
        0,
      ),
    ).toBe(true)
    expect(guardedCompare(() => Number.NEGATIVE_INFINITY, 1, 2, 'TreeMap.put')).toBe(-1)
    expect(calls).toBe(2)
  })
})
