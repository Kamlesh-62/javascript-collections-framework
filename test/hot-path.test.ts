import { describe, expect, it } from 'vitest'
import {
  compareSymbol,
  HashMap,
  HashSet,
  LinkedHashMap,
  LinkedHashSet,
  PriorityQueue,
  TreeMap,
  TreeSet,
} from '../src/index'

// Counts the calls a collection makes to the native `Map` and `Set` that hold its contents,
// through spies on their prototypes. Nothing is timed.

const MAP_METHODS = ['get', 'has', 'set', 'delete'] as const
const SET_METHODS = ['has', 'add', 'delete'] as const

/**
 * Wraps the native methods with counters, runs `work`, restores them, and returns how many calls
 * `work` made in all. Plain wrappers, not test-framework spies, whose own bookkeeping may use
 * `Map` and `Set`.
 */
function nativeCalls(work: () => void): number {
  let calls = 0
  const saved: Array<[object, string, unknown]> = []
  const wrap = (proto: object, names: readonly string[]) => {
    for (const name of names) {
      const original = Reflect.get(proto, name) as (...args: unknown[]) => unknown
      saved.push([proto, name, original])
      Reflect.set(proto, name, function (this: unknown, ...args: unknown[]) {
        calls++
        return Reflect.apply(original, this, args)
      })
    }
  }
  wrap(Map.prototype, MAP_METHODS)
  wrap(Set.prototype, SET_METHODS)
  try {
    work()
  } finally {
    for (const [proto, name, original] of saved) Reflect.set(proto, name, original)
  }
  return calls
}

describe('a default HashMap', () => {
  const filled = () =>
    new HashMap<number, number | undefined>([
      [1, 10],
      [2, undefined],
    ])

  it('reads with one native call for get, has and delete [043 S1-AC1]', () => {
    for (const key of [1, 2, 3]) {
      const map = filled()
      expect(
        nativeCalls(() => map.get(key)),
        `get ${key}`,
      ).toBe(1)
      expect(
        nativeCalls(() => map.has(key)),
        `has ${key}`,
      ).toBe(1)
      expect(
        nativeCalls(() => map.delete(key)),
        `delete ${key}`,
      ).toBe(1)
    }
  })

  it('writes with at most two native calls for set, put and remove, for new and existing keys [043 S1-AC1]', () => {
    for (const key of [1, 2, 3]) {
      const map = filled()
      expect(
        nativeCalls(() => map.set(key, 5)),
        `set ${key}`,
      ).toBeLessThanOrEqual(2)
      expect(
        nativeCalls(() => map.put(key, 6)),
        `put ${key}`,
      ).toBeLessThanOrEqual(2)
      expect(
        nativeCalls(() => map.remove(key)),
        `remove ${key}`,
      ).toBeLessThanOrEqual(2)
    }
  })

  it('keeps every result: undefined values, -0, revisions [043 S1-AC1]', () => {
    const map = filled()
    expect(map.get(2)).toBeUndefined()
    expect(map.has(2)).toBe(true)
    expect(map.getOrDefault(2, 'x')).toBeUndefined()
    expect(map.getOrDefault(3, 'x')).toBe('x')
    expect(map.put(2, 7)).toBeUndefined()
    expect(map.put(4, 8)).toBeUndefined()
    expect(map.put(4, 9)).toBe(8)
    expect(map.remove(2)).toBe(7)
    expect(map.remove(2)).toBeUndefined()
    map.set(-0, 1)
    expect([...map.keys()]).toContain(0)
    expect(
      Object.is(
        [...map.keys()].find((k) => k === 0),
        0,
      ),
    ).toBe(true)
    expect(map.get(0)).toBe(1)
    const r0 = map.revision
    map.set(0, 2) // an existing key: a value change
    const r1 = map.revision
    expect(r1).toBeGreaterThan(r0)
    expect(map.delete(99)).toBe(false)
    expect(map.revision).toBe(r1)
  })
})

describe('a default HashSet', () => {
  it('makes one native call for has, add and delete, for members and non-members [043 S1-AC1]', () => {
    for (const value of [1, 3]) {
      const set = new HashSet([1, 2])
      expect(
        nativeCalls(() => set.has(value)),
        `has ${value}`,
      ).toBe(1)
      expect(
        nativeCalls(() => set.add(value)),
        `add ${value}`,
      ).toBe(1)
      expect(
        nativeCalls(() => set.delete(value)),
        `delete ${value}`,
      ).toBe(1)
    }
  })

  it('keeps every result and revision: -0, repeated adds, deletes of non-members [043 S1-AC1]', () => {
    const set = new HashSet<number>([1])
    const r0 = set.revision
    set.add(1)
    expect(set.revision).toBe(r0)
    set.add(-0)
    expect(set.revision).toBeGreaterThan(r0)
    expect(set.has(0)).toBe(true)
    expect(
      Object.is(
        [...set].find((v) => v === 0),
        0,
      ),
    ).toBe(true)
    const r1 = set.revision
    expect(set.delete(5)).toBe(false)
    expect(set.revision).toBe(r1)
    expect(set.delete(0)).toBe(true)
    expect([...set]).toEqual([1])
  })
})

