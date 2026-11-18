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
      [
        ...NAMES,
        'ArrayDeque',
        'ArrayList',
        'HashMap',
        'HashSet',
        'LinkedHashMap',
        'LinkedHashSet',
        'LinkedList',
        'PriorityQueue',
        'TreeMap',
        'TreeSet',
      ].sort(),
    )
    expect(guards(a)).toEqual([
      'isCollection',
      'isDeque',
      'isList',
      'isMapCollection',
      'isQueue',
      'isSequencedCollection',
      'isSetCollection',
      'isSortedMap',
      'isSortedSet',
    ])
    expect(result.lines.at(-1)).toBe('two copies: 18 classes, 9 guards — ok')
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
    expect(failures).toContain('found 17 classes recognised across copies; expected at least 18')
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

describe('priority queues across two copies', () => {
  type Namespace = Record<string, unknown>
  type QueueClass = new (elements?: Iterable<unknown>) => { poll(): unknown }

  async function load(): Promise<[Namespace, Namespace]> {
    const a = { ...(await import('../src/index')) } as Namespace
    vi.resetModules()
    const b = { ...(await import('../src/index')) } as Namespace
    return [a, b]
  }

  it('isQueue and isCollection accept a PriorityQueue from the other copy; the deque and list guards refuse it [010 S6-AC1]', async () => {
    const [a, b] = await load()
    for (const [mine, theirs] of [
      [a, b],
      [b, a],
    ] as const) {
      const PriorityQueue = theirs.PriorityQueue as QueueClass
      const queue = new PriorityQueue([2, 1])
      for (const guard of ['isQueue', 'isCollection']) {
        expect((mine[guard] as (value: unknown) => boolean)(queue), guard).toBe(true)
      }
      for (const guard of ['isDeque', 'isSequencedCollection', 'isList']) {
        expect((mine[guard] as (value: unknown) => boolean)(queue), guard).toBe(false)
      }
    }
  })

  it('instanceof PriorityQueue holds across copies and not for other queues [010 S6-AC2]', async () => {
    const [a, b] = await load()
    const A = a.PriorityQueue as QueueClass
    const B = b.PriorityQueue as QueueClass
    expect(A).not.toBe(B)
    expect(new A() instanceof B).toBe(true)
    expect(new B() instanceof A).toBe(true)
    for (const other of [
      new (b.ArrayDeque as QueueClass)(),
      new (b.LinkedList as QueueClass)(),
      new (b.ArrayList as QueueClass)(),
      [1],
      null,
      1,
    ]) {
      expect(other instanceof A).toBe(false)
    }
    expect(brandedValue(2, 'PriorityQueue') instanceof A).toBe(false)
  })

  it('the two-copy check covers PriorityQueue [010 S6-AC3]', async () => {
    const [a, b] = await load()
    const result = checkTwoCopies(a, b)
    expect(result.failures).toEqual([])
    expect(brandedClasses(a)).toContain('PriorityQueue')
    expect(result.lines).toContain('PriorityQueue: recognised across copies; major 2 refused')
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

describe('maps across two copies', () => {
  type Namespace = Record<string, unknown>
  type MapClass = new (entries?: Iterable<unknown> | null, options?: object) => object

  async function load(): Promise<[Namespace, Namespace]> {
    const a = { ...(await import('../src/index')) } as Namespace
    vi.resetModules()
    const b = { ...(await import('../src/index')) } as Namespace
    return [a, b]
  }

  it('isMapCollection accepts a HashMap from either copy and refuses everything else, and maps are not collections [012 S9-AC4]', async () => {
    const [a, b] = await load()
    for (const [mine, theirs] of [
      [a, b],
      [b, a],
    ] as const) {
      const HashMap = theirs.HashMap as MapClass
      const isMapCollection = mine.isMapCollection as (value: unknown) => boolean
      const pairs = [['a', 1]]
      const maps = [
        new HashMap(pairs),
        new HashMap(pairs, { key: (v: unknown) => v }),
        new HashMap(pairs, { equivalence: theirs.valueEquivalence }),
      ]
      for (const map of maps) {
        expect(isMapCollection(map)).toBe(true)
        for (const guard of [
          'isCollection',
          'isSetCollection',
          'isSortedSet',
          'isSequencedCollection',
          'isList',
          'isQueue',
        ]) {
          expect((mine[guard] as (value: unknown) => boolean)(map), guard).toBe(false)
        }
      }
      const sample = maps[0] as {
        keySet(): unknown
        entrySet(): unknown
        valueCollection(): unknown
      }
      const HashSet = theirs.HashSet as MapClass
      const ArrayList = theirs.ArrayList as MapClass
      const ArrayDeque = theirs.ArrayDeque as MapClass
      for (const value of [
        new Map([['a', 1]]),
        new HashSet([1]),
        new ArrayList([1]),
        new ArrayDeque([1]),
        sample.keySet(),
        sample.entrySet(),
        sample.valueCollection(),
        new (theirs.TreeSet as MapClass)([1]),
        {},
        null,
        undefined,
      ]) {
        expect(isMapCollection(value), String(value)).toBe(false)
      }
    }
  })

  it('instanceof HashMap holds across copies and not for other values [012 S9-AC4]', async () => {
    const [a, b] = await load()
    const A = a.HashMap as MapClass
    const B = b.HashMap as MapClass
    expect(A).not.toBe(B)
    expect(new A() instanceof B).toBe(true)
    expect(new B([['a', 1]], { key: (v: unknown) => v }) instanceof A).toBe(true)
    for (const value of [new Map(), new (b.HashSet as MapClass)(), [], null, 1]) {
      expect(value instanceof A).toBe(false)
    }
    expect(brandedValue(2, 'HashMap') instanceof A).toBe(false)
    expect(brandedValue(1, 'HashMap') instanceof A).toBe(true)
  })

  it('compares equal maps from two copies as equal, both ways [012 S9-AC4]', async () => {
    const [a, b] = await load()
    const A = a.HashMap as MapClass
    const B = b.HashMap as MapClass
    const x = new A([['a', 1]]) as { equals(o: unknown): boolean }
    const y = new B([['a', 1]]) as { equals(o: unknown): boolean }
    expect(x.equals(y)).toBe(true)
    expect(y.equals(x)).toBe(true)
  })

  it('the two-copy check covers HashMap and isMapCollection [012 S9-AC5]', async () => {
    const [a, b] = await load()
    const result = checkTwoCopies(a, b)
    expect(result.failures).toEqual([])
    expect(result.lines).toContain('HashMap: recognised across copies; major 2 refused')
    expect(result.lines).toContain('isMapCollection: recognised across copies; major 2 refused')
    const { isMapCollection: _dropped, ...without } = a
    expect(checkTwoCopies(without, b).failures).toContain('guard isMapCollection not found')
  })
})

describe('sorted sets across two copies', () => {
  type Namespace = Record<string, unknown>
  type SortedClass = new (
    elements?: Iterable<unknown>,
  ) => {
    subSet(from: unknown, to: unknown): unknown
    headSet(to: unknown): unknown
    reversed(): unknown
  }

  async function load(): Promise<[Namespace, Namespace]> {
    const a = { ...(await import('../src/index')) } as Namespace
    vi.resetModules()
    const b = { ...(await import('../src/index')) } as Namespace
    return [a, b]
  }

  it('isSortedSet accepts a TreeSet and its views from either copy and refuses other values; the set and sequenced guards accept them [015 S8-AC3]', async () => {
    const [a, b] = await load()
    for (const [mine, theirs] of [
      [a, b],
      [b, a],
    ] as const) {
      const TreeSet = theirs.TreeSet as SortedClass
      const set = new TreeSet([1, 2, 3])
      const samples = [set, set.subSet(1, 3), set.headSet(2), set.reversed()]
      const guard = (name: string) => mine[name] as (value: unknown) => boolean
      const map = new (
        theirs.HashMap as new (
          pairs: unknown[][],
        ) => {
          keySet(): unknown
          entrySet(): unknown
        }
      )([[1, 'a']])
      for (const value of samples) {
        expect(guard('isSortedSet')(value)).toBe(true)
        expect(guard('isSetCollection')(value)).toBe(true)
        expect(guard('isCollection')(value)).toBe(true)
        expect(guard('isSequencedCollection')(value)).toBe(true)
        expect(guard('isList')(value)).toBe(false)
        expect(guard('isQueue')(value)).toBe(false)
      }
      for (const value of [
        new (theirs.HashSet as SortedClass)([1]),
        new Set([1]),
        [1],
        new (theirs.ArrayList as SortedClass)([1]),
        new (theirs.ArrayDeque as SortedClass)([1]),
        new (theirs.PriorityQueue as SortedClass)([1]),
        map,
        map.keySet(),
        map.entrySet(),
        {},
        null,
        undefined,
      ]) {
        expect(guard('isSortedSet')(value), String(value)).toBe(false)
      }
    }
  })

  it('instanceof TreeSet holds for a TreeSet from either copy and not for its views [015 S8-AC4]', async () => {
    const [a, b] = await load()
    const A = a.TreeSet as SortedClass
    const B = b.TreeSet as SortedClass
    expect(A).not.toBe(B)
    expect(new A() instanceof B).toBe(true)
    expect(new B([1]) instanceof A).toBe(true)
    const set = new B([1, 2, 3])
    for (const value of [set.subSet(1, 3), set.reversed(), set.headSet(2)]) {
      expect(value instanceof A).toBe(false)
      expect(value instanceof B).toBe(false)
    }
    for (const value of [new (b.HashSet as SortedClass)(), new Set(), [], null, 1]) {
      expect(value instanceof A).toBe(false)
    }
    expect(brandedValue(2, 'TreeSet') instanceof A).toBe(false)
    expect(brandedValue(1, 'TreeSet') instanceof A).toBe(true)
  })

  it('the two-copy check covers TreeSet and isSortedSet [015 S8-AC5]', async () => {
    const [a, b] = await load()
    const result = checkTwoCopies(a, b)
    expect(result.failures).toEqual([])
    expect(result.lines).toContain('TreeSet: recognised across copies; major 2 refused')
    expect(result.lines).toContain('isSortedSet: recognised across copies; major 2 refused')
    const { isSortedSet: _dropped, ...without } = a
    expect(checkTwoCopies(without, b).failures).toContain('guard isSortedSet not found')
  })
})

describe('linked hash sets across two copies', () => {
  type Namespace = Record<string, unknown>
  type LinkedClass = new (
    elements?: Iterable<unknown> | null,
    options?: object,
  ) => { reversed(): unknown }

  async function load(): Promise<[Namespace, Namespace]> {
    const a = { ...(await import('../src/index')) } as Namespace
    vi.resetModules()
    const b = { ...(await import('../src/index')) } as Namespace
    return [a, b]
  }

  it('the set, sequenced and collection guards accept a LinkedHashSet and its view from either copy; isList, isQueue and isSortedSet refuse them [013 S5-AC6]', async () => {
    const [a, b] = await load()
    for (const [mine, theirs] of [
      [a, b],
      [b, a],
    ] as const) {
      const LinkedHashSet = theirs.LinkedHashSet as LinkedClass
      const set = new LinkedHashSet([1, 2])
      const samples = [
        set,
        set.reversed(),
        new LinkedHashSet([1], { key: (v: unknown) => v }),
        new LinkedHashSet([1], { equivalence: theirs.valueEquivalence }),
      ]
      const guard = (name: string) => mine[name] as (value: unknown) => boolean
      for (const value of samples) {
        expect(guard('isSetCollection')(value)).toBe(true)
        expect(guard('isSequencedCollection')(value)).toBe(true)
        expect(guard('isCollection')(value)).toBe(true)
        for (const name of [
          'isList',
          'isQueue',
          'isDeque',
          'isSortedSet',
          'isMapCollection',
          'isSortedMap',
        ]) {
          expect(guard(name)(value), name).toBe(false)
        }
      }
    }
  })

  it('instanceof LinkedHashSet holds across copies and not for its view or a HashSet; a LinkedHashSet is not a HashSet [013 S5-AC6]', async () => {
    const [a, b] = await load()
    const A = a.LinkedHashSet as LinkedClass
    const B = b.LinkedHashSet as LinkedClass
    expect(A).not.toBe(B)
    expect(new A() instanceof B).toBe(true)
    expect(new B([1], { key: (v: unknown) => v }) instanceof A).toBe(true)
    const set = new B([1, 2])
    expect(set.reversed() instanceof A).toBe(false)
    expect(set.reversed() instanceof B).toBe(false)
    const HashSetA = a.HashSet as LinkedClass
    const HashSetB = b.HashSet as LinkedClass
    expect(new HashSetB([1]) instanceof A).toBe(false)
    expect(new HashSetA([1]) instanceof A).toBe(false)
    expect(set instanceof HashSetA).toBe(false)
    expect(new A() instanceof HashSetA).toBe(false)
    for (const value of [new Set(), [], null, 1]) expect(value instanceof A).toBe(false)
    expect(brandedValue(2, 'LinkedHashSet') instanceof A).toBe(false)
    expect(brandedValue(1, 'LinkedHashSet') instanceof A).toBe(true)
  })

  it('the two-copy check covers LinkedHashSet and its view under the set and sequenced guards [013 S5-AC7]', async () => {
    const [a, b] = await load()
    const result = checkTwoCopies(a, b)
    expect(result.failures).toEqual([])
    expect(result.lines).toContain('LinkedHashSet: recognised across copies; major 2 refused')
    expect(brandedClasses(a)).toContain('LinkedHashSet')
    const { LinkedHashSet: _dropped, ...without } = a
    const failures = checkTwoCopies(without, b).failures
    expect(failures.some((line) => line.includes('LinkedHashSet'))).toBe(true)
  })
})

describe('linked hash maps across two copies', () => {
  type Namespace = Record<string, unknown>
  type LinkedClass = new (
    entries?: Iterable<unknown> | null,
    options?: object,
  ) => {
    reversed(): unknown
    keySet(): unknown
    entrySet(): unknown
    valueCollection(): unknown
  }

  async function load(): Promise<[Namespace, Namespace]> {
    const a = { ...(await import('../src/index')) } as Namespace
    vi.resetModules()
    const b = { ...(await import('../src/index')) } as Namespace
    return [a, b]
  }

  it('isMapCollection accepts a LinkedHashMap and its view from either copy; isSortedMap and isCollection refuse them; their views are sequenced collections [014 S7-AC6]', async () => {
    const [a, b] = await load()
    for (const [mine, theirs] of [
      [a, b],
      [b, a],
    ] as const) {
      const LinkedHashMap = theirs.LinkedHashMap as LinkedClass
      const map = new LinkedHashMap([['a', 1]])
      const samples = [
        map,
        map.reversed(),
        new LinkedHashMap([['a', 1]], { key: (v: unknown) => v }),
        new LinkedHashMap([['a', 1]], { equivalence: theirs.valueEquivalence }),
      ]
      const guard = (name: string) => mine[name] as (value: unknown) => boolean
      for (const value of samples) {
        expect(guard('isMapCollection')(value)).toBe(true)
        for (const name of ['isSortedMap', 'isCollection', 'isSetCollection', 'isList']) {
          expect(guard(name)(value), name).toBe(false)
        }
        const views = value as {
          keySet(): unknown
          entrySet(): unknown
          valueCollection(): unknown
        }
        for (const view of [views.keySet(), views.entrySet(), views.valueCollection()]) {
          expect(guard('isSequencedCollection')(view)).toBe(true)
        }
      }
    }
  })

  it('instanceof LinkedHashMap holds across copies and not for its view or a HashMap [014 S7-AC6]', async () => {
    const [a, b] = await load()
    const A = a.LinkedHashMap as LinkedClass
    const B = b.LinkedHashMap as LinkedClass
    expect(A).not.toBe(B)
    expect(new A() instanceof B).toBe(true)
    expect(new B([['a', 1]], { accessOrder: true, maxSize: 2 }) instanceof A).toBe(true)
    const map = new B([['a', 1]])
    expect(map.reversed() instanceof A).toBe(false)
    const HashMapA = a.HashMap as LinkedClass
    expect(new HashMapA() instanceof A).toBe(false)
    expect(new A() instanceof HashMapA).toBe(false)
    expect(brandedValue(2, 'LinkedHashMap') instanceof A).toBe(false)
    expect(brandedValue(1, 'LinkedHashMap') instanceof A).toBe(true)
  })

  it('the two-copy check covers LinkedHashMap, its view and its key, entry and value views [014 S7-AC7]', async () => {
    const [a, b] = await load()
    const result = checkTwoCopies(a, b)
    expect(result.failures).toEqual([])
    expect(result.lines).toContain('LinkedHashMap: recognised across copies; major 2 refused')
    const { LinkedHashMap: _dropped, ...without } = a
    const failures = checkTwoCopies(without, b).failures
    expect(failures.some((line) => line.includes('LinkedHashMap'))).toBe(true)
  })
})

describe('sorted maps across two copies', () => {
  type Namespace = Record<string, unknown>
  type SortedMapClass = new (
    entries?: Iterable<unknown>,
  ) => {
    subMap(from: unknown, to: unknown): unknown
    headMap(to: unknown): unknown
    reversed(): unknown
    keySet(): unknown
    entrySet(): unknown
    valueCollection(): unknown
    equals(other: unknown): boolean
  }

  async function load(): Promise<[Namespace, Namespace]> {
    const a = { ...(await import('../src/index')) } as Namespace
    vi.resetModules()
    const b = { ...(await import('../src/index')) } as Namespace
    return [a, b]
  }

  it('isSortedMap accepts a TreeMap and its views from either copy; the sorted-map, sorted-set and map guards refuse each other’s values [016 S8-AC3]', async () => {
    const [a, b] = await load()
    for (const [mine, theirs] of [
      [a, b],
      [b, a],
    ] as const) {
      const TreeMap = theirs.TreeMap as SortedMapClass
      const map = new TreeMap([
        [1, 'a'],
        [2, 'b'],
        [3, 'c'],
      ])
      const guard = (name: string) => mine[name] as (value: unknown) => boolean
      const views = [map, map.subMap(1, 3), map.headMap(2), map.reversed()]
      for (const value of views) {
        expect(guard('isSortedMap')(value)).toBe(true)
        expect(guard('isMapCollection')(value)).toBe(true)
        expect(guard('isCollection')(value)).toBe(false)
        expect(guard('isSortedSet')(value)).toBe(false)
        expect(guard('isSetCollection')(value)).toBe(false)
      }
      const keySet = map.keySet()
      expect(guard('isSortedSet')(keySet)).toBe(true)
      expect(guard('isSequencedCollection')(keySet)).toBe(true)
      for (const name of ['isMapCollection', 'isList', 'isQueue', 'isDeque']) {
        expect(guard(name)(keySet), name).toBe(false)
      }
      expect(guard('isCollection')(map.valueCollection())).toBe(true)
      expect(guard('isSetCollection')(map.entrySet())).toBe(true)
      const TreeSet = theirs.TreeSet as new (elements: unknown[]) => unknown
      const HashMap = theirs.HashMap as new (pairs: unknown[][]) => unknown
      const linked = new (theirs.LinkedHashSet as new (e: unknown[]) => { reversed(): unknown })([
        1,
      ])
      for (const value of [
        new HashMap([[1, 'a']]),
        new Map([[1, 'a']]),
        new TreeSet([1]),
        keySet,
        map.entrySet(),
        map.valueCollection(),
        new (theirs.HashSet as new (e: unknown[]) => unknown)([1]),
        new (theirs.ArrayList as new (e: unknown[]) => unknown)([1]),
        new (theirs.ArrayDeque as new (e: unknown[]) => unknown)([1]),
        new (theirs.PriorityQueue as new (e: unknown[]) => unknown)([1]),
        linked,
        linked.reversed(),
        {},
        null,
        undefined,
      ]) {
        expect(guard('isSortedMap')(value), String(value)).toBe(false)
      }
      expect(guard('isMapCollection')(new TreeSet([1]))).toBe(false)
    }
  })

  it('instanceof TreeMap holds for a TreeMap from either copy and not for its views [016 S8-AC4]', async () => {
    const [a, b] = await load()
    const A = a.TreeMap as SortedMapClass
    const B = b.TreeMap as SortedMapClass
    expect(A).not.toBe(B)
    expect(new A() instanceof B).toBe(true)
    expect(new B([[1, 'a']]) instanceof A).toBe(true)
    const map = new B([
      [1, 'a'],
      [2, 'b'],
    ])
    for (const value of [map.subMap(1, 2), map.reversed(), map.headMap(2), map.keySet()]) {
      expect(value instanceof A).toBe(false)
      expect(value instanceof B).toBe(false)
    }
    for (const value of [new (b.HashMap as SortedMapClass)(), new Map(), [], null, 1]) {
      expect(value instanceof A).toBe(false)
    }
    expect(brandedValue(2, 'TreeMap') instanceof A).toBe(false)
    expect(brandedValue(1, 'TreeMap') instanceof A).toBe(true)
    expect(new A([[1, 'a']]).equals(new B([[1, 'a']]))).toBe(true)
  })

  it('the two-copy check covers TreeMap and isSortedMap [016 S8-AC5]', async () => {
    const [a, b] = await load()
    const result = checkTwoCopies(a, b)
    expect(result.failures).toEqual([])
    expect(result.lines).toContain('TreeMap: recognised across copies; major 2 refused')
    expect(result.lines).toContain('isSortedMap: recognised across copies; major 2 refused')
    const { isSortedMap: _dropped, ...without } = a
    expect(checkTwoCopies(without, b).failures).toContain('guard isSortedMap not found')
  })
})

describe('sets from maps across two copies', () => {
  type Namespace = Record<string, unknown>
  type AnySet = {
    add(e: unknown): AnySet
    has(e: unknown): boolean
    equals(o: unknown): boolean
    readonly size: number
  }
  type MapClass = new (
    options?: unknown,
  ) => { keySet(): unknown; entrySet(): unknown; has(k: unknown): boolean; size: number }

  async function load(): Promise<[Namespace, Namespace]> {
    const a = { ...(await import('../src/index')) } as Namespace
    vi.resetModules()
    const b = { ...(await import('../src/index')) } as Namespace
    return [a, b]
  }

  it('newSetFromMap accepts an empty HashMap or TreeMap from the other copy and the set is recognised by both [017 S4-AC1]', async () => {
    const [a, b] = await load()
    const newSetFromMap = a.newSetFromMap as (map: unknown) => AnySet
    for (const name of ['HashMap', 'TreeMap']) {
      const map = new (b[name] as MapClass)()
      const set = newSetFromMap(map)
      set.add(2).add(1)
      expect(set.size, name).toBe(2)
      expect(map.has(1), name).toBe(true)
      expect(set.has(2), name).toBe(true)
      for (const copy of [a, b]) {
        expect((copy.isSetCollection as (v: unknown) => boolean)(set), name).toBe(true)
        expect((copy.isCollection as (v: unknown) => boolean)(set), name).toBe(true)
      }
      expect(set.equals(new (b.HashSet as new (e: unknown[]) => unknown)([1, 2]))).toBe(true)
    }
  })

  it('newSetFromMap refuses a key or entry set from the other copy with TypeError [017 S4-AC2]', async () => {
    const [a, b] = await load()
    const newSetFromMap = a.newSetFromMap as (map: unknown) => AnySet
    const map = new (b.HashMap as MapClass)()
    for (const view of [map.keySet(), map.entrySet()]) {
      expect(() => newSetFromMap(view)).toThrow(TypeError)
      expect(() => newSetFromMap(view)).toThrow(
        /^newSetFromMap: map is not a map from this library/,
      )
    }
  })

  it('equal value-equivalence sets from the two copies hash alike [017 S1-AC2]', async () => {
    const [a, b] = await load()
    const equalsKey = a.equalsSymbol as symbol
    const hashKey = a.hashCodeSymbol as symbol
    expect(b.equalsSymbol).toBe(equalsKey)
    const value = (n: number) => ({
      n,
      [equalsKey](other: { n: number }) {
        return other !== null && typeof other === 'object' && other.n === n
      },
      [hashKey]() {
        return n
      },
    })
    const make = (copy: Namespace) =>
      new (copy.HashSet as new (e: unknown[], o: unknown) => unknown)([value(1), value(2)], {
        equivalence: copy.valueEquivalence,
      })
    const fromA = make(a)
    const fromB = make(b)
    expect((a.equals as (x: unknown, y: unknown) => boolean)(fromA, fromB)).toBe(true)
    expect((a.hashCode as (x: unknown) => number)(fromA)).toBe(
      (b.hashCode as (x: unknown) => number)(fromB),
    )
  })
})

describe('immutable collections across two copies', () => {
  type Namespace = Record<string, unknown>
  type Equatable = { equals(o: unknown): boolean }
  type Factory = (...args: unknown[]) => Equatable
  type Guard = (value: unknown) => boolean

  async function load(): Promise<[Namespace, Namespace]> {
    const a = { ...(await import('../src/index')) } as Namespace
    vi.resetModules()
    const b = { ...(await import('../src/index')) } as Namespace
    return [a, b]
  }

  it("immutable results from one copy pass the other copy's guards [018 S5-AC4]", async () => {
    const [a, b] = await load()
    const list = (a.listOf as Factory)(1, 2)
    const set = (a.setOf as Factory)(1, 2)
    const map = (a.mapOf as Factory)(['a', 1])
    for (const copy of [a, b]) {
      expect((copy.isList as Guard)(list)).toBe(true)
      expect((copy.isSequencedCollection as Guard)(list)).toBe(true)
      expect((copy.isSetCollection as Guard)(set)).toBe(true)
      expect((copy.isSetCollection as Guard)(list)).toBe(false)
      expect((copy.isMapCollection as Guard)(map)).toBe(true)
      expect((copy.isCollection as Guard)(map)).toBe(false)
    }
  })

  it("immutable results equal the other copy's collections both ways [018 S5-AC1] [018 S5-AC2] [018 S5-AC3]", async () => {
    const [a, b] = await load()
    const pairs = [
      ['a', 1],
      ['b', 2],
    ]
    const cases: Array<[Equatable, Equatable]> = [
      [(a.listOf as Factory)(1, 2), new (b.ArrayList as new (e: unknown[]) => Equatable)([1, 2])],
      [(a.setOf as Factory)(1, 2), new (b.HashSet as new (e: unknown[]) => Equatable)([2, 1])],
      [(a.copyOfMap as Factory)(pairs), new (b.HashMap as new (e: unknown[]) => Equatable)(pairs)],
    ]
    for (const [ours, theirs] of cases) {
      expect(ours.equals(theirs)).toBe(true)
      expect(theirs.equals(ours)).toBe(true)
      expect((a.hashCode as (v: unknown) => number)(ours)).toBe(
        (a.hashCode as (v: unknown) => number)(theirs),
      )
    }
  })
})
