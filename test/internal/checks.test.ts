import { describe, expect, it } from 'vitest'
import { IllegalArgumentError, IndexOutOfBoundsError } from '../../src/index'
import {
  checkIndex,
  checkPosition,
  checkRange,
  describeValue,
  isIterable,
  requireFunction,
} from '../../src/internal/checks'

// Values that are never a valid index, position or range bound.
const NOT_SAFE_INTEGERS: ReadonlyArray<unknown> = [
  '1',
  '',
  1n,
  true,
  false,
  null,
  undefined,
  new Number(1),
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
  1.5,
  2 ** 53,
  -(2 ** 53),
  {},
  [1],
  () => 1,
  Symbol('i'),
]

const message = (fn: () => unknown): string => {
  try {
    fn()
  } catch (error) {
    return (error as Error).message
  }
  throw new Error('expected a throw')
}

describe('checkIndex', () => {
  it('accepts 0 to size - 1 and rejects negatives and size or more [001 S3-AC1]', () => {
    expect(checkIndex(0, 3, 'List.get')).toBe(0)
    expect(checkIndex(2, 3, 'List.get')).toBe(2)
    for (const bad of [-1, 3, 4, 2 ** 31]) {
      expect(() => checkIndex(bad, 3, 'List.get')).toThrow(IndexOutOfBoundsError)
    }
    expect(() => checkIndex(0, 0, 'List.get')).toThrow(IndexOutOfBoundsError)
  })
})

describe('checkPosition', () => {
  it('accepts 0 to size and rejects negatives and more than size [001 S3-AC2]', () => {
    expect(checkPosition(0, 0, 'List.add')).toBe(0)
    expect(checkPosition(3, 3, 'List.add')).toBe(3)
    for (const bad of [-1, 4]) {
      expect(() => checkPosition(bad, 3, 'List.add')).toThrow(IndexOutOfBoundsError)
    }
  })
})

describe('checkRange', () => {
  it('rejects a bad from, from < 0, a bad to and to > size, naming the first bound that fails [001 S3-AC3]', () => {
    expect(() => checkRange(-1, 2, 3, 'List.subList')).toThrow(IndexOutOfBoundsError)
    expect(() => checkRange(0, 4, 3, 'List.subList')).toThrow(IndexOutOfBoundsError)
    expect(message(() => checkRange(-1, 1.5, 3, 'List.subList'))).toContain('from -1')
    expect(message(() => checkRange('a', 9, 3, 'List.subList'))).toContain('from "a"')
    expect(message(() => checkRange(0, 1.5, 3, 'List.subList'))).toContain('to 1.5')
    expect(message(() => checkRange(1, 9, 3, 'List.subList'))).toContain('to 9')
    // to > size is checked before from > to
    expect(() => checkRange(3, 2, 1, 'List.subList')).toThrow(IndexOutOfBoundsError)
    expect(message(() => checkRange(3, 2, 1, 'List.subList'))).toContain('to 2')
  })

  it('rejects from > to with IllegalArgumentError once both bounds are valid [001 S3-AC7]', () => {
    expect(() => checkRange(2, 1, 3, 'List.subList')).toThrow(IllegalArgumentError)
    expect(() => checkRange(0, -1, 3, 'List.subList')).toThrow(IllegalArgumentError)
    expect(() => checkRange(2 ** 53, 3, 3, 'List.subList')).toThrow(IndexOutOfBoundsError)
  })

  it('accepts an empty range at every valid point, including at size and for size 0 [001 S3-AC8]', () => {
    for (const at of [0, 1, 3]) expect(() => checkRange(at, at, 3, 'List.subList')).not.toThrow()
    expect(() => checkRange(0, 0, 0, 'List.subList')).not.toThrow()
    expect(() => checkRange(-0, 0, 0, 'List.subList')).not.toThrow()
  })
})

