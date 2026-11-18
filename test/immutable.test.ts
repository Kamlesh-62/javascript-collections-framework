import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  ArrayDeque,
  ArrayList,
  copyOfList,
  copyOfMap,
  copyOfSet,
  type Equivalence,
  HashMap,
  HashSet,
  hashCode,
  isCollection,
  isDeque,
  isList,
  isMapCollection,
  isQueue,
  isSequencedCollection,
  isSetCollection,
  isSortedMap,
  isSortedSet,
  type KeyOf,
  LinkedHashMap,
  LinkedHashSet,
  LinkedList,
  listOf,
  type MapEntry,
  mapOf,
  PriorityQueue,
  type ReadonlyList,
  type ReadonlyMapCollection,
  type ReadonlySetCollection,
  sameValueZeroEquivalence,
  setOf,
  TreeMap,
  TreeSet,
  UnsupportedOperationError,
} from '../src/index'
import { caught, describeReadonlyCollection } from './contracts/readonly-collection'
import { describeReadonlyList } from './contracts/readonly-list'
import { describeReadonlyMap } from './contracts/readonly-map'
import { describeReadonlySet } from './contracts/readonly-set'
import { describeUnsupportedMutators } from './contracts/unsupported'
import { combine } from './fixtures/structural-list'

const sumOf = (elements: unknown[], hash: (value: unknown) => number) =>
  elements.reduce<number>((h, e) => (h + hash(e)) | 0, 0)

/** A `key` that keeps primitives and gives each object its own symbol: SameValueZero by key. */
function identityKey(): KeyOf<unknown> {
  const ids = new WeakMap<object, symbol>()
  return ((value: unknown) => {
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return value
    let id = ids.get(value as object)
    if (id === undefined) {
      id = Symbol('id')
      ids.set(value as object, id)
    }
    return id
  }) as KeyOf<unknown>
}

/** A user-written SameValueZero equivalence: a new object, so the set uses its buckets. */
function sameValueZeroUser(): Equivalence<unknown> {
  return {
    equals: (a, b) => sameValueZeroEquivalence.equals(a, b),
    hash: (value) => sameValueZeroEquivalence.hash(value),
  }
}

/** An iterable that records whether it was read. */
function spyIterable<T>(items: T[]): Iterable<T> & { read: boolean } {
  const spy = {
    read: false,
    [Symbol.iterator]() {
      spy.read = true
      return items[Symbol.iterator]()
    },
  }
  return spy
}

const lists = (initial?: Iterable<unknown>) => copyOfList([...(initial ?? [])])
const subLists = (initial?: Iterable<unknown>) => {
  const items = [...(initial ?? [])]
  return copyOfList(['<', ...items, '>']).subList(1, 1 + items.length)
}
const reversedLists = (initial?: Iterable<unknown>) =>
  copyOfList([...(initial ?? [])].reverse()).reversed()

describe('immutable lists pass the read-only contract suites [018 S6-AC2]', () => {
  const peers = [(initial?: Iterable<unknown>) => new ArrayList<unknown>(initial)]
  for (const [name, make] of [
    ['ImmutableList', lists],
    ['ImmutableSubList', subLists],
    ['ImmutableReversedList', reversedLists],
  ] as const) {
    describeReadonlyCollection(name, make, {
      brackets: 'list',
      minusZero: 'kept',
      structural: { expectedHash: combine },
      peers,
    })
    describeReadonlyList(name, make, peers)
    describeUnsupportedMutators(name, () => make([1, 2, 3]), 'list')
    describeUnsupportedMutators(name, () => make(), 'list')
  }
})

describe('immutable sets pass the read-only contract suites [018 S6-AC2]', () => {
  const paths: Array<
    [string, () => { key?: KeyOf<unknown>; equivalence?: Equivalence<unknown> } | undefined]
  > = [
    ['default', () => undefined],
    ['key', () => ({ key: identityKey() })],
    ['equivalence', () => ({ equivalence: sameValueZeroUser() })],
  ]
  for (const [path, options] of paths) {
    describe(`on the ${path} path`, () => {
      const make = (initial?: Iterable<unknown>) => copyOfSet([...(initial ?? [])], options())
      describeReadonlyCollection('ImmutableSet', make, {
        brackets: 'set',
        peers: [(initial) => new HashSet<unknown>(initial)],
        structural: {
          expectedHash: (elements, hash) =>
            path === 'equivalence'
              ? sumOf(elements, sameValueZeroEquivalence.hash)
              : sumOf(elements, hash),
        },
      })
      describeReadonlySet('ImmutableSet', make)
      describeUnsupportedMutators('ImmutableSet', () => make([1, 2]), 'set')
    })
  }
  describe('from setOf', () => {
    const make = (initial?: Iterable<unknown>) => setOf(...(initial ?? []))
    describeReadonlySet('ImmutableSet', make)
    describeUnsupportedMutators('ImmutableSet', () => setOf(), 'set')
  })
})

