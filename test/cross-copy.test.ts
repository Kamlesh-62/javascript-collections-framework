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
    expect(brandedClasses(a)).toEqual(
      [...NAMES, 'ArrayDeque', 'ArrayList', 'HashSet', 'LinkedList'].sort(),
    )
    expect(guards(a)).toEqual([
      'isCollection',
      'isDeque',
      'isList',
      'isQueue',
      'isSequencedCollection',
      'isSetCollection',
    ])
    expect(result.lines.at(-1)).toBe('two copies: 12 classes, 6 guards — ok')
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
    expect(failures).toContain('found 11 classes recognised across copies; expected at least 12')
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

describe('deques across two copies', () => {
  type Namespace = Record<string, unknown>
  type DequeClass = new (elements?: Iterable<unknown>) => { reversed(): unknown }

  async function load(): Promise<[Namespace, Namespace]> {
    const a = { ...(await import('../src/index')) } as Namespace
    vi.resetModules()
    const b = { ...(await import('../src/index')) } as Namespace
    return [a, b]
  }

  it('isQueue and isDeque accept deques and their views and refuse everything else [008 S7-AC1]', async () => {
    const [a, b] = await load()
    for (const [mine, theirs] of [
      [a, b],
      [b, a],
    ] as const) {
      const ArrayDeque = theirs.ArrayDeque as DequeClass
      const ArrayList = theirs.ArrayList as new (elements?: Iterable<unknown>) => unknown
      const deque = new ArrayDeque([1, 2])
      for (const guard of ['isQueue', 'isDeque', 'isCollection', 'isSequencedCollection']) {
        const check = mine[guard] as (value: unknown) => boolean
        for (const value of [deque, deque.reversed()]) expect(check(value), guard).toBe(true)
      }
      const isList = mine.isList as (value: unknown) => boolean
      expect(isList(deque)).toBe(false)
      for (const guard of ['isQueue', 'isDeque']) {
        const check = mine[guard] as (value: unknown) => boolean
        for (const value of [[1], new ArrayList([1]), new Set(), new Map(), {}, null, undefined]) {
          expect(check(value), `${guard} ${String(value)}`).toBe(false)
        }
      }
    }
  })

  it('instanceof ArrayDeque holds across copies and not for the reversed view [008 S7-AC2]', async () => {
    const [a, b] = await load()
    const A = a.ArrayDeque as DequeClass
    const B = b.ArrayDeque as DequeClass
    expect(new A() instanceof B).toBe(true)
    expect(new B() instanceof A).toBe(true)
    expect(new A([1]).reversed() instanceof B).toBe(false)
    expect(brandedValue(2, 'ArrayDeque') instanceof A).toBe(false)
  })

  it('the two-copy check covers isQueue, isDeque and ArrayDeque with the deque and its view [008 S7-AC3]', async () => {
    const [a, b] = await load()
    const result = checkTwoCopies(a, b)
    expect(result.failures).toEqual([])
    expect(result.lines).toContain('isQueue: recognised across copies; major 2 refused')
    expect(result.lines).toContain('isDeque: recognised across copies; major 2 refused')
    expect(result.lines).toContain('ArrayDeque: recognised across copies; major 2 refused')
  })

  it('guards accept a LinkedList and its view from the other copy; isList refuses them [007 S6-AC1]', async () => {
    const [a, b] = await load()
    for (const [mine, theirs] of [
      [a, b],
      [b, a],
    ] as const) {
      const LinkedList = theirs.LinkedList as DequeClass
      const list = new LinkedList([1, 2])
      for (const guard of ['isQueue', 'isDeque', 'isCollection', 'isSequencedCollection']) {
        const check = mine[guard] as (value: unknown) => boolean
        for (const value of [list, list.reversed()]) expect(check(value), guard).toBe(true)
      }
      const isList = mine.isList as (value: unknown) => boolean
      expect(isList(list)).toBe(false)
      expect(isList(list.reversed())).toBe(false)
    }
  })

  it('instanceof LinkedList holds across copies, not for its view, handles or deques [007 S6-AC2]', async () => {
    const [a, b] = await load()
    const A = a.LinkedList as DequeClass
    const B = b.LinkedList as DequeClass
    expect(new A() instanceof B).toBe(true)
    expect(new B() instanceof A).toBe(true)
    expect(new A([1]).reversed() instanceof B).toBe(false)
    const handle = (new A([1]) as unknown as { firstNode(): unknown }).firstNode()
    expect(handle instanceof B).toBe(false)
    expect(new (b.ArrayDeque as DequeClass)() instanceof A).toBe(false)
    expect(brandedValue(2, 'LinkedList') instanceof A).toBe(false)
  })

  it('the two-copy check covers LinkedList, its view and handles across copies [007 S6-AC3]', async () => {
    const [a, b] = await load()
    const result = checkTwoCopies(a, b)
    expect(result.failures).toEqual([])
    expect(result.lines).toContain('LinkedList: recognised across copies; major 2 refused')
    expect(result.lines).toContain('LinkedList: node handles refused across copies')
    const A = a.LinkedList as new (
      elements?: Iterable<unknown>,
    ) => {
      firstNode(): unknown
      removeNode(node: unknown): unknown
      size: number
    }
    const B = b.LinkedList as typeof A
    const theirs = new B([1])
    expect(() => new A([1]).removeNode(theirs.firstNode())).toThrow(
      a.IllegalArgumentError as new () => Error,
    )
  })
})