describe('non-number and non-integer arguments', () => {
  it('rejects them without coercion, and treats -0 as 0, for indexes, positions and ranges [001 S3-AC4]', () => {
    for (const bad of NOT_SAFE_INTEGERS) {
      expect(() => checkIndex(bad, 5, 'List.get')).toThrow(IndexOutOfBoundsError)
      expect(() => checkPosition(bad, 5, 'List.add')).toThrow(IndexOutOfBoundsError)
      expect(() => checkRange(bad, 1, 5, 'List.subList')).toThrow(IndexOutOfBoundsError)
      expect(() => checkRange(0, bad, 5, 'List.subList')).toThrow(IndexOutOfBoundsError)
    }
    expect(Object.is(checkIndex(-0, 1, 'List.get'), 0)).toBe(true)
    expect(Object.is(checkPosition(-0, 0, 'List.add'), 0)).toBe(true)
  })
})

describe('messages', () => {
  it('start with Class.method and name the value and the size [001 S3-AC5]', () => {
    const index = message(() => checkIndex(5, 3, 'ArrayList.get'))
    expect(index.startsWith('ArrayList.get: ')).toBe(true)
    expect(index).toContain('5')
    expect(index).toContain('3')

    const position = message(() => checkPosition('x', 2, 'ArrayList.add'))
    expect(position.startsWith('ArrayList.add: ')).toBe(true)
    expect(position).toContain('"x"')
    expect(position).toContain('2')

    const range = message(() => checkRange(4, 1, 7, 'ArrayList.subList'))
    expect(range.startsWith('ArrayList.subList: ')).toBe(true)
    expect(range).toContain('4')
    expect(range).toContain('1')
    expect(range).toContain('7')
  })
})

describe('describeValue', () => {
  it('renders values without running user code, with bounded and escaped strings [001 S3-AC6]', () => {
    let touched = false
    const hostile = {
      toString() {
        touched = true
        return 'hostile'
      },
      get [Symbol.toStringTag]() {
        touched = true
        return 'Hostile'
      },
    }
    const proxy = new Proxy(
      {},
      {
        get() {
          touched = true
          return undefined
        },
        getPrototypeOf() {
          touched = true
          return null
        },
      },
    )
    expect(describeValue(hostile)).toBe('object')
    expect(describeValue(proxy)).toBe('object')
    expect(describeValue(() => 1)).toBe('function')
    expect(touched).toBe(false)

    expect(describeValue('a"b\nc')).toBe('"a\\"b\\nc"')
    const long = 'x'.repeat(100)
    expect(describeValue(long)).toBe(JSON.stringify('x'.repeat(40)))
    const pairAtCut = `${'x'.repeat(39)}😀tail`
    expect(describeValue(pairAtCut)).toBe(JSON.stringify('x'.repeat(39)))

    expect(describeValue(Symbol('s'))).toBe('Symbol(s)')
    expect(describeValue(Symbol('d'.repeat(100))).length).toBe(40)
    expect(describeValue(12n)).toBe('12n')
    expect(describeValue(10n ** 100n)).toBe(`${'1'}${'0'.repeat(39)}n`)
    expect(describeValue(-0)).toBe('0')
    expect(describeValue(1.5)).toBe('1.5')
    expect(describeValue(Number.NaN)).toBe('NaN')
    expect(describeValue(true)).toBe('true')
    expect(describeValue(null)).toBe('null')
    expect(describeValue(undefined)).toBe('undefined')
  })
})

describe('isIterable', () => {
  it('accepts values with a callable Symbol.iterator', () => {
    for (const value of [
      [],
      '',
      new Set(),
      new Map(),
      { [Symbol.iterator]: () => [][Symbol.iterator]() },
    ]) {
      expect(isIterable(value)).toBe(true)
    }
  })

  it('rejects null, undefined, array-likes and a non-callable Symbol.iterator', () => {
    for (const value of [null, undefined, 1, {}, { length: 2 }, { [Symbol.iterator]: 1 }]) {
      expect(isIterable(value)).toBe(false)
    }
  })
})

describe('requireFunction', () => {
  it('accepts functions and classes', () => {
    expect(() => requireFunction(() => 1, 'A.m', 'f')).not.toThrow()
    expect(() => requireFunction(class {}, 'A.m', 'f')).not.toThrow()
  })

  it('throws TypeError naming the method and parameter otherwise', () => {
    expect(() => requireFunction(null, 'ArrayList.sort', 'comparator')).toThrow(
      new TypeError('ArrayList.sort: comparator is not a function'),
    )
  })
})