describe('immutable maps and their views pass the read-only contract suites [018 S6-AC2]', () => {
  const pairsOf = (initial?: Iterable<unknown>) =>
    [...(initial ?? [])].map((e) => [e, e] as [unknown, unknown])
  describeReadonlyMap('ImmutableMap', (initial) => copyOfMap([...(initial ?? [])]))
  describeReadonlyMap('ImmutableMap', (initial) => mapOf(...(initial ?? [])))
  describeReadonlyMap('ImmutableMap', (initial) =>
    copyOfMap([...(initial ?? [])], { key: identityKey() }),
  )
  describeReadonlyMap('ImmutableMap', (initial) =>
    copyOfMap([...(initial ?? [])], { equivalence: sameValueZeroUser() }),
  )
  describeReadonlySet('ImmutableMapKeySet', (initial) => copyOfMap(pairsOf(initial)).keySet())
  describeReadonlySet('ImmutableMapEntrySet', (initial) => copyOfMap(pairsOf(initial)).entrySet(), {
    member: (entry) => (entry as MapEntry<unknown, unknown>).key,
    probe: (e) => [...new HashMap([[e, e]]).entrySet()][0],
    printed: (text) => `${text} => ${text}`,
  })
  describeReadonlyCollection(
    'ImmutableMapValues',
    (initial) =>
      copyOfMap([...(initial ?? [])].map((e, i) => [`k${i}`, e] as const)).valueCollection(),
    { brackets: 'list' },
  )
  const filled = () => mapOf<unknown, unknown>(['a', 1], ['b', 2])
  describeUnsupportedMutators('ImmutableMap', filled, 'map')
  describeUnsupportedMutators('ImmutableMap', () => mapOf(), 'map')
  describeUnsupportedMutators('ImmutableMapKeySet', () => filled().keySet(), 'set')
  describeUnsupportedMutators('ImmutableMapEntrySet', () => filled().entrySet(), 'set')
  describeUnsupportedMutators('ImmutableMapValues', () => filled().valueCollection(), 'values')
})

