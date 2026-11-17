import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import { HashMap } from '../src/collections/hash-map'
import { HashSet } from '../src/collections/hash-set'
import { TreeMap } from '../src/collections/tree-map'
import { TreeSet } from '../src/collections/tree-set'
import {
  ClassCastError,
  type Comparator,
  ConcurrentModificationError,
  compareSymbol,
  equals,
  equalsSymbol,
  hashCode,
  hashCodeSymbol,
  IllegalArgumentError,
  IllegalStateError,
  isCollection,
  isMapCollection,
  isSetCollection,
  isSortedMap,
  isSortedSet,
  type MapEntry,
  NoSuchElementError,
  NullElementError,
  type SortedMap,
  UnsupportedOperationError,
} from '../src/index'
import { type CollectionFactory, describeCollection } from './contracts/collection'
import { describeMapCollection, type MapFactory } from './contracts/map'
import { describeSequencedCollection } from './contracts/sequenced'
import { describeSetCollection } from './contracts/set'
import { describeSortedMap } from './contracts/sorted-map'
import { describeSortedSet } from './contracts/sorted-set'
import { integer, seeded } from './support/random'
import { runSortedMapReferenceModel } from './support/reference-model'

function caught(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

const ascending = (a: number, b: number): number => a - b
const descending = (a: number, b: number): number => b - a

/** A comparator that counts its calls. */
function counting<T>(compare: Comparator<T>): { comparator: Comparator<T>; calls: () => number } {
  let calls = 0
  return {
    comparator: (a, b) => {
      calls++
      return compare(a, b)
    },
    calls: () => calls,
  }
}

/** A key ordered by `[compareSymbol]`, counting every call made through the protocol. */
class Ranked {
  static calls = 0
  constructor(readonly rank: number) {}
  [compareSymbol](other: Ranked): number {
    Ranked.calls++
    return this.rank - other.rank
  }
}

/** The comparison bound for one search in a map of `n` mappings: 2⌈log2(n + 1)⌉ + 2. */
function bound(n: number): number {
  return 2 * Math.ceil(Math.log2(n + 1)) + 2
}

/** Sorted, reverse-sorted, alternating and seeded random sequences of `n` distinct numbers. */
function sequences(n: number, seed: number): Array<[string, number[]]> {
  const sorted = Array.from({ length: n }, (_, i) => i)
  const random = seeded(seed)
  const shuffled = sorted.slice()
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = integer(random, 0, i)
    const t = shuffled[i] as number
    shuffled[i] = shuffled[j] as number
    shuffled[j] = t
  }
  const alternating: number[] = []
  for (let lo = 0, hi = n - 1; lo <= hi; lo++, hi--) {
    alternating.push(lo)
    if (lo !== hi) alternating.push(hi)
  }
  return [
    ['sorted', sorted],
    ['reverse', sorted.slice().reverse()],
    ['alternating', alternating],
    ['random', shuffled],
  ]
}

/** A snapshot of what a failed call must leave untouched. */
function state<K, V>(
  map: SortedMap<K, V>,
): { pairs: Array<[K, V]>; size: number; revision: number } {
  return { pairs: map.toJSON(), size: map.size, revision: map.revision }
}

/** A map of `k → 'v' + k` for each key. */
function mapOf(
  keys: number[],
  options?: { comparator?: Comparator<number> },
): TreeMap<number, string> {
  return new TreeMap<number, string>(
    keys.map((k): [number, string] => [k, `v${k}`]),
    options,
  )
}