describe('a default LinkedHashMap and LinkedHashSet', () => {
  it('make one native call for get and has without access order [043 S1-AC2]', () => {
    for (const key of [1, 3]) {
      const map = new LinkedHashMap([
        [1, 10],
        [2, 20],
      ])
      expect(
        nativeCalls(() => map.get(key)),
        `map get ${key}`,
      ).toBe(1)
      expect(
        nativeCalls(() => map.has(key)),
        `map has ${key}`,
      ).toBe(1)
      const set = new LinkedHashSet([1, 2])
      expect(
        nativeCalls(() => set.has(key)),
        `set has ${key}`,
      ).toBe(1)
    }
  })

  it('keep their order, access order and eviction [043 S1-AC2]', () => {
    const lru = new LinkedHashMap<string, number>({ accessOrder: true, maxSize: 2 })
    lru.set('a', 1).set('b', 2)
    expect(lru.get('a')).toBe(1)
    lru.set('c', 3)
    expect([...lru.keys()]).toEqual(['a', 'c'])
    expect(lru.has('b')).toBe(false)
    const set = new LinkedHashSet(['x', 'y'])
    set.addFirst('z')
    expect([...set]).toEqual(['z', 'x', 'y'])
    expect([...set.reversed()]).toEqual(['y', 'x', 'z'])
  })
})

describe('iterating a default hash map or set', () => {
  /** Calls of `get` and `has` only, during `work`. */
  function lookups(work: () => void): number {
    let calls = 0
    const saved: Array<[object, string, unknown]> = []
    for (const proto of [Map.prototype, Set.prototype]) {
      for (const name of ['get', 'has']) {
        const original = Reflect.get(proto, name) as (...args: unknown[]) => unknown
        saved.push([proto, name, original])
        Reflect.set(proto, name, function (this: unknown, ...args: unknown[]) {
          calls++
          return Reflect.apply(original, this, args)
        })
      }
    }
    try {
      work()
    } finally {
      for (const [proto, name, original] of saved) Reflect.set(proto, name, original)
    }
    return calls
  }

  const pairs: Array<[string, number]> = [
    ['a', 1],
    ['b', 2],
    ['c', 3],
  ]

  it('looks nothing up: for…of, keys, values, entries and forEach read the storage directly [043 S1-AC3]', () => {
    const maps: Array<[string, () => HashMap<string, number> | LinkedHashMap<string, number>]> = [
      ['HashMap', () => new HashMap(pairs)],
      ['LinkedHashMap', () => new LinkedHashMap(pairs)],
    ]
    for (const [label, make] of maps) {
      const map = make()
      expect(
        lookups(() => [...map]),
        `${label} for…of`,
      ).toBe(0)
      expect(
        lookups(() => [...map.keys()]),
        `${label} keys`,
      ).toBe(0)
      expect(
        lookups(() => [...map.values()]),
        `${label} values`,
      ).toBe(0)
      expect(
        lookups(() => [...map.entries()]),
        `${label} entries`,
      ).toBe(0)
      expect(
        lookups(() => map.forEach(() => {})),
        `${label} forEach`,
      ).toBe(0)
    }
    const sets: Array<[string, () => HashSet<string> | LinkedHashSet<string>]> = [
      ['HashSet', () => new HashSet(['a', 'b'])],
      ['LinkedHashSet', () => new LinkedHashSet(['a', 'b'])],
    ]
    for (const [label, make] of sets) {
      const set = make()
      expect(
        lookups(() => [...set]),
        `${label} for…of`,
      ).toBe(0)
      expect(
        lookups(() => set.forEach(() => {})),
        `${label} forEach`,
      ).toBe(0)
    }
  })

  it('yields, for a key not yet reached, the value set during iteration, as Map does [043 S1-AC3]', () => {
    const maps: Array<
      [string, () => { set(k: string, v: number): unknown } & Iterable<[string, number]>]
    > = [
      ['HashMap', () => new HashMap(pairs)],
      ['LinkedHashMap', () => new LinkedHashMap(pairs)],
      ['Map', () => new Map(pairs)],
    ]
    for (const [label, make] of maps) {
      const map = make()
      const seen: Array<[string, number]> = []
      for (const [key, value] of map) {
        seen.push([key, value])
        if (key === 'a') {
          map.set('c', 30)
          map.set('d', 4)
        }
      }
      expect(seen, label).toEqual([
        ['a', 1],
        ['b', 2],
        ['c', 30],
        ['d', 4],
      ])
    }
  })

  it('hands out entries that are copies: changing one changes nothing stored [043 S1-AC3]', () => {
    const map = new HashMap(pairs)
    for (const entry of map) entry[1] = 99
    expect([...map.values()]).toEqual([1, 2, 3])
    expect(Object.prototype.toString.call(map.entries())).not.toBe('[object Map Iterator]')
  })
})