describe('S1 — create', () => {
  it('listOf keeps argument order and duplicates; listOf() is empty [018 S1-AC1]', () => {
    expect(listOf('b', 'a', 'b').toArray()).toEqual(['b', 'a', 'b'])
    expect(listOf().size).toBe(0)
    expect(listOf(1).get(0)).toBe(1)
  })

  it('copyOfList copies in iteration order [018 S1-AC2]', () => {
    expect(copyOfList(new Set([3, 1, 2])).toArray()).toEqual([3, 1, 2])
    expect(copyOfList('abc').toArray()).toEqual(['a', 'b', 'c'])
    expect(copyOfList(new ArrayList([1, 2]).reversed()).toArray()).toEqual([2, 1])
    expect(copyOfList(Array(3).fill(0)).toArray()).toEqual([0, 0, 0])
  })

  it('sets keep the first of equal members in first-seen order, as new Set does [018 S1-AC3]', () => {
    for (const set of [
      setOf(2, 1, 2, -0, 0, Number.NaN, Number.NaN),
      copyOfSet([2, 1, 2, -0, 0, Number.NaN, Number.NaN]),
    ]) {
      expect(set.toArray()).toEqual([...new Set([2, 1, 2, -0, 0, Number.NaN, Number.NaN])])
      expect(Object.is(set.toArray()[2], 0)).toBe(true)
      expect(set.size).toBe(4)
    }
    const first = { id: 1 }
    const second = { id: 1 }
    const keyed = copyOfSet([first, second], { key: (o) => o.id })
    expect(keyed.toArray()[0]).toBe(first)
  })

  it('maps keep a key first position and first key object and take its last value [018 S1-AC4]', () => {
    const map = mapOf<unknown, unknown>(
      ['a', 1],
      ['b', 2],
      ['a', 3],
      [-0, 'zero'],
      [Number.NaN, 'x'],
      [Number.NaN, 'y'],
    )
    expect([...map]).toEqual([
      ...new Map<unknown, unknown>([
        ['a', 1],
        ['b', 2],
        ['a', 3],
        [-0, 'zero'],
        [Number.NaN, 'x'],
        [Number.NaN, 'y'],
      ]),
    ])
    expect([...map.keys()][0]).toBe('a')
    expect(map.get('a')).toBe(3)
    expect(Object.is([...map.keys()][2], 0)).toBe(true)
    expect(map.get(Number.NaN)).toBe('y')
    const first = { id: 1 }
    const second = { id: 1 }
    const keyed = copyOfMap<{ id: number }, string>(
      [
        [first, 'a'],
        [second, 'b'],
      ],
      { key: (o) => o.id },
    )
    expect([...keyed.keys()][0]).toBe(first)
    expect(keyed.get(second)).toBe('b')
  })

  it('copyOfMap reads library maps, native maps, pairs and entries; mapOf takes entries too [018 S1-AC5]', () => {
    const pairs: Array<[string, number]> = [
      ['a', 1],
      ['b', 2],
    ]
    const sources: Array<Iterable<readonly [string, number] | MapEntry<string, number>>> = [
      new HashMap(pairs),
      new TreeMap<string, number>(pairs),
      new Map(pairs),
      pairs,
      new HashMap(pairs).entrySet(),
    ]
    for (const source of sources) expect([...copyOfMap(source)]).toEqual(pairs)
    expect([...mapOf(...new HashMap(pairs).entrySet())]).toEqual(pairs)
  })

  it('stores null and undefined, and finds them like any other value [018 S1-AC6]', () => {
    const list = listOf(null, undefined)
    expect(list.indexOf(undefined)).toBe(1)
    expect(list.has(null)).toBe(true)
    const set = copyOfSet([null, undefined])
    expect(set.has(undefined)).toBe(true)
    expect(setOf(null).has(null)).toBe(true)
    const map = mapOf<unknown, unknown>([null, undefined], [undefined, null])
    expect(map.get(undefined)).toBe(null)
    expect(map.has(null)).toBe(true)
    expect(map.getOrDefault(null, 'x')).toBeUndefined()
    expect(copyOfMap([[undefined, 1]]).get(undefined)).toBe(1)
  })

  it('returns empty collections for no input [018 S1-AC7]', () => {
    for (const empty of [setOf(), mapOf(), copyOfList([]), copyOfSet([]), copyOfMap([])]) {
      expect(empty.size).toBe(0)
      expect(empty.isEmpty()).toBe(true)
    }
  })

  it('returns its argument only for a factory result with the identical equality; views are always copied [018 S1-AC8]', () => {
    const list = listOf(1, 2)
    expect(copyOfList(list).equals(list)).toBe(true)
    const view = list.subList(0, 1)
    const fromView = copyOfList(view)
    expect(fromView).not.toBe(view)
    expect(String(fromView)).toBe('ImmutableList(1) [1]')
    const reversed = list.reversed()
    const fromReversed = copyOfList(reversed)
    expect(fromReversed).not.toBe(reversed)
    expect(String(fromReversed)).toBe('ImmutableList(2) [2, 1]')
    const equivalence = sameValueZeroUser()
    const withEquivalence = copyOfSet([1, 2], { equivalence })
    expect(copyOfSet(withEquivalence, { equivalence }).equals(withEquivalence)).toBe(true)
    const otherEquivalence = copyOfSet(withEquivalence, { equivalence: sameValueZeroUser() })
    expect(otherEquivalence).not.toBe(withEquivalence)
    expect(otherEquivalence.equals(withEquivalence)).toBe(true)

    const key = (s: string) => s.toLowerCase()
    const keyed = copyOfSet(['a', 'B'], { key })
    expect(copyOfSet(keyed, { key }).equals(keyed)).toBe(true)
    const plain = copyOfSet(keyed)
    expect(plain).not.toBe(keyed)
    expect(plain.has('A')).toBe(false)
    expect(keyed.has('A')).toBe(true)
    expect(copyOfSet(keyed, { key: (s) => s })).not.toBe(keyed)

    const map = mapOf(['a', 1])
    const keySet = map.keySet()
    expect(copyOfSet(keySet)).not.toBe(keySet)
    expect(String(copyOfSet(keySet))).toBe("ImmutableSet(1) {'a'}")
    const keyedMap = copyOfMap([['a', 1]], { key })
    expect(copyOfMap(keyedMap)).not.toBe(keyedMap)
    expect(copyOfMap(keyedMap, { key }).equals(keyedMap)).toBe(true)

    let calls = 0
    const counting = copyOfSet<string>([], {
      key: (s) => {
        calls++
        return s
      },
    })
    counting.has('x')
    expect(calls).toBe(1) // an empty result keeps its own equality
  })
})

describe('S2 — value-keyed sets and maps', () => {
  it('matches members and keys by a derived key [018 S2-AC1]', () => {
    const key = (p: { x: number; y: number }) => `${p.x},${p.y}`
    const set = copyOfSet(
      [
        { x: 1, y: 2 },
        { x: 1, y: 2 },
      ],
      { key },
    )
    expect(set.size).toBe(1)
    expect(set.has({ x: 1, y: 2 })).toBe(true)
    const map = copyOfMap([[{ x: 0, y: 0 }, 'origin']], { key })
    expect(map.get({ x: 0, y: 0 })).toBe('origin')
  })

  it('decides membership by an equivalence [018 S2-AC2]', () => {
    const caseless: Equivalence<string> = {
      equals: (a, b) => a.toLowerCase() === b.toLowerCase(),
      hash: (s) => s.toLowerCase().length,
    }
    const set = copyOfSet(['Ann', 'ANN', 'Bo'], { equivalence: caseless })
    expect(set.toArray()).toEqual(['Ann', 'Bo'])
    expect(set.has('bo')).toBe(true)
    expect(copyOfMap([['K', 1]], { equivalence: caseless }).get('k')).toBe(1)
  })

  it('rejects invalid options with TypeError naming the factory, before reading the source; null means none [018 S2-AC3]', () => {
    const bad: unknown[] = [
      { key: (v: unknown) => v, equivalence: sameValueZeroEquivalence },
      { key: 5 },
      { equivalence: {} },
      5,
      'key',
    ]
    for (const options of bad) {
      for (const [name, call] of [
        ['copyOfSet', (source: Iterable<unknown>) => copyOfSet(source, options as never)],
        ['copyOfMap', (source: Iterable<unknown>) => copyOfMap(source as never, options as never)],
      ] as const) {
        const source = spyIterable<unknown>([['a', 1]])
        const error = caught(() => call(source))
        expect(error).toBeInstanceOf(TypeError)
        expect((error as Error).message.startsWith(`${name}: `)).toBe(true)
        expect(source.read).toBe(false)
      }
    }
    expect(() => copyOfSet(5 as never, { key: 5 } as never)).toThrow(
      /^copyOfSet: elements is not iterable/,
    )
    expect(() => copyOfMap(5 as never, 'bad' as never)).toThrow(
      /^copyOfMap: entries is not iterable/,
    )
    expect(copyOfSet([1, 1], null).size).toBe(1)
    expect(copyOfMap([['a', 1]], undefined).get('a')).toBe(1)
  })

  it('setOf and mapOf use SameValueZero, as copyOfSet and copyOfMap without options [018 S2-AC4]', () => {
    expect(setOf({}, {}).size).toBe(2)
    expect(setOf('a', 'a').size).toBe(1)
    expect(mapOf([{}, 1], [{}, 2]).size).toBe(2)
    expect(setOf(1, 2).equals(copyOfSet([1, 2]))).toBe(true)
  })
})

