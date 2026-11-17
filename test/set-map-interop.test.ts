// How sets and maps of every implementation behave together and with native `Set` and `Map`.

import { describe, expect, it } from 'vitest'
import {
  ArrayDeque,
  ArrayList,
  ClassCastError,
  equals,
  equalsSymbol,
  HashMap,
  HashSet,
  hashCode,
  hashCodeSymbol,
  LinkedHashMap,
  LinkedHashSet,
  type MapCollection,
  type MapEntry,
  NullElementError,
  newSetFromMap,
  PriorityQueue,
  type SetCollection,
  sameValueZeroEquivalence,
  TreeMap,
  TreeSet,
  valueEquivalence,
} from '../src/index'
import { describeSetCollection } from './contracts/set'

function caught(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

type AnySet = SetCollection<unknown>
type AnyMap = MapCollection<unknown, unknown>
type SetKind = [string, (members: unknown[]) => AnySet]

const asSet = (set: unknown): AnySet => set as AnySet
const asMap = (map: unknown): AnyMap => map as AnyMap

/** Fills `map` with `key → true` for each member, in order, and returns it. */
function keyed<M extends AnyMap>(map: M, members: unknown[]): M {
  for (const member of members) map.set(member, true)
  return map
}

/** Every kind of set, each built from members given in insertion order. */
const SET_KINDS: SetKind[] = [
  ['HashSet', (members) => asSet(new HashSet(members))],
  ['LinkedHashSet', (members) => asSet(new LinkedHashSet(members))],
  ['TreeSet', (members) => asSet(new TreeSet(members as number[]))],
  [
    'TreeSet range view',
    (members) => {
      const view = new TreeSet<number>([-1000, 1000]).subSet(-100, 100)
      view.addAll(members as number[])
      return asSet(view)
    },
  ],
  ['reversed TreeSet', (members) => asSet(new TreeSet(members as number[]).reversed())],
  ['HashMap keySet', (members) => keyed(asMap(new HashMap()), members).keySet()],
  ['LinkedHashMap keySet', (members) => keyed(asMap(new LinkedHashMap()), members).keySet()],
  ['TreeMap keySet', (members) => keyed(asMap(new TreeMap()), members).keySet()],
  [
    'set from a HashMap',
    (members) => {
      const set = newSetFromMap(new HashMap<unknown, boolean>())
      set.addAll(members)
      return set
    },
  ],
  [
    'set from a LinkedHashMap',
    (members) => {
      const set = newSetFromMap(new LinkedHashMap<unknown, boolean>())
      set.addAll(members)
      return set
    },
  ],
  [
    'set from a TreeMap',
    (members) => {
      const set = newSetFromMap(new TreeMap<unknown, boolean>())
      set.addAll(members)
      return set
    },
  ],
]

const MEMBERS = [3, 1, 2]
const SHUFFLED = [2, 3, 1]

describe('sets compare across implementations', () => {
  it('are equal both ways exactly when they have the same members, whatever the order [017 S1-AC1]', () => {
    for (const [nameA, makeA] of SET_KINDS) {
      for (const [nameB, makeB] of SET_KINDS) {
        const pair = `${nameA} / ${nameB}`
        const a = makeA(MEMBERS)
        expect(a.equals(makeB(SHUFFLED)), pair).toBe(true)
        expect(makeB(SHUFFLED).equals(a), pair).toBe(true)
        expect(equals(a, makeB(SHUFFLED)), pair).toBe(true)
        expect(a.equals(makeB([1, 2, 4])), pair).toBe(false)
        expect(makeB([1, 2, 4]).equals(a), pair).toBe(false)
        expect(a.equals(makeB([1, 2])), pair).toBe(false)
        expect(makeB([1, 2]).equals(a), pair).toBe(false)
      }
    }
  })

  it('hash alike when equal under the default equality [017 S1-AC2]', () => {
    const expected = hashCode(new HashSet(MEMBERS))
    for (const [name, make] of SET_KINDS) {
      expect(hashCode(make(SHUFFLED)), name).toBe(expected)
    }
    expect(hashCode(new HashSet(MEMBERS, { equivalence: sameValueZeroEquivalence }))).toBe(expected)
  })

  it('hash alike when equal and sharing one key function or one equivalence [017 S1-AC2]', () => {
    const lower = (s: string) => s.toLowerCase()
    const keySets: AnySet[] = [
      asSet(new HashSet(['A', 'b'], { key: lower })),
      asSet(new LinkedHashSet(['b', 'a'], { key: lower })),
      keyed(asMap(new HashMap<string, boolean>({ key: lower })), ['a', 'B']).keySet(),
      keyed(asMap(new LinkedHashMap<string, boolean>({ key: lower })), ['B', 'A']).keySet(),
    ]
    const fromMap = newSetFromMap(new HashMap<string, boolean>({ key: lower }))
    fromMap.addAll(['a', 'b'])
    keySets.push(asSet(fromMap))
    for (const a of keySets) {
      for (const b of keySets) {
        expect(a.equals(b)).toBe(true)
        expect(hashCode(a)).toBe(hashCode(b))
      }
    }
    // Equal amounts are distinct objects, equal only through the equality protocol.
    const amounts = () => [new Amount(1), new Amount(2)]
    const byValue = [
      asSet(new HashSet(amounts(), { equivalence: valueEquivalence })),
      asSet(new LinkedHashSet(amounts().reverse(), { equivalence: valueEquivalence })),
      keyed(
        asMap(new HashMap<Amount, boolean>({ equivalence: valueEquivalence })),
        amounts(),
      ).keySet(),
    ]
    for (const a of byValue) {
      for (const b of byValue) {
        expect(a.equals(b)).toBe(true)
        expect(hashCode(a)).toBe(hashCode(b))
      }
    }
  })

  it('are never equal to a list, deque, queue, map, native Set or array of the same elements [017 S1-AC3]', () => {
    const peers: unknown[] = [
      new ArrayList(MEMBERS),
      new ArrayDeque(MEMBERS),
      new PriorityQueue(MEMBERS),
      new HashMap(MEMBERS.map((m) => [m, m] as [number, number])),
      new Set(MEMBERS),
      MEMBERS.slice(),
    ]
    for (const [name, make] of SET_KINDS) {
      const set = make(MEMBERS)
      for (const peer of peers) {
        expect(set.equals(peer), name).toBe(false)
        expect(equals(set, peer), name).toBe(false)
        expect(equals(peer, set), name).toBe(false)
        const other = peer as { equals?: (value: unknown) => boolean }
        if (typeof other.equals === 'function') expect(other.equals(set), name).toBe(false)
      }
    }
  })

  it('bulk operations accept any other set as they accept an array of its members [017 S1-AC4]', () => {
    const mutable = SET_KINDS
    for (const [targetName, makeTarget] of mutable) {
      const canAdd = !/keySet/.test(targetName)
      for (const [sourceName, makeSource] of SET_KINDS) {
        const label = `${targetName} <- ${sourceName}`
        const source = makeSource([2, 5, 1])
        const members = [...source]
        const methods = canAdd ? ['addAll', 'removeAll', 'retainAll'] : ['removeAll', 'retainAll']
        for (const method of methods) {
          const viaSet = makeTarget([1, 2, 3])
          const viaArray = makeTarget([1, 2, 3])
          const call = (target: AnySet, argument: Iterable<unknown>) =>
            (target as unknown as Record<string, (a: Iterable<unknown>) => boolean>)[method]?.call(
              target,
              argument,
            )
          expect(call(viaSet, source), `${label} ${method}`).toBe(call(viaArray, members))
          expect([...viaSet], `${label} ${method}`).toEqual([...viaArray])
        }
      }
    }
  })

  it('lets a throwing comparator propagate when equals consults the sorted side [017 S1-AC5]', () => {
    const marker = { marker: true }
    const failure = new Error('cannot compare')
    const sorted = new TreeSet<unknown>({
      comparator: (a, b) => {
        if (a === marker || b === marker) throw failure
        return (a as number) - (b as number)
      },
    })
    sorted.add(1)
    const hashed = new HashSet<unknown>([marker])
    expect(caught(() => hashed.equals(sorted))).toBe(failure)
    expect(caught(() => equals(hashed, sorted))).toBe(failure)
  })

  it('is false both ways when a natural order meets null or another kind [017 S1-AC5]', () => {
    const sorted = new TreeSet<number>([1, 2])
    for (const other of [new HashSet<unknown>([1, null]), new HashSet<unknown>([1, 'a'])]) {
      expect(sorted.equals(other)).toBe(false)
      expect(other.equals(sorted)).toBe(false)
    }
    const sortedKeys = new TreeMap<number, number>([
      [1, 1],
      [2, 2],
    ]).keySet()
    expect(new HashSet<unknown>([1, undefined]).equals(sortedKeys)).toBe(false)
  })

  it('is false both ways when a comparator equates members the other side distinguishes [017 S1-AC5]', () => {
    const caseless = new TreeSet<string>(['a', 'B'], {
      comparator: (a, b) => a.toLowerCase().localeCompare(b.toLowerCase()),
    })
    const exact = new HashSet<string>(['A', 'b'])
    expect(caseless.equals(exact)).toBe(false)
    expect(exact.equals(caseless)).toBe(false)
  })
})

// ── Map views are real sets ──

type MapMaker = () => AnyMap
const VIEW_MAPS: Array<[string, MapMaker]> = [
  ['HashMap', () => asMap(new HashMap())],
  ['LinkedHashMap', () => asMap(new LinkedHashMap())],
  ['TreeMap', () => asMap(new TreeMap<unknown, unknown>({ comparator: anyOrder() }))],
]

/** A total order over the values the set suite uses: by kind, then by value or first sight. */
function anyOrder(): (a: unknown, b: unknown) => number {
  const kinds = [
    'number',
    'bigint',
    'string',
    'boolean',
    'symbol',
    'function',
    'object',
    'undefined',
  ]
  const ids = new Map<unknown, number>()
  const idOf = (value: unknown): number => {
    let id = ids.get(value)
    if (id === undefined) {
      id = ids.size
      ids.set(value, id)
    }
    return id
  }
  return (a, b) => {
    if (a === b) return 0
    const kind = kinds.indexOf(typeof a) - kinds.indexOf(typeof b)
    if (kind !== 0) return kind
    if (typeof a === 'number') {
      const x = a
      const y = b as number
      if (Number.isNaN(x) || Number.isNaN(y))
        return Number(Number.isNaN(x)) - Number(Number.isNaN(y))
      return x < y ? -1 : x > y ? 1 : 0
    }
    if (typeof a === 'string' || typeof a === 'bigint' || typeof a === 'boolean') {
      const x = a as string
      const y = b as string
      return x < y ? -1 : x > y ? 1 : 0
    }
    return idOf(a) - idOf(b)
  }
}

const viewOwners = new WeakMap<object, AnyMap>()
const insertThroughMap = (view: object, e: unknown) => {
  ;(viewOwners.get(view) as AnyMap).set(e, e)
}
const contractOrder = anyOrder()

describe('map views are real sets', () => {
  it('runs the set suite on every map key set and entry set, filled through the map [017 S2-AC1]', () => {
    // The suites below are registered at module level; this test pins the views they run on.
    for (const [, make] of VIEW_MAPS) {
      const map = make()
      map.set(1, 1)
      expect(String(map.keySet())).toMatch(/KeySet\(1\) \{1\}$/)
      expect(String(map.entrySet())).toMatch(/EntrySet\(1\) \{1 => 1\}$/)
    }
  })

  it('removes the corresponding mappings and nothing else through view removals [017 S2-AC2]', () => {
    const entryOf = (map: AnyMap, key: unknown) =>
      [...map.entrySet()].find((entry) => entry.key === key) as MapEntry<unknown, unknown>
    for (const [name, make] of VIEW_MAPS) {
      const fill = () => {
        const map = make()
        for (const k of [1, 2, 3, 4, 5]) map.set(k, `v${k}`)
        return map
      }
      const rest = (map: AnyMap) => [...map.entries()]
      const check = (change: (map: AnyMap) => unknown, kept: number[]) => {
        const map = fill()
        change(map)
        expect(rest(map), name).toEqual(kept.map((k) => [k, `v${k}`]))
      }
      check((m) => m.keySet().removeAll([2, 4, 9]), [1, 3, 5])
      check((m) => m.keySet().retainAll([2, 4, 9]), [2, 4])
      check((m) => m.keySet().removeIf((k) => (k as number) > 3), [1, 2, 3])
      check((m) => m.keySet().delete(3), [1, 2, 4, 5])
      check((m) => m.keySet().clear(), [])
      check((m) => m.entrySet().removeAll([entryOf(m, 2), entryOf(fill(), 4)]), [1, 3, 5])
      check((m) => m.entrySet().retainAll([entryOf(m, 1)]), [1])
      check((m) => m.entrySet().removeIf((e) => e.key === 5), [1, 2, 3, 4])
      check((m) => m.entrySet().delete(entryOf(m, 1)), [2, 3, 4, 5])
      check(
        (m) => {
          // An entry with the right key and another value matches no mapping.
          const other = make()
          other.set(1, 'other')
          m.entrySet().delete(entryOf(other, 1))
        },
        [1, 2, 3, 4, 5],
      )
      check((m) => m.entrySet().clear(), [])
    }
  })

  it('makes entry sets of equal maps equal across implementations, hashing as their maps [017 S2-AC3]', () => {
    const maps = VIEW_MAPS.map(([, make]) => {
      const map = make()
      for (const k of [3, 1, 2]) map.set(k, `v${k}`)
      return map
    })
    for (const a of maps) {
      expect(hashCode(a.entrySet())).toBe(hashCode(a))
      for (const b of maps) {
        expect(a.entrySet().equals(b.entrySet())).toBe(true)
        expect(b.entrySet().equals(a.entrySet())).toBe(true)
        expect(hashCode(a.entrySet())).toBe(hashCode(b.entrySet()))
        expect(a.keySet().equals(b.keySet())).toBe(true)
        expect(b.keySet().equals(a.keySet())).toBe(true)
      }
      const keys = new HashSet([1, 2, 3])
      expect(a.keySet().equals(keys)).toBe(true)
      expect(keys.equals(a.keySet())).toBe(true)
    }
  })
})

for (const [name, make] of VIEW_MAPS) {
  const keySet = (initial: Iterable<unknown> = []) => {
    const map = make()
    for (const e of initial) map.set(e, e)
    const view = map.keySet()
    viewOwners.set(view, map)
    return view
  }
  const entrySet = (initial: Iterable<unknown> = []) => {
    const map = make()
    for (const e of initial) map.set(e, e)
    const view = map.entrySet() as unknown as AnySet
    viewOwners.set(view, map)
    return view
  }
  const order = (members: unknown[]) =>
    name === 'TreeMap' ? members.slice().sort(contractOrder) : members
  describe(`${name} views as sets [017 S2-AC1]`, () => {
    describeSetCollection(`${name}KeySet`, keySet, { insert: insertThroughMap, order })
    describeSetCollection(`${name}EntrySet`, entrySet, {
      insert: insertThroughMap,
      order,
      member: (entry) => (entry as MapEntry<unknown, unknown>).key,
      probe: (e) => [...new HashMap([[e, e]]).entrySet()][0],
      printed: (text) => `${text} => ${text}`,
    })
  })
}

// ── Maps compare across implementations ──

/** A value equal to another with the same `n`, through the equality protocol. */
class Amount {
  constructor(readonly n: number) {}
  [equalsSymbol](other: unknown): boolean {
    return other instanceof Amount && other.n === this.n
  }
  [hashCodeSymbol](): number {
    return this.n
  }
}

type MapKind = [string, (pairs: Array<[number, unknown]>) => AnyMap]

const MAP_KINDS: MapKind[] = [
  ['HashMap', (pairs) => asMap(new HashMap(pairs))],
  ['LinkedHashMap', (pairs) => asMap(new LinkedHashMap(pairs))],
  [
    'access-ordered LinkedHashMap',
    (pairs) => {
      const map = new LinkedHashMap<number, unknown>({ accessOrder: true })
      map.putAll(pairs)
      return asMap(map)
    },
  ],
  [
    'reversed LinkedHashMap',
    (pairs) => {
      const view = new LinkedHashMap<number, unknown>().reversed()
      view.putAll(pairs)
      return asMap(view)
    },
  ],
  ['TreeMap', (pairs) => asMap(new TreeMap(pairs))],
  [
    'TreeMap range view',
    (pairs) => {
      const view = new TreeMap<number, unknown>([
        [-1000, 'low'],
        [1000, 'high'],
      ]).subMap(-100, 100)
      view.putAll(pairs)
      return asMap(view)
    },
  ],
  ['reversed TreeMap', (pairs) => asMap(new TreeMap(pairs).reversed())],
]

const PAIRS: Array<[number, unknown]> = [
  [3, new Amount(30)],
  [1, 'one'],
  [2, new Amount(20)],
]
const SHUFFLED_PAIRS: Array<[number, unknown]> = [
  [2, new Amount(20)],
  [3, new Amount(30)],
  [1, 'one'],
]

describe('maps compare across implementations', () => {
  it('are equal both ways with equal mappings, hash alike, and leave access order alone [017 S3-AC1]', () => {
    const expectedHash = hashCode(new HashMap(PAIRS))
    for (const [nameA, makeA] of MAP_KINDS) {
      for (const [nameB, makeB] of MAP_KINDS) {
        const pair = `${nameA} / ${nameB}`
        const a = makeA(PAIRS)
        const b = makeB(SHUFFLED_PAIRS)
        const orderA = [...a.keys()]
        const orderB = [...b.keys()]
        expect(a.equals(b), pair).toBe(true)
        expect(b.equals(a), pair).toBe(true)
        expect(equals(a, b), pair).toBe(true)
        expect([...a.keys()], pair).toEqual(orderA)
        expect([...b.keys()], pair).toEqual(orderB)
        const different = makeB([
          [3, new Amount(30)],
          [1, 'one'],
          [2, new Amount(21)],
        ])
        expect(a.equals(different), pair).toBe(false)
        expect(different.equals(a), pair).toBe(false)
        expect(a.equals(makeB(PAIRS.slice(1))), pair).toBe(false)
        expect(makeB(PAIRS.slice(1)).equals(a), pair).toBe(false)
      }
      expect(hashCode(makeA(SHUFFLED_PAIRS)), nameA).toBe(expectedHash)
    }
  })

  it('putAll copies another map of any kind, a native Map or an entry set in source order [017 S3-AC2]', () => {
    for (const [targetName, makeTarget] of MAP_KINDS) {
      const sources: Array<[string, () => Iterable<readonly [number, unknown]>]> = [
        ...MAP_KINDS.map(([name, make]): [string, () => Iterable<readonly [number, unknown]>] => [
          name,
          () => make(PAIRS) as Iterable<[number, unknown]>,
        ]),
        ['native Map', () => new Map(PAIRS)],
        [
          'entry set',
          () => new LinkedHashMap(PAIRS).entrySet() as unknown as Iterable<[number, unknown]>,
        ],
      ]
      for (const [sourceName, makeSource] of sources) {
        const source = makeSource()
        const keyOf = (entry: unknown) =>
          Array.isArray(entry) ? entry[0] : (entry as MapEntry<number, unknown>).key
        const sourceOrder = [...source].map(keyOf)
        const target = makeTarget([])
        target.putAll(source as Iterable<[unknown, unknown]>)
        const label = `${targetName} <- ${sourceName}`
        expect(target.size, label).toBe(3)
        expect(target.equals(new HashMap(PAIRS)), label).toBe(true)
        if (targetName === 'LinkedHashMap' || targetName === 'access-ordered LinkedHashMap') {
          expect([...target.keys()], label).toEqual(sourceOrder)
        }
        expect([...source].map(keyOf), label).toEqual(sourceOrder)
      }
    }
  })

  it('putAll reads its source exactly once [017 S3-AC2]', () => {
    for (const [targetName, makeTarget] of MAP_KINDS) {
      let reads = 0
      const source: Iterable<[number, unknown]> = {
        [Symbol.iterator]() {
          reads++
          return new Map(PAIRS)[Symbol.iterator]()
        },
      }
      const target = makeTarget([])
      target.putAll(source as Iterable<[unknown, unknown]>)
      expect(reads, targetName).toBe(1)
      expect(target.size, targetName).toBe(3)
    }
  })

  it('putAll leaves an access-ordered source in its order [017 S3-AC2]', () => {
    const source = new LinkedHashMap<number, string>({ accessOrder: true })
    source.putAll([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
    ])
    for (const [, make] of MAP_KINDS) make([]).putAll(source)
    expect([...source.keys()]).toEqual([1, 2, 3])
  })

  it('putAll of the map itself or its entry set keeps mappings, size and order and changes revision [017 S3-AC2]', () => {
    for (const [name, make] of MAP_KINDS) {
      for (const self of [(m: AnyMap) => m, (m: AnyMap) => m.entrySet()]) {
        const map = make(PAIRS)
        const before = [...map.entries()]
        const revision = map.revision
        map.putAll(self(map) as Iterable<[unknown, unknown]>)
        expect([...map.entries()], name).toEqual(before)
        expect(map.size, name).toBe(3)
        expect(map.revision, name).not.toBe(revision)
      }
    }
  })

  it('putAll into a LinkedHashMap with a smaller maxSize evicts the eldest [017 S3-AC2]', () => {
    const target = new LinkedHashMap<number, unknown>({ maxSize: 2 })
    target.putAll(new HashMap(PAIRS))
    expect([...target.keys()]).toEqual([...new HashMap(PAIRS).keys()].slice(1))
    expect(target.size).toBe(2)
  })

  it('putAll into a natural-order TreeMap refuses null and mixed-kind keys, unchanged [017 S3-AC2]', () => {
    const target = new TreeMap<unknown, unknown>([[5, 'five']])
    expect(() =>
      target.putAll(
        new HashMap<unknown, unknown>([
          [1, 'a'],
          [null, 'b'],
        ]),
      ),
    ).toThrow(NullElementError)
    expect(() =>
      target.putAll(
        new HashMap<unknown, unknown>([
          [1, 'a'],
          ['x', 'b'],
        ]),
      ),
    ).toThrow(ClassCastError)
    expect([...target.entries()]).toEqual([[5, 'five']])
  })

  it('are never equal to a set, list or native Map of the same mappings [017 S3-AC3]', () => {
    for (const [name, make] of MAP_KINDS) {
      const map = make(PAIRS)
      const peers: unknown[] = [
        new HashSet(PAIRS),
        new HashSet([...map.entrySet()]),
        new ArrayList(PAIRS),
        new Map(PAIRS),
      ]
      for (const peer of peers) {
        expect(map.equals(peer), name).toBe(false)
        expect(equals(map, peer), name).toBe(false)
        expect(equals(peer, map), name).toBe(false)
        const other = peer as { equals?: (value: unknown) => boolean }
        if (typeof other.equals === 'function') expect(other.equals(map), name).toBe(false)
      }
    }
  })
})

// ── Native Set and Map interop ──

type SetMethod =
  | 'union'
  | 'intersection'
  | 'difference'
  | 'symmetricDifference'
  | 'isSubsetOf'
  | 'isSupersetOf'
  | 'isDisjointFrom'
const SET_METHODS: SetMethod[] = [
  'union',
  'intersection',
  'difference',
  'symmetricDifference',
  'isSubsetOf',
  'isSupersetOf',
  'isDisjointFrom',
]
const setPrototype = Set.prototype as unknown as Record<string, unknown>
const hasSetMethods = SET_METHODS.every((method) => typeof setPrototype[method] === 'function')
const mapGroupBy = (Map as unknown as { groupBy?: unknown }).groupBy as
  | (<T, K>(items: Iterable<T>, by: (item: T) => K) => Map<K, T[]>)
  | undefined

/** Calls the native set method `method` on `receiver` with `argument`, as the runtime does. */
function callNative(receiver: Set<unknown>, method: SetMethod, argument: unknown): unknown {
  const result = (setPrototype[method] as (this: Set<unknown>, other: unknown) => unknown).call(
    receiver,
    argument,
  )
  return result instanceof Set ? [...result] : result
}

describe('native Set and Map interop', () => {
  it.runIf(hasSetMethods)(
    'native set methods treat a library set like a native Set of its members [017 S5-AC1]',
    () => {
      const receivers = [new Set([1, 2, 9]), new Set<unknown>(), new Set([3, 1, 2]), new Set([7])]
      const accessOrdered = new LinkedHashMap<number, boolean>({ accessOrder: true })
      for (const k of MEMBERS) accessOrdered.set(k, true)
      const kinds: SetKind[] = [
        ...SET_KINDS,
        ['access-ordered LinkedHashMap keySet', () => asSet(accessOrdered.keySet())],
        [
          'HashSet with SameValueZero equivalence',
          (members) => asSet(new HashSet(members, { equivalence: sameValueZeroEquivalence })),
        ],
      ]
      for (const [name, make] of kinds) {
        for (const receiver of receivers) {
          for (const method of SET_METHODS) {
            const library = make(MEMBERS)
            const native = new Set([...library])
            expect(callNative(receiver, method, library), `${name} ${method}`).toEqual(
              callNative(receiver, method, native),
            )
          }
        }
      }
      expect([...accessOrdered.keys()]).toEqual(MEMBERS)
    },
  )

  it.runIf(hasSetMethods)(
    'native set methods follow the equality of a key set given as the argument [017 S5-AC2]',
    () => {
      const lowercase = new HashSet<string>(['A', 'B'], { key: (s) => s.toLowerCase() })
      expect(callNative(new Set(['a']), 'isSubsetOf', lowercase)).toBe(true)
      expect(callNative(new Set(['a', 'c']), 'intersection', lowercase)).toEqual(['a'])
      expect(callNative(new Set(['a', 'b', 'c']), 'isSupersetOf', lowercase)).toBe(false)
      expect(callNative(new Set(['c']), 'isDisjointFrom', lowercase)).toBe(true)
    },
  )

  it('new Set and new Map copy library collections in their iteration order [017 S5-AC3]', () => {
    for (const [name, make] of SET_KINDS) {
      const set = make(MEMBERS)
      expect([...new Set(set)], name).toEqual([...set])
    }
    for (const [name, make] of MAP_KINDS) {
      const map = make(PAIRS)
      expect([...new Map(map)], name).toEqual([...map])
    }
  })

  it('library collections built from native ones hold the same members and order [017 S5-AC4]', () => {
    const native = new Set([3, 1, 2])
    expect([...new HashSet(native)]).toEqual([3, 1, 2])
    expect([...new LinkedHashSet(native)]).toEqual([3, 1, 2])
    expect([...new TreeSet(native)]).toEqual([1, 2, 3])
    const nativeMap = new Map(PAIRS)
    expect([...new HashMap(nativeMap)]).toEqual(PAIRS)
    expect([...new LinkedHashMap(nativeMap)]).toEqual(PAIRS)
    expect([...new TreeMap(nativeMap)]).toEqual(PAIRS.slice().sort((a, b) => a[0] - b[0]))
  })

  it.runIf(typeof mapGroupBy === 'function')(
    'Map.groupBy output fills any library map with the same groups [017 S5-AC5]',
    () => {
      const groups = (mapGroupBy as NonNullable<typeof mapGroupBy>)([1, 2, 3, 4, 5], (n) =>
        n % 2 === 0 ? 'even' : 'odd',
      )
      for (const map of [new HashMap(groups), new LinkedHashMap(groups), new TreeMap(groups)]) {
        expect(map.size).toBe(2)
        expect(map.get('odd')).toEqual([1, 3, 5])
        expect(map.get('even')).toEqual([2, 4])
      }
      expect([...new LinkedHashMap(groups).keys()]).toEqual(['odd', 'even'])
    },
  )
})