describe('natural order of numbers and strings', () => {
  it('orders -0, 0 and NaN as before: -0 equals 0, NaN after every number and equal to itself [043 S2-AC1]', () => {
    const set = new TreeSet<number>([3, Number.NaN, -0, 1, Number.NaN, 0, -1])
    expect([...set]).toEqual([-1, 0, 1, 3, Number.NaN])
    expect(set.has(-0)).toBe(true)
    expect(set.ceiling(4)).toBeNaN()
    const queue = new PriorityQueue<number>([Number.NaN, 2, -0, 1])
    const out: number[] = []
    for (let x = queue.poll(); x !== undefined; x = queue.poll()) out.push(x)
    expect(out).toEqual([-0, 1, 2, Number.NaN])
    expect([...new TreeSet(['b', 'a', 'B', ''])]).toEqual(['', 'B', 'a', 'b'])
  })

  it('still throws for mixed kinds, null and undefined, and lenient lookups still report a mixed-kind value absent [043 S2-AC1]', () => {
    const map = new TreeMap<unknown, number>([[1, 1]])
    expect(() => map.set('a', 2)).toThrow('TreeMap.set: string and number cannot be compared')
    expect(() => map.set(null, 2)).toThrow('TreeMap.set: null is not allowed as a key')
    expect(map.has('a')).toBe(false)
    expect(map.get('a')).toBeUndefined()
    expect(map.delete('a')).toBe(false)
    expect(new TreeSet<unknown>([1]).has('1')).toBe(false)
  })

  it('still reports a change made by a user callback, and by a comparator [043 S2-AC2]', () => {
    const map = new TreeMap<number, number>([[1, 1]])
    expect(() =>
      map.compute(1, () => {
        map.set(2, 2)
        return 3
      }),
    ).toThrow('TreeMap.compute: the map was changed by the callback')
    let armed = false
    const set = new TreeSet<number>({
      comparator: (a, b) => {
        if (armed) {
          armed = false
          set.delete(1)
        }
        return a - b
      },
    })
    set.add(1)
    armed = true
    expect(() => set.add(2)).toThrow('TreeSet.add: the set was changed by the comparator')
    const queue = new PriorityQueue<number>({
      comparator: (a, b) => {
        if (armed) {
          armed = false
          queue.clear()
        }
        return a - b
      },
    })
    queue.add(1)
    armed = true
    expect(() => queue.add(2)).toThrow('PriorityQueue.add: the queue was changed by the comparator')
  })

  it('still reports a change made by a [compareSymbol] method during a comparison [043 S2-AC2]', () => {
    let armed = false
    let target: { clear(): void } | undefined
    class Rank {
      constructor(readonly n: number) {}
      [compareSymbol](other: Rank): number {
        if (armed && target !== undefined) {
          armed = false
          target.clear()
        }
        return this.n - other.n
      }
    }
    const set = new TreeSet<Rank>([new Rank(1)])
    target = set
    armed = true
    expect(() => set.add(new Rank(2))).toThrow('TreeSet.add: the set was changed by the comparator')
    set.add(new Rank(1))
    armed = true
    expect(() => set.has(new Rank(2))).toThrow('TreeSet.has: the set was changed by the comparator')
    const queue = new PriorityQueue<Rank>([new Rank(1)])
    target = queue
    armed = true
    expect(() => queue.add(new Rank(2))).toThrow(
      'PriorityQueue.add: the queue was changed by the comparator',
    )
  })

  it('ignores a [compareSymbol] method put on Number.prototype or String.prototype [043 S2-AC3]', () => {
    const backwards = function (this: unknown, other: unknown) {
      return (this as number) < (other as number)
        ? 1
        : (this as number) > (other as number)
          ? -1
          : 0
    }
    for (const proto of [Number.prototype, String.prototype]) {
      Object.defineProperty(proto, compareSymbol, {
        value: backwards,
        configurable: true,
        writable: true,
      })
    }
    try {
      expect([...new TreeSet([3, 1, 2])]).toEqual([1, 2, 3])
      expect([
        ...new TreeMap([
          ['b', 2],
          ['a', 1],
        ]).keys(),
      ]).toEqual(['a', 'b'])
      const queue = new PriorityQueue([3, 1, 2])
      expect(queue.poll()).toBe(1)
      expect(new TreeSet(['x', 'y']).floor('xx')).toBe('x')
    } finally {
      for (const proto of [Number.prototype, String.prototype]) {
        Reflect.deleteProperty(proto, compareSymbol)
      }
    }
    expect(Object.getOwnPropertySymbols(Number.prototype)).not.toContain(compareSymbol)
  })
})