describe('S3 — reject bad input', () => {
  it('throws TypeError naming the factory for a source that is not iterable [018 S3-AC1]', () => {
    for (const value of [5, null, undefined, {}]) {
      expect(() => copyOfList(value as never)).toThrow(/^copyOfList: elements is not iterable/)
      expect(() => copyOfSet(value as never)).toThrow(/^copyOfSet: elements is not iterable/)
      expect(() => copyOfMap(value as never)).toThrow(/^copyOfMap: entries is not iterable/)
    }
  })

  it('throws TypeError naming the factory and the 0-based position of a bad item [018 S3-AC2]', () => {
    expect(() => mapOf(['a', 1], ['b'] as never)).toThrow(
      /^mapOf: item 1 is not a \[key, value\] pair/,
    )
    expect(() => copyOfMap([5] as never)).toThrow(/^copyOfMap: item 0 /)
    expect(() => copyOfMap([['a', 1, 2]] as never)).toThrow(TypeError)
  })

  it('lets errors from the source and from callbacks propagate, returning nothing [018 S3-AC3]', () => {
    const failure = new Error('source failed')
    const throwing = {
      *[Symbol.iterator]() {
        yield 1
        throw failure
      },
    }
    expect(caught(() => copyOfList(throwing))).toBe(failure)
    expect(caught(() => copyOfSet(throwing))).toBe(failure)
    const throwingPairs = {
      *[Symbol.iterator]() {
        yield ['a', 1]
        throw failure
      },
    }
    expect(caught(() => copyOfMap(throwingPairs as never))).toBe(failure)
    const hashFailure = new Error('hash failed')
    expect(
      caught(() =>
        copyOfSet([1], {
          equivalence: {
            equals: (a, b) => a === b,
            hash: () => {
              throw hashFailure
            },
          },
        }),
      ),
    ).toBe(hashFailure)
    const keyFailure = new Error('key failed')
    expect(
      caught(() =>
        copyOfSet([1], {
          key: () => {
            throw keyFailure
          },
        }),
      ),
    ).toBe(keyFailure)
    expect(
      caught(() =>
        copyOfMap([[1, 1]], {
          key: () => {
            throw keyFailure
          },
        }),
      ),
    ).toBe(keyFailure)
  })

  it('reads the whole source before any callback, so changes the callbacks make do not count [018 S3-AC4]', () => {
    const failFast = new ArrayList<number>([1, 2, 3])
    const fromList = copyOfSet(failFast, {
      key: (n) => {
        failFast.add(n + 100)
        return n
      },
    })
    expect(fromList.toArray()).toEqual([1, 2, 3])
    const live = new HashSet<number>([1, 2, 3])
    let next = 1000
    const fromLive = copyOfSet(live, {
      key: (n) => {
        live.add(next++)
        return n
      },
    })
    expect(fromLive.toArray()).toEqual([1, 2, 3])
    const map = new HashMap<number, number>([[1, 1]])
    const fromMap = copyOfMap(map, {
      equivalence: {
        equals: (a, b) => a === b,
        hash: (n) => {
          map.set(next++, 0)
          return n
        },
      },
    })
    expect([...fromMap]).toEqual([[1, 1]])
  })
})

