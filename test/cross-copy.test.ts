import { describe, expect, it, vi } from 'vitest'

// Two copies of the package (an ESM and a CJS build, or two nested installs) are simulated by
// loading the entry module twice with the module registry reset in between.
const NAMES = [
  'IndexOutOfBoundsError',
  'IllegalArgumentError',
  'UnsupportedOperationError',
  'NullElementError',
  'ClassCastError',
  'NoSuchElementError',
  'IllegalStateError',
  'ConcurrentModificationError',
] as const

type ErrorClass = new (message?: string) => Error

describe('two copies of the library', () => {
  it("recognise each other's instances with instanceof, in both directions [001 S2-AC1]", async () => {
    const first = (await import('../src/index')) as unknown as Record<string, ErrorClass>
    vi.resetModules()
    const second = (await import('../src/index')) as unknown as Record<string, ErrorClass>

    for (const name of NAMES) {
      const A = first[name] as ErrorClass
      const B = second[name] as ErrorClass
      expect(A).not.toBe(B)
      expect(new A('x') instanceof B).toBe(true)
      expect(new B('x') instanceof A).toBe(true)
      for (const other of NAMES) {
        if (other !== name) expect(new A('x') instanceof (second[other] as ErrorClass)).toBe(false)
      }
    }
  })
})
