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
    expect(brandedClasses(a)).toEqual([...NAMES, 'ArrayList'].sort())
    expect(guards(a)).toEqual(['isCollection', 'isList', 'isSequencedCollection'])
    expect(result.lines.at(-1)).toBe('two copies: 9 classes, 3 guards — ok')
    expect(result.lines).toContain('isCollection: recognised across copies; major 2 refused')
    expect(result.lines.join('\n')).not.toContain('cross-copy no')
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

  it('fails when it finds fewer than the expected classes and guards [005 S4-AC4]', async () => {
    const [a, b] = await twoCopies()
    const { IllegalStateError: _dropped, isCollection: _guard, ...fewer } = a
    const failures = checkTwoCopies(fewer, b).failures
    expect(failures).toContain('found 8 classes recognised across copies; expected at least 9')
    expect(failures).toContain('guard isCollection not found')
    expect(checkTwoCopies({}, {}).ok).toBe(false)
  })
})

describe('lists across two copies', () => {
  type Namespace = Record<string, unknown>
  type ListClass = new (
    elements?: Iterable<unknown>,
  ) => {
    subList(from: number, to: number): unknown
    reversed(): unknown
  }

  async function load(): Promise<[Namespace, Namespace]> {
    const a = { ...(await import('../src/index')) } as Namespace
    vi.resetModules()
    const b = { ...(await import('../src/index')) } as Namespace
    return [a, b]
  }

  it('isList and isSequencedCollection accept lists and views and refuse everything else [006 S7-AC5]', async () => {
    const [a, b] = await load()
    for (const [mine, theirs] of [
      [a, b],
      [b, a],
    ] as const) {
      const ArrayList = theirs.ArrayList as ListClass
      const list = new ArrayList([1, 2])
      for (const guard of ['isList', 'isSequencedCollection', 'isCollection']) {
        const check = mine[guard] as (value: unknown) => boolean
        for (const value of [list, list.subList(0, 1), list.reversed()]) {
          expect(check(value), guard).toBe(true)
        }
        if (guard === 'isCollection') continue
        for (const value of [[1], new Set([1]), new Map(), { size: 0 }, null, undefined, 'ab']) {
          expect(check(value), `${guard} ${String(value)}`).toBe(false)
        }
      }
    }
  })

  it('the two-copy check accepts lists and their views from the other copy with no exemption [006 S9-AC2]', async () => {
    const [a, b] = await load()
    const result = checkTwoCopies(a, b)
    expect(result.failures).toEqual([])
    for (const guard of ['isCollection', 'isSequencedCollection', 'isList']) {
      expect(result.lines).toContain(`${guard}: recognised across copies; major 2 refused`)
    }
    const refusing = {
      ...b,
      isList: (value: unknown) => (b.isList as (v: unknown) => boolean)(value) && false,
    }
    expect(
      checkTwoCopies(a, refusing).failures.some((f) => f.startsWith('isList: copy B refuses')),
    ).toBe(true)
  })

  it('instanceof ArrayList holds across copies and not for views, arrays or other lists [006 S9-AC4]', async () => {
    const [a, b] = await load()
    const A = a.ArrayList as ListClass
    const B = b.ArrayList as ListClass
    expect(A).not.toBe(B)
    expect(new A() instanceof B).toBe(true)
    expect(new B() instanceof A).toBe(true)
    const list = new A([1, 2])
    for (const value of [list.subList(0, 1), list.reversed(), [1], new Set(), null, 1]) {
      expect(value instanceof A).toBe(false)
      expect(value instanceof B).toBe(false)
    }
    expect(brandedValue(2, 'ArrayList') instanceof A).toBe(false)
  })
})
