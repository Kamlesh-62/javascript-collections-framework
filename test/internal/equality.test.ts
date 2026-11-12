import { describe, expect, it } from 'vitest'
import { equalsSymbol, hashCode, hashCodeSymbol } from '../../src/index'
import { equalsAt, hashAt, protocolOf } from '../../src/internal/equality'
import { fixHashSeed } from '../support/hash-seed'

fixHashSeed()

// The entry points hashed collections use: protocol methods read once by the collection are
// passed back in, so one operation reads each user method once.
describe('internal equality entry points', () => {
  it('protocolOf reads both methods once, and only on objects', () => {
    expect(protocolOf(1)).toBeUndefined()
    expect(protocolOf('x')).toBeUndefined()
    expect(protocolOf(() => 1)).toBeUndefined()
    expect(protocolOf(null)).toBeUndefined()
    let reads = 0
    const value = {
      get [equalsSymbol]() {
        reads++
        return () => true
      },
      get [hashCodeSymbol]() {
        reads++
        return () => 7
      },
    }
    const methods = protocolOf(value)
    expect(reads).toBe(2)
    expect(typeof methods?.equals).toBe('function')
    expect(typeof methods?.hash).toBe('function')
  })

  it('equalsAt and hashAt use methods already read instead of reading again', () => {
    let reads = 0
    const value = {
      get [equalsSymbol]() {
        reads++
        return () => true
      },
      get [hashCodeSymbol]() {
        reads++
        return () => 7
      },
    }
    const other = { [equalsSymbol]: () => true, [hashCodeSymbol]: () => 7 }
    const methods = protocolOf(value)
    reads = 0
    expect(hashAt(value, 'HashSet.add', hashCode, methods)).toBe(7)
    expect(equalsAt(value, other, 'HashSet.add', methods)).toBe(true)
    expect(reads).toBe(0)
  })
})