describe('writes to a default LinkedHashMap', () => {
  const pairs = (): Array<[number, number]> => [
    [1, 10],
    [2, 20],
    [3, 30],
  ]

  it('make one native call for a present key and two for a new one, in insertion order [044 S3-AC1]', () => {
    for (const reversed of [false, true]) {
      const map = new LinkedHashMap(pairs())
      const target = reversed ? map.reversed() : map
      expect(nativeCalls(() => target.set(2, 5))).toBe(1)
      expect(nativeCalls(() => target.put(1, 6))).toBe(1)
      expect(nativeCalls(() => target.set(4, 40))).toBe(2)
      expect(nativeCalls(() => target.put(5, 50))).toBe(2)
      expect(map.get(2)).toBe(5)
      expect(map.get(1)).toBe(6)
      expect([...map.keys()]).toEqual(reversed ? [5, 4, 1, 2, 3] : [1, 2, 3, 4, 5])
    }
  })

  it('make two native calls for a present key that is not last in access order, one when last [044 S3-AC1]', () => {
    const map = new LinkedHashMap(pairs(), { accessOrder: true })
    expect(nativeCalls(() => map.set(1, 11))).toBe(2)
    expect(nativeCalls(() => map.set(1, 12))).toBe(1)
    expect(nativeCalls(() => map.put(2, 21))).toBe(2)
    expect(nativeCalls(() => map.put(2, 22))).toBe(1)
    expect(nativeCalls(() => map.set(4, 40))).toBe(2)
    expect([...map]).toEqual([
      [3, 30],
      [1, 12],
      [2, 22],
      [4, 40],
    ])
  })

  it('add one delete per mapping maxSize evicts, with and without onEvict [044 S3-AC1]', () => {
    for (const withCallback of [false, true]) {
      const evicted: number[] = []
      const map = new LinkedHashMap<number, number>({
        maxSize: 2,
        onEvict: withCallback ? (_value, key) => evicted.push(key) : undefined,
      })
      map.set(1, 10).set(2, 20)
      expect(nativeCalls(() => map.set(3, 30))).toBe(3)
      expect(nativeCalls(() => map.put(4, 40))).toBe(3)
      expect(nativeCalls(() => map.set(4, 41))).toBe(1)
      expect([...map.keys()]).toEqual([3, 4])
      expect(evicted).toEqual(withCallback ? [1, 2] : [])
    }
  })

  it('make the same calls per element when built or given putAll [044 S3-AC2]', () => {
    // Four new keys and one repeated: 4 × 2 + 1.
    const input: Array<[number, number]> = [
      [1, 10],
      [2, 20],
      [1, 11],
      [3, 30],
      [4, 40],
    ]
    expect(nativeCalls(() => new LinkedHashMap(input))).toBe(9)
    expect(nativeCalls(() => LinkedHashMap.from(input))).toBe(9)
    const map = new LinkedHashMap<number, number>([[1, 0]])
    // One present key, three new keys and one repeated new key: 1 + 3 × 2 + 1.
    expect(nativeCalls(() => map.putAll(input))).toBe(8)
    expect([...map]).toEqual([
      [1, 11],
      [2, 20],
      [3, 30],
      [4, 40],
    ])
  })
})

