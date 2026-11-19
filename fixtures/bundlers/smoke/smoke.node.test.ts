// The smoke check once in Node.js, against the package as Node.js resolves it, and its guard on
// exports it does not cover.

import * as lib from 'javascript-collections-framework'
import { describe, expect, it } from 'vitest'
import { COLLECTIONS, smoke } from './smoke.js'

describe('smoke check in Node.js', () => {
  it('passes on the built package, covering ten collection classes and every error class [039 S1-AC1]', () => {
    const errors = Object.keys(lib).filter((name) => name.endsWith('Error'))
    expect(COLLECTIONS).toHaveLength(10)
    expect(smoke(lib)).toEqual({ collections: 10, errors: errors.length })
  })

  it('fails when a collection class is exported that the check does not cover [039 S1-AC1]', () => {
    class ExtraList {}
    expect(() => smoke({ ...lib, ExtraList })).toThrow('11 collection classes are exported')
  })

  it('fails when an error class does not extend a native error [039 S1-AC1]', () => {
    class OddError {}
    expect(() => smoke({ ...lib, OddError })).toThrow('OddError does not extend a native error')
  })
})