describe('TreeMap — sorted mappings', () => {
  it('iterates mappings set in any order in ascending key order through every output path [016 S1-AC1]', () => {
    const random = seeded(3)
    const keys = Array.from({ length: 200 }, () => integer(random, -100, 100))
    const unique = [...new Set(keys)].sort(ascending)
    const map = new TreeMap<number, string>()
    const reversed = new TreeMap<number, string>({ comparator: descending })
    for (const k of keys) {
      map.set(k, `v${k}`)
      reversed.set(k, `v${k}`)
    }
    expect([...map.keys()]).toEqual(unique)
    expect([...reversed.keys()]).toEqual(unique.slice().reverse())
    expect([...map.values()]).toEqual(unique.map((k) => `v${k}`))
    expect([...map.entries()]).toEqual(unique.map((k) => [k, `v${k}`]))
    expect([...map]).toEqual(unique.map((k) => [k, `v${k}`]))
    expect(map.toJSON()).toEqual(unique.map((k) => [k, `v${k}`]))
    const seen: unknown[] = []
    map.forEach((value, key, owner) => {
      seen.push([key, value, owner === map])
    })
    expect(seen).toEqual(unique.map((k) => [k, `v${k}`, true]))
    const small = new TreeMap([
      ['pear', 1],
      ['apple', 2],
      ['fig', 3],
    ])
    expect(String(small)).toBe("TreeMap(3) {'apple' => 2, 'fig' => 3, 'pear' => 1}")
    expect(JSON.stringify(small)).toBe('[["apple",2],["fig",3],["pear",1]]')
    const dates = new TreeMap([
      [new Date(3), 'c'],
      [new Date(1), 'a'],
    ])
    expect([...dates.values()]).toEqual(['a', 'c'])
  })

  it('decides sameness by the comparator alone and keeps the stored key object on set and put [016 S1-AC2]', () => {
    type Item = { id: number; label: string }
    const byId = (a: Item, b: Item) => a.id - b.id
    const map = new TreeMap<Item, string>({ comparator: byId })
    const first = { id: 1, label: 'first' }
    map.set(first, 'a')
    expect(map.put({ id: 1, label: 'second' }, 'b')).toBe('a')
    map.set({ id: 1, label: 'third' }, 'c')
    expect(map.size).toBe(1)
    expect([...map.keys()][0]).toBe(first)
    expect(map.get({ id: 1, label: 'any' })).toBe('c')
    expect(map.has({ id: 2, label: 'x' })).toBe(false)
    expect(map.replace({ id: 1, label: 'y' }, 'd')).toBe('c')
    expect(map.remove({ id: 1, label: 'z' })).toBe('d')
    expect(map.size).toBe(0)
    map.set(first, 'e')
    expect(map.delete({ id: 1, label: 'w' })).toBe(true)
  })

  it('refuses a null or undefined key in natural order by every way in, changing nothing, and stores them where the comparator accepts them [016 S1-AC3]', () => {
    const map = new TreeMap<unknown, unknown>([[1, 'a']])
    const before = state(map)
    const ways: Array<[string, (key: unknown) => unknown]> = [
      ['set', (k) => map.set(k, 'x')],
      ['put', (k) => map.put(k, 'x')],
      ['putAll', (k) => map.putAll([[k, 'x']])],
      ['getOrInsert', (k) => map.getOrInsert(k, 'x')],
      ['getOrInsertComputed', (k) => map.getOrInsertComputed(k, () => 'x')],
      ['compute', (k) => map.compute(k, () => 'x')],
      ['merge', (k) => map.merge(k, 'x', () => 'y')],
      ['constructor', (k) => new TreeMap([[k, 'x']])],
      ['from', (k) => TreeMap.from([[k, 'x']])],
    ]
    for (const [name, way] of ways) {
      for (const key of [null, undefined]) {
        const error = caught(() => way(key)) as Error
        expect(error, name).toBeInstanceOf(NullElementError)
        expect(error.message, name).toContain(`${String(key)} is not allowed as a key`)
      }
    }
    expect(state(map)).toEqual(before)
    const first = new TreeMap<number | null, string>(
      [
        [2, 'b'],
        [null, 'n'],
      ],
      { comparator: (a, b) => (a === b ? 0 : a === null ? -1 : b === null ? 1 : a - b) },
    )
    expect(first.get(null)).toBe('n')
    expect([...first.keys()]).toEqual([null, 2])
    const values = new TreeMap<number, unknown>([
      [1, null],
      [2, undefined],
    ])
    expect(values.has(2)).toBe(true)
    expect(values.get(1)).toBeNull()
    expect(values.getOrDefault(2, 'none')).toBeUndefined()
  })

  it('throws ClassCastError for a key that cannot be compared with the stored keys, changing nothing [016 S1-AC4]', () => {
    const map = new TreeMap<unknown, string>([[1, 'a']])
    const before = state(map)
    for (const key of ['1', {}, Symbol('s'), 1n, new Date(1)]) {
      expect(() => map.set(key, 'x')).toThrow(ClassCastError)
      expect(() => map.compute(key, () => 'x')).toThrow(ClassCastError)
    }
    expect(state(map)).toEqual(before)
  })

  it('checks a lone key entering an empty map against itself in natural order [016 S1-AC4]', () => {
    for (const key of [{}, Symbol('s'), () => 0]) {
      const map = new TreeMap<unknown, string>()
      expect(() => map.set(key, 'x')).toThrow(ClassCastError)
      expect(map.size).toBe(0)
      expect(() => new TreeMap([[key, 'x']])).toThrow(ClassCastError)
    }
    Ranked.calls = 0
    new TreeMap<Ranked, string>().set(new Ranked(1), 'a')
    expect(Ranked.calls).toBe(1)
  })

  it('treats null, undefined and incomparable keys as absent for lookups in natural order, while user errors propagate [016 S1-AC5]', () => {
    const map = mapOf([1, 2, 3])
    const before = state(map)
    for (const key of [null, undefined, 'a', {}, Symbol('s'), 1n, new Date(1)]) {
      const k = key as never
      expect(map.get(k)).toBeUndefined()
      expect(map.getOrDefault(k, 'fallback')).toBe('fallback')
      expect(map.has(k)).toBe(false)
      expect(map.delete(k)).toBe(false)
      expect(map.remove(k)).toBeUndefined()
      expect(map.replace(k, 'x')).toBeUndefined()
      expect(map.computeIfPresent(k, () => 'x')).toBeUndefined()
      const entries = map.entrySet()
      const entry = [...new HashMap([[key, 'v1']]).entrySet()][0] as MapEntry<never, string>
      expect(entries.has(entry)).toBe(false)
      expect(entries.delete(entry)).toBe(false)
      expect(entries.removeAll([entry])).toBe(false)
    }
    expect(state(map)).toEqual(before)
    expect(map.entrySet().retainAll([[...new HashMap([['x', 'v1']]).entrySet()][0] as never])).toBe(
      true,
    )
    expect(map.size).toBe(0)
    expect(new TreeMap<number, string>().get(null as never)).toBeUndefined()
    const failure = new Error('user comparator')
    const strict = new TreeMap<unknown, string>([[1, 'a']], {
      comparator: (a, b) => {
        if (a === null || b === null) throw failure
        return (a as number) - (b as number)
      },
    })
    expect(caught(() => strict.get(null))).toBe(failure)
    expect(caught(() => strict.has(null))).toBe(failure)
    class Picky {
      constructor(readonly refuses: boolean) {}
      [compareSymbol](other: Picky): number {
        if (this.refuses || other.refuses) throw new ClassCastError('Picky: refuses to compare')
        return 0
      }
    }
    const picky = new TreeMap<Picky, string>([[new Picky(false), 'a']])
    expect(() => picky.get(new Picky(true))).toThrow('Picky: refuses to compare')
    expect(() => picky.delete(new Picky(true))).toThrow('Picky: refuses to compare')
  })

  it('stores -0 as 0 in natural order, while a comparator sees keys as given [016 S1-AC6]', () => {
    const map = new TreeMap<number, string>([[-0, 'z']])
    expect(Object.is([...map.keys()][0], 0)).toBe(true)
    map.clear()
    map.set(-0, 'a')
    expect(Object.is([...map.keys()][0], 0)).toBe(true)
    expect(map.get(-0)).toBe('a')
    expect(map.has(0)).toBe(true)
    map.compute(-0, (_v, key) => {
      expect(Object.is(key, 0)).toBe(true)
      return 'b'
    })
    expect(map.size).toBe(1)
    const seen: number[] = []
    const custom = new TreeMap<number, string>({
      comparator: (a, b) => {
        seen.push(a, b)
        return a - b
      },
    })
    custom.set(1, 'a').set(-0, 'b')
    expect(seen.some((v) => Object.is(v, -0))).toBe(true)
    expect(Object.is([...custom.keys()][0], -0)).toBe(true)
  })

  it('leaves mappings, size, revision and open iterators as they were when the comparator fails at any point [016 S1-AC7]', () => {
    const failure = new Error('comparator failed')
    let failAt = 0
    let calls = 0
    const throwing = (a: number, b: number): number => {
      calls++
      if (calls === failAt) throw failure
      return a - b
    }
    const nanAt = (a: number, b: number): number => {
      calls++
      return calls === failAt ? Number.NaN : a - b
    }
    const operations: Array<[string, (map: TreeMap<number, string>) => unknown]> = [
      ['set', (m) => m.set(17, 'x')],
      ['set present', (m) => m.set(20, 'x')],
      ['put', (m) => m.put(17, 'x')],
      ['get', (m) => m.get(20)],
      ['has', (m) => m.has(17)],
      ['delete', (m) => m.delete(20)],
      ['remove', (m) => m.remove(20)],
      ['replace', (m) => m.replace(20, 'x')],
      ['getOrInsert', (m) => m.getOrInsert(17, 'x')],
      ['getOrInsertComputed', (m) => m.getOrInsertComputed(17, () => 'x')],
      ['compute', (m) => m.compute(20, () => undefined)],
      ['computeIfPresent', (m) => m.computeIfPresent(20, () => undefined)],
      ['merge', (m) => m.merge(17, 'x', () => 'y')],
      ['lowerEntry', (m) => m.lowerEntry(17)],
      ['floorEntry', (m) => m.floorEntry(17)],
      ['ceilingEntry', (m) => m.ceilingEntry(17)],
      ['higherEntry', (m) => m.higherEntry(17)],
      ['subMap', (m) => m.subMap(4, 30)],
      ['sub-map set', (m) => m.subMap(4, 30).set(17, 'x')],
      ['sub-map clear', (m) => m.subMap(4, 30).clear()],
      ['entry-set delete', (m) => m.entrySet().delete([...mapOf([20]).entrySet()][0] as never)],
    ]
    for (const order of [throwing, nanAt]) {
      for (const [name, operation] of operations) {
        failAt = 0
        const probe = mapOf(
          Array.from({ length: 40 }, (_, i) => i * 2),
          { comparator: order },
        )
        calls = 0
        operation(probe)
        const total = calls
        expect(total, name).toBeGreaterThan(0)
        for (let k = 1; k <= total; k++) {
          failAt = 0
          const map = mapOf(
            Array.from({ length: 40 }, (_, i) => i * 2),
            { comparator: order },
          )
          const iterator = map[Symbol.iterator]()
          expect(iterator.next().value).toEqual([0, 'v0'])
          const before = state(map)
          calls = 0
          failAt = k
          const error = caught(() => operation(map))
          failAt = 0
          if (order === throwing) expect(error, `${name} failing at call ${k}`).toBe(failure)
          else expect(error, `${name} failing at call ${k}`).toBeInstanceOf(TypeError)
          expect(state(map), `${name} failing at call ${k}`).toEqual(before)
          expect(iterator.next().value, `${name} failing at call ${k}`).toEqual([2, 'v2'])
        }
      }
    }
  })

  it('keeps what putAll set before a comparator failure while inserting [016 S1-AC7]', () => {
    const failure = new Error('comparator failed')
    const comparator = (a: number, b: number) => {
      if (a === 99 || b === 99) throw failure
      return a - b
    }
    const map = new TreeMap<number, string>([[1, 'a']], { comparator })
    const revision = map.revision
    expect(
      caught(() =>
        map.putAll([
          [2, 'b'],
          [3, 'c'],
          [99, 'z'],
          [4, 'd'],
        ]),
      ),
    ).toBe(failure)
    expect([...map.keys()]).toEqual([1, 2, 3])
    expect(map.revision).not.toBe(revision)
  })

  it('throws ConcurrentModificationError when the comparator changes the map, keeping its change and making none itself [016 S1-AC8]', () => {
    let target: TreeMap<number, string> | undefined
    let armed = false
    const comparator = (a: number, b: number): number => {
      if (armed && target !== undefined) {
        armed = false
        target.set(1000, 'x')
      }
      return a - b
    }
    const operations: Array<[string, (map: TreeMap<number, string>) => unknown]> = [
      ['set', (m) => m.set(5, 'y')],
      ['get', (m) => m.get(4)],
      ['delete', (m) => m.delete(4)],
      ['compute', (m) => m.compute(5, () => 'y')],
      ['merge', (m) => m.merge(4, 'y', () => 'z')],
      ['floorEntry', (m) => m.floorEntry(5)],
      ['putAll', (m) => m.putAll([[5, 'y']])],
      ['subMap', (m) => m.subMap(2, 4)],
    ]
    for (const [name, operation] of operations) {
      target = mapOf([0, 2, 4, 6], { comparator })
      armed = true
      expect(() => operation(target as TreeMap<number, string>), name).toThrow(
        ConcurrentModificationError,
      )
      expect([...target.keys()], name).toEqual([0, 2, 4, 6, 1000])
    }
    const message = (
      caught(() => {
        target = mapOf([0, 2], { comparator })
        armed = true
        target.set(1, 'z')
      }) as Error
    ).message
    expect(message).toBe('TreeMap.set: the map was changed by the comparator')
  })

  it('checks the callback, then a null key, then comparability, then the range, before any lookup or callback [016 S1-AC9]', () => {
    const map = new TreeMap<unknown, string>([[1, 'a']])
    let called = 0
    const fn = () => {
      called++
      return 'x'
    }
    expect(() => map.compute(null, 1 as never)).toThrow(TypeError)
    expect(() => map.compute(null, fn)).toThrow(NullElementError)
    expect(() => map.merge(null, 'x', fn)).toThrow(NullElementError)
    expect(() => map.getOrInsertComputed(null, fn)).toThrow(NullElementError)
    expect(() => map.compute('a', fn)).toThrow(ClassCastError)
    expect(() => map.merge({}, 'x', fn)).toThrow(ClassCastError)
    expect(called).toBe(0)
    const view = new TreeMap<unknown, string>([
      [1, 'a'],
      [9, 'i'],
    ]).subMap(0, 5)
    expect(() => view.compute(null, 1 as never)).toThrow(TypeError)
    expect(() => view.compute(null, fn)).toThrow(NullElementError)
    expect(() => view.compute('a', fn)).toThrow(ClassCastError)
    expect(() => view.compute(7, fn)).toThrow(IllegalArgumentError)
    expect(() => view.getOrInsertComputed(7, fn)).toThrow(IllegalArgumentError)
    expect(() => view.merge(7, 'x', fn)).toThrow(IllegalArgumentError)
    expect(called).toBe(0)
  })

  it('checks the shape, keys and range of all putAll input against one common key before setting anything [016 S1-AC9]', () => {
    const map = mapOf([1, 2])
    const before = state(map)
    expect(() =>
      map.putAll([
        [3, 'c'],
        [null, 'n'],
      ] as never),
    ).toThrow(NullElementError)
    expect(() =>
      map.putAll([
        [3, 'c'],
        ['x', 'n'],
      ] as never),
    ).toThrow(ClassCastError)
    expect(() => map.putAll([[3, 'c'], [4]] as never)).toThrow(TypeError)
    expect(() =>
      map.subMap(0, 5).putAll([
        [3, 'c'],
        [7, 'g'],
      ]),
    ).toThrow(IllegalArgumentError)
    expect(state(map)).toEqual(before)
    const empty = new TreeMap<unknown, string>()
    expect(() =>
      empty.putAll([
        [{}, 'o'],
        [1, 'a'],
      ]),
    ).toThrow(ClassCastError)
    expect(empty.size).toBe(0)
    const { comparator, calls } = counting(ascending)
    const counted = new TreeMap<number, string>({ comparator })
    counted.putAll([[5, 'e']])
    expect(calls()).toBe(0)
  })
})