describe('S4 — never change', () => {
  it('does not show later changes to the source [018 S4-AC3]', () => {
    const array = [1, 2]
    const list = listOf(...array)
    const copied = copyOfList(array)
    const source = new HashSet([1])
    const set = copyOfSet(source)
    const native = new Map([['a', 1]])
    const map = copyOfMap(native)
    array.push(3)
    source.add(2)
    native.set('b', 2)
    expect(list.size).toBe(2)
    expect(copied.size).toBe(2)
    expect(set.size).toBe(1)
    expect(map.size).toBe(1)
  })

  it('types the results and views as read-only, so mutators do not compile [018 S4-AC4]', () => {
    // Checked by the compiler; the function is never called.
    const typeChecks = (
      list: ReadonlyList<number>,
      set: ReadonlySetCollection<number>,
      map: ReadonlyMapCollection<string, number>,
    ) => {
      // @ts-expect-error a read-only list cannot change
      list.add(1)
      // @ts-expect-error a read-only list cannot change
      list.addAll([1])
      // @ts-expect-error a read-only list cannot change
      list.delete(1)
      // @ts-expect-error a read-only list cannot change
      list.removeAll([1])
      // @ts-expect-error a read-only list cannot change
      list.retainAll([1])
      // @ts-expect-error a read-only list cannot change
      list.removeIf(() => true)
      // @ts-expect-error a read-only list cannot change
      list.clear()
      // @ts-expect-error a read-only list cannot change
      list.addFirst(1)
      // @ts-expect-error a read-only list cannot change
      list.addLast(1)
      // @ts-expect-error a read-only list cannot change
      list.removeFirst()
      // @ts-expect-error a read-only list cannot change
      list.removeLast()
      // @ts-expect-error a read-only list cannot change
      list.set(0, 1)
      // @ts-expect-error a read-only list cannot change
      list.insert(0, 1)
      // @ts-expect-error a read-only list cannot change
      list.insertAll(0, [1])
      // @ts-expect-error a read-only list cannot change
      list.removeAt(0)
      // @ts-expect-error a read-only list cannot change
      list.replaceAll((e) => e)
      // @ts-expect-error a read-only list cannot change
      list.sort()
      // @ts-expect-error a read-only sub-list cannot change
      list.subList(0, 1).add(1)
      // @ts-expect-error a read-only sub-list cannot change
      list.subList(0, 1).addAll([1])
      // @ts-expect-error a read-only sub-list cannot change
      list.subList(0, 1).delete(1)
      // @ts-expect-error a read-only sub-list cannot change
      list.subList(0, 1).removeAll([1])
      // @ts-expect-error a read-only sub-list cannot change
      list.subList(0, 1).retainAll([1])
      // @ts-expect-error a read-only sub-list cannot change
      list.subList(0, 1).removeIf(() => true)
      // @ts-expect-error a read-only sub-list cannot change
      list.subList(0, 1).clear()
      // @ts-expect-error a read-only sub-list cannot change
      list.subList(0, 1).addFirst(1)
      // @ts-expect-error a read-only sub-list cannot change
      list.subList(0, 1).addLast(1)
      // @ts-expect-error a read-only sub-list cannot change
      list.subList(0, 1).removeFirst()
      // @ts-expect-error a read-only sub-list cannot change
      list.subList(0, 1).removeLast()
      // @ts-expect-error a read-only sub-list cannot change
      list.subList(0, 1).set(0, 1)
      // @ts-expect-error a read-only sub-list cannot change
      list.subList(0, 1).insert(0, 1)
      // @ts-expect-error a read-only sub-list cannot change
      list.subList(0, 1).insertAll(0, [1])
      // @ts-expect-error a read-only sub-list cannot change
      list.subList(0, 1).removeAt(0)
      // @ts-expect-error a read-only sub-list cannot change
      list.subList(0, 1).replaceAll((e) => e)
      // @ts-expect-error a read-only sub-list cannot change
      list.subList(0, 1).sort()
      // @ts-expect-error a read-only reversed list cannot change
      list.reversed().add(1)
      // @ts-expect-error a read-only reversed list cannot change
      list.reversed().addAll([1])
      // @ts-expect-error a read-only reversed list cannot change
      list.reversed().delete(1)
      // @ts-expect-error a read-only reversed list cannot change
      list.reversed().removeAll([1])
      // @ts-expect-error a read-only reversed list cannot change
      list.reversed().retainAll([1])
      // @ts-expect-error a read-only reversed list cannot change
      list.reversed().removeIf(() => true)
      // @ts-expect-error a read-only reversed list cannot change
      list.reversed().clear()
      // @ts-expect-error a read-only reversed list cannot change
      list.reversed().addFirst(1)
      // @ts-expect-error a read-only reversed list cannot change
      list.reversed().addLast(1)
      // @ts-expect-error a read-only reversed list cannot change
      list.reversed().removeFirst()
      // @ts-expect-error a read-only reversed list cannot change
      list.reversed().removeLast()
      // @ts-expect-error a read-only reversed list cannot change
      list.reversed().set(0, 1)
      // @ts-expect-error a read-only reversed list cannot change
      list.reversed().insert(0, 1)
      // @ts-expect-error a read-only reversed list cannot change
      list.reversed().insertAll(0, [1])
      // @ts-expect-error a read-only reversed list cannot change
      list.reversed().removeAt(0)
      // @ts-expect-error a read-only reversed list cannot change
      list.reversed().replaceAll((e) => e)
      // @ts-expect-error a read-only reversed list cannot change
      list.reversed().sort()
      // @ts-expect-error a read-only set cannot change
      set.add(1)
      // @ts-expect-error a read-only set cannot change
      set.addAll([1])
      // @ts-expect-error a read-only set cannot change
      set.delete(1)
      // @ts-expect-error a read-only set cannot change
      set.removeAll([1])
      // @ts-expect-error a read-only set cannot change
      set.retainAll([1])
      // @ts-expect-error a read-only set cannot change
      set.removeIf(() => true)
      // @ts-expect-error a read-only set cannot change
      set.clear()
      // @ts-expect-error a read-only map cannot change
      map.set('a', 1)
      // @ts-expect-error a read-only map cannot change
      map.put('a', 1)
      // @ts-expect-error a read-only map cannot change
      map.putAll([['a', 1]])
      // @ts-expect-error a read-only map cannot change
      map.delete('a')
      // @ts-expect-error a read-only map cannot change
      map.remove('a')
      // @ts-expect-error a read-only map cannot change
      map.replace('a', 1)
      // @ts-expect-error a read-only map cannot change
      map.replaceAll((v) => v)
      // @ts-expect-error a read-only map cannot change
      map.getOrInsert('a', 1)
      // @ts-expect-error a read-only map cannot change
      map.getOrInsertComputed('a', () => 1)
      // @ts-expect-error a read-only map cannot change
      map.compute('a', () => 1)
      // @ts-expect-error a read-only map cannot change
      map.computeIfPresent('a', () => 1)
      // @ts-expect-error a read-only map cannot change
      map.merge('a', 1, (x) => x)
      // @ts-expect-error a read-only map cannot change
      map.clear()
      // @ts-expect-error a read-only key view cannot change
      map.keySet().add(1)
      // @ts-expect-error a read-only key view cannot change
      map.keySet().addAll([1])
      // @ts-expect-error a read-only key view cannot change
      map.keySet().delete(1)
      // @ts-expect-error a read-only key view cannot change
      map.keySet().removeAll([1])
      // @ts-expect-error a read-only key view cannot change
      map.keySet().retainAll([1])
      // @ts-expect-error a read-only key view cannot change
      map.keySet().removeIf(() => true)
      // @ts-expect-error a read-only key view cannot change
      map.keySet().clear()
      const entries = map.entrySet()
      // @ts-expect-error a read-only entry view cannot change
      entries.add(1)
      // @ts-expect-error a read-only entry view cannot change
      entries.addAll([1])
      // @ts-expect-error a read-only entry view cannot change
      entries.delete(1)
      // @ts-expect-error a read-only entry view cannot change
      entries.removeAll([1])
      // @ts-expect-error a read-only entry view cannot change
      entries.retainAll([1])
      // @ts-expect-error a read-only entry view cannot change
      entries.removeIf(() => true)
      // @ts-expect-error a read-only entry view cannot change
      entries.clear()
      // @ts-expect-error a read-only value view cannot change
      map.valueCollection().add(1)
      // @ts-expect-error a read-only value view cannot change
      map.valueCollection().addAll([1])
      // @ts-expect-error a read-only value view cannot change
      map.valueCollection().delete(1)
      // @ts-expect-error a read-only value view cannot change
      map.valueCollection().removeAll([1])
      // @ts-expect-error a read-only value view cannot change
      map.valueCollection().retainAll([1])
      // @ts-expect-error a read-only value view cannot change
      map.valueCollection().removeIf(() => true)
      // @ts-expect-error a read-only value view cannot change
      map.valueCollection().clear()
      // Typed, and refused at run time only:
      list.cursor().remove()
      list.listCursor(0).set(1)
      for (const entry of entries) entry.setValue(1)
    }
    expect(typeof typeChecks).toBe('function')
    const results: [
      ReadonlyList<number>,
      ReadonlySetCollection<number>,
      ReadonlyMapCollection<string, number>,
    ] = [listOf(1), setOf(1), mapOf(['a', 1])]
    expect(results.length).toBe(3)
  })

  it('keeps revision the same for life, refused changes included [018 S4-AC5]', () => {
    const list = listOf(1)
    const set = setOf(1)
    const map = mapOf(['a', 1])
    const before = [list.revision, set.revision, map.revision]
    caught(() => (list as never as ArrayList<number>).add(2))
    caught(() => (set as never as HashSet<number>).clear())
    caught(() => (map as never as HashMap<string, number>).set('b', 2))
    expect([list.revision, set.revision, map.revision]).toEqual(before)
  })

  it('refuses through every view and cursor, naming it [018 S4-AC2] [018 S4-AC6]', () => {
    const list = listOf(1, 2) as never as ArrayList<number>
    expect(() => list.removeAt(99)).toThrow(
      'ImmutableList.removeAt: the collection cannot be changed',
    )
    expect(() => list.removeIf(5 as never)).toThrow(UnsupportedOperationError)
    expect(() => list.cursor().remove()).toThrow(
      'ImmutableList.cursor.remove: the collection cannot be changed',
    )
    expect(() => list.listCursor(1).set(0)).toThrow(
      'ImmutableList.listCursor.set: the collection cannot be changed',
    )
    expect(() => list.subList(0, 1).clear()).toThrow(
      'ImmutableSubList.clear: the collection cannot be changed',
    )
    const map = mapOf(['a', 1]) as never as HashMap<string, number>
    expect(() => map.keySet().cursor().remove()).toThrow(
      'ImmutableMapKeySet.cursor.remove: the collection cannot be changed',
    )
    const [entry] = [...map.entrySet()]
    expect(() => entry?.setValue(2)).toThrow('MapEntry.setValue: the collection cannot be changed')
  })
})