describe('sets across two copies', () => {
  type Namespace = Record<string, unknown>
  type SetClass = new (elements?: Iterable<unknown> | null, options?: object) => object

  async function load(): Promise<[Namespace, Namespace]> {
    const a = { ...(await import('../src/index')) } as Namespace
    vi.resetModules()
    const b = { ...(await import('../src/index')) } as Namespace
    return [a, b]
  }

  it('isSetCollection accepts a HashSet from either copy and refuses everything else [011 S9-AC1]', async () => {
    const [a, b] = await load()
    for (const [mine, theirs] of [
      [a, b],
      [b, a],
    ] as const) {
      const HashSet = theirs.HashSet as SetClass
      const isSetCollection = mine.isSetCollection as (value: unknown) => boolean
      const isCollection = mine.isCollection as (value: unknown) => boolean
      const sets = [
        new HashSet([1]),
        new HashSet([1], { key: (v: unknown) => v }),
        new HashSet([1], { equivalence: theirs.valueEquivalence }),
      ]
      for (const set of sets) {
        expect(isSetCollection(set)).toBe(true)
        expect(isCollection(set)).toBe(true)
        for (const guard of ['isList', 'isQueue', 'isDeque', 'isSequencedCollection']) {
          expect((mine[guard] as (value: unknown) => boolean)(set), guard).toBe(false)
        }
      }
      const ArrayList = theirs.ArrayList as new (elements?: Iterable<unknown>) => unknown
      const ArrayDeque = theirs.ArrayDeque as new (elements?: Iterable<unknown>) => unknown
      for (const value of [
        new Set([1]),
        [1],
        new ArrayList([1]),
        new ArrayDeque([1]),
        new Map(),
        {},
        null,
        undefined,
      ]) {
        expect(isSetCollection(value), String(value)).toBe(false)
      }
    }
  })

  it('instanceof HashSet holds across copies and not for other collections [011 S9-AC2]', async () => {
    const [a, b] = await load()
    const A = a.HashSet as SetClass
    const B = b.HashSet as SetClass
    expect(A).not.toBe(B)
    expect(new A() instanceof B).toBe(true)
    expect(new B([1], { key: (v: unknown) => v }) instanceof A).toBe(true)
    for (const value of [new Set(), new (b.ArrayList as SetClass)(), [], null, 1]) {
      expect(value instanceof A).toBe(false)
    }
    expect(brandedValue(2, 'HashSet') instanceof A).toBe(false)
    expect(brandedValue(1, 'HashSet') instanceof A).toBe(true)
  })

  it('the two-copy check covers HashSet and isSetCollection [011 S9-AC3]', async () => {
    const [a, b] = await load()
    const result = checkTwoCopies(a, b)
    expect(result.failures).toEqual([])
    expect(result.lines).toContain('HashSet: recognised across copies; major 2 refused')
    expect(result.lines).toContain('isSetCollection: recognised across copies; major 2 refused')
    const { isSetCollection: _dropped, ...without } = a
    expect(checkTwoCopies(without, b).failures).toContain('guard isSetCollection not found')
  })
})