describe('TreeMap — cost and robustness', () => {
  it('uses at most 2⌈log2(n + 1)⌉ + 2 comparisons per keyed operation and none for the ends and polls [016 S5-AC1]', () => {
    for (const [label, values] of sequences(300, 5)) {
      const { comparator, calls } = counting(ascending)
      const map = new TreeMap<number, string>({ comparator })
      const check = (what: string, n: number, run: () => unknown, extra = 0) => {
        const before = calls()
        run()
        expect(calls() - before, `${label} ${what} at size ${n}`).toBeLessThanOrEqual(
          bound(n) + extra,
        )
      }
      for (const v of values) {
        const n = map.size
        const k = v * 2
        if (v % 3 === 0) check('set', n, () => map.set(k, 'a'))
        else if (v % 3 === 1) check('put', n, () => map.put(k, 'a'))
        else check('merge', n, () => map.merge(k, 'a', (x, y) => x + y))
        check('set of a present key', n + 1, () => map.set(k, 'b'))
      }
      const n = map.size
      for (const v of values) {
        for (const probe of [v * 2, v * 2 + 1, -1, 1000]) {
          check('get', n, () => map.get(probe))
          check('getOrDefault', n, () => map.getOrDefault(probe, ''))
          check('has', n, () => map.has(probe))
          check('replace', n, () => map.replace(probe === v * 2 ? probe : -5, 'c'))
          check('computeIfPresent', n, () => map.computeIfPresent(probe, (x) => x))
          check('lowerEntry', n, () => map.lowerEntry(probe))
          check('floorEntry', n, () => map.floorEntry(probe))
          check('ceilingEntry', n, () => map.ceilingEntry(probe))
          check('higherEntry', n, () => map.higherEntry(probe))
          check('getOrInsert of a present key', n, () => map.getOrInsert(v * 2, 'x'))
          check('compute of a present key', n, () => map.compute(v * 2, (x) => x))
        }
      }
      const before = calls()
      map.firstEntry()
      map.lastEntry()
      map.pollFirstEntry()
      map.pollLastEntry()
      expect(calls(), `${label} ends`).toBe(before)
      for (const v of values) {
        const size = map.size
        if (v % 2 === 0) check('delete', size, () => map.delete(v * 2))
        else check('remove', size, () => map.remove(v * 2))
      }
      expect(map.size).toBe(0)
      for (const v of values.slice(0, 60)) {
        const size = map.size
        if (v % 2 === 0) check('getOrInsert', size, () => map.getOrInsert(v, 'g'))
        else check('compute', size, () => map.compute(v, () => 'c'))
        check('getOrInsertComputed', map.size, () => map.getOrInsertComputed(v + 0.5, () => 'q'))
      }
    }
    // Calls to [compareSymbol] methods count too, and an empty map gets one self-check.
    const ranked = new TreeMap<Ranked, number>()
    Ranked.calls = 0
    ranked.set(new Ranked(0), 0)
    expect(Ranked.calls).toBeLessThanOrEqual(bound(0))
    for (let i = 1; i < 200; i++) {
      const n = ranked.size
      Ranked.calls = 0
      ranked.set(new Ranked((i * 7919) % 200), i)
      expect(Ranked.calls).toBeLessThanOrEqual(bound(n))
      Ranked.calls = 0
      ranked.get(new Ranked(i))
      expect(Ranked.calls).toBeLessThanOrEqual(bound(n + 1))
      Ranked.calls = 0
      ranked.floorEntry(new Ranked(i))
      expect(Ranked.calls).toBeLessThanOrEqual(bound(n + 1))
    }
  })

  it('bounds getOrInsertComputed by one search, plus one more only when the callback changed the structure [016 S5-AC1]', () => {
    const { comparator, calls } = counting(ascending)
    const map = mapOf(
      Array.from({ length: 100 }, (_, i) => i * 2),
      { comparator },
    )
    let before = calls()
    map.getOrInsertComputed(51, () => {
      map.set(0, 'value write only')
      return 'x'
    })
    const quiet = calls() - before
    // The value write in the callback searches too; the insertion itself searches once.
    expect(quiet).toBeLessThanOrEqual(2 * bound(100))
    before = calls()
    let inner = 0
    map.getOrInsertComputed(53, () => {
      const start = calls()
      map.delete(10)
      inner = calls() - start
      return 'y'
    })
    expect(calls() - before - inner).toBeLessThanOrEqual(bound(101) + bound(101))
    expect(map.get(53)).toBe('y')
    expect(map.has(10)).toBe(false)
  })

  it('keeps size, iteration and call counts sound under an inconsistent comparator [016 S5-AC3]', () => {
    for (const seed of [1, 2, 3]) {
      const random = seeded(seed)
      let calls = 0
      const map = new TreeMap<{ id: number }, number>({
        comparator: () => {
          calls++
          return integer(random, -1, 1)
        },
      })
      const stored = new Set<{ id: number }>()
      for (let step = 0; step < 2000; step++) {
        const n = map.size
        calls = 0
        const roll = random()
        if (roll < 0.5) {
          const key = { id: step }
          map.set(key, step)
          if (map.size === n + 1) stored.add(key)
          else expect(map.size).toBe(n)
        } else if (roll < 0.6) {
          const key = { id: step }
          map.compute(key, () => step)
          if (map.size === n + 1) stored.add(key)
        } else if (roll < 0.8) {
          const victim = [...stored][integer(random, 0, Math.max(0, stored.size - 1))]
          if (victim !== undefined && map.delete(victim)) {
            const left = new Set(map.keys())
            for (const key of stored) if (!left.has(key)) stored.delete(key)
          }
          expect(map.size).toBe(stored.size)
        } else if (roll < 0.9) {
          for (const search of [
            () => map.get({ id: -1 }),
            () => map.ceilingEntry({ id: -1 }),
            () => map.lowerEntry({ id: -1 }),
          ]) {
            calls = 0
            search()
            expect(calls).toBeLessThanOrEqual(bound(n))
          }
        } else {
          const first = map.pollFirstEntry()
          if (first !== undefined) stored.delete(first.key)
        }
        expect(calls).toBeLessThanOrEqual(bound(n))
        expect(map.size).toBe(stored.size)
      }
      const seen = [...map.keys()]
      expect(seen.length).toBe(map.size)
      expect(new Set(seen).size).toBe(seen.length)
      for (const key of seen) expect(stored.has(key)).toBe(true)
    }
  })
})

describe('TreeMap — the map operations', () => {
  it('reads, writes and computes as a map does, with the comparator deciding keys and TreeMap in messages [016 S2-AC1]', () => {
    const map = mapOf([1, 2, 3])
    expect(map.getOrDefault(2, 'none')).toBe('v2')
    expect(map.getOrDefault(9, 'none')).toBe('none')
    expect(map.containsValue('v3')).toBe(true)
    expect(map.containsValue('v9')).toBe(false)
    expect(map.getOrInsert(2, 'x')).toBe('v2')
    expect(map.getOrInsert(4, 'v4')).toBe('v4')
    expect(map.compute(5, (old) => (old === undefined ? 'new' : 'old'))).toBe('new')
    expect(map.compute(5, (old) => `${old}!`)).toBe('new!')
    expect(map.compute(5, () => undefined)).toBeUndefined()
    expect(map.has(5)).toBe(false)
    expect(map.compute(6, () => undefined)).toBeUndefined()
    expect(map.has(6)).toBe(false)
    expect(map.computeIfPresent(1, (v, k, owner) => `${v}:${k}:${owner === map}`)).toBe('v1:1:true')
    expect(map.computeIfPresent(9, () => 'x')).toBeUndefined()
    expect(map.computeIfPresent(1, () => undefined)).toBeUndefined()
    expect(map.has(1)).toBe(false)
    expect(map.merge(7, 'a', () => 'unused')).toBe('a')
    expect(
      map.merge(7, 'b', (old, value, key, owner) => `${old}${value}${key}${owner === map}`),
    ).toBe('ab7true')
    expect(map.merge(7, 'c', () => undefined)).toBeUndefined()
    expect(map.has(7)).toBe(false)
    map.replaceAll((value, key, owner) => `${value}/${key}/${owner === map}`)
    expect(map.toJSON()).toEqual([
      [2, 'v2/2/true'],
      [3, 'v3/3/true'],
      [4, 'v4/4/true'],
    ])
    for (const name of ['compute', 'computeIfPresent', 'replaceAll'] as const) {
      const error = caught(() =>
        name === 'replaceAll' ? map.replaceAll(1 as never) : map[name](2, 1 as never),
      ) as Error
      expect(error, name).toBeInstanceOf(TypeError)
      expect(error.message, name).toBe(`TreeMap.${name}: fn is not a function`)
    }
    expect(() => map.merge(2, 'x', 1 as never)).toThrow('TreeMap.merge: fn is not a function')
    expect(() => map.getOrInsertComputed(2, 1 as never)).toThrow(TypeError)
    expect(() => map.forEach(1 as never)).toThrow('TreeMap.forEach: action is not a function')
  })

  it('throws ConcurrentModificationError when a compute, merge or replaceAll callback changes the structure, keeping its change [016 S2-AC1]', () => {
    const cases: Array<[string, (map: TreeMap<number, string>) => unknown]> = [
      [
        'compute',
        (m) =>
          m.compute(1, () => {
            m.delete(3)
            return 'x'
          }),
      ],
      [
        'computeIfPresent',
        (m) =>
          m.computeIfPresent(1, () => {
            m.set(9, 'i')
            return 'x'
          }),
      ],
      [
        'merge',
        (m) =>
          m.merge(1, 'y', () => {
            m.delete(3)
            return 'x'
          }),
      ],
      [
        'replaceAll',
        (m) =>
          m.replaceAll(() => {
            m.set(9, 'i')
            return 'x'
          }),
      ],
    ]
    for (const [name, run] of cases) {
      const map = mapOf([1, 2, 3])
      const error = caught(() => run(map)) as Error
      expect(error, name).toBeInstanceOf(ConcurrentModificationError)
      expect(error.message, name).toBe(`TreeMap.${name}: the map was changed by the callback`)
      expect(map.get(1), name).toBe('v1')
    }
    const map = mapOf([1, 2, 3])
    map.replaceAll((value, key) => {
      if (key === 2) map.set(1, 'written')
      return `${value}!`
    })
    expect(map.toJSON()).toEqual([
      [1, 'written'],
      [2, 'v2!'],
      [3, 'v3!'],
    ])
  })

  it('getOrInsertComputed calls fn once with this undefined, and looks again only after a structural change [016 S2-AC2]', () => {
    type Id = { id: number }
    const byId = (a: Id, b: Id) => a.id - b.id
    const map = new TreeMap<Id, string>({ comparator: byId })
    const outer: Id = { id: 1 }
    const inner: Id = { id: 1 }
    let self: unknown = 'unset'
    const result = map.getOrInsertComputed(outer, function (this: unknown) {
      self = this
      map.set(inner, 'inner')
      return 'outer'
    })
    expect(self).toBeUndefined()
    expect(result).toBe('outer')
    expect(map.size).toBe(1)
    expect([...map.keys()][0]).toBe(inner)
    expect(map.get(outer)).toBe('outer')
    // A callback that removes other keys is no error; the key goes where it now belongs.
    const numbers = mapOf([1, 2, 3, 4, 5])
    expect(
      numbers.getOrInsertComputed(6, () => {
        numbers.delete(1)
        numbers.delete(2)
        return 'six'
      }),
    ).toBe('six')
    expect([...numbers.keys()]).toEqual([3, 4, 5, 6])
    // A callback that only writes values does not cause a second search.
    const { comparator, calls } = counting(ascending)
    const counted = mapOf([10, 20, 30], { comparator })
    let before = calls()
    counted.getOrInsertComputed(15, () => 'x')
    const plain = calls() - before
    before = calls()
    counted.getOrInsertComputed(25, () => {
      const start = calls()
      counted.replaceAll((v) => v)
      expect(calls()).toBe(start)
      return 'y'
    })
    expect(calls() - before).toBeLessThanOrEqual(plain + 1)
    expect(() => counted.getOrInsertComputed(10, 'x' as never)).toThrow(TypeError)
  })

  it('changes revision on every addition, removal and value write, and not for calls that change nothing; value writes keep iterators open [016 S2-AC3]', () => {
    const map = mapOf([1, 2, 3])
    const changes: Array<[string, () => unknown]> = [
      ['set new', () => map.set(4, 'a')],
      ['set present', () => map.set(4, 'b')],
      ['put present', () => map.put(4, 'b')],
      ['replace', () => map.replace(4, 'c')],
      ['compute', () => map.compute(4, () => 'd')],
      ['merge', () => map.merge(4, 'e', (x) => x)],
      ['remove', () => map.remove(4)],
      ['getOrInsert new', () => map.getOrInsert(5, 'f')],
      ['delete', () => map.delete(5)],
      ['entry setValue', () => map.firstEntry()?.setValue('g')],
      ['pollFirstEntry', () => map.pollFirstEntry()],
      ['clear', () => map.clear()],
    ]
    for (const [name, change] of changes) {
      const before = map.revision
      change()
      expect(map.revision, name).not.toBe(before)
    }
    map.set(1, 'a').set(2, 'b')
    const quiet: Array<[string, () => unknown]> = [
      ['delete absent', () => map.delete(9)],
      ['remove absent', () => map.remove(9)],
      ['replace absent', () => map.replace(9, 'x')],
      ['getOrInsert present', () => map.getOrInsert(1, 'x')],
      ['computeIfPresent absent', () => map.computeIfPresent(9, () => 'x')],
      ['compute absent to undefined', () => map.compute(9, () => undefined)],
      ['get', () => map.get(1)],
      ['out-of-range delete', () => map.subMap(5, 8).delete(1)],
      ['clear empty', () => new TreeMap().clear()],
      ['empty range clear', () => map.subMap(5, 8).clear()],
      ['poll empty', () => map.subMap(5, 8).pollFirstEntry()],
    ]
    for (const [name, call] of quiet) {
      const before = map.revision
      call()
      expect(map.revision, name).toBe(before)
    }
    const iterator = map.entries()
    expect(iterator.next().value).toEqual([1, 'a'])
    map.set(2, 'written')
    map.replaceAll((v) => `${v}+`)
    ;(map.lastEntry() as MapEntry<number, string>).setValue('entry')
    expect(iterator.next().value).toEqual([2, 'entry'])
    expect(iterator.next().done).toBe(true)
  })

  it('makes one descent for compute, merge and the getOrInsert methods on a miss [016 S5-AC1]', () => {
    const { comparator, calls } = counting(ascending)
    const map = mapOf(
      Array.from({ length: 127 }, (_, i) => i * 2),
      { comparator },
    )
    const depth = (run: () => unknown): number => {
      const before = calls()
      run()
      return calls() - before
    }
    const get = depth(() => map.get(101))
    for (const [name, run] of [
      ['compute', () => map.compute(101, () => 'x')],
      ['merge', () => map.merge(103, 'x', () => 'y')],
      ['getOrInsert', () => map.getOrInsert(105, 'x')],
      ['getOrInsertComputed', () => map.getOrInsertComputed(107, () => 'x')],
    ] as Array<[string, () => unknown]>) {
      expect(depth(run), name).toBeLessThanOrEqual(get + 1)
    }
  })
})