describe('S5 — values like any other collection', () => {
  it('equals any list with equal elements in order, both ways, with equal hashes [018 S5-AC1]', () => {
    const list = listOf<unknown>(1, 'x', null)
    const peers = [
      new ArrayList<unknown>([1, 'x', null]),
      new ArrayList<unknown>([0, 1, 'x', null]).subList(1, 4),
      new ArrayList<unknown>([null, 'x', 1]).reversed(),
      copyOfList([1, 'x', null]),
    ]
    for (const peer of peers) {
      expect(list.equals(peer)).toBe(true)
      expect(peer.equals(list)).toBe(true)
      expect(hashCode(list)).toBe(hashCode(peer))
    }
    const numbers = listOf(1, 2, 3)
    for (const queue of [
      new ArrayDeque([1, 2, 3]),
      new PriorityQueue([1, 2, 3]),
      new LinkedList([1, 2, 3]),
    ]) {
      expect(numbers.equals(queue)).toBe(false)
      expect(queue.equals(numbers)).toBe(false)
    }
    for (const other of [
      new LinkedList<unknown>([1, 'x', null]),
      new HashSet<unknown>([1, 'x', null]),
      mapOf([1, 'x']),
      [1, 'x', null],
    ]) {
      expect(list.equals(other)).toBe(false)
      if (typeof (other as { equals?: unknown }).equals === 'function') {
        expect((other as { equals(o: unknown): boolean }).equals(list)).toBe(false)
      }
    }
  })

  it('equals any library set with the same members, both ways, with equal hashes under the same equality [018 S5-AC2]', () => {
    const set = setOf(1, 2, 3)
    for (const peer of [
      new HashSet([3, 2, 1]),
      new LinkedHashSet([2, 3, 1]),
      new TreeSet<number>([1, 2, 3]),
      copyOfSet([3, 1, 2]),
      mapOf([1, 0], [2, 0], [3, 0]).keySet(),
    ]) {
      expect(set.equals(peer)).toBe(true)
      expect(peer.equals(set)).toBe(true)
      expect(hashCode(set)).toBe(hashCode(peer))
    }
    const key = (s: string) => s.toLowerCase()
    const keyed = copyOfSet(['a', 'b'], { key })
    expect(hashCode(keyed)).toBe(hashCode(new HashSet(['A', 'b'], { key })))
    expect(keyed.equals(new HashSet(['a', 'b']))).toBe(true)
    expect(new HashSet(['a', 'b']).equals(keyed)).toBe(true)
    for (const other of [
      listOf(1, 2, 3),
      new ArrayDeque([1, 2, 3]),
      mapOf([1, 1]),
      new Set([1, 2, 3]),
    ]) {
      expect(set.equals(other)).toBe(false)
    }
  })

  it('equals any library map with equal mappings, both ways, with equal hashes [018 S5-AC3]', () => {
    const pairs: Array<[string, number]> = [
      ['a', 1],
      ['b', 2],
    ]
    const map = copyOfMap(pairs)
    for (const peer of [
      new HashMap(pairs),
      new LinkedHashMap(pairs),
      new TreeMap<string, number>(pairs),
      mapOf(['b', 2], ['a', 1]),
    ]) {
      expect(map.equals(peer)).toBe(true)
      expect(peer.equals(map)).toBe(true)
      expect(hashCode(map)).toBe(hashCode(peer))
    }
    for (const other of [setOf('a', 'b'), listOf('a', 'b'), new Map(pairs)]) {
      expect(map.equals(other)).toBe(false)
    }
  })

  it('answers the guards as the table says [018 S5-AC4]', () => {
    const guards = [
      isCollection,
      isSequencedCollection,
      isList,
      isSetCollection,
      isMapCollection,
      isQueue,
      isDeque,
      isSortedSet,
      isSortedMap,
    ]
    const answers = (value: unknown) => guards.map((guard) => guard(value))
    const list = [true, true, true, false, false, false, false, false, false]
    const set = [true, false, false, true, false, false, false, false, false]
    const values = [true, false, false, false, false, false, false, false, false]
    const map = [false, false, false, false, true, false, false, false, false]
    const l = listOf(1, 2)
    const m = mapOf(['a', 1])
    expect(answers(l)).toEqual(list)
    expect(answers(l.subList(0, 1))).toEqual(list)
    expect(answers(l.reversed())).toEqual(list)
    expect(answers(setOf(1))).toEqual(set)
    expect(answers(m.keySet())).toEqual(set)
    expect(answers(m.entrySet())).toEqual(set)
    expect(answers(m.valueCollection())).toEqual(values)
    expect(answers(m)).toEqual(map)
  })

  it('prints every result and view with its tag [018 S5-AC5]', () => {
    const l = listOf(1, 2)
    const m = mapOf(['a', 1])
    const shown: Array<[unknown, string, string]> = [
      [l, 'ImmutableList', 'ImmutableList(2) [1, 2]'],
      [l.subList(0, 1), 'ImmutableSubList', 'ImmutableSubList(1) [1]'],
      [l.reversed(), 'ImmutableReversedList', 'ImmutableReversedList(2) [2, 1]'],
      [setOf(1), 'ImmutableSet', 'ImmutableSet(1) {1}'],
      [m, 'ImmutableMap', "ImmutableMap(1) {'a' => 1}"],
      [m.keySet(), 'ImmutableMapKeySet', "ImmutableMapKeySet(1) {'a'}"],
      [m.entrySet(), 'ImmutableMapEntrySet', "ImmutableMapEntrySet(1) {'a' => 1}"],
      [m.valueCollection(), 'ImmutableMapValues', 'ImmutableMapValues(1) [1]'],
    ]
    for (const [value, tag, text] of shown) {
      expect(String(value)).toBe(text)
      expect(Object.prototype.toString.call(value)).toBe(`[object ${tag}]`)
      expect(inspect(value).startsWith(`${tag}(`)).toBe(true)
    }
    expect(inspect(m)).toBe("ImmutableMap(1) { 'a' => 1 }")
  })

  it('serialises like its mutable counterparts and makes mutable copies [018 S5-AC6]', () => {
    const list = listOf<unknown>(1, 'a')
    const set = setOf(1, 2)
    const map = mapOf(['a', 1])
    expect(JSON.stringify(list)).toBe(JSON.stringify(new ArrayList([1, 'a'])))
    expect(JSON.stringify(set)).toBe(JSON.stringify(new HashSet([1, 2])))
    expect(JSON.stringify(map)).toBe(JSON.stringify(new HashMap([['a', 1]])))
    expect(ArrayList.from(list).toArray()).toEqual([1, 'a'])
    expect(new HashSet(set).equals(set)).toBe(true)
    expect(new HashMap(map).equals(map)).toBe(true)
    expect([...new Set(set)]).toEqual([1, 2])
    expect([...new Map(map)]).toEqual([['a', 1]])
    expect(Array.from(list)).toEqual([1, 'a'])
    const key = (s: string) => s.toLowerCase()
    const copied = new HashSet(copyOfSet(['a'], { key }))
    expect(copied.has('A')).toBe(false) // the target's default equality
  })

  it('hands out fixed entries equal to any entry with an equal key and value; each value view equals only itself [018 S5-AC7]', () => {
    const map = mapOf(['a', 1])
    const entries: unknown[] = []
    map.entrySet().forEach((entry) => {
      entries.push(entry)
    })
    const cursor = map.entrySet().cursor()
    entries.push(cursor.next())
    entries.push(...map.entrySet())
    const [sourceEntry] = [...new HashMap([['a', 1]]).entrySet()]
    for (const entry of entries as Array<MapEntry<string, number>>) {
      expect(entry.value).toBe(1)
      expect(caught(() => entry.setValue(2))).toBeInstanceOf(UnsupportedOperationError)
      expect(entry.value).toBe(1)
      expect(entry.equals(sourceEntry)).toBe(true)
      expect(sourceEntry?.equals(entry)).toBe(true)
    }
    expect(map.valueCollection().equals(map.valueCollection())).toBe(false)
    const values = map.valueCollection()
    expect(values.equals(values)).toBe(true)
  })
})

