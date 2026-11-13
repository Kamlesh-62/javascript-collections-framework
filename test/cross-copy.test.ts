import { describe, expect, it, vi } from 'vitest'
import { brandedClasses, brandedValue, checkTwoCopies, guards } from '../scripts/lib/two-copies.mjs'

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

describe('the two-copy check', () => {
  async function twoCopies(): Promise<[Record<string, unknown>, Record<string, unknown>]> {
    const a = { ...(await import('../src/index')) } as Record<string, unknown>
    vi.resetModules()
    const b = { ...(await import('../src/index')) } as Record<string, unknown>
    return [a, b]
  }

  it('finds every error class and guard and has each copy accept the other copy’s values [005 S4-AC1]', async () => {
    const [a, b] = await twoCopies()
    const result = checkTwoCopies(a, b)
    expect(result.failures).toEqual([])
    expect(brandedClasses(a)).toEqual([...NAMES].sort())
    expect(guards(a)).toEqual(['isCollection'])
    expect(result.lines.at(-1)).toBe('two copies: 8 classes, 1 guards — ok')
    expect(result.lines).toContain(
      'isCollection: major 2 refused; cross-copy no exported collection to check across copies',
    )
  })

  it('refuses values carrying another major version’s brand [005 S4-AC2]', async () => {
    const [a, b] = await twoCopies()
    const isCollection = a.isCollection as (value: unknown) => boolean
    expect(isCollection(brandedValue(1, 'Collection'))).toBe(true)
    expect(isCollection(brandedValue(2, 'Collection'))).toBe(false)
    for (const name of NAMES) {
      expect(brandedValue(2, name) instanceof (a[name] as ErrorClass)).toBe(false)
      expect(brandedValue(2, name) instanceof (b[name] as ErrorClass)).toBe(false)
    }
    const lax = { ...a, isAnything: () => true }
    expect(checkTwoCopies(lax, { ...b, isAnything: () => true }).failures).toContain(
      'isAnything: a major-2 value is accepted (copy A)',
    )
  })

  it('fails when it finds fewer than the eight error classes and isCollection [005 S4-AC4]', async () => {
    const [a, b] = await twoCopies()
    const { IllegalStateError: _dropped, isCollection: _guard, ...fewer } = a
    const failures = checkTwoCopies(fewer, b).failures
    expect(failures).toContain('found 7 classes recognised across copies; expected at least 8')
    expect(failures).toContain('guard isCollection not found')
    expect(checkTwoCopies({}, {}).ok).toBe(false)
  })
})