describe('TreeMap — ends and nearest entries', () => {
  it('firstEntry and lastEntry return the entries of the least and greatest keys, or undefined [016 S3-AC1]', () => {
    const map = mapOf([5, 1, 3])
    expect((map.firstEntry() as MapEntry<number, string>).key).toBe(1)
    expect((map.lastEntry() as MapEntry<number, string>).value).toBe('v5')
    expect(new TreeMap().firstEntry()).toBeUndefined()
    expect(new TreeMap().lastEntry()).toBeUndefined()
    expect(map.reversed().firstEntry()?.key).toBe(5)
  })

  it('lowerEntry, floorEntry, ceilingEntry and higherEntry return the nearest entry on each side, or undefined [016 S3-AC2]', () => {
    const keys = [10, 20, 30, 40, 50]
    const map = mapOf([50, 10, 40, 20, 30])
    for (let probe = 0; probe <= 60; probe += 5) {
      const expectKey = (entry: MapEntry<number, string> | undefined, key: number | undefined) => {
        expect(entry === undefined ? undefined : entry.key, `probe ${probe}`).toBe(key)
        if (entry !== undefined) expect(entry.value).toBe(`v${key}`)
      }
      expectKey(map.lowerEntry(probe), keys.filter((k) => k < probe).pop())
      expectKey(map.floorEntry(probe), keys.filter((k) => k <= probe).pop())
      expectKey(
        map.ceilingEntry(probe),
        keys.find((k) => k >= probe),
      )
      expectKey(
        map.higherEntry(probe),
        keys.find((k) => k > probe),
      )
    }
    expect(map.floorEntry(-0)).toBeUndefined()
    expect(mapOf([0]).floorEntry(-0)?.key).toBe(0)
    for (const method of ['lowerEntry', 'floorEntry', 'ceilingEntry', 'higherEntry'] as const) {
      const empty = new TreeMap<unknown, string>()
      expect(() => empty[method](null), method).toThrow(NullElementError)
      expect(() => empty[method](undefined), method).toThrow(NullElementError)
      expect(empty[method]({}), method).toBeUndefined()
      expect(empty.reversed()[method]({}), method).toBeUndefined()
      expect(() => (map as TreeMap<unknown, string>)[method]('a'), method).toThrow(ClassCastError)
      const error = caught(() => (map as TreeMap<unknown, string>)[method](null)) as Error
      expect(error.message).toBe(`TreeMap.${method}: null is not allowed as a key`)
    }
    const { comparator, calls } = counting(ascending)
    const counted = new TreeMap<number, string>({ comparator })
    counted.floorEntry(1)
    counted.reversed().ceilingEntry(1)
    expect(calls()).toBe(0)
    const nulls = new TreeMap<number | null, string>([[1, 'a']], {
      comparator: (a, b) => (a === b ? 0 : a === null ? -1 : b === null ? 1 : a - b),
    })
    expect(nulls.ceilingEntry(null)?.key).toBe(1)
  })

  it('pollFirstEntry and pollLastEntry remove and return the ends, or undefined when empty [016 S3-AC3]', () => {
    const map = mapOf([1, 2, 3])
    const first = map.pollFirstEntry() as MapEntry<number, string>
    expect([first.key, first.value]).toEqual([1, 'v1'])
    const last = map.pollLastEntry() as MapEntry<number, string>
    expect([last.key, last.value]).toEqual([3, 'v3'])
    expect(map.toJSON()).toEqual([[2, 'v2']])
    map.clear()
    expect(map.pollFirstEntry()).toBeUndefined()
    expect(map.pollLastEntry()).toBeUndefined()
  })

  it('makes entries live (map, key) handles: no user calls while stored, a comparator lookup once detached [016 S3-AC5]', () => {
    const { comparator, calls } = counting(ascending)
    const map = mapOf([1, 2, 3, 4, 5], { comparator })
    const entry = map.floorEntry(3) as MapEntry<number, string>
    let before = calls()
    expect(entry.value).toBe('v3')
    expect(entry.setValue('three')).toBe('v3')
    expect(map.get(3)).toBe('three')
    map.set(3, 'set')
    map.set(9, 'nine')
    map.delete(1)
    before = calls()
    expect(entry.value).toBe('set')
    expect(entry.setValue('again')).toBe('set')
    expect(calls()).toBe(before)
    // Once removed, it reads its last value and refuses writes.
    map.delete(3)
    before = calls()
    expect(entry.value).toBe('again')
    expect(calls() - before).toBeLessThanOrEqual(bound(map.size))
    expect(() => entry.setValue('x')).toThrow(IllegalStateError)
    // Set again, it finds the new mapping and keeps it.
    map.set(3, 'back')
    expect(entry.value).toBe('back')
    before = calls()
    expect(entry.setValue('written')).toBe('back')
    expect(calls()).toBe(before)
    expect(map.get(3)).toBe('written')
    // A polled entry reads its value; setValue throws until the key is set again.
    const polled = map.pollFirstEntry() as MapEntry<number, string>
    expect(polled.value).toBe('v2')
    expect(() => polled.setValue('x')).toThrow(IllegalStateError)
    map.set(2, 'two')
    expect(polled.setValue('2')).toBe('two')
    expect(map.get(2)).toBe('2')
    // After clear, every entry has left the map.
    const last = map.lastEntry() as MapEntry<number, string>
    map.clear()
    expect(last.value).toBe('nine')
    expect(() => last.setValue('x')).toThrow(IllegalStateError)
  })

  it('treats a detached entry key that natural order cannot compare as absent, and propagates comparator errors and re-entrant changes [016 S3-AC5]', () => {
    const numbers = new TreeMap<unknown, string>([[1, 'one']])
    const entry = numbers.firstEntry() as MapEntry<unknown, string>
    numbers.clear()
    numbers.set('a', 'letter')
    expect(entry.value).toBe('one')
    expect(() => entry.setValue('x')).toThrow(IllegalStateError)
    const failure = new Error('comparator failed')
    let fail = false
    const failing = mapOf([1, 2], {
      comparator: (a, b) => {
        if (fail) throw failure
        return a - b
      },
    })
    const detached = failing.firstEntry() as MapEntry<number, string>
    failing.delete(1)
    fail = true
    expect(caught(() => detached.value)).toBe(failure)
    fail = false
    let target: TreeMap<number, string> | undefined
    let armed = false
    const reentrant = (a: number, b: number) => {
      if (armed && target !== undefined) {
        armed = false
        target.set(100, 'x')
      }
      return a - b
    }
    target = mapOf([1, 2], { comparator: reentrant })
    const gone = target.firstEntry() as MapEntry<number, string>
    target.delete(1)
    armed = true
    expect(() => gone.value).toThrow(ConcurrentModificationError)
  })

  it('gives entries from views as handles on the whole map, with no range check on setValue [016 S3-AC5]', () => {
    const map = mapOf([1, 2, 3, 4])
    const view = map.subMap(1, 3)
    const entry = view.lastEntry() as MapEntry<number, string>
    expect(entry.key).toBe(2)
    view.delete(2)
    map.set(2, 'outside the view now? no, inside')
    expect(entry.value).toBe('outside the view now? no, inside')
    const head = map.headMap(2)
    const one = head.firstEntry() as MapEntry<number, string>
    head.delete(1)
    map.set(1, 'a')
    expect(one.setValue('b')).toBe('a')
    expect(map.get(1)).toBe('b')
  })

  it('comparator() returns the comparator given or undefined, and a stable reversing function on a reversed view [016 S3-AC6]', () => {
    expect(new TreeMap().comparator()).toBeUndefined()
    const map = new TreeMap<number, string>({ comparator: descending })
    expect(map.comparator()).toBe(descending)
    expect(map.subMap(9, 1).comparator()).toBe(descending)
    const reversed = map.reversed()
    const reversing = reversed.comparator() as Comparator<number>
    expect(reversed.comparator()).toBe(reversing)
    expect(reversing(1, 2)).toBeLessThan(0)
    const natural = new TreeMap<number, string>().reversed().comparator() as Comparator<number>
    expect(natural(1, 2)).toBeGreaterThan(0)
    expect(natural(2, 2)).toBe(0)
  })
})

/** The map 10 → 'v10', 20 → 'v20', …, 50 → 'v50'. */
function tens(): TreeMap<number, string> {
  return mapOf([10, 20, 30, 40, 50])
}