describe('S6 — cost and contract', () => {
  it('builds in O(n) and reads in O(1), counted in key and hash calls [018 S6-AC1]', () => {
    let keyCalls = 0
    const set = copyOfSet(
      Array.from({ length: 1000 }, (_, i) => i),
      {
        key: (n) => {
          keyCalls++
          return n
        },
      },
    )
    expect(keyCalls).toBe(1000)
    keyCalls = 0
    expect(set.has(500)).toBe(true)
    expect(keyCalls).toBe(1)
    let hashCalls = 0
    const map = copyOfMap(
      Array.from({ length: 1000 }, (_, i) => [i, i] as const),
      {
        equivalence: {
          equals: (a, b) => a === b,
          hash: (n) => {
            hashCalls++
            return n
          },
        },
      },
    )
    expect(hashCalls).toBe(1000)
    hashCalls = 0
    expect(map.get(999)).toBe(999)
    expect(hashCalls).toBe(1)
    const list = copyOfList(Array.from({ length: 1000 }, (_, i) => i))
    expect(list.get(999)).toBe(999)
  })

  it('copies 1,000,000 elements without a stack overflow [018 S6-AC4]', () => {
    const many = Array.from({ length: 1_000_000 }, (_, i) => i)
    expect(copyOfList(many).size).toBe(1_000_000)
    expect(copyOfSet(many).size).toBe(1_000_000)
    expect(copyOfMap(many.map((i) => [i, i] as const)).size).toBe(1_000_000)
  })
})
