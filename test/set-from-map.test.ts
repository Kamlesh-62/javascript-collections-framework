import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  ArrayList,
  ClassCastError,
  type Comparator,
  ConcurrentModificationError,
  equals,
  HashMap,
  HashSet,
  hashCode,
  IllegalArgumentError,
  isCollection,
  isMapCollection,
  isSequencedCollection,
  isSetCollection,
  isSortedSet,
  LinkedHashMap,
  type MapCollection,
  NullElementError,
  newSetFromMap,
  type SetCollection,
  TreeMap,
  TreeSet,
} from '../src/index'
import { type CollectionFactory, describeCollection } from './contracts/collection'
import { describeSetCollection } from './contracts/set'

function caught(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

type AnyMap = MapCollection<unknown, boolean>

const asMap = (map: unknown): AnyMap => map as AnyMap

/** Every kind of map a set can be built over, empty, with the order its keys iterate in. */
function emptyMaps(): Array<[string, () => AnyMap, (keys: number[]) => number[]]> {
  const ascending = (keys: number[]) => keys.slice().sort((a, b) => a - b)
  const descending = (keys: number[]) => keys.slice().sort((a, b) => b - a)
  const asAdded = (keys: number[]) => keys
  return [
    ['HashMap', () => asMap(new HashMap<number, boolean>()), asAdded],
    ['LinkedHashMap', () => asMap(new LinkedHashMap<number, boolean>()), asAdded],
    [
      'access-ordered LinkedHashMap',
      () => asMap(new LinkedHashMap<number, boolean>({ accessOrder: true })),
      asAdded,
    ],
    [
      'reversed LinkedHashMap',
      () => asMap(new LinkedHashMap<number, boolean>().reversed()),
      asAdded,
    ],
    ['TreeMap', () => asMap(new TreeMap<number, boolean>()), ascending],
    [
      'TreeMap range view',
      () => asMap(new TreeMap<number, boolean>([[-100, true]]).subMap(-50, 50)),
      ascending,
    ],
    ['reversed TreeMap', () => asMap(new TreeMap<number, boolean>().reversed()), descending],
    [
      'TreeMap with a comparator',
      () => asMap(new TreeMap<number, boolean>({ comparator: (a, b) => b - a })),
      descending,
    ],
  ]
}

describe('newSetFromMap — creating the set', () => {
  for (const [name, make, order] of emptyMaps()) {
    it(`returns a live set over an empty ${name}, ordered as the map orders its keys [017 S4-AC1]`, () => {
      const map = make()
      const set = newSetFromMap(map)
      expect(isSetCollection(set)).toBe(true)
      set.add(3).add(1).add(2)
      expect([...set]).toEqual(order([3, 1, 2]))
      expect([...set]).toEqual([...map.keys()])
      expect([...map.values()]).toEqual([true, true, true])
      expect(set.size).toBe(3)
      expect(String(set)).toBe(`SetFromMap(3) {${order([3, 1, 2]).join(', ')}}`)
    })
  }

  it('accepts a range view that is empty though its map is not [017 S4-AC1]', () => {
    const backing = new TreeMap<number, boolean>([
      [1, true],
      [100, true],
    ])
    const set = newSetFromMap(backing.subMap(10, 20))
    set.add(15)
    expect([...set]).toEqual([15])
    expect([...backing.keys()]).toEqual([1, 15, 100])
  })

  it('throws IllegalArgumentError naming newSetFromMap for a non-empty map [017 S4-AC2]', () => {
    for (const map of [
      new HashMap([[1, true]]),
      new LinkedHashMap([
        [1, true],
        [2, false],
      ]),
      new TreeMap([[1, true]]),
    ]) {
      const error = caught(() => newSetFromMap(map))
      expect(error).toBeInstanceOf(IllegalArgumentError)
      expect((error as Error).message).toMatch(
        /^newSetFromMap: map must be empty, but has \d mapping/,
      )
    }
    expect(() => newSetFromMap(new HashMap([[1, true]]))).toThrow(
      'newSetFromMap: map must be empty, but has 1 mapping',
    )
  })

  it('throws TypeError naming newSetFromMap for anything that is not a library map [017 S4-AC2]', () => {
    const notMaps: unknown[] = [
      new Map(),
      new Set(),
      new HashSet(),
      new HashMap().keySet(),
      new TreeMap().entrySet(),
      null,
      undefined,
      42,
      [],
    ]
    for (const value of notMaps) {
      const error = caught(() => newSetFromMap(value as AnyMap))
      expect(error).toBeInstanceOf(TypeError)
      expect((error as Error).message).toMatch(/^newSetFromMap: map is not a map from this library/)
    }
    expect(() => newSetFromMap(null as never)).toThrow(
      'newSetFromMap: map is not a map from this library (null)',
    )
  })
})

describe('newSetFromMap — adding', () => {
  /** Wraps `map` so every `getOrInsert` call is recorded. */
  function recording(map: AnyMap): { map: AnyMap; calls: unknown[][] } {
    const calls: unknown[][] = []
    const proxy = new Proxy(map, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver)
        if (property === 'getOrInsert') {
          return (...args: unknown[]) => {
            calls.push(args)
            return Reflect.apply(value as (...a: unknown[]) => unknown, target, args)
          }
        }
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    return { map: proxy, calls }
  }

  it('adds through getOrInsert(member, true) and returns the set [017 S4-AC3]', () => {
    const { map, calls } = recording(asMap(new HashMap()))
    const set = newSetFromMap(map)
    expect(set.add('a')).toBe(set)
    expect(calls).toEqual([['a', true]])
    expect(map.get('a')).toBe(true)
  })

  it('checks and reports emptiness through the map isEmpty, never reading size [017 S4-AC4]', () => {
    const reads: string[] = []
    const range = new TreeMap<number, boolean>().subMap(0, 10)
    const map = new Proxy(range, {
      get(target, property, receiver) {
        if (property === 'size' || property === 'isEmpty') reads.push(property)
        const value = Reflect.get(target, property, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const set = newSetFromMap(map)
    expect(set.isEmpty()).toBe(true)
    expect(reads).toEqual(['isEmpty', 'isEmpty'])
    set.add(5)
    expect(set.isEmpty()).toBe(false)
  })

  it('keeps a present member and its value, with revision unchanged, on hash and tree maps [017 S4-AC3]', () => {
    for (const map of [new HashMap<string, boolean>(), new TreeMap<string, boolean>()]) {
      const set = newSetFromMap(map)
      set.add('a').add('b')
      map.set('a', false)
      const revision = set.revision
      set.add('a')
      expect(set.revision).toBe(revision)
      expect(map.get('a')).toBe(false)
      expect([...set]).toEqual(['a', 'b'])
    }
  })

  it('counts re-adding as an access on an access-ordered LinkedHashMap [017 S4-AC3]', () => {
    const map = new LinkedHashMap<string, boolean>({ accessOrder: true })
    const set = newSetFromMap(map)
    set.add('a').add('b')
    const revision = set.revision
    set.add('a')
    expect([...set]).toEqual(['b', 'a'])
    expect(set.revision).not.toBe(revision)
  })

  it('keeps the stored member when an equal one is added over a key map [017 S4-AC3]', () => {
    const map = new HashMap<{ id: number }, boolean>({ key: (e) => e.id })
    const set = newSetFromMap(map)
    const first = { id: 1 }
    set.add(first).add({ id: 1 })
    expect(set.size).toBe(1)
    expect([...set][0]).toBe(first)
  })

  it('addAll is true when an element was absent before its add, even when eviction keeps the size [017 S4-AC3]', () => {
    const map = new LinkedHashMap<string, boolean>({ accessOrder: true, maxSize: 2 })
    const set = newSetFromMap(map)
    set.add('a').add('b')
    expect(set.addAll(['c'])).toBe(true)
    expect(set.size).toBe(2)
    expect([...set]).toEqual(['b', 'c'])
    expect(set.addAll(['b'])).toBe(false)
    expect([...set]).toEqual(['c', 'b'])
    expect(set.addAll([])).toBe(false)
  })

  it('addAll asks the map has and then getOrInsert for each element [017 S4-AC3]', () => {
    const seen: string[] = []
    const map = new HashMap<string, boolean>({
      key: (e) => {
        seen.push(e)
        return e
      },
    })
    const set = newSetFromMap(map)
    seen.length = 0
    expect(set.addAll(['x', 'y'])).toBe(true)
    expect(seen).toEqual(['x', 'x', 'y', 'y'])
  })

  it('names SetFromMap in its own argument errors [017 S4-AC3]', () => {
    const set = newSetFromMap(new HashMap())
    expect(() => set.addAll(5 as never)).toThrow(
      new TypeError('SetFromMap.addAll: elements is not iterable (5)'),
    )
    expect(() => set.removeAll(5 as never)).toThrow(
      'SetFromMap.removeAll: elements is not iterable',
    )
    expect(() => set.retainAll(5 as never)).toThrow(
      'SetFromMap.retainAll: elements is not iterable',
    )
    expect(() => set.removeIf(5 as never)).toThrow(
      'SetFromMap.removeIf: predicate is not a function',
    )
    expect(() => set.forEach(5 as never)).toThrow('SetFromMap.forEach: action is not a function')
  })
})

describe('newSetFromMap — the map shows through', () => {
  for (const [name, make] of emptyMaps()) {
    it(`shows direct changes to a ${name}, with its size and revision [017 S4-AC4]`, () => {
      const map = make()
      const set = newSetFromMap(map)
      map.set(1, true)
      map.set(2, false)
      expect(set.has(1)).toBe(true)
      expect(set.has(2)).toBe(true)
      expect(set.size).toBe(map.size)
      expect(set.revision).toBe(map.revision)
      map.set(2, true)
      expect(set.size).toBe(2)
      expect(set.revision).toBe(map.revision)
      map.delete(1)
      expect(set.has(1)).toBe(false)
      expect(set.size).toBe(1)
      expect(set.revision).toBe(map.revision)
    })
  }

  it('leaves membership unchanged when a present key is written false [017 S4-AC4]', () => {
    const map = new HashMap<string, boolean>()
    const set = newSetFromMap(map)
    set.add('a')
    map.set('a', false)
    expect(set.has('a')).toBe(true)
    expect([...set]).toEqual(['a'])
  })
})

describe('newSetFromMap — iteration and removal', () => {
  it('iterates live over a HashMap and a LinkedHashMap [017 S4-AC5]', () => {
    for (const map of [new HashMap<number, boolean>(), new LinkedHashMap<number, boolean>()]) {
      const set = newSetFromMap(map)
      set.add(1).add(2)
      const seen: number[] = []
      for (const e of set) {
        seen.push(e)
        if (e === 1) set.add(3)
      }
      expect(seen).toEqual([1, 2, 3])
      const visited: number[] = []
      set.forEach((e) => {
        visited.push(e)
        if (e === 3) set.add(4)
      })
      expect(visited).toEqual([1, 2, 3, 4])
    }
  })

  it('fails fast over a TreeMap and its views, naming the key view [017 S4-AC5]', () => {
    for (const map of [
      new TreeMap<number, boolean>(),
      new TreeMap<number, boolean>().reversed(),
      new TreeMap<number, boolean>().headMap(100),
    ]) {
      const set = newSetFromMap(map)
      set.add(1).add(2)
      const forEachError = caught(() =>
        set.forEach(() => {
          set.add(3)
        }),
      )
      expect(forEachError).toBeInstanceOf(ConcurrentModificationError)
      expect((forEachError as Error).message).toMatch(/^Tree\w*KeySet\.forEach: /)
      const iterator = set[Symbol.iterator]()
      iterator.next()
      set.add(4)
      expect(() => iterator.next()).toThrow(ConcurrentModificationError)
      const cursor = set.cursor()
      expect(() => cursor.remove()).toThrow(/^Tree\w*KeySet\.cursor: /)
    }
  })

  it('passes the set as the third forEach argument and thisArg as this [017 S4-AC5]', () => {
    for (const map of [new HashMap(), new LinkedHashMap(), new TreeMap()]) {
      const set = newSetFromMap(asMap(map))
      set.add(1)
      const context = {}
      const calls: unknown[][] = []
      set.forEach(function (this: unknown, a, b, c) {
        calls.push([this, a, b, c])
      }, context)
      expect(calls).toEqual([[context, 1, 1, set]])
      expect(calls[0]?.[3]).toBe(set)
    }
  })

  it('removes mappings through cursor, delete, removeIf, removeAll, retainAll and clear [017 S4-AC5]', () => {
    for (const map of [
      new HashMap<number, boolean>(),
      new LinkedHashMap<number, boolean>(),
      new TreeMap<number, boolean>(),
    ]) {
      const set = newSetFromMap(map)
      set.addAll([1, 2, 3, 4, 5, 6, 7])
      const cursor = set.cursor()
      cursor.next()
      cursor.remove()
      expect(map.has(1)).toBe(false)
      expect(set.delete(2)).toBe(true)
      expect(set.delete(2)).toBe(false)
      expect(set.removeIf((e) => e === 3)).toBe(true)
      expect(set.removeAll([4, 40])).toBe(true)
      expect(set.retainAll([5, 6])).toBe(true)
      expect([...map.keys()]).toEqual([5, 6])
      set.clear()
      expect(map.size).toBe(0)
    }
  })
})

describe('newSetFromMap — LRU set', () => {
  it('keeps at most maxSize members, evicting the least recently added or re-added [017 S4-AC6]', () => {
    const evicted: unknown[][] = []
    const map: LinkedHashMap<string, boolean> = new LinkedHashMap<string, boolean>({
      accessOrder: true,
      maxSize: 3,
      onEvict: (value, key, owner) => {
        evicted.push([value, key, owner])
      },
    })
    const set = newSetFromMap(map)
    set.add('a').add('b').add('c')
    set.add('a')
    expect(set.has('b')).toBe(true)
    expect([...set]).toEqual(['b', 'c', 'a'])
    set.add('d')
    expect([...set]).toEqual(['c', 'a', 'd'])
    expect(evicted).toEqual([[true, 'b', map]])
    expect(evicted[0]?.[2]).toBe(map)
    expect(set.addAll(['e', 'c'])).toBe(true)
    expect([...set]).toEqual(['d', 'e', 'c'])
    // 'e' evicts 'c', the least recent; 'c' is then absent, so adding it evicts 'a'.
    expect(evicted.map((call) => call[1])).toEqual(['b', 'c', 'a'])
    expect(set.size).toBe(3)
  })
})

describe('newSetFromMap — a set like any other', () => {
  it('compares, hashes, prints and serialises as a set tagged SetFromMap [017 S4-AC7]', () => {
    const set = newSetFromMap(new LinkedHashMap<unknown, boolean>())
    set.add('b').add(1).add(null)
    const same = new HashSet<unknown>([null, 1, 'b'])
    expect(set.equals(same)).toBe(true)
    expect(same.equals(set)).toBe(true)
    expect(equals(set, same)).toBe(true)
    expect(hashCode(set)).toBe(hashCode(same))
    expect(set.equals(new HashSet([1, 'b']))).toBe(false)
    expect(set.equals(new ArrayList<unknown>(['b', 1, null]))).toBe(false)
    expect(String(set)).toBe("SetFromMap(3) {'b', 1, null}")
    expect(set.toJSON()).toEqual(['b', 1, null])
    expect(JSON.stringify(set)).toBe('["b",1,null]')
    expect(inspect(set)).toBe("SetFromMap(3) { 'b', 1, null }")
    expect(Object.prototype.toString.call(set)).toBe('[object SetFromMap]')
    expect(isSetCollection(set)).toBe(true)
    expect(isCollection(set)).toBe(true)
    expect(isSequencedCollection(set)).toBe(false)
    expect(isSortedSet(set)).toBe(false)
    expect(isMapCollection(set)).toBe(false)
    expect(set.isEmpty()).toBe(false)
    expect([...set.entries()]).toEqual([
      ['b', 'b'],
      [1, 1],
      [null, null],
    ])
    expect([...set.keys()]).toEqual([...set.values()])
    expect(set.toArray()).toEqual(['b', 1, null])
    expect('copy' in set).toBe(false)
  })

  it('compares members with the map key equality [017 S4-AC7]', () => {
    const lower = (s: string) => s.toLowerCase()
    const set = newSetFromMap(new HashMap<string, boolean>({ key: lower }))
    set.add('A')
    const other = new HashSet<string>(['a'], { key: lower })
    expect(set.equals(other)).toBe(true)
    expect(other.equals(set)).toBe(true)
    expect(hashCode(set)).toBe(hashCode(other))
  })
})

describe('newSetFromMap — the map key rules', () => {
  it('stores -0 as 0 and NaN once over a default HashMap [017 S4-AC10]', () => {
    const set = newSetFromMap(new HashMap<number, boolean>())
    set.add(-0).add(Number.NaN).add(Number.NaN)
    expect(Object.is([...set][0], 0)).toBe(true)
    expect(set.size).toBe(2)
  })

  it('holds itself as a member, printing [Circular], with equals and hashing ending [017 S4-AC10]', () => {
    const set = newSetFromMap(new HashMap<unknown, boolean>())
    set.add(set)
    expect(String(set)).toBe('SetFromMap(1) {[Circular]}')
    expect(set.equals(set)).toBe(true)
    const other = newSetFromMap(new HashMap<unknown, boolean>())
    other.add(other)
    expect(set.equals(other)).toBe(false)
    expect(typeof hashCode(set)).toBe('number')
  })

  it('stores -0 as 0 over a natural-order TreeMap and as the comparator decides otherwise [017 S4-AC10]', () => {
    const natural = newSetFromMap(new TreeMap<number, boolean>())
    natural.add(-0)
    expect(Object.is([...natural][0], 0)).toBe(true)
    const custom = newSetFromMap(new TreeMap<number, boolean>({ comparator: (a, b) => a - b }))
    custom.add(-0)
    expect(Object.is([...custom][0], -0)).toBe(true)
  })

  it('accepts null and undefined over a hash map and rejects them over a natural-order TreeMap [017 S4-AC10]', () => {
    const hashed = newSetFromMap(new HashMap<unknown, boolean>())
    hashed.add(null).add(undefined)
    expect(hashed.size).toBe(2)
    const sorted = newSetFromMap(new TreeMap<unknown, boolean>())
    const error = caught(() => sorted.add(null))
    expect(error).toBeInstanceOf(NullElementError)
    expect((error as Error).message).toMatch(/^TreeMap\./)
    expect(sorted.size).toBe(0)
  })

  it('throws ClassCastError adding a mixed kind over a TreeMap while has answers false [017 S4-AC10]', () => {
    const set = newSetFromMap(new TreeMap<unknown, boolean>())
    set.add(1)
    const error = caught(() => set.add('a'))
    expect(error).toBeInstanceOf(ClassCastError)
    expect((error as Error).message).toMatch(/^TreeMap\.getOrInsert: /)
    expect(set.has('a')).toBe(false)
    expect([...set]).toEqual([1])
  })

  it('keeps the stored member for an equal one over an equivalence map [017 S4-AC10]', () => {
    const set = newSetFromMap(
      new HashMap<number[], boolean>({
        equivalence: {
          equals: (a, b) => a.length === b.length && a.every((x, i) => x === b[i]),
          hash: (a) => a.length,
        },
      }),
    )
    const stored = [1, 2]
    set.add(stored).add([1, 2])
    expect(set.size).toBe(1)
    expect([...set][0]).toBe(stored)
    expect(set.has([1, 2])).toBe(true)
  })

  it('handles shared backing: addAll of itself, removals against the map key set [017 S4-AC10]', () => {
    const map = new LinkedHashMap<number, boolean>()
    const set = newSetFromMap(map)
    set.addAll([1, 2, 3])
    expect(set.addAll(set)).toBe(false)
    expect([...set]).toEqual([1, 2, 3])
    map.set(9, false)
    expect(map.keySet().retainAll(set)).toBe(false)
    expect(set.removeAll(map.keySet())).toBe(true)
    expect(set.size).toBe(0)
    expect(map.size).toBe(0)
  })
})

describe('newSetFromMap — failures in the map', () => {
  it('propagates a range view error and adds nothing for that element [017 S4-AC11]', () => {
    const backing = new TreeMap<number, boolean>()
    const set = newSetFromMap(backing.subMap(0, 10))
    const error = caught(() => set.add(20))
    expect(error).toBeInstanceOf(IllegalArgumentError)
    expect((error as Error).message).toMatch(/^TreeSubMap\.getOrInsert: /)
    expect(backing.size).toBe(0)
    expect(() => set.addAll([1, 2, 30, 3])).toThrow(IllegalArgumentError)
    expect([...set]).toEqual([1, 2])
  })

  it('keeps the added member and drops the evicted one when onEvict throws in add [017 S4-AC11]', () => {
    const failure = new Error('evict failed')
    const map = new LinkedHashMap<string, boolean>({
      maxSize: 1,
      onEvict: () => {
        throw failure
      },
    })
    const set = newSetFromMap(map)
    set.add('a')
    expect(caught(() => set.add('b'))).toBe(failure)
    expect([...set]).toEqual(['b'])
  })

  it('stops addAll at the element whose eviction threw, keeping it and the earlier ones less evicted [017 S4-AC11]', () => {
    const failure = new Error('evict failed')
    const map = new LinkedHashMap<string, boolean>({
      maxSize: 2,
      onEvict: (_value, key) => {
        if (key === 'b') throw failure
      },
    })
    const set = newSetFromMap(map)
    set.add('a')
    expect(caught(() => set.addAll(['b', 'c', 'd', 'e']))).toBe(failure)
    // 'c' evicted 'a'; 'd' evicted 'b', whose callback threw: 'd' stays, 'e' is never added.
    expect([...set]).toEqual(['c', 'd'])
  })
})

// ── Shared contracts ──

const sumOf = (elements: unknown[], hash: (value: unknown) => number) =>
  elements.reduce<number>((h, e) => (h + hash(e)) | 0, 0)

/** A total order over the values the contract suites use: by kind, then by value or first sight. */
function anyOrder(): Comparator<unknown> {
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
    switch (typeof a) {
      case 'number': {
        const x = a as number
        const y = b as number
        if (Number.isNaN(x) || Number.isNaN(y))
          return Number(Number.isNaN(x)) - Number(Number.isNaN(y))
        return x < y ? -1 : x > y ? 1 : 0
      }
      case 'bigint':
      case 'string':
      case 'boolean': {
        const x = a as string
        const y = b as string
        return x < y ? -1 : x > y ? 1 : 0
      }
      default:
        return idOf(a) - idOf(b)
    }
  }
}

const filled =
  (empty: () => AnyMap) =>
  (initial: Iterable<unknown> = []): SetCollection<unknown> => {
    const set = newSetFromMap(empty())
    for (const e of initial) set.add(e)
    return set
  }

const overHashMap = filled(() => asMap(new HashMap()))
const overLinkedHashMap = filled(() => asMap(new LinkedHashMap()))
const contractOrder = anyOrder()
const overTreeMap = filled(() => asMap(new TreeMap<unknown, boolean>({ comparator: anyOrder() })))

describe('newSetFromMap — shared contracts', () => {
  it('runs the collection and set suites over a HashMap, a LinkedHashMap and a TreeMap [017 S4-AC8]', () => {
    // The suites below are registered at module level; this test pins the factories they use.
    expect(String(overHashMap([2, 1]))).toBe('SetFromMap(2) {2, 1}')
    expect(String(overLinkedHashMap([2, 1]))).toBe('SetFromMap(2) {2, 1}')
    expect(String(overTreeMap([2, 'a', 1]))).toBe("SetFromMap(3) {1, 2, 'a'}")
  })
})

for (const [name, make] of [
  ['over a HashMap', overHashMap],
  ['over a LinkedHashMap', overLinkedHashMap],
] as const) {
  describe(`${name} [017 S4-AC8]`, () => {
    describeCollection('SetFromMap', make as CollectionFactory, {
      cursorName: make === overHashMap ? 'HashMapKeySet' : 'LinkedHashMapKeySet',
      iteration: 'live',
      brackets: 'set',
      nullElements: 'store',
      peers: [(initial?: Iterable<unknown>) => new HashSet<unknown>(initial)],
      structural: { expectedHash: sumOf },
      withEquality: (initial, equality) => {
        const set = newSetFromMap(
          asMap(
            new HashMap<unknown, boolean>({ equivalence: { equals: equality, hash: () => 0 } }),
          ),
        )
        for (const e of initial) set.add(e)
        return set
      },
      withFailingAdd: (rejects, failure) =>
        newSetFromMap(
          asMap(
            new HashMap<unknown, boolean>({
              key: (e) => {
                if (rejects(e)) throw failure
                return e as number
              },
            }),
          ),
        ),
    })
    describeSetCollection('SetFromMap', make)
  })
}

describe('over a TreeMap [017 S4-AC8]', () => {
  describeCollection('SetFromMap', overTreeMap as CollectionFactory, {
    cursorName: 'TreeMapKeySet',
    iteration: 'fail-fast',
    brackets: 'set',
    nullElements: 'store',
    order: 'unspecified',
    minusZero: 'kept',
    peers: [(initial?: Iterable<unknown>) => new HashSet<unknown>(initial)],
    structural: { expectedHash: sumOf },
    withFailingAdd: (rejects, failure) => {
      const order = anyOrder()
      return newSetFromMap(
        asMap(
          new TreeMap<unknown, boolean>({
            comparator: (a, b) => {
              if (rejects(a) || rejects(b)) throw failure
              return order(a, b)
            },
          }),
        ),
      )
    },
  })
  describeSetCollection('SetFromMap', overTreeMap, {
    order: (members) => members.slice().sort(contractOrder),
  })
})

describe('newSetFromMap — not a class', () => {
  it('is not an instance of any library class [017 S4-AC7]', () => {
    const set = newSetFromMap(new TreeMap<number, boolean>())
    for (const type of [TreeSet, HashSet, TreeMap, HashMap, LinkedHashMap, ArrayList]) {
      expect(set instanceof type).toBe(false)
    }
  })
})