describe('TreeMap — range, reversed and collection views', () => {
  it('answers key-only queries through keySet(), with removals writing through [016 S3-AC4]', () => {
    const map = tens()
    const keys = map.keySet()
    expect(keys.getFirst()).toBe(10)
    expect(keys.getLast()).toBe(50)
    expect(keys.lower(30)).toBe(20)
    expect(keys.floor(35)).toBe(30)
    expect(keys.ceiling(35)).toBe(40)
    expect(keys.higher(50)).toBeUndefined()
    expect(keys.pollFirst()).toBe(10)
    expect(keys.pollLast()).toBe(50)
    expect(keys.removeFirst()).toBe(20)
    expect(keys.removeLast()).toBe(40)
    expect(map.toJSON()).toEqual([[30, 'v30']])
    map.clear()
    expect(() => keys.getFirst()).toThrow(NoSuchElementError)
    expect(() => keys.removeLast()).toThrow(NoSuchElementError)
    expect(keys.pollFirst()).toBeUndefined()
  })

  it('subMap, headMap and tailMap are live views of a key range with options read once and checked [016 S4-AC1]', () => {
    const map = tens()
    expect(map.subMap(20, 40).toJSON()).toEqual([
      [20, 'v20'],
      [30, 'v30'],
    ])
    expect([...map.subMap(20, 40, { fromInclusive: false, toInclusive: true }).keys()]).toEqual([
      30, 40,
    ])
    expect([...map.headMap(30).keys()]).toEqual([10, 20])
    expect([...map.headMap(30, { inclusive: true }).keys()]).toEqual([10, 20, 30])
    expect([...map.tailMap(30).keys()]).toEqual([30, 40, 50])
    expect([...map.tailMap(30, { inclusive: false }).keys()]).toEqual([40, 50])
    expect([...map.subMap(20, 40, null).keys()]).toEqual([20, 30])
    expect(map.subMap(30, 30).size).toBe(0)
    expect(map.subMap(30, 30, { toInclusive: true }).size).toBe(1)
    let reads = 0
    const options = {
      get fromInclusive() {
        reads++
        return false
      },
      get toInclusive() {
        reads++
        return true
      },
    }
    expect([...map.subMap(10, 30, options).keys()]).toEqual([20, 30])
    expect(reads).toBe(2)
    expect(() => map.subMap(40, 20)).toThrow(IllegalArgumentError)
    expect(() => map.subMap(1, 2, 5 as never)).toThrow('TreeMap.subMap: options is not an object')
    expect(() => map.headMap(1, { inclusive: 'yes' } as never)).toThrow(
      'TreeMap.headMap: inclusive is not a boolean',
    )
    expect(() => map.tailMap(null as never)).toThrow(NullElementError)
    expect(() => map.tailMap('a' as never)).toThrow(ClassCastError)
    expect(() => new TreeMap<unknown, string>().headMap({})).toThrow(ClassCastError)
    const view = map.subMap(20, 40)
    expect([...view.subMap(25, 35).keys()]).toEqual([30])
    expect(() => view.tailMap(10)).toThrow(IllegalArgumentError)
    expect(() => view.headMap(45)).toThrow(IllegalArgumentError)
  })

  it('shows changes through the map or a view in both, sharing revision and fail-fast state [016 S4-AC2]', () => {
    const map = tens()
    const view = map.subMap(15, 45)
    map.set(25, 'v25')
    expect([...view.keys()]).toEqual([20, 25, 30, 40])
    view.delete(30)
    expect(map.has(30)).toBe(false)
    view.set(35, 'v35')
    expect(map.get(35)).toBe('v35')
    view.set(20, 'written')
    expect(map.get(20)).toBe('written')
    expect(view.revision).toBe(map.revision)
    const iterator = view.keys()
    iterator.next()
    map.set(1, 'outside')
    expect(() => iterator.next()).toThrow(ConcurrentModificationError)
  })

  it('refuses to create a mapping outside a view range and answers absent there, using only mappings in range [016 S4-AC3]', () => {
    const map = tens()
    const view = map.subMap(20, 40)
    const before = state(map)
    const outside: Array<[string, () => unknown]> = [
      ['set', () => view.set(45, 'x')],
      ['put', () => view.put(10, 'x')],
      ['putAll', () => view.putAll([[45, 'x']])],
      ['getOrInsert', () => view.getOrInsert(40, 'x')],
      ['getOrInsertComputed', () => view.getOrInsertComputed(45, () => 'x')],
      ['compute', () => view.compute(50, () => 'x')],
      ['merge', () => view.merge(50, 'x', () => 'y')],
    ]
    for (const [name, write] of outside) {
      const error = caught(write) as Error
      expect(error, name).toBeInstanceOf(IllegalArgumentError)
      expect(error.message, name).toMatch(/^TreeSubMap\.\w+: \d+ is outside the range of the view$/)
    }
    expect(view.get(50)).toBeUndefined()
    expect(view.getOrDefault(10, 'none')).toBe('none')
    expect(view.has(50)).toBe(false)
    expect(view.delete(50)).toBe(false)
    expect(view.remove(10)).toBeUndefined()
    expect(view.replace(50, 'x')).toBeUndefined()
    expect(view.computeIfPresent(50, () => 'x')).toBeUndefined()
    expect(state(map)).toEqual(before)
    expect(view.size).toBe(2)
    expect(view.containsValue('v50')).toBe(false)
    expect(view.containsValue('v30')).toBe(true)
    const seen: number[] = []
    view.forEach((_v, k) => {
      seen.push(k)
    })
    expect(seen).toEqual([20, 30])
    expect(view.firstEntry()?.key).toBe(20)
    expect(view.lastEntry()?.key).toBe(30)
    expect(view.floorEntry(100)?.key).toBe(30)
    expect(view.ceilingEntry(0)?.key).toBe(20)
    expect(view.lowerEntry(20)).toBeUndefined()
    expect(view.higherEntry(30)).toBeUndefined()
    expect(view.equals(mapOf([20, 30]))).toBe(true)
    expect(hashCode(view)).toBe(hashCode(mapOf([20, 30])))
    expect(String(view)).toBe("TreeSubMap(2) {20 => 'v20', 30 => 'v30'}")
    expect(view.toJSON()).toEqual([
      [20, 'v20'],
      [30, 'v30'],
    ])
    view.replaceAll((v) => `${v}!`)
    expect(map.get(10)).toBe('v10')
    expect(map.get(20)).toBe('v20!')
    expect(view.pollLastEntry()?.key).toBe(30)
    view.clear()
    expect([...map.keys()]).toEqual([10, 40, 50])
    expect(view.isEmpty()).toBe(true)
  })

  it('reverses into a live descending view with mirrored navigation, ends, polls and ranges [016 S4-AC4]', () => {
    const map = tens()
    const reversed = map.reversed()
    expect([...reversed.keys()]).toEqual([50, 40, 30, 20, 10])
    expect(reversed.reversed()).toBe(map)
    expect(reversed.firstEntry()?.key).toBe(50)
    expect(reversed.lastEntry()?.key).toBe(10)
    expect(reversed.lowerEntry(30)?.key).toBe(40)
    expect(reversed.higherEntry(30)?.key).toBe(20)
    expect(reversed.floorEntry(35)?.key).toBe(40)
    expect(reversed.ceilingEntry(35)?.key).toBe(30)
    const head = reversed.headMap(30)
    expect([...head.keys()]).toEqual([50, 40])
    expect(String(head)).toBe("ReversedTreeMap(2) {50 => 'v50', 40 => 'v40'}")
    expect([...reversed.subMap(40, 20).keys()]).toEqual([40, 30])
    expect(() => reversed.subMap(20, 40)).toThrow(IllegalArgumentError)
    expect([...reversed.tailMap(30, { inclusive: false }).keys()]).toEqual([20, 10])
    expect(reversed.pollFirstEntry()?.key).toBe(50)
    expect(map.lastEntry()?.key).toBe(40)
    const range = map.subMap(20, 50)
    const rangeReversed = range.reversed()
    expect([...rangeReversed.keys()]).toEqual([40, 30, 20])
    expect(rangeReversed.reversed()).toBe(range)
    expect(() => rangeReversed.set(5, 'x')).toThrow(IllegalArgumentError)
    rangeReversed.set(25, 'v25')
    expect(map.get(25)).toBe('v25')
    expect(rangeReversed.valueCollection().toArray()).toEqual(['v40', 'v30', 'v25', 'v20'])
  })

  it('keySet() is a live sorted set of the keys in the view order that cannot add [016 S4-AC5]', () => {
    const map = tens()
    const keys = map.keySet()
    expect(isSortedSet(keys)).toBe(true)
    expect(keys.toArray()).toEqual([10, 20, 30, 40, 50])
    const before = state(map)
    expect(() => keys.add(60)).toThrow(UnsupportedOperationError)
    expect(() => keys.add(10)).toThrow(UnsupportedOperationError)
    expect(() => keys.addFirst(1)).toThrow(UnsupportedOperationError)
    expect(() => keys.addLast(99)).toThrow(UnsupportedOperationError)
    expect(() => keys.addAll([1])).toThrow(UnsupportedOperationError)
    expect(keys.addAll([])).toBe(false)
    expect(() => keys.subSet(20, 40).add(99)).toThrow(UnsupportedOperationError)
    expect((caught(() => keys.add(60)) as Error).message).toBe(
      'TreeMapKeySet.add: a map view cannot add; set the mapping on the map',
    )
    expect(state(map)).toEqual(before)
    expect(keys.delete(30)).toBe(true)
    expect(map.has(30)).toBe(false)
    expect(keys.removeAll([10])).toBe(true)
    expect(keys.retainAll([20, 40])).toBe(true)
    expect(keys.removeIf((k) => k === 40)).toBe(true)
    expect(map.toJSON()).toEqual([[20, 'v20']])
    map.putAll(tens())
    expect(keys.subSet(20, 40).toArray()).toEqual([20, 30])
    expect(keys.headSet(30).toArray()).toEqual(map.headMap(30).keySet().toArray())
    expect(keys.reversed().toArray()).toEqual([50, 40, 30, 20, 10])
    expect(keys.reversed().reversed()).toBe(keys)
    const viewKeys = map.subMap(20, 50).reversed().keySet()
    expect(viewKeys.toArray()).toEqual([40, 30, 20])
    expect(viewKeys.reversed().reversed()).toBe(viewKeys)
    expect(viewKeys.reversed().toArray()).toEqual([20, 30, 40])
    expect(String(viewKeys)).toBe('TreeMapKeySet(3) {40, 30, 20}')
    expect(() => viewKeys.headSet(10)).toThrow(IllegalArgumentError)
    expect(keys.comparator()).toBeUndefined()
    expect(hashCode(keys)).toBe(hashCode(new TreeSet([10, 20, 30, 40, 50])))
    expect(keys.equals(new TreeSet([50, 40, 30, 20, 10]))).toBe(true)
    expect(keys[hashCodeSymbol]((k) => (k as number) * 7)).toBe(
      new TreeSet([10, 20, 30, 40, 50])[hashCodeSymbol]((k) => (k as number) * 7),
    )
  })

  it('entry-set removal throws when reading an argument entry changes the map, as on HashMap [016 S4-AC6]', () => {
    const map = new TreeMap<number, string>([
      [1, 'a'],
      [3, 'c'],
    ])
    const fake = {
      [Symbol.for('javascript-collections-framework/1/MapEntry')]: true,
      key: 3,
      get value(): string {
        map.delete(1)
        return 'c'
      },
    }
    expect(() => map.entrySet().removeAll([fake as never])).toThrow(ConcurrentModificationError)
    expect(map.has(3)).toBe(true)
  })

  it('entrySet() and valueCollection() are live views in key order with map-view membership, removal and add rules [016 S4-AC6]', () => {
    const map = tens()
    const entries = map.entrySet()
    const values = map.valueCollection()
    expect([...entries].map((e) => e.key)).toEqual([10, 20, 30, 40, 50])
    expect(values.toArray()).toEqual(['v10', 'v20', 'v30', 'v40', 'v50'])
    expect(entries.has([10, 'v10'] as never)).toBe(false)
    const foreign = [...new HashMap([[20, 'v20']]).entrySet()][0] as MapEntry<number, string>
    expect(entries.has(foreign)).toBe(true)
    const stale = [...new HashMap([[20, 'other']]).entrySet()][0] as MapEntry<number, string>
    expect(entries.has(stale)).toBe(false)
    expect(entries.delete(stale)).toBe(false)
    expect(entries.delete(foreign)).toBe(true)
    expect(map.has(20)).toBe(false)
    expect(() => entries.add(foreign)).toThrow(UnsupportedOperationError)
    expect(entries.addAll([])).toBe(false)
    expect(() => entries.addAll([foreign])).toThrow(UnsupportedOperationError)
    expect(() => values.add('x')).toThrow(UnsupportedOperationError)
    expect(values.addAll([])).toBe(false)
    expect(() => values.addAll(['x'])).toThrow(UnsupportedOperationError)
    expect(values.equals(values)).toBe(true)
    expect(values.equals(map.valueCollection())).toBe(false)
    expect(entries.equals(mapOf([10, 30, 40, 50]).entrySet())).toBe(true)
    expect(hashCode(entries)).toBe(hashCode(mapOf([10, 30, 40, 50])))
    map.set(60, 'v10')
    expect(values.delete('v10')).toBe(true)
    expect(map.has(10)).toBe(false)
    expect(map.has(60)).toBe(true)
    map.set(5, 'v60')
    map.set(60, 'v60')
    expect(map.reversed().valueCollection().delete('v60')).toBe(true)
    expect(map.has(60)).toBe(false)
    expect(map.has(5)).toBe(true)
    expect(entries.removeAll([[...mapOf([30]).entrySet()][0] as never])).toBe(true)
    expect(entries.retainAll([[...mapOf([40]).entrySet()][0] as never])).toBe(true)
    expect(map.toJSON()).toEqual([[40, 'v40']])
    expect(String(entries)).toBe("TreeMapEntrySet(1) {40 => 'v40'}")
    expect(String(values)).toBe("TreeMapValues(1) ['v40']")
    entries.clear()
    expect(map.size).toBe(0)
    const view = tens().subMap(20, 40)
    expect(view.entrySet().size).toBe(2)
    expect(view.valueCollection().toArray()).toEqual(['v20', 'v30'])
    expect(view.entrySet().has([...mapOf([50]).entrySet()][0] as never)).toBe(false)
    const cursor = view.entrySet().cursor()
    const first = cursor.next()
    cursor.remove()
    expect(first.key).toBe(20)
    expect(first.value).toBe('v20')
    expect(view.size).toBe(1)
  })

  it('prints and tags views and names them and their methods in errors [016 S4-AC7]', () => {
    const map = mapOf([1, 3])
    expect(String(map.reversed())).toBe("ReversedTreeMap(2) {3 => 'v3', 1 => 'v1'}")
    expect(Object.prototype.toString.call(map.subMap(0, 2))).toBe('[object TreeSubMap]')
    expect(Object.prototype.toString.call(map.reversed())).toBe('[object ReversedTreeMap]')
    expect(Object.prototype.toString.call(map.keySet())).toBe('[object TreeMapKeySet]')
    expect(Object.prototype.toString.call(map.entrySet())).toBe('[object TreeMapEntrySet]')
    expect(Object.prototype.toString.call(map.valueCollection())).toBe('[object TreeMapValues]')
    expect(inspect(map.subMap(0, 2))).toBe("TreeSubMap(1) { 1 => 'v1' }")
    expect((caught(() => map.reversed().set(null as never, 'x')) as Error).message).toBe(
      'ReversedTreeMap.set: null is not allowed as a key',
    )
    expect((caught(() => map.subMap(0, 2).merge(5, 'x', () => 'y')) as Error).message).toBe(
      'TreeSubMap.merge: 5 is outside the range of the view',
    )
    expect((caught(() => map.reversed().compute(1, 2 as never)) as Error).message).toBe(
      'ReversedTreeMap.compute: fn is not a function',
    )
  })

  it('keeps range-view operations within two comparisons of the map bound [016 S5-AC2]', () => {
    const { comparator, calls } = counting(ascending)
    const map = mapOf(
      Array.from({ length: 300 }, (_, i) => i),
      { comparator },
    )
    const view = map.subMap(50, 250)
    const n = map.size
    for (const probe of [0, 49, 50, 120, 249, 250, 299]) {
      for (const run of [
        () => view.get(probe),
        () => view.has(probe),
        () => view.floorEntry(probe),
        () => view.higherEntry(probe),
      ]) {
        const before = calls()
        run()
        expect(calls() - before).toBeLessThanOrEqual(bound(n) + 2)
      }
    }
    for (const run of [
      () => view.firstEntry(),
      () => view.lastEntry(),
      () => view.pollFirstEntry(),
      () => view.pollLastEntry(),
    ]) {
      const before = calls()
      run()
      expect(calls() - before).toBeLessThanOrEqual(bound(n))
    }
    const before = calls()
    view.set(100, 'x')
    expect(calls() - before).toBeLessThanOrEqual(bound(n) + 2)
  })
})