describe('writes to a default LinkedHashSet', () => {
  it('make two native calls for an added element and one for a member [044 S3-AC4]', () => {
    for (const reversed of [false, true]) {
      const set = new LinkedHashSet([1, 2, 3])
      const target = reversed ? set.reversed() : set
      expect(nativeCalls(() => target.add(4))).toBe(2)
      expect(nativeCalls(() => target.add(2))).toBe(1)
      expect([...set]).toEqual(reversed ? [4, 1, 2, 3] : [1, 2, 3, 4])
    }
  })

  it('make two native calls for addFirst and addLast that move a member, one when it is already there [044 S3-AC4]', () => {
    const set = new LinkedHashSet([1, 2, 3])
    expect(nativeCalls(() => set.addFirst(2))).toBe(2)
    expect(nativeCalls(() => set.addFirst(2))).toBe(1)
    expect(nativeCalls(() => set.addLast(2))).toBe(2)
    expect(nativeCalls(() => set.addLast(2))).toBe(1)
    expect(nativeCalls(() => set.addFirst(0))).toBe(2)
    expect(nativeCalls(() => set.addLast(9))).toBe(2)
    expect([...set]).toEqual([0, 1, 3, 2, 9])
  })

  it('make two native calls for a delete of a member and one for a non-member [044 S3-AC4]', () => {
    const set = new LinkedHashSet([1, 2, 3])
    expect(nativeCalls(() => set.delete(2))).toBe(2)
    expect(nativeCalls(() => set.delete(2))).toBe(1)
    expect(nativeCalls(() => set.delete(7))).toBe(1)
    expect([...set]).toEqual([1, 3])
  })

  it('make the same calls per element when built or given addAll [044 S3-AC2]', () => {
    // Four new elements and one repeated: 4 × 2 + 1.
    const input = [1, 2, 1, 3, 4]
    expect(nativeCalls(() => new LinkedHashSet(input))).toBe(9)
    expect(nativeCalls(() => LinkedHashSet.from(input))).toBe(9)
    const set = new LinkedHashSet([1])
    // One member, three new elements and one repeated: 1 + 3 × 2 + 1.
    expect(nativeCalls(() => set.addAll(input))).toBe(8)
    expect([...set]).toEqual([1, 2, 3, 4])
  })
})

describe('building a default HashMap or HashSet', () => {
  /** Calls per native method name during `work`. */
  function callsByName(work: () => void): Record<string, number> {
    const counts: Record<string, number> = {}
    const saved: Array<[object, string, unknown]> = []
    const wrap = (proto: object, prefix: string, names: readonly string[]) => {
      for (const name of names) {
        const original = Reflect.get(proto, name) as (...args: unknown[]) => unknown
        saved.push([proto, name, original])
        Reflect.set(proto, name, function (this: unknown, ...args: unknown[]) {
          const label = `${prefix}.${name}`
          counts[label] = (counts[label] || 0) + 1
          return Reflect.apply(original, this, args)
        })
      }
    }
    wrap(Map.prototype, 'Map', MAP_METHODS)
    wrap(Set.prototype, 'Set', SET_METHODS)
    try {
      work()
    } finally {
      for (const [proto, name, original] of saved) Reflect.set(proto, name, original)
    }
    return counts
  }

  const pairs: Array<[number, number | undefined]> = [
    [1, 10],
    [-0, undefined],
    [1, 11],
    [Number.NaN, 30],
  ]

  it('sets each pair with one native set and no get or has, for the constructor, from and putAll [044 S5-AC1]', () => {
    expect(callsByName(() => new HashMap(pairs))).toEqual({ 'Map.set': 4 })
    expect(callsByName(() => HashMap.from(pairs))).toEqual({ 'Map.set': 4 })
    const map = new HashMap<number, number | undefined>([[2, 20]])
    expect(callsByName(() => map.putAll(pairs))).toEqual({ 'Map.set': 4 })
    // A repeated key keeps the first key and the last value; undefined values are stored.
    const built = new HashMap(pairs)
    expect([...built]).toEqual([
      [1, 11],
      [0, undefined],
      [Number.NaN, 30],
    ])
    expect(built.has(0)).toBe(true)
    expect(built.revision).toBe(new HashMap(pairs).revision)
  })

  it('counts revisions as one change per pair, new or repeated [044 S5-AC1]', () => {
    const map = new HashMap<number, number | undefined>()
    const start = map.revision
    map.putAll(pairs)
    const viaSet = new HashMap<number, number | undefined>()
    for (const [key, value] of pairs) viaSet.set(key, value)
    expect(map.revision - start).toBe(viaSet.revision - start)
    expect([...map]).toEqual([...viaSet])
  })

  it('adds each element with one native add and no has [044 S5-AC2]', () => {
    const elements = [1, -0, 1, Number.NaN, 0, 'a']
    expect(callsByName(() => new HashSet(elements))).toEqual({ 'Set.add': 6 })
    expect(callsByName(() => HashSet.from(elements))).toEqual({ 'Set.add': 6 })
    const set = new HashSet(elements)
    expect([...set]).toEqual([1, 0, Number.NaN, 'a'])
    const viaAdd = new HashSet<unknown>()
    for (const element of elements) viaAdd.add(element)
    expect(set.revision).toBe(viaAdd.revision)
  })
})
