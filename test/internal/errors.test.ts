import { afterEach, describe, expect, it } from 'vitest'
import { IndexOutOfBoundsError } from '../../src/index'
import { initError } from '../../src/internal/errors'

type WithCapture = { captureStackTrace?: unknown }
const original = (Error as WithCapture).captureStackTrace

afterEach(() => {
  ;(Error as WithCapture).captureStackTrace = original
})

describe('initError', () => {
  it('repairs the prototype chain when a down-levelled constructor returns a plain native error', () => {
    // What ES5 output does: `_super.call(this, message) || this` yields a plain RangeError.
    const plain = new RangeError('List.get: index 5 is out of bounds for size 3')
    initError(plain, 'IndexOutOfBoundsError', IndexOutOfBoundsError)
    expect(plain instanceof IndexOutOfBoundsError).toBe(true)
    expect(plain instanceof RangeError).toBe(true)
    expect(plain.name).toBe('IndexOutOfBoundsError')
    expect(Object.keys(plain)).toEqual([])
  })

  it('still constructs errors on runtimes without Error.captureStackTrace', () => {
    ;(Error as WithCapture).captureStackTrace = undefined
    const error = new IndexOutOfBoundsError('x')
    expect(error.message).toBe('x')
    expect(error.name).toBe('IndexOutOfBoundsError')
    expect(typeof error.stack).toBe('string')
  })
})