describe('TreeMap — fail-fast iteration', () => {
  it('fails fast when the structure changes during for…of, forEach, the iterators or a view cursor, but not on value writes [016 S6-AC1]', () => {
    const make = () => mapOf([1, 2, 3, 4, 5])
    const sources: Array<[string, (m: TreeMap<number, string>) => Iterable<unknown>]> = [
      ['map', (m) => m],
      ['keys', (m) => m.keys()],
      ['values', (m) => m.values()],
      ['entries', (m) => m.entries()],
      ['subMap', (m) => m.subMap(1, 5)],
      ['reversed', (m) => m.reversed()],
      ['keySet', (m) => m.keySet()],
      ['entrySet', (m) => m.entrySet()],
      ['valueCollection', (m) => m.valueCollection()],
      ['reversed keySet', (m) => m.reversed().keySet()],
    ]
    for (const [name, source] of sources) {
      const map = make()
      expect(() => {
        for (const _ of source(map)) map.set(9, 'x')
      }, name).toThrow(ConcurrentModificationError)
      const written = make()
      let steps = 0
      for (const _ of source(written)) {
        written.set(1, 'written')
        written.replace(2, 'again')
        steps++
      }
      expect(steps, name).toBe([...source(make())].length)
    }
    const map = make()
    expect(() =>
      map.forEach((_v, k) => {
        if (k === 5) map.delete(1)
      }),
    ).toThrow(ConcurrentModificationError)
    for (const cursor of [
      make().keySet().cursor(),
      make().entrySet().cursor(),
      make().valueCollection().cursor(),
    ]) {
      cursor.next()
      cursor.remove()
      cursor.next()
    }
    const other = make()
    const cursor = other.subMap(1, 4).entrySet().cursor()
    cursor.next()
    other.delete(5)
    expect(() => cursor.next()).toThrow(ConcurrentModificationError)
    const done = make().keys()
    for (let step = done.next(); !step.done; step = done.next()) {
      // run to the end
    }
    expect(done.next().done).toBe(true)
  })
})

describe('TreeMap — construction', () => {
  it('reads an iterable first argument as entries and any other object as options, and refuses the rest [016 S7-AC1]', () => {
    expect(new TreeMap().size).toBe(0)
    expect(new TreeMap(null).size).toBe(0)
    expect(new TreeMap(undefined).size).toBe(0)
    expect(new TreeMap(new Map([[2, 'b']])).toJSON()).toEqual([[2, 'b']])
    expect(new TreeMap<number, string>({ comparator: descending }).comparator()).toBe(descending)
    expect(new TreeMap({ unknown: true } as never).size).toBe(0)
    for (const bad of [1, 'ab', true, Symbol('s')]) {
      expect(() => new TreeMap(bad as never)).toThrow(TypeError)
    }
    expect(() => new TreeMap(5 as never)).toThrow('TreeMap: entries is not iterable (5)')
    const hint = (caught(() => new TreeMap(descending as never)) as Error).message
    expect(hint).toMatch(
      /^TreeMap: entries is not iterable \(.*\); pass the comparator as \{ comparator \}$/,
    )
    const fromHint = (caught(() => TreeMap.from(descending as never)) as Error).message
    expect(fromHint).toMatch(
      /^TreeMap\.from: entries is not iterable .*; pass the comparator as \{ comparator \}$/,
    )
    expect(() => TreeMap.from(null as never)).toThrow(
      'TreeMap.from: entries is not iterable (null)',
    )
  })

  it('requires iterable entries and an options object when a second argument is given, and the same in from [016 S7-AC1]', () => {
    expect(new TreeMap(null, { comparator: descending }).comparator()).toBe(descending)
    expect(new TreeMap(undefined, {}).size).toBe(0)
    expect(() => new TreeMap({} as never, {})).toThrow('TreeMap: entries is not iterable')
    expect(() => new TreeMap([], 1 as never)).toThrow('TreeMap: options is not an object (1)')
    expect(() => new TreeMap([], null as never)).toThrow(TypeError)
    expect(() => TreeMap.from([], 1 as never)).toThrow('TreeMap.from: options is not an object')
    expect(TreeMap.from([[1, 'a']]).get(1)).toBe('a')
    expect(
      TreeMap.from(
        [
          [1, 'a'],
          [2, 'b'],
        ],
        { comparator: descending },
      ).toJSON(),
    ).toEqual([
      [2, 'b'],
      [1, 'a'],
    ])
  })

  it('checks every item is a pair or an entry before inserting anything, and keeps prototype-named keys ordinary [016 S7-AC2]', () => {
    const { comparator, calls } = counting(ascending)
    for (const bad of [
      [[1, 'a'], [2]],
      [
        [1, 'a'],
        [1, 2, 3],
      ],
      [[1, 'a'], 'ab'],
      [[1, 'a'], null],
    ]) {
      expect(() => new TreeMap(bad as never, { comparator })).toThrow(
        /^TreeMap: item 1 is not a \[key, value\] pair or a map entry/,
      )
      expect(() => TreeMap.from(bad as never, { comparator })).toThrow(/^TreeMap\.from: item 1/)
    }
    expect(calls()).toBe(0)
    const entry = [...new HashMap([[3, 'c']]).entrySet()][0] as MapEntry<number, string>
    expect(new TreeMap<number, string>([[1, 'a'], entry]).toJSON()).toEqual([
      [1, 'a'],
      [3, 'c'],
    ])
    const names = new TreeMap<string, number>([
      ['__proto__', 1],
      ['constructor', 2],
      ['prototype', 3],
    ])
    expect(names.size).toBe(3)
    expect(names.get('__proto__')).toBe(1)
    expect(names.get('constructor')).toBe(2)
    expect(Object.getPrototypeOf(names)).toBe(TreeMap.prototype)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('reads comparator once, refuses a non-function and never inherits it from a source map [016 S7-AC3]', () => {
    let reads = 0
    const options = {
      get comparator() {
        reads++
        return descending
      },
      other: 'ignored',
    }
    expect(new TreeMap<number, string>([[1, 'a']], options).comparator()).toBe(descending)
    expect(reads).toBe(1)
    TreeMap.from<number, string>([], options)
    expect(reads).toBe(2)
    expect(() => new TreeMap({ comparator: 1 } as never)).toThrow(
      'TreeMap: comparator is not a function (1)',
    )
    expect(() => TreeMap.from([], { comparator: 'x' } as never)).toThrow(TypeError)
    const source = mapOf([1, 2, 3], { comparator: descending })
    const copied = new TreeMap(source)
    expect(copied.comparator()).toBeUndefined()
    expect([...copied.keys()]).toEqual([1, 2, 3])
    expect(TreeMap.from(source).comparator()).toBeUndefined()
  })

  it('copy() returns an independent TreeMap with the same mappings and comparator without calling user functions [016 S7-AC4]', () => {
    const { comparator, calls } = counting(descending)
    const map = mapOf([3, 1, 2], { comparator })
    const before = calls()
    const copy = map.copy()
    expect(calls()).toBe(before)
    expect(copy).not.toBe(map)
    expect(copy instanceof TreeMap).toBe(true)
    expect(copy.toJSON()).toEqual(map.toJSON())
    expect(copy.comparator()).toBe(comparator)
    copy.set(9, 'z')
    copy.delete(1)
    expect([...map.keys()]).toEqual([3, 2, 1])
    map.clear()
    expect([...copy.keys()]).toEqual([9, 3, 2])
    expect(new TreeMap().copy().size).toBe(0)
  })

  it('builds from strictly ascending keys with at most n − 1 comparisons, keeps the first key with the last value, and copies with none [016 S5-AC5]', () => {
    for (const n of [0, 1, 2, 3, 10, 64, 1000]) {
      const { comparator, calls } = counting(ascending)
      const keys = Array.from({ length: n }, (_, i) => i)
      const map = mapOf(keys, { comparator })
      expect(calls(), `size ${n}`).toBeLessThanOrEqual(Math.max(0, n - 1))
      expect([...map.keys()]).toEqual(keys)
      const fromCalls = calls()
      TreeMap.from(
        keys.map((k): [number, string] => [k, 'x']),
        { comparator },
      )
      expect(calls() - fromCalls).toBeLessThanOrEqual(Math.max(0, n - 1))
      const copyCalls = calls()
      expect(map.copy().toJSON()).toEqual(map.toJSON())
      expect(calls()).toBe(copyCalls)
    }
    Ranked.calls = 0
    new TreeMap([[new Ranked(1), 'a']])
    expect(Ranked.calls).toBe(1)
    Ranked.calls = 0
    new TreeMap([
      [new Ranked(1), 'a'],
      [new Ranked(2), 'b'],
      [new Ranked(3), 'c'],
    ])
    expect(Ranked.calls).toBe(2)
    type Key = { k: number; i: number }
    const { comparator, calls } = counting((a: Key, b: Key) => a.k - b.k)
    const random = seeded(4)
    const input = Array.from({ length: 1000 }, (_, i): [Key, number] => [
      { k: integer(random, 0, 300), i },
      i,
    ])
    const map = new TreeMap(input, { comparator })
    expect(calls()).toBeLessThanOrEqual(1000 * bound(1000))
    const firsts = new Map<number, number>()
    const lasts = new Map<number, number>()
    for (const [key, value] of input) {
      if (!firsts.has(key.k)) firsts.set(key.k, key.i)
      lasts.set(key.k, value)
    }
    expect(map.size).toBe(firsts.size)
    for (const [key, value] of map) {
      expect(key.i).toBe(firsts.get(key.k))
      expect(value).toBe(lasts.get(key.k))
    }
    expect([
      ...new TreeMap([
        [1, 'a'],
        [2, 'b'],
        [3, 'c'],
        [2, 'B'],
        [0, 'z'],
      ]),
    ]).toEqual([
      [0, 'z'],
      [1, 'a'],
      [2, 'B'],
      [3, 'c'],
    ])
  })
})

describe('TreeMap — equality and output', () => {
  it('equals a map with the same mappings both ways, including a HashMap, with lookups of incomparable keys answering absent [016 S6-AC2]', () => {
    const tree = mapOf([1, 2, 3])
    const hash = new HashMap([
      [3, 'v3'],
      [1, 'v1'],
      [2, 'v2'],
    ])
    expect(tree.equals(hash)).toBe(true)
    expect(hash.equals(tree)).toBe(true)
    expect(equals(tree, hash)).toBe(true)
    expect(tree.equals(mapOf([3, 2, 1], { comparator: descending }))).toBe(true)
    expect(tree.reversed().equals(tree)).toBe(true)
    const mixed = new HashMap<unknown, string>([
      [1, 'v1'],
      ['2', 'v2'],
      [null, 'v3'],
    ])
    expect(tree.equals(mixed)).toBe(false)
    expect(mixed.equals(tree)).toBe(false)
    expect(tree.equals(mapOf([1, 2, 4]))).toBe(false)
    expect(tree.equals(new Map(tree))).toBe(false)
    expect(tree.equals(tree.keySet())).toBe(false)
    expect(tree.equals(new TreeSet([1, 2, 3]))).toBe(false)
    expect(tree[equalsSymbol](hash)).toBe(true)
    expect(tree.subMap(1, 3)[equalsSymbol](mapOf([1, 2]))).toBe(true)
    expect('hashCode' in tree).toBe(false)
  })

  it('hashes like an equal default HashMap for comparators consistent with the hash function [016 S6-AC3]', () => {
    const a = mapOf([1, 2, 3])
    const b = mapOf([3, 2, 1], { comparator: descending })
    const h = new HashMap([
      [2, 'v2'],
      [3, 'v3'],
      [1, 'v1'],
    ])
    expect(hashCode(a)).toBe(hashCode(b))
    expect(hashCode(a)).toBe(hashCode(h))
    const standIn = (v: unknown) => (typeof v === 'number' ? v * 31 : 7)
    expect(a.reversed()[hashCodeSymbol](standIn)).toBe(a[hashCodeSymbol](standIn))
    expect(h[hashCodeSymbol](standIn)).toBe(a[hashCodeSymbol](standIn))
    expect(a.headMap(3)[hashCodeSymbol](standIn)).toBe(mapOf([1, 2])[hashCodeSymbol](standIn))
  })

  it('prints TreeMap(n) {k => v} in key order, writes JSON as pairs and supports inspect and the tag [016 S6-AC4]', () => {
    const map = new TreeMap([
      ['b', 2],
      ['a', 1],
    ])
    expect(String(map)).toBe("TreeMap(2) {'a' => 1, 'b' => 2}")
    expect(String(new TreeMap())).toBe('TreeMap(0) {}')
    expect(map.toJSON()).toEqual([
      ['a', 1],
      ['b', 2],
    ])
    expect(JSON.stringify(map)).toBe('[["a",1],["b",2]]')
    expect(inspect(map)).toBe("TreeMap(2) { 'a' => 1, 'b' => 2 }")
    expect(inspect({ m: map }, { depth: 0 })).toBe('{ m: [TreeMap] }')
    expect(Object.prototype.toString.call(map)).toBe('[object TreeMap]')
    expect(map[Symbol.toStringTag]).toBe('TreeMap')
  })

  it('terminates on a map that contains itself in equals, hashing and printing [016 S6-AC5]', () => {
    const map = new TreeMap<string, unknown>([['a', 1]])
    map.set('self', map)
    expect(String(map)).toBe("TreeMap(2) {'a' => 1, 'self' => [Circular]}")
    expect(map.equals(map)).toBe(true)
    expect(typeof hashCode(map)).toBe('number')
    const other = new TreeMap<string, unknown>([['a', 1]])
    other.set('self', other)
    expect(typeof map.equals(other)).toBe('boolean')
    const keyed = new TreeMap<unknown, number>({ comparator: () => 0 })
    keyed.set(keyed, 1)
    expect(String(keyed)).toBe('TreeMap(1) {[Circular] => 1}')
    expect(typeof hashCode(keyed)).toBe('number')
  })

  it('sets 200,000 ascending keys, then iterates, prints, compares, copies and clears without overflowing the stack [016 S5-AC4]', () => {
    const n = 200000
    const map = new TreeMap<number, number>()
    for (let i = 0; i < n; i++) map.set(i, i)
    expect(map.size).toBe(n)
    let expected = 0
    let wrong = 0
    for (const [k, v] of map) if (k !== expected || v !== expected++) wrong++
    expect(wrong).toBe(0)
    expect(expected).toBe(n)
    expect(String(map).startsWith(`TreeMap(${n}) {0 => 0, 1 => 1`)).toBe(true)
    const copy = map.copy()
    expect(map.equals(copy)).toBe(true)
    expect(copy.equals(map)).toBe(true)
    expect(map.reversed().firstEntry()?.key).toBe(n - 1)
    expect(map.subMap(1000, 2000).size).toBe(1000)
    map.clear()
    expect(map.size).toBe(0)
    expect(copy.size).toBe(n)
    // Generous: instrumented coverage runs are many times slower than plain ones.
  }, 60000)
})

// ── Shared contracts ──

/** Kinds in the order the contract comparator puts them. */
const KINDS = ['number', 'bigint', 'string', 'boolean', 'symbol', 'function', 'object', 'undefined']

/** A key below every other value, and one above, so a range view can hold any value. */
const LOW = { edge: 'low' }
const HIGH = { edge: 'high' }

/**
 * A total order over any values, for the contract suites, which use strings, objects and the
 * collection itself next to numbers: `LOW` first and `HIGH` last, then by kind, then by value;
 * symbols, functions and objects in the order first seen.
 */
function mixedComparator(): Comparator<unknown> {
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
    if (a === LOW || b === HIGH) return -1
    if (a === HIGH || b === LOW) return 1
    const kinds = KINDS.indexOf(typeof a) - KINDS.indexOf(typeof b)
    if (kinds !== 0) return kinds
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

type AnyMap = SortedMap<unknown, unknown>

/**
 * The four map objects the suites run on, each in ascending order of `order` (a fresh order per
 * map): the map, a range view, a reversed view of a map kept in reverse order, and a reversed
 * range view of one.
 */
function mapObjects(
  order: () => Comparator<unknown> | undefined,
  low: unknown,
  high: unknown,
): Array<[string, () => AnyMap]> {
  const reverse = (): Comparator<unknown> | undefined => {
    const forward = order()
    return forward === undefined
      ? (a, b) => (a === b ? 0 : (a as string) < (b as string) ? 1 : -1)
      : (a, b) => forward(b, a)
  }
  const options = (comparator: Comparator<unknown> | undefined) =>
    comparator === undefined ? {} : { comparator }
  return [
    ['TreeMap', () => new TreeMap<unknown, unknown>(options(order()))],
    [
      'TreeSubMap',
      () => {
        const map = new TreeMap<unknown, unknown>(options(order()))
        map.set(low, 0).set(high, 0)
        return map.subMap(low, high, { fromInclusive: false })
      },
    ],
    ['ReversedTreeMap', () => new TreeMap<unknown, unknown>(options(reverse())).reversed()],
    [
      'ReversedTreeMap',
      () => {
        const map = new TreeMap<unknown, unknown>(options(reverse()))
        map.set(low, 0).set(high, 0)
        return map.subMap(high, low, { fromInclusive: false }).reversed()
      },
    ],
  ]
}

describe('TreeMap — shared contracts', () => {
  it('runs the map, sorted-map, collection, set, sequenced and sorted-set suites on the map, its views and their key, entry and value views [016 S8-AC1]', () => {
    // The suites below are registered at module level; this test pins the factories they use.
    for (const [name, make] of mapObjects(mixedComparator, LOW, HIGH)) {
      const map = make()
      map.putAll([
        [2, 'b'],
        ['a', 1],
        [1, 'a'],
      ])
      expect(String(map), name).toBe(`${name}(3) {1 => 'a', 2 => 'b', 'a' => 1}`)
      expect(map.has(LOW), name).toBe(false)
      expect(map.has(HIGH), name).toBe(false)
      expect(isSortedMap(map), name).toBe(true)
    }
    for (const [name, make] of mapObjects(() => undefined, 'A', '~')) {
      const map = make()
      map.putAll([
        ['b', 2],
        ['a', 1],
      ])
      expect([...map.keys()], name).toEqual(['a', 'b'])
    }
  })
})

// The map suite on the map and each kind of map view, with natural order over string keys.
for (const [name, make] of mapObjects(() => undefined, 'A', '~')) {
  const factory: MapFactory = (initial) => {
    const map = make()
    if (initial !== undefined) map.putAll(initial)
    return map as never
  }
  describeMapCollection(name, factory, { iteration: 'fail-fast', order: 'ascending' })
}

// The sorted-map suite on the map, a range view and a reversed view.
describeSortedMap('TreeMap', (initial) => new TreeMap<number, string>(initial ?? []))
describeSortedMap('TreeSubMap', (initial) => {
  const view = new TreeMap<number, string>([
    [-1e9, 'low'],
    [1e9, 'high'],
  ]).subMap(-1e6, 1e6)
  view.putAll(initial ?? [])
  return view
})
describeSortedMap('ReversedTreeMap', (initial) => {
  const view = new TreeMap<number, string>({ comparator: descending }).reversed()
  view.putAll(initial ?? [])
  return view
})

const sumOf = (elements: unknown[], hash: (value: unknown) => number) =>
  elements.reduce<number>((h, e) => (h + hash(e)) | 0, 0)

{
  const contractOrder = mixedComparator()
  /** The map each view the factories below returned was made from. */
  const owners = new WeakMap<object, AnyMap>()
  const ownerOf = (view: object) => owners.get(view) as AnyMap
  for (const [name, make] of mapObjects(mixedComparator, LOW, HIGH)) {
    const keySet = (initial: Iterable<unknown> = []) => {
      const map = make()
      for (const e of initial) map.set(e, e)
      const view = map.keySet()
      owners.set(view, map)
      return view
    }
    const entrySet = (initial: Iterable<unknown> = []) => {
      const map = make()
      for (const e of initial) map.set(e, e)
      const view = map.entrySet() as unknown as ReturnType<typeof keySet>
      owners.set(view, map)
      return view
    }
    const insertKey = (view: object, e: unknown) => {
      ownerOf(view).set(e, e)
    }
    describe(`${name} views`, () => {
      describeCollection('TreeMapKeySet', keySet as CollectionFactory, {
        iteration: 'fail-fast',
        brackets: 'set',
        nullElements: 'store',
        order: 'unspecified',
        minusZero: 'kept',
        peers: [(initial?: Iterable<unknown>) => new HashSet<unknown>(initial)],
        structural: { expectedHash: sumOf },
        insert: insertKey,
      })
      describeSetCollection('TreeMapKeySet', keySet as never, {
        order: (members) => members.slice().sort(contractOrder),
        insert: insertKey,
      })
      describeSequencedCollection('TreeMapKeySet', keySet as never, {
        addAtEnds: 'unsupported',
        insert: insertKey,
      })
      describeSetCollection('TreeMapEntrySet', entrySet as never, {
        order: (members) => members.slice().sort(contractOrder),
        insert: insertKey,
        member: (entry) => (entry as MapEntry<unknown, unknown>).key,
        probe: (e) => [...new HashMap([[e, e]]).entrySet()][0],
        printed: (text) => `${text} => ${text}`,
      })
    })
  }

  // The sorted-set suite on the key sets, in ascending numeric order, filled through the maps.
  const numberMaps: Array<[string, () => SortedMap<number, string>]> = [
    ['TreeMapKeySet', () => new TreeMap<number, string>()],
    [
      'TreeMapKeySet',
      () =>
        new TreeMap<number, string>([
          [-1e9, 'low'],
          [1e9, 'high'],
        ]).subMap(-1e6, 1e6),
    ],
    ['TreeMapKeySet', () => new TreeMap<number, string>({ comparator: descending }).reversed()],
  ]
  for (const [name, make] of numberMaps) {
    const maps = new WeakMap<object, SortedMap<number, string>>()
    describeSortedSet(
      name,
      (initial) => {
        const map = make()
        for (const e of initial ?? []) map.set(e, `v${e}`)
        const keys = map.keySet()
        maps.set(keys, map)
        return keys
      },
      {
        insert: (set, element, range) => {
          const map = maps.get(set) as SortedMap<number, string>
          const target = range === undefined ? map : map.subMap(range[0], range[1])
          target.set(element, `v${element}`)
        },
      },
    )
  }

  // The collection suite on the value views: each value gets a new key after the last one in the
  // view's order, so the order values are added in is their iteration order.
  const valueMaps: Array<[string, () => SortedMap<number, unknown>, number]> = [
    ['map', () => new TreeMap<number, unknown>(), 1],
    [
      'range view',
      () =>
        new TreeMap<number, unknown>([
          [-1e9, 'low'],
          [1e9, 'high'],
        ]).subMap(-1e8, 1e8),
      1,
    ],
    ['reversed view', () => new TreeMap<number, unknown>().reversed(), -1],
    [
      'reversed range view',
      () =>
        new TreeMap<number, unknown>([
          [-1e9, 'low'],
          [1e9, 'high'],
        ])
          .subMap(-1e8, 1e8)
          .reversed(),
      -1,
    ],
  ]
  for (const [label, make, direction] of valueMaps) {
    let nextKey = 0
    const valueMap = new WeakMap<object, SortedMap<number, unknown>>()
    const put = (view: object, e: unknown) => {
      nextKey += direction
      ;(valueMap.get(view) as SortedMap<number, unknown>).set(nextKey, e)
    }
    const values = (initial: Iterable<unknown> = []) => {
      const map = make()
      const view = map.valueCollection()
      valueMap.set(view, map)
      for (const e of initial) put(view, e)
      return view
    }
    describe(`TreeMapValues of a ${label}`, () => {
      describeCollection('TreeMapValues', values, {
        iteration: 'fail-fast',
        brackets: 'list',
        nullElements: 'store',
        order: 'insertion',
        insert: put,
      })
    })
  }
}

describe('TreeMap — reference model', () => {
  it('matches a native Map plus sorted keys under seeded operations, with numbers and strings, including nearest entries, polls and range views [016 S8-AC2]', () => {
    const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
    const letters = 'abcdefghij'
    for (const seed of [1, 2, 3, 4]) {
      runSortedMapReferenceModel({
        seed,
        steps: 800,
        make: () => new TreeMap<number, number>(),
        compare: ascending,
        key: (random) => integer(random, 0, 60),
      })
      runSortedMapReferenceModel({
        seed,
        steps: 800,
        make: () => new TreeMap<number, number>({ comparator: descending }),
        compare: descending,
        key: (random) => integer(random, 0, 60),
      })
      runSortedMapReferenceModel({
        seed,
        steps: 800,
        make: () => new TreeMap<string, number>(),
        compare: byCodeUnit,
        key: (random) =>
          `${letters[integer(random, 0, 9)] as string}${letters[integer(random, 0, 9)] as string}`,
      })
    }
  })
})

describe('TreeMap — recognition', () => {
  it('is recognised by isSortedMap and isMapCollection with its views, and never as a collection, set or sorted set [016 S8-AC3]', () => {
    const map = mapOf([1, 2, 3])
    for (const value of [map, map.subMap(1, 3), map.headMap(2), map.reversed()]) {
      expect(isSortedMap(value)).toBe(true)
      expect(isMapCollection(value)).toBe(true)
      expect(isCollection(value)).toBe(false)
      expect(isSetCollection(value)).toBe(false)
      expect(isSortedSet(value)).toBe(false)
    }
    for (const value of [
      new HashMap([[1, 'a']]),
      new Map([[1, 'a']]),
      new TreeSet([1]),
      map.keySet(),
      map.entrySet(),
      map.valueCollection(),
      new HashSet([1]),
      {},
      null,
      undefined,
    ]) {
      expect(isSortedMap(value)).toBe(false)
    }
  })

  it('answers instanceof TreeMap for a TreeMap and not for its views [016 S8-AC4]', () => {
    const map = mapOf([1, 2])
    expect(map instanceof TreeMap).toBe(true)
    for (const value of [
      map.subMap(1, 2),
      map.reversed(),
      map.keySet(),
      new HashMap(),
      new Map(),
    ]) {
      expect(value instanceof TreeMap).toBe(false)
    }
  })
})
