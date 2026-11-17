import { inspect } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HashMap } from '../src/collections/hash-map'
import { HashSet } from '../src/collections/hash-set'
import { LinkedHashMap, type LinkedHashMapOptions } from '../src/collections/linked-hash-map'
import { TreeMap } from '../src/collections/tree-map'
import {
  ConcurrentModificationError,
  type Equivalence,
  equalsSymbol,
  hashCode,
  hashCodeSymbol,
  IllegalArgumentError,
  IllegalStateError,
  isCollection,
  isMapCollection,
  isSequencedCollection,
  isSetCollection,
  isSortedMap,
  type KeyOf,
  type MapCollection,
  type MapEntry,
  NoSuchElementError,
  sameValueZeroEquivalence,
  UnsupportedOperationError,
  valueEquivalence,
} from '../src/index'
import type { SequencedMap } from '../src/interfaces/sequenced-map'
import { setBucketSeedSourceForTesting } from '../src/internal/engines/hash-table'
import { describeCollection } from './contracts/collection'
import { describeMapCollection } from './contracts/map'
import { describeSequencedCollection } from './contracts/sequenced'
import { describeSequencedMap } from './contracts/sequenced-map'
import { describeSequencedSet } from './contracts/sequenced-set'
import { describeSetCollection } from './contracts/set'
import { fixHashSeed } from './support/hash-seed'
import {
  runLruReferenceModel,
  runMapReferenceModel,
  runSequencedMapReferenceModel,
} from './support/reference-model'

fixHashSeed()
let nextBucketSeed = 0
beforeEach(() => {
  nextBucketSeed = 0x5eed
  setBucketSeedSourceForTesting(() => nextBucketSeed++)
})
afterEach(() => setBucketSeedSourceForTesting(undefined))

type AnyMap = LinkedHashMap<unknown, unknown>
type Options = LinkedHashMapOptions<unknown, unknown>

function caught(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  return undefined
}

function messageOf(fn: () => unknown): string {
  return (caught(fn) as Error).message
}

/** A key that returns primitives unchanged and a distinct symbol per object or function. */
function identityKey(): (value: unknown) => unknown {
  const ids = new WeakMap<object, symbol>()
  return (value) => {
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return value
    let id = ids.get(value as object)
    if (id === undefined) {
      id = Symbol('id')
      ids.set(value as object, id)
    }
    return id
  }
}

/** A user-written SameValueZero equivalence: a new object, so the map uses its buckets. */
function sameValueZeroUser(): Equivalence<unknown> {
  return {
    equals: (a, b) => sameValueZeroEquivalence.equals(a, b),
    hash: (value) => sameValueZeroEquivalence.hash(value),
  }
}

type Path = readonly [string, () => Options]

/** The three ways a map can compare keys: native, by derived key, by an equivalence. */
const PATHS: readonly Path[] = [
  ['default', () => ({})],
  ['key', () => ({ key: identityKey() as KeyOf<unknown> })],
  ['equivalence', () => ({ equivalence: sameValueZeroUser() })],
]

function makeOn(
  path: Path,
  initial?: Iterable<readonly [unknown, unknown]>,
  extra?: Options,
): AnyMap {
  return new LinkedHashMap<unknown, unknown>(initial, { ...path[1](), ...extra })
}

/** `k → 'v' + k` pairs. */
function pairs(...keys: unknown[]): Array<[unknown, unknown]> {
  return keys.map((k): [unknown, unknown] => [k, `v${String(k)}`])
}

/** A map with counting `key`, `hash` and `equals` functions, on the keyed or the bucket path. */
function counted(
  kind: 'key' | 'equivalence',
  extra?: Options,
): { map: AnyMap; calls: unknown[]; equalsCalls: () => number } {
  const calls: unknown[] = []
  let equalsCalls = 0
  const options: Options =
    kind === 'key'
      ? { key: (k) => returning(calls.push(k), k as string) }
      : {
          equivalence: {
            equals: (a, b) => returning(equalsCalls++, a === b),
            hash: (k) => returning(calls.push(k), sameValueZeroEquivalence.hash(k)),
          },
        }
  return {
    map: new LinkedHashMap<unknown, unknown>({ ...options, ...extra }),
    calls,
    equalsCalls: () => equalsCalls,
  }
}

/** Returns `result`; `effect` is evaluated first, for callbacks that do something and answer. */
function returning<T>(_effect: unknown, result: T): T {
  return result
}

const keysOf = (map: { keys(): Iterable<unknown> }): unknown[] => [...map.keys()]

describe('LinkedHashMap — a HashMap with an order', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      it('reads, writes and upserts as HashMap does, with LinkedHashMap in names [014 S1-AC1]', () => {
        const map = makeOn(path, pairs('a', 'b'))
        expect(map.get('a')).toBe('va')
        expect(map.get('z')).toBeUndefined()
        expect(map.getOrDefault('z', 0)).toBe(0)
        expect(map.has('b')).toBe(true)
        expect(map.containsValue('vb')).toBe(true)
        expect(map.set('c', 3)).toBe(map)
        expect(map.put('c', 4)).toBe(3)
        expect(map.put('d', 5)).toBeUndefined()
        expect(map.replace('z', 1)).toBeUndefined()
        expect(map.replace('d', 6)).toBe(5)
        expect(map.getOrInsert('e', 7)).toBe(7)
        expect(map.getOrInsert('e', 8)).toBe(7)
        expect(map.getOrInsertComputed('f', (k) => `${String(k)}!`)).toBe('f!')
        expect(map.compute('f', () => undefined)).toBeUndefined()
        expect(map.computeIfPresent('z', () => 1)).toBeUndefined()
        expect(map.computeIfPresent('e', (v) => (v as number) + 1)).toBe(8)
        expect(map.merge('e', 2, (a, b) => (a as number) + (b as number))).toBe(10)
        expect(map.merge('g', 1, () => 0)).toBe(1)
        expect(map.delete('g')).toBe(true)
        expect(map.delete('g')).toBe(false)
        expect(map.remove('e')).toBe(10)
        map.replaceAll((v, k) => `${String(k)}=${String(v)}`)
        expect(map.toJSON()).toEqual([
          ['a', 'a=va'],
          ['b', 'b=vb'],
          ['c', 'c=4'],
          ['d', 'd=6'],
        ])
        expect(() => map.compute('a', 1 as never)).toThrow(TypeError)
        expect(messageOf(() => map.compute('a', 1 as never))).toMatch(/^LinkedHashMap\.compute: /)
        map.clear()
        expect(map.size).toBe(0)
      })

      it('stores null and undefined keys and turns -0 into 0 [014 S1-AC1]', () => {
        const map = makeOn(path, [
          [null, 1],
          [undefined, 2],
          [-0, 3],
        ])
        expect(map.get(null)).toBe(1)
        expect(map.get(undefined)).toBe(2)
        expect(Object.is(keysOf(map)[2], 0)).toBe(true)
        expect(map.get(0)).toBe(3)
        map.putFirst(-0, 4)
        expect(Object.is(keysOf(map)[0], 0)).toBe(true)
        expect(map.size).toBe(3)
      })

      it('throws ConcurrentModificationError when a compute callback adds or removes mappings, keeping its changes [014 S1-AC1]', () => {
        const map = makeOn(path, pairs('a'))
        expect(() =>
          map.compute('a', (_v, _k, m) => {
            m.set('b', 1)
            return 'x'
          }),
        ).toThrow(ConcurrentModificationError)
        expect(map.toJSON()).toEqual([
          ['a', 'va'],
          ['b', 1],
        ])
      })

      it('gives live entries that read a removed mapping and refuse to write it [014 S1-AC1]', () => {
        const map = makeOn(path, pairs('a', 'b'))
        const entry = [...map.entrySet()][0] as MapEntry<unknown, unknown>
        expect(entry.setValue(1)).toBe('va')
        expect(map.get('a')).toBe(1)
        map.delete('a')
        expect(entry.value).toBe(1)
        expect(() => entry.setValue(2)).toThrow(IllegalStateError)
        map.set('a', 3)
        expect(entry.value).toBe(3)
      })

      it('iterates in insertion order on every surface: a present key keeps its place, a key deleted and set again goes to the end [014 S1-AC2]', () => {
        const map = makeOn(path, pairs('a', 'b', 'c'))
        map.set('a', 1)
        map.delete('b')
        map.set('b', 2)
        const keys = ['a', 'c', 'b']
        const values = [1, 'vc', 2]
        expect(keysOf(map)).toEqual(keys)
        expect([...map.values()]).toEqual(values)
        expect([...map.entries()]).toEqual([
          ['a', 1],
          ['c', 'vc'],
          ['b', 2],
        ])
        expect([...map]).toEqual([...map.entries()])
        const seen: unknown[] = []
        map.forEach((_v, k) => {
          seen.push(k)
        })
        expect(seen).toEqual(keys)
        expect(String(map)).toBe("LinkedHashMap(3) {'a' => 1, 'c' => 'vc', 'b' => 2}")
        expect(map.toJSON().map((p) => p[0])).toEqual(keys)
        expect([...map.keySet()]).toEqual(keys)
        expect([...map.valueCollection()]).toEqual(values)
        expect([...map.entrySet()].map((e) => e.key)).toEqual(keys)
      })
    })
  }

  it('compares keys with SameValueZero by default, exactly as a native Map [014 S1-AC1]', () => {
    const a = {}
    const input: Array<[unknown, number]> = [
      [a, 1],
      [{}, 2],
      [Number.NaN, 3],
      [Number.NaN, 4],
      [0, 5],
      [-0, 6],
      ['1', 7],
      [1, 8],
    ]
    expect([...new LinkedHashMap(input)]).toEqual([...new Map(input)])
  })

  for (const [label, options] of [
    ['default', () => undefined],
    ['key', () => ({ key: (k: number) => k })],
    [
      'equivalence',
      () => ({
        equivalence: {
          equals: (a: number, b: number) => a === b,
          hash: (k: number) => sameValueZeroEquivalence.hash(k),
        },
      }),
    ],
    [
      'equivalence with few hashes',
      () => ({
        equivalence: { equals: (a: number, b: number) => a === b, hash: (k: number) => k % 6 },
      }),
    ],
  ] as const) {
    it(`matches a native Map in insertion order across growth and shrinking (${label}) [014 S1-AC1] [014 S1-AC2] [014 S3-AC5]`, () => {
      for (const seed of [1, 2, 3]) {
        runMapReferenceModel({
          seed,
          steps: 1500,
          keys: 300,
          bulk: true,
          make: () =>
            new LinkedHashMap<number, number>(
              undefined,
              (options as () => LinkedHashMapOptions<number, number> | undefined)(),
            ),
        })
      }
    }, 60000)
  }
})

describe('LinkedHashMap — both ends', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      it('firstEntry and lastEntry return live entries of the ends, or undefined when empty, without moving anything [014 S2-AC1]', () => {
        for (const accessOrder of [false, true]) {
          const map = makeOn(path, pairs('a', 'b', 'c'), { accessOrder })
          const revision = map.revision
          const first = map.firstEntry() as MapEntry<unknown, unknown>
          const last = map.lastEntry() as MapEntry<unknown, unknown>
          expect([first.key, first.value]).toEqual(['a', 'va'])
          expect([last.key, last.value]).toEqual(['c', 'vc'])
          expect(keysOf(map)).toEqual(['a', 'b', 'c'])
          expect(map.revision).toBe(revision)
          map.set('a', 1)
          expect(first.value).toBe(1)
          expect(makeOn(path).firstEntry()).toBeUndefined()
          expect(makeOn(path).lastEntry()).toBeUndefined()
        }
      })

      it('pollFirstEntry and pollLastEntry remove the ends and return their entries, or undefined when empty [014 S2-AC2]', () => {
        const map = makeOn(path, pairs('a', 'b', 'c'))
        const first = map.pollFirstEntry() as MapEntry<unknown, unknown>
        const last = map.pollLastEntry() as MapEntry<unknown, unknown>
        expect([first.key, first.value, last.key, last.value]).toEqual(['a', 'va', 'c', 'vc'])
        expect(keysOf(map)).toEqual(['b'])
        map.clear()
        expect(map.pollFirstEntry()).toBeUndefined()
        expect(map.pollLastEntry()).toBeUndefined()
      })

      it('returns the same live (map, key) handles from the ends and polls: readable but not writable while the key is absent [014 S2-AC3]', () => {
        const map = makeOn(path, pairs('a', 'b'))
        const polled = map.pollFirstEntry() as MapEntry<unknown, unknown>
        expect(polled.value).toBe('va')
        expect(() => polled.setValue(1)).toThrow(IllegalStateError)
        map.set('a', 2)
        expect(polled.value).toBe(2)
        expect(polled.setValue(3)).toBe(2)
        expect(map.get('a')).toBe(3)
        const last = map.lastEntry() as MapEntry<unknown, unknown>
        map.putFirst('a', 4)
        expect(last.key).toBe('a')
        expect(last.value).toBe(4)
        expect(String(last)).toBe("'a' => 4")
        expect(last.equals([...new HashMap([['a', 4]]).entrySet()][0])).toBe(true)
      })

      it('putFirst and putLast insert an absent key at that end, or move the present mapping there with the stored key, and return the map [014 S2-AC4]', () => {
        const map = makeOn(path, pairs('b'))
        expect(map.putFirst('a', 1)).toBe(map)
        expect(map.putLast('c', 3)).toBe(map)
        expect(map.toJSON()).toEqual([
          ['a', 1],
          ['b', 'vb'],
          ['c', 3],
        ])
        map.putFirst('c', 4)
        map.putLast('a', 5)
        expect(map.toJSON()).toEqual([
          ['c', 4],
          ['b', 'vb'],
          ['a', 5],
        ])
      })

      it('putFirst and putLast keep the stored key object, call key or hash once, and refuse a callback that changes the map [014 S2-AC5]', () => {
        if (path[0] === 'default') return
        type Id = { id: number }
        const options: LinkedHashMapOptions<Id, string> =
          path[0] === 'key'
            ? { key: (k) => k.id }
            : { equivalence: { equals: (a, b) => a.id === b.id, hash: (k) => k.id } }
        const map = new LinkedHashMap<Id, string>(options)
        const one = { id: 1 }
        map.set(one, 'a').set({ id: 2 }, 'b')
        map.putLast({ id: 1 }, 'c')
        expect([...map.keys()][1]).toBe(one)
        expect(map.get(one)).toBe('c')
      })

      it('changes revision for inserts, removals, moves and value writes but not for calls that change nothing [014 S2-AC6]', () => {
        const map = makeOn(path, pairs('a', 'b'))
        let revision = map.revision
        const changed = (): boolean => {
          const now = map.revision !== revision
          revision = map.revision
          return now
        }
        map.get('a')
        map.has('z')
        map.delete('z')
        map.replace('z', 1)
        map.firstEntry()
        expect(changed()).toBe(false)
        map.putFirst('z', 0)
        expect(changed()).toBe(true)
        map.putLast('z', 0)
        expect(changed()).toBe(true)
        map.set('a', 1)
        expect(changed()).toBe(true)
        map.pollFirstEntry()
        expect(changed()).toBe(true)
        map.clear()
        expect(changed()).toBe(true)
        map.clear()
        expect(changed()).toBe(false)
      })

      it('treats putFirst of the first key and putLast of the last as a value write: revision changes, open iterators are unaffected, callbacks see no change [014 S2-AC6]', () => {
        const map = makeOn(path, pairs('a', 'b', 'c'))
        const before = map.keys()
        const revision = map.revision
        map.putFirst('a', 1)
        map.putLast('c', 3)
        expect(map.revision).not.toBe(revision)
        expect([...before]).toEqual(['a', 'b', 'c'])
        expect(
          map.compute('b', () => {
            map.putFirst('a', 2)
            return 'x'
          }),
        ).toBe('x')
        expect(() =>
          map.compute('b', () => {
            map.putFirst('c', 2)
            return 'y'
          }),
        ).toThrow(ConcurrentModificationError)
        expect(keysOf(map)).toEqual(['c', 'a', 'b'])
      })
    })
  }

  it('calls no key, equals or hash function in the ends and polls, even after a stored key changed [014 S2-AC7]', () => {
    for (const kind of ['key', 'equivalence'] as const) {
      type Box = { n: number }
      const calls = { n: 0 }
      const options: LinkedHashMapOptions<Box, number> =
        kind === 'key'
          ? { key: (k) => returning(calls.n++, k.n) }
          : {
              equivalence: {
                equals: (a, b) => returning(calls.n++, a.n === b.n),
                hash: (k) => returning(calls.n++, k.n),
              },
            }
      const boxes = [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }]
      const map = new LinkedHashMap<Box, number>(
        boxes.map((b): [Box, number] => [b, b.n]),
        options,
      )
      for (const box of boxes) box.n += 100
      calls.n = 0
      map.firstEntry()
      map.lastEntry()
      expect((map.pollFirstEntry() as MapEntry<Box, number>).value).toBe(1)
      expect((map.pollLastEntry() as MapEntry<Box, number>).value).toBe(4)
      map.reversed().pollFirstEntry()
      expect(calls.n, kind).toBe(0)
      expect(map.size).toBe(1)
    }
  })

  it('calls the key function once for the argument of putFirst and putLast [014 S2-AC5]', () => {
    for (const kind of ['key', 'equivalence'] as const) {
      const { map, calls } = counted(kind)
      map.set('a', 1).set('b', 2)
      calls.length = 0
      map.putFirst('b', 3)
      map.putLast('c', 4)
      expect(calls, kind).toEqual(['b', 'c'])
    }
  })

  it('throws ConcurrentModificationError when a key or hash function of putFirst changes the map, with nothing inserted or moved [014 S2-AC5]', () => {
    for (const kind of ['key', 'equivalence'] as const) {
      let target: AnyMap | undefined
      const sneaky = (k: unknown) => {
        if (k === 'x' && target !== undefined) target.delete('a')
        return k
      }
      const options: Options =
        kind === 'key'
          ? { key: sneaky as KeyOf<unknown> }
          : {
              equivalence: {
                equals: (a, b) => a === b,
                hash: (k) => sameValueZeroEquivalence.hash(sneaky(k)),
              },
            }
      const map = new LinkedHashMap<unknown, unknown>(pairs('a', 'b', 'x'), options)
      target = map
      expect(() => map.putFirst('x', 1)).toThrow(ConcurrentModificationError)
      expect(map.toJSON()).toEqual(pairs('b', 'x'))
    }
  })
})

describe('LinkedHashMap — access order', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      const lru = (...keys: unknown[]) => makeOn(path, pairs(...keys), { accessOrder: true })

      it('moves a present mapping to the end on every read and write of its key, through the map or its reversed view [014 S3-AC1]', () => {
        const calls: Array<[string, (map: SequencedMap<unknown, unknown>) => unknown]> = [
          ['get', (m) => m.get('a')],
          ['getOrDefault', (m) => m.getOrDefault('a', 0)],
          ['getOrInsert', (m) => m.getOrInsert('a', 0)],
          ['getOrInsertComputed', (m) => m.getOrInsertComputed('a', () => 0)],
          ['set', (m) => m.set('a', 1)],
          ['put', (m) => m.put('a', 1)],
          ['replace', (m) => m.replace('a', 1)],
          ['compute', (m) => m.compute('a', () => 1)],
          ['computeIfPresent', (m) => m.computeIfPresent('a', () => 1)],
          ['merge', (m) => m.merge('a', 1, () => 2)],
          ['putAll', (m) => m.putAll([['a', 1]])],
        ]
        for (const [name, call] of calls) {
          for (const reversed of [false, true]) {
            const map = lru('a', 'b', 'c')
            call(reversed ? map.reversed() : map)
            expect(keysOf(map), `${name}${reversed ? ' (reversed)' : ''}`).toEqual(['b', 'c', 'a'])
          }
        }
      })

      it('counts the overwrite after getOrInsertComputed’s second lookup and present keys of the constructor and from as accesses [014 S3-AC1]', () => {
        const map = lru('a', 'b', 'c')
        map.getOrInsertComputed('z', () => {
          map.set('z', 0)
          map.set('d', 0)
          return 1
        })
        expect(keysOf(map)).toEqual(['a', 'b', 'c', 'd', 'z'])
        const input = pairs('a', 'b', 'a')
        expect(keysOf(makeOn(path, input, { accessOrder: true }))).toEqual(['b', 'a'])
        expect(keysOf(LinkedHashMap.from(input, { ...path[1](), accessOrder: true }))).toEqual([
          'b',
          'a',
        ])
      })

      it('places a mapping where putFirst or putLast say, without an access move [014 S3-AC1]', () => {
        const map = lru('a', 'b', 'c')
        map.putFirst('c', 1)
        expect(keysOf(map)).toEqual(['c', 'a', 'b'])
        map.reversed().putLast('b', 2)
        expect(keysOf(map)).toEqual(['b', 'c', 'a'])
      })

      it('never moves a mapping on has, containsValue, iteration, views, ends, entries, replaceAll, equals, hashing or output [014 S3-AC2]', () => {
        const map = lru('a', 'b', 'c')
        const order = keysOf(map)
        map.has('a')
        map.containsValue('va')
        for (const _ of map) void _
        map.forEach((v) => {
          void v
        })
        map.keySet().has('a')
        map.entrySet().has([...new HashMap([['a', 'va']]).entrySet()][0] as never)
        map.valueCollection().has('va')
        map.reversed().keySet().has('a')
        map.firstEntry()
        map.lastEntry()
        const entry = [...map.entrySet()][0] as MapEntry<unknown, unknown>
        void entry.value
        entry.setValue('va')
        map.replaceAll((v) => v)
        hashCode(map)
        String(map)
        JSON.stringify(map)
        inspect(map)
        map.toJSON()
        expect(keysOf(map)).toEqual(order)
      })

      it('never reorders an access-ordered map when maps are compared, either way round [014 S3-AC2]', () => {
        const map = lru('a', 'b', 'c')
        const twin = lru('c', 'b', 'a')
        const others: unknown[] = [
          new HashMap(pairs('c', 'a', 'b')),
          twin,
          map.reversed(),
          new TreeMap(pairs('a', 'b', 'c') as Array<[string, string]>),
        ]
        for (const other of others) {
          expect(map.equals(other)).toBe(true)
          expect((other as MapCollection<unknown, unknown>).equals(map)).toBe(true)
        }
        expect(keysOf(map)).toEqual(['a', 'b', 'c'])
        expect(keysOf(twin)).toEqual(['c', 'b', 'a'])
      })

      it('changes revision for an access move and nothing that callbacks see [014 S3-AC3]', () => {
        const map = lru('a', 'b', 'c')
        let revision = map.revision
        map.get('c')
        expect(map.revision).toBe(revision)
        map.get('a')
        expect(map.revision).not.toBe(revision)
        revision = map.revision
        map.set('a', 1)
        expect(map.revision).not.toBe(revision)
        expect(
          map.compute('b', (v, _k, m) => returning([m.get('c'), m.get('b')], `${String(v)}!`)),
        ).toBe('vb!')
        expect(map.merge('c', 1, (v, _x, _k, m) => returning(m.get('a'), v))).toBe('vc')
        map.replaceAll((v, _k, m) => returning(m.get('a'), v))
        expect(map.computeIfPresent('a', (v, _k, m) => returning(m.get('a'), v))).toBe(1)
        expect(map.getOrInsertComputed('z', (k) => returning(map.get('a'), k))).toBe('z')
        expect(map.size).toBe(4)
      })

      it('never throws for key, equals or hash functions that read the map [014 S3-AC3]', () => {
        if (path[0] === 'default') return
        let self: AnyMap | undefined
        const read = (k: unknown) => {
          if (self !== undefined && k !== 'probe') self.get('probe')
          return k
        }
        const options: Options =
          path[0] === 'key'
            ? { key: read as KeyOf<unknown>, accessOrder: true }
            : {
                accessOrder: true,
                equivalence: {
                  equals: (a, b) => a === b,
                  hash: (k) => sameValueZeroEquivalence.hash(read(k)),
                },
              }
        const map = new LinkedHashMap<unknown, unknown>(pairs('a', 'probe', 'b'), options)
        self = map
        expect(map.get('a')).toBe('va')
        map.set('c', 1)
        map.putFirst('b', 2)
        expect(keysOf(map)).toEqual(['b', 'a', 'c', 'probe'])
      })

      it('decides view removeIf, removeAll and retainAll by mapping, whatever the predicate reads [014 S3-AC3]', () => {
        const map = lru('a', 'b', 'c', 'd')
        expect(
          map.keySet().removeIf((k) => {
            map.get('d')
            map.get('a')
            return k === 'b' || k === 'd'
          }),
        ).toBe(true)
        expect(keysOf(map)).toEqual(['c', 'a'])
        expect(map.valueCollection().removeIf((v) => returning(map.get('c'), v === 'vc'))).toBe(
          true,
        )
        expect(keysOf(map)).toEqual(['a'])
        const again = lru('a', 'b', 'c')
        expect(again.entrySet().removeIf((e) => returning(again.get(e.key), e.key === 'a'))).toBe(
          true,
        )
        expect(keysOf(again)).toEqual(['b', 'c'])
      })

      it('never returns a mapping twice to an open loop after an access move [014 S3-AC4]', () => {
        const map = lru('a', 'b', 'c', 'd')
        const seen: unknown[] = []
        for (const k of map.keys()) {
          seen.push(k)
          map.get(k)
        }
        expect(seen).toEqual(['a', 'b', 'c', 'd'])

        const forward = lru('a', 'b', 'c', 'd')
        const loop: unknown[] = []
        for (const k of forward.keys()) {
          loop.push(k)
          if (k === 'a') forward.get('b') // unvisited: visited once at its new place
          if (k === 'c') forward.get('c') // the last returned: continues from its old successor
        }
        expect(loop).toEqual(['a', 'c', 'd', 'b'])

        const backward = lru('a', 'b', 'c', 'd')
        const back: unknown[] = []
        for (const k of backward.reversed().keys()) {
          back.push(k)
          if (k === 'd') backward.get('b') // unvisited on a reversed loop: skipped
        }
        expect(back).toEqual(['d', 'c', 'a'])
      })

      it('does not return twice a mapping a cursor reached with hasNext, and its remove removes it from its new place [014 S3-AC4]', () => {
        const map = lru('a', 'b', 'c')
        const cursor = map.keySet().cursor()
        expect(cursor.next()).toBe('a')
        expect(cursor.hasNext()).toBe(true)
        map.get('b')
        expect(cursor.next()).toBe('b')
        cursor.remove()
        expect(keysOf(map)).toEqual(['a', 'c'])
        expect(cursor.next()).toBe('c')
        expect(cursor.hasNext()).toBe(false)
      })

      it('visits only new mappings after clear, and a visited mapping again after an explicit move [014 S3-AC4]', () => {
        const map = lru('a', 'b', 'c')
        const loop: unknown[] = []
        for (const k of map.keys()) {
          loop.push(k)
          if (loop.length === 1) {
            map.get('a')
            map.putFirst('a', 1)
            map.putLast('a', 2)
          }
        }
        expect(loop).toEqual(['a', 'b', 'c', 'a'])
        const cleared = lru('a', 'b')
        const it = cleared.keys()
        expect(it.next().value).toBe('a')
        cleared.clear()
        cleared.set('x', 1).set('y', 2)
        cleared.get('x')
        expect([...it]).toEqual(['y', 'x'])
      })

      it('never moves mappings on access in insertion order (the default) [014 S3-AC5]', () => {
        const map = makeOn(path, pairs('a', 'b', 'c'))
        map.get('a')
        map.set('a', 1)
        map.compute('a', () => 2)
        map.merge('a', 1, () => 3)
        expect(keysOf(map)).toEqual(['a', 'b', 'c'])
      })
    })
  }
})

/** A bounded map on `path` whose `onEvict` records `[key, value]` pairs and checks its arguments. */
function bounded(
  path: Path,
  maxSize: number,
  initial?: Iterable<readonly [unknown, unknown]>,
  extra?: Options,
): { map: AnyMap; evicted: Array<[unknown, unknown]> } {
  const evicted: Array<[unknown, unknown]> = []
  let self: AnyMap | undefined
  const map = new LinkedHashMap<unknown, unknown>(initial, {
    ...path[1](),
    maxSize,
    onEvict(this: unknown, value, key, owner) {
      expect(this).toBeUndefined()
      if (self !== undefined) expect(owner).toBe(self)
      evicted.push([key, value])
    },
    ...extra,
  })
  self = map
  return { map, evicted }
}

describe('LinkedHashMap — bulk input', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      it('reads the whole input first, then sets each pair in order; a repeated key keeps its first place with the last value, or moves to the end in access order [014 S1-AC3]', () => {
        const input = [...pairs('a', 'b'), ['a', 1] as [unknown, unknown]]
        const make = [
          (o: Options) => new LinkedHashMap<unknown, unknown>(input, o),
          (o: Options) => LinkedHashMap.from(input, o),
          (o: Options) => {
            const map = new LinkedHashMap<unknown, unknown>(o)
            map.putAll(input)
            return map
          },
        ]
        for (const build of make) {
          expect(build(path[1]()).toJSON()).toEqual([
            ['a', 1],
            ['b', 'vb'],
          ])
          expect(build({ ...path[1](), accessOrder: true }).toJSON()).toEqual([
            ['b', 'vb'],
            ['a', 1],
          ])
        }
        let calls = 0
        const bad = [...pairs('a'), 'oops'] as never
        for (const build of [
          () => new LinkedHashMap(bad, { maxSize: 1, onEvict: () => calls++ }),
          () => LinkedHashMap.from(bad, { maxSize: 1, onEvict: () => calls++ }),
          () => new LinkedHashMap({ maxSize: 1, onEvict: () => calls++ }).putAll(bad),
        ]) {
          expect(build).toThrow(TypeError)
        }
        const target = makeOn(path, pairs('z'))
        expect(() => target.putAll(bad)).toThrow(TypeError)
        expect(target.toJSON()).toEqual(pairs('z'))
        expect(calls).toBe(0)
      })

      it('never takes options from a source map [014 S1-AC3]', () => {
        const source = makeOn(path, pairs('a', 'b', 'c'), { accessOrder: true, maxSize: 3 })
        const copy = new LinkedHashMap(source)
        copy.get('a')
        copy.set('d', 1)
        expect(keysOf(copy)).toEqual(['a', 'b', 'c', 'd'])
        expect(keysOf(LinkedHashMap.from(source))).toEqual(['a', 'b', 'c'])
      })
    })
  }
})

describe('LinkedHashMap — bounded size and eviction', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      it('evicts from the front past maxSize before the call returns, never the mapping just inserted [014 S4-AC1]', () => {
        const { map, evicted } = bounded(path, 2, pairs('a', 'b'))
        map.set('c', 1)
        expect(keysOf(map)).toEqual(['b', 'c'])
        expect(evicted).toEqual([['a', 'va']])
        map.putFirst('d', 2)
        expect(keysOf(map)).toEqual(['d', 'c'])
        map.reversed().set('e', 3) // a new key through the view goes to the map's front
        expect(keysOf(map)).toEqual(['e', 'c'])
        const one = bounded(path, 1, pairs('a')).map
        one.putFirst('b', 1)
        expect(keysOf(one)).toEqual(['b'])
        const many = bounded(path, 2)
        many.map.putAll(pairs('a', 'b', 'c', 'd'))
        expect(keysOf(many.map)).toEqual(['c', 'd'])
        expect(many.evicted.map((p) => p[0])).toEqual(['a', 'b'])
      })

      it('never evicts on value writes or moves [014 S4-AC1]', () => {
        const { map, evicted } = bounded(path, 2, pairs('a', 'b'))
        map.set('a', 1)
        map.putFirst('b', 2)
        map.putLast('b', 3)
        map.compute('a', () => 4)
        expect(map.size).toBe(2)
        expect(evicted).toEqual([])
      })

      it('calls onEvict(value, key, map) once per evicted mapping, in order, with this undefined and the map itself, and never for removals [014 S4-AC2]', () => {
        const { map, evicted } = bounded(path, 2, pairs('a', 'b'))
        map.reversed().set('c', 1)
        map.valueCollection().getFirst()
        map.set('d', 2).set('e', 3)
        expect(evicted.map((p) => p[0])).toEqual(['a', 'c', 'b'])
        evicted.length = 0
        map.delete('d')
        map.remove('e')
        map.set('f', 1).set('g', 2)
        map.pollFirstEntry()
        map.pollLastEntry()
        map.set('h', 1)
        map.keySet().delete('h')
        map.set('i', 1)
        map.valueCollection().removeIf(() => true)
        map.set('j', 1)
        map.replace('j', 2)
        map.clear()
        expect(evicted).toEqual([])
      })

      it('delivers evictions caused inside a callback after the outer call, and a call on another map delivers its own queue at once [014 S4-AC2]', () => {
        const log: string[] = []
        const options = (name: string): Options => ({
          ...path[1](),
          maxSize: 1,
          onEvict: (_v, key) => log.push(`${name}:${String(key)}`),
        })
        const map = new LinkedHashMap<unknown, unknown>(pairs('a'), options('m'))
        const other = new LinkedHashMap<unknown, unknown>(pairs('x'), options('o'))
        map.getOrInsertComputed('z', () => {
          map.set('b', 1) // evicts a: queued
          log.push('after set')
          return 0
        })
        expect(log).toEqual(['after set', 'm:a', 'm:b'])
        log.length = 0
        map.set('c', 1)
        expect(log).toEqual(['m:z'])
        log.length = 0
        const chained = new LinkedHashMap<unknown, unknown>(pairs('p'), {
          ...path[1](),
          maxSize: 1,
          onEvict: (_v, key) => {
            log.push(`c:${String(key)}`)
            other.set('y', 1)
            log.push('other set')
          },
        })
        chained.set('q', 1)
        expect(log).toEqual(['c:p', 'o:x', 'other set'])
      })

      it('queues evictions caused by a key function until the outer call ends [014 S4-AC2]', () => {
        if (path[0] === 'default') return
        const log: string[] = []
        let self: AnyMap | undefined
        const inner = (k: unknown) => {
          if (self !== undefined && k === 'trigger') {
            self.set('inner', 1)
            log.push('after set')
          }
          return k
        }
        const options: Options =
          path[0] === 'key'
            ? { key: inner as KeyOf<unknown> }
            : {
                equivalence: {
                  equals: (a, b) => a === b,
                  hash: (k) => sameValueZeroEquivalence.hash(inner(k)),
                },
              }
        const map = new LinkedHashMap<unknown, unknown>(pairs('a'), {
          ...options,
          maxSize: 1,
          onEvict: (_v, key) => log.push(String(key)),
        })
        self = map
        expect(() => map.get('trigger')).toThrow(ConcurrentModificationError)
        expect(log).toEqual(['after set', 'a'])
      })

      it('delivers once after the last pair of putAll, the constructor and from [014 S4-AC3]', () => {
        const seenDuring: number[] = []
        let delivered = 0
        const options = (): Options => ({
          ...path[1](),
          maxSize: 1,
          onEvict: () => delivered++,
        })
        const watch = (keys: string[]): Array<[unknown, unknown]> =>
          keys.map((k): [unknown, unknown] => [k, returning(seenDuring.push(delivered), k)])
        new LinkedHashMap<unknown, unknown>(watch(['a', 'b', 'c']), options())
        expect(delivered).toBe(2)
        LinkedHashMap.from(watch(['a', 'b', 'c']), options())
        expect(delivered).toBe(4)
        const map = new LinkedHashMap<unknown, unknown>(options())
        map.putAll(watch(['a', 'b', 'c']))
        expect(delivered).toBe(6)
        expect(seenDuring.every((n) => n % 2 === 0)).toBe(true)
      })

      it('delivers before a call’s own error, drops the rest when onEvict throws, and lets the call’s own error win [014 S4-AC3]', () => {
        const evicted: unknown[] = []
        const map = new LinkedHashMap<unknown, unknown>(pairs('a', 'b'), {
          ...path[1](),
          maxSize: 2,
          onEvict: (_v, key) => evicted.push(key),
        })
        expect(() =>
          map.compute('a', () => {
            map.set('c', 1)
            return 'x'
          }),
        ).toThrow(ConcurrentModificationError)
        expect(evicted).toEqual(['a'])

        const boom = new Error('boom')
        const seen: unknown[] = []
        const failing = new LinkedHashMap<unknown, unknown>(pairs('a', 'b'), {
          ...path[1](),
          maxSize: 2,
          onEvict: (_v, key) => {
            seen.push(key)
            throw boom
          },
        })
        expect(() => failing.putAll(pairs('c', 'd'))).toThrow(boom)
        expect(seen).toEqual(['a'])
        expect(keysOf(failing)).toEqual(['c', 'd'])
        expect(() =>
          failing.compute('c', () => {
            failing.set('e', 1)
            return 'x'
          }),
        ).toThrow(ConcurrentModificationError)
        expect(keysOf(failing)).toEqual(['d', 'e'])
        expect(
          () =>
            new LinkedHashMap(pairs('a', 'b', 'c'), {
              maxSize: 2,
              onEvict: () => {
                throw boom
              },
            }),
        ).toThrow(boom)
        expect(() =>
          LinkedHashMap.from(pairs('a', 'b', 'c'), {
            maxSize: 2,
            onEvict: () => {
              throw boom
            },
          }),
        ).toThrow(boom)
      })

      it('stays consistent and within maxSize when onEvict re-inserts, refills or clears, delivering what it causes from the same queue [014 S4-AC4]', () => {
        const log: unknown[] = []
        let mode = 'reinsert'
        let self: AnyMap | undefined
        const map = new LinkedHashMap<unknown, unknown>(pairs('a', 'b'), {
          ...path[1](),
          maxSize: 2,
          onEvict: (value, key) => {
            log.push(key)
            const m = self as AnyMap
            if (mode === 'reinsert' && key === 'a') m.set(key, value)
            if (mode === 'refill' && log.length < 5) m.set(`r${log.length}`, 0)
            if (mode === 'clear') m.clear()
            expect(m.size).toBeLessThanOrEqual(2)
          },
        })
        self = map
        map.set('c', 1)
        expect(log).toEqual(['a', 'b'])
        expect(keysOf(map)).toEqual(['c', 'a'])
        mode = 'refill'
        log.length = 0
        map.set('d', 1)
        expect(log.length).toBe(5)
        expect(map.size).toBe(2)
        mode = 'clear'
        log.length = 0
        map.set('e', 1)
        expect(log.length).toBe(1)
        expect(map.size).toBe(0)
      })

      it('ends a 100,000-step chain of re-entrant evictions with a constant stack [014 S4-AC4]', () => {
        let count = 0
        let self: LinkedHashMap<number, number> | undefined
        const map = new LinkedHashMap<number, number>({
          maxSize: 1,
          onEvict: (_value, key) => {
            count++
            if (count < 100_000) (self as LinkedHashMap<number, number>).set(key + 2, 0)
          },
        })
        self = map
        map.set(0, 0).set(1, 0)
        expect(count).toBe(100_000)
        expect(map.size).toBe(1)
      }, 60000)
    })
  }

  it('rejects invalid options with TypeError or IllegalArgumentError naming the method, before storing anything [014 S4-AC5]', () => {
    const wrongType: Array<[string, unknown]> = [
      ['maxSize', '3'],
      ['maxSize', 3n],
      ['maxSize', {}],
      ['onEvict', 'f'],
      ['onEvict', null],
      ['accessOrder', 1],
      ['accessOrder', 'true'],
    ]
    const wrongValue: unknown[] = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]
    let iterated = 0
    const input = {
      *[Symbol.iterator]() {
        iterated++
        yield ['a', 1]
      },
    } as Iterable<[unknown, unknown]>
    for (const [name, value] of wrongType) {
      const options = { [name]: value } as Options
      expect(() => new LinkedHashMap(input, options)).toThrow(TypeError)
      expect(messageOf(() => new LinkedHashMap(input, options))).toMatch(
        new RegExp(`^LinkedHashMap: ${name} is not a `),
      )
      expect(messageOf(() => LinkedHashMap.from(input, options))).toMatch(
        new RegExp(`^LinkedHashMap.from: ${name} is not a `),
      )
    }
    for (const maxSize of wrongValue) {
      const error = caught(() => new LinkedHashMap(input, { maxSize: maxSize as number }))
      expect(error).toBeInstanceOf(IllegalArgumentError)
      expect((error as Error).message).toMatch(
        /^LinkedHashMap: maxSize must be a positive safe integer/,
      )
      expect(
        caught(() => LinkedHashMap.from(input, { maxSize: maxSize as number })),
      ).toBeInstanceOf(IllegalArgumentError)
    }
    expect(iterated).toBe(3 * wrongType.length + 2 * wrongValue.length)
    expect(new LinkedHashMap(input, { maxSize: 2 ** 53 - 1 }).size).toBe(1)
  })

  it('reads each option exactly once at construction [014 S4-AC5]', () => {
    const reads: string[] = []
    const options = new Proxy(
      { accessOrder: true, maxSize: 2, onEvict: () => undefined },
      {
        get(target, name) {
          reads.push(String(name))
          return Reflect.get(target, name)
        },
      },
    )
    const map = new LinkedHashMap(pairs('a', 'b', 'c'), options as Options)
    const counts = (name: string) => reads.filter((r) => r === name).length
    for (const name of ['key', 'equivalence', 'accessOrder', 'maxSize', 'onEvict']) {
      expect(counts(name), name).toBe(1)
    }
    map.get('b')
    map.set('d', 1)
    expect(reads.length).toBe(5)
    expect(keysOf(map)).toEqual(['b', 'd'])
  })

  it('ends construction with the mappings that setting each pair in order gives, reporting evictions in order [014 S4-AC6]', () => {
    for (const accessOrder of [false, true]) {
      for (const build of [
        (o: Options) =>
          new LinkedHashMap<unknown, unknown>(
            [
              ['a', 1],
              ['b', 2],
              ['c', 3],
              ['a', 4],
            ],
            o,
          ),
        (o: Options) =>
          LinkedHashMap.from<unknown, unknown>(
            [
              ['a', 1],
              ['b', 2],
              ['c', 3],
              ['a', 4],
            ],
            o,
          ),
      ]) {
        const evicted: unknown[] = []
        const map = build({ accessOrder, maxSize: 2, onEvict: (v, k) => evicted.push([k, v]) })
        expect(map.toJSON()).toEqual([
          ['c', 3],
          ['a', 4],
        ])
        expect(evicted).toEqual([
          ['a', 1],
          ['b', 2],
        ])
      }
    }
  })

  for (const [label, options] of [
    ['default', {}],
    ['key', { key: (k: number) => k }],
    [
      'equivalence',
      { equivalence: { equals: (a: number, b: number) => a === b, hash: (k: number) => k % 6 } },
    ],
  ] as const) {
    it(`behaves as an LRU cache of maxSize mappings against an array model (${label}) [014 S4-AC7]`, () => {
      for (const seed of [1, 2, 3]) {
        for (const maxSize of [1, 3, 16]) {
          runLruReferenceModel({
            seed,
            steps: 2000,
            maxSize,
            make: (onEvict) =>
              new LinkedHashMap<number, number>({
                ...(options as LinkedHashMapOptions<number, number>),
                accessOrder: true,
                maxSize,
                onEvict,
              }),
          })
        }
      }
    }, 60000)
  }
})

describe('LinkedHashMap — reversed view and live iteration', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      it('reversed() is a live map in the opposite order whose reversed() is the map itself [014 S5-AC1]', () => {
        const map = makeOn(path, pairs('a', 'b', 'c'))
        const view = map.reversed()
        expect(isMapCollection(view)).toBe(true)
        expect(keysOf(view)).toEqual(['c', 'b', 'a'])
        expect(view.reversed()).toBe(map)
        view.delete('b')
        map.set('d', 1)
        expect(keysOf(view)).toEqual(['d', 'c', 'a'])
        expect(view.size).toBe(3)
        expect(view.get('d')).toBe(1)
        expect(view.equals(map)).toBe(true)
        expect(map.equals(view)).toBe(true)
        expect(hashCode(view)).toBe(hashCode(map))
      })

      it('mirrors the ends and puts every new key inserted through the view at its end, the map’s front [014 S5-AC2]', () => {
        const map = makeOn(path, pairs('a', 'b', 'c'))
        const view = map.reversed()
        expect(view.firstEntry()?.key).toBe('c')
        expect(view.lastEntry()?.key).toBe('a')
        expect(view.pollFirstEntry()?.key).toBe('c')
        expect(view.pollLastEntry()?.key).toBe('a')
        view.putFirst('z', 1)
        view.putLast('y', 2)
        expect(keysOf(map)).toEqual(['y', 'b', 'z'])
        const inserts: Array<(m: SequencedMap<unknown, unknown>, k: string) => unknown> = [
          (m, k) => m.set(k, 0),
          (m, k) => m.put(k, 0),
          (m, k) => m.putAll([[k, 0]]),
          (m, k) => m.getOrInsert(k, 0),
          (m, k) => m.getOrInsertComputed(k, () => 0),
          (m, k) => m.compute(k, () => 0),
          (m, k) => m.merge(k, 0, () => 1),
        ]
        inserts.forEach((insert, i) => {
          insert(view, `n${i}`)
          expect(map.firstEntry()?.key).toBe(`n${i}`)
        })
      })

      it('runs forEach, replaceAll, putAll and output in the view’s order [014 S5-AC2]', () => {
        const map = makeOn(path, pairs('a', 'b'))
        const view = map.reversed()
        const seen: unknown[] = []
        view.forEach((_v, k, m) => {
          seen.push(k)
          expect(m).toBe(view)
        })
        expect(seen).toEqual(['b', 'a'])
        const replaced: unknown[] = []
        view.replaceAll((v, k) => returning(replaced.push(k), v))
        expect(replaced).toEqual(['b', 'a'])
        view.putAll(pairs('c', 'd'))
        expect(keysOf(view)).toEqual(['b', 'a', 'c', 'd'])
        expect(view.toJSON()).toEqual(pairs('b', 'a', 'c', 'd'))
        expect([...view]).toEqual(pairs('b', 'a', 'c', 'd'))
      })

      it('prints and tags as ReversedLinkedHashMap, names it in errors, and keeps access order and eviction on the map [014 S5-AC3]', () => {
        const view = makeOn(path, [
          ['a', 1],
          ['b', 2],
        ]).reversed()
        expect(String(view)).toBe("ReversedLinkedHashMap(2) {'b' => 2, 'a' => 1}")
        expect(Object.prototype.toString.call(view)).toBe('[object ReversedLinkedHashMap]')
        expect(inspect(view)).toBe("ReversedLinkedHashMap(2) { 'b' => 2, 'a' => 1 }")
        expect(messageOf(() => view.compute('a', 1 as never))).toMatch(
          /^ReversedLinkedHashMap\.compute: /,
        )
        expect(messageOf(() => view.forEach(1 as never))).toMatch(
          /^ReversedLinkedHashMap\.forEach: /,
        )
        const { map, evicted } = bounded(path, 2, pairs('a', 'b'), { accessOrder: true })
        const lru = map.reversed()
        lru.get('a')
        expect(keysOf(map)).toEqual(['b', 'a'])
        lru.set('c', 1)
        expect(keysOf(map)).toEqual(['c', 'a'])
        expect(evicted).toEqual([['b', 'vb']])
      })

      it('iterates live through explicit moves on the map, its view and their views, never throwing [014 S5-AC4]', () => {
        const map = makeOn(path, pairs('a', 'b', 'c', 'd'))
        const loop: unknown[] = []
        for (const k of map.keys()) {
          loop.push(k)
          if (k === 'a') map.delete('c') // ahead: skipped
          if (k === 'b') map.putLast('a', 1) // visited: visited again
          if (k === 'd') map.putFirst('z', 0) // at the start: not visited
        }
        expect(loop).toEqual(['a', 'b', 'd', 'a'])

        const back = makeOn(path, pairs('a', 'b', 'c', 'd'))
        const reversedLoop: unknown[] = []
        for (const [k] of back.reversed()) {
          reversedLoop.push(k)
          if (k === 'd') back.putFirst('d', 1) // the last returned moves to the view's end
        }
        expect(reversedLoop).toEqual(['d', 'c', 'b', 'a', 'd'])

        const views = makeOn(path, pairs('a', 'b', 'c'))
        const valueLoop: unknown[] = []
        for (const v of views.valueCollection()) {
          valueLoop.push(v)
          if (v === 'va') views.putLast('b', 'vb2')
        }
        expect(valueLoop).toEqual(['va', 'vc', 'vb2'])
        const entries = views.reversed().entrySet()[Symbol.iterator]()
        expect(entries.next().value?.key).toBe('b')
        views.clear()
        views.set('x', 1) // at the view's start: not visited
        views.putFirst('y', 2) // at the view's end: visited
        expect([...entries].map((e) => e.key)).toEqual(['y'])
        expect(entries.next().done).toBe(true)
        views.set('w', 0)
        expect(entries.next().done).toBe(true)
      })
    })
  }
})

describe('LinkedHashMap — sequenced views', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      for (const reversed of [false, true]) {
        const label = reversed ? 'the reversed view' : 'the map'
        const source = () => {
          const map = makeOn(path, pairs('a', 'b', 'c'))
          return reversed ? map.reversed() : map
        }
        it(`gives ${label} key, entry and value views in its order with its ends, removals and reversed views [014 S6-AC1]`, () => {
          const map = source()
          const order = keysOf(map)
          const keys = map.keySet()
          const entries = map.entrySet()
          const values = map.valueCollection()
          for (const view of [keys, entries, values]) {
            expect(isSequencedCollection(view)).toBe(true)
          }
          expect([...keys]).toEqual(order)
          expect(keys.getFirst()).toBe(order[0])
          expect(keys.getLast()).toBe(order[2])
          expect(entries.getFirst().key).toBe(order[0])
          expect(entries.getLast().value).toBe(`v${String(order[2])}`)
          expect(values.getFirst()).toBe(`v${String(order[0])}`)
          expect(values.getLast()).toBe(`v${String(order[2])}`)
          expect([...keys.reversed()]).toEqual([...map.reversed().keySet()])
          expect([...values.reversed()]).toEqual([...map.reversed().valueCollection()])
          expect([...entries.reversed()].map((e) => e.key)).toEqual(order.slice().reverse())
          expect(keys.removeFirst()).toBe(order[0])
          const removed = entries.removeLast()
          expect([removed.key, removed.value]).toEqual([order[2], `v${String(order[2])}`])
          expect(keysOf(map)).toEqual([order[1]])
          expect(values.reversed().removeFirst()).toBe(`v${String(order[1])}`)
          for (const [name, view] of [
            ['LinkedHashMapKeySet', keys],
            ['LinkedHashMapEntrySet', entries],
            ['LinkedHashMapValues', values],
          ] as const) {
            const noun = name === 'LinkedHashMapValues' ? 'collection' : 'set'
            for (const method of ['getFirst', 'getLast', 'removeFirst', 'removeLast'] as const) {
              const error = caught(() => view[method]())
              expect(error).toBeInstanceOf(NoSuchElementError)
              expect((error as Error).message).toBe(`${name}.${method}: the ${noun} is empty`)
            }
          }
        })

        it(`refuses add, addAll, addFirst and addLast on ${label}’s views, changing nothing [014 S6-AC1]`, () => {
          const map = source()
          const revision = map.revision
          const entry = map.firstEntry() as MapEntry<unknown, unknown>
          const views: Array<
            [
              unknown,
              {
                add(e: unknown): unknown
                addAll(e: unknown[]): boolean
                addFirst(e: unknown): unknown
                addLast(e: unknown): unknown
              },
            ]
          > = [
            ['z', map.keySet()],
            [entry, map.entrySet() as never],
            ['z', map.valueCollection()],
          ]
          for (const [element, view] of views) {
            expect(() => view.add(element)).toThrow(UnsupportedOperationError)
            expect(() => view.addAll([element])).toThrow(UnsupportedOperationError)
            expect(view.addAll([])).toBe(false)
            expect(() => view.addFirst(element)).toThrow(UnsupportedOperationError)
            expect(() => view.addLast(element)).toThrow(UnsupportedOperationError)
          }
          expect(map.revision).toBe(revision)
          expect(map.size).toBe(3)
        })
      }
    })
  }
})

describe('LinkedHashMap — view removals', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      const entryOf = (key: unknown, value: unknown) =>
        [...new HashMap([[key, value]]).entrySet()][0] as MapEntry<unknown, unknown>

      it('removes by entry through the entry view’s delete, removeAll, retainAll and cursor, by mapping and without moving anything [014 S6-AC1] [014 S3-AC3]', () => {
        const map = makeOn(path, pairs('a', 'b', 'c', 'd', 'e'), { accessOrder: true })
        const entries = map.entrySet()
        expect(entries.delete(entryOf('a', 'other'))).toBe(false)
        expect(entries.delete(entryOf('a', 'va'))).toBe(true)
        expect(entries.removeAll([entryOf('b', 'vb'), entryOf('c', 'wrong'), 'x' as never])).toBe(
          true,
        )
        expect(keysOf(map)).toEqual(['c', 'd', 'e'])
        expect(entries.removeAll([entryOf('z', 1)])).toBe(false)
        expect(entries.retainAll([entryOf('c', 'vc'), entryOf('e', 've')])).toBe(true)
        expect(keysOf(map)).toEqual(['c', 'e'])
        const cursor = entries.cursor()
        const first = cursor.next()
        expect([first.key, first.value]).toEqual(['c', 'vc'])
        cursor.remove()
        expect(keysOf(map)).toEqual(['e'])
        const reversed = map.reversed().entrySet().cursor()
        expect(reversed.next().key).toBe('e')
        map.delete('e')
        map.set('e', 1)
        reversed.remove()
        expect(map.size).toBe(0)
      })

      it('removes by key through the key view’s removeAll and retainAll, deciding every mapping first [014 S6-AC1]', () => {
        const map = makeOn(path, pairs('a', 'b', 'c', 'd'))
        const keys = map.reversed().keySet()
        expect(keys.removeAll(['a', 'z'])).toBe(true)
        expect(keys.retainAll(['b', 'd'])).toBe(true)
        expect(keysOf(map)).toEqual(['b', 'd'])
        expect(keys.retainAll(['b', 'd'])).toBe(false)
        expect(keys.delete('z')).toBe(false)
        expect(keys.delete('b')).toBe(true)
        let calls = 0
        map.keySet().forEach((k, same, set) => {
          calls++
          expect([k, same, set.size]).toEqual(['d', 'd', 1])
        })
        map.valueCollection().forEach(() => {
          calls++
        })
        map.entrySet().forEach(() => {
          calls++
        })
        expect(calls).toBe(3)
      })

      it('throws ConcurrentModificationError when a removeIf predicate adds or removes mappings, removing nothing [014 S3-AC3]', () => {
        const map = makeOn(path, pairs('a', 'b'))
        const error = caught(() =>
          map.keySet().removeIf((k) => {
            if (k === 'a') map.set('z', 0)
            return true
          }),
        )
        expect(error).toBeInstanceOf(ConcurrentModificationError)
        expect((error as Error).message).toBe(
          'LinkedHashMapKeySet.removeIf: the collection was changed while deciding',
        )
        expect(keysOf(map)).toEqual(['a', 'b', 'z'])
      })
    })
  }
})

describe('LinkedHashMap — changed keys and forEach', () => {
  it('removes a mapping whose key changed by its stored key or hash, without calling user functions, through the map and its reversed view [014 S1-AC1]', () => {
    type Id = { id: number }
    for (const kind of ['key', 'equivalence'] as const) {
      for (const reversed of [false, true]) {
        for (const removal of ['cursor', 'removeIf', 'removeAll', 'retainAll', 'clear'] as const) {
          const label = `${kind} ${reversed ? 'reversed ' : ''}${removal}`
          const keys: Id[] = [{ id: 1 }, { id: 2 }, { id: 3 }]
          const calls: unknown[] = []
          const options: LinkedHashMapOptions<Id, string> =
            kind === 'key'
              ? {
                  key: (k) => {
                    calls.push(k)
                    return k.id
                  },
                }
              : {
                  equivalence: {
                    equals: (a, b) => {
                      calls.push(a)
                      return a.id === b.id
                    },
                    hash: (k) => {
                      calls.push(k)
                      return k.id
                    },
                  },
                }
          const owner = new LinkedHashMap<Id, string>(
            keys.map((k): [Id, string] => [k, `v${k.id}`]),
            options,
          )
          const map: SequencedMap<Id, string> = reversed ? owner.reversed() : owner
          ;(keys[1] as Id).id = 99 // changed while stored
          calls.length = 0
          if (removal === 'cursor') {
            const cursor = map.keySet().cursor()
            while (cursor.hasNext()) if (cursor.next().id === 99) cursor.remove()
            expect(calls, label).toEqual([])
          } else if (removal === 'removeIf') {
            map.entrySet().removeIf((e) => e.key.id === 99)
            expect(calls, label).toEqual([])
          } else if (removal === 'removeAll') {
            // matched against the stored derived key or hash, not a recomputed one
            if (kind === 'key') map.keySet().removeAll([{ id: 2 }])
            else map.keySet().removeAll([{ id: 99 }])
          } else if (removal === 'retainAll') {
            map.keySet().retainAll([keys[0], keys[2]] as Id[])
          } else {
            map.clear()
            expect(calls, label).toEqual([])
          }
          const left = [...owner.keys()].map((k) => k.id)
          const unmatched = kind === 'equivalence' && removal === 'removeAll'
          expect(left, label).toEqual(removal === 'clear' ? [] : unmatched ? [1, 99, 3] : [1, 3])
          expect(calls.includes(keys[1]), label).toBe(false)
        }
      }
    }
  })

  it('delivers evictions caused by a forEach action on the map or a view only after forEach returns [014 S4-AC2]', () => {
    for (const path of PATHS) {
      const loops: Array<(map: AnyMap, action: () => void) => void> = [
        (map, action) => map.forEach(action),
        (map, action) => map.reversed().forEach(action),
        (map, action) => map.keySet().forEach(action),
        (map, action) => map.entrySet().forEach(action),
        (map, action) => map.valueCollection().forEach(action),
      ]
      loops.forEach((loop, i) => {
        const log: string[] = []
        const map = new LinkedHashMap<unknown, unknown>(pairs('a'), {
          ...path[1](),
          maxSize: 1,
          onEvict: (_v, key) => {
            log.push(`evict ${String(key)}`)
          },
        })
        let inserted = false
        loop(map, () => {
          if (inserted) return
          inserted = true
          map.set('b', 1)
          log.push('inserted')
        })
        log.push('returned')
        expect(log, `${path[0]} loop ${i}`).toEqual(['inserted', 'evict a', 'returned'])
      })
    }
  })
})

describe('LinkedHashMap — construction, equality, copy and output', () => {
  it('reads its arguments as HashMap does: entries, then options; an object that is not iterable is the options [014 S1-AC1]', () => {
    expect(new LinkedHashMap().size).toBe(0)
    expect(new LinkedHashMap(null, null).size).toBe(0)
    expect(new LinkedHashMap({ accessOrder: true }).size).toBe(0)
    expect(new LinkedHashMap(new Map([['a', 1]])).toJSON()).toEqual([['a', 1]])
    expect(new LinkedHashMap(new HashMap([['a', 1]]).entrySet()).toJSON()).toEqual([['a', 1]])
    expect(messageOf(() => new LinkedHashMap(1 as never))).toBe(
      'LinkedHashMap: entries is not iterable (1)',
    )
    expect(() => new LinkedHashMap({} as never, {})).toThrow(TypeError)
    expect(() => new LinkedHashMap([['a', 1, 2]] as never)).toThrow(TypeError)
    expect(() => LinkedHashMap.from(null as never)).toThrow(TypeError)
    expect(messageOf(() => LinkedHashMap.from(null as never))).toMatch(/^LinkedHashMap\.from: /)
    expect(
      () =>
        new LinkedHashMap(null, { key: (k: unknown) => k, equivalence: valueEquivalence } as never),
    ).toThrow(TypeError)
    expect(LinkedHashMap.from([['a', 1]], null).toJSON()).toEqual([['a', 1]])
  })

  it('equals a HashMap or TreeMap with equal mappings both ways, in any order, and hashes as an equal HashMap [014 S7-AC2]', () => {
    for (const path of PATHS) {
      const map = makeOn(path, pairs('a', 'b', 'c'))
      const hash = new HashMap(pairs('c', 'a', 'b'), path[1]() as never)
      const tree = new TreeMap(pairs('b', 'c', 'a') as Array<[string, string]>)
      for (const other of [hash, tree, makeOn(path, pairs('c', 'b', 'a'))]) {
        expect(map.equals(other)).toBe(true)
        expect(other.equals(map)).toBe(true)
        expect(map[equalsSymbol](other)).toBe(true)
      }
      expect(map.equals(new HashMap(pairs('a', 'b')))).toBe(false)
      expect(map.equals(new Map(map))).toBe(false)
      expect(map.equals(map.keySet())).toBe(false)
      expect(hashCode(map)).toBe(hashCode(hash))
      expect(map[hashCodeSymbol](hashCode)).toBe(hash[hashCodeSymbol](hashCode))
      expect('hashCode' in map).toBe(false)
    }
  })

  it('copies the mappings, order and options without calling user functions, independent afterwards [014 S7-AC5]', () => {
    for (const kind of ['key', 'equivalence'] as const) {
      const evicted: unknown[] = []
      const onEvict = (_v: unknown, k: unknown) => evicted.push(k)
      const { map, calls, equalsCalls } = counted(kind, { accessOrder: true, maxSize: 3, onEvict })
      map.putAll(pairs('a', 'b', 'c'))
      map.get('a')
      const before = calls.length
      const equalsBefore = equalsCalls()
      const copy = map.copy()
      expect(calls.length).toBe(before)
      expect(equalsCalls()).toBe(equalsBefore)
      expect(copy).toBeInstanceOf(LinkedHashMap)
      expect(copy.toJSON()).toEqual(map.toJSON())
      copy.get('b')
      expect(keysOf(copy)).toEqual(['c', 'a', 'b'])
      expect(keysOf(map)).toEqual(['b', 'c', 'a'])
      copy.set('d', 1)
      expect(keysOf(copy)).toEqual(['a', 'b', 'd'])
      expect(evicted).toEqual(['c'])
      expect(map.size).toBe(3)
    }
  })

  it('prints, serialises and inspects in order, and is recognised by instanceof and the guards [014 S7-AC6]', () => {
    const map = new LinkedHashMap([
      ['b', 2],
      ['a', 1],
    ])
    expect(String(map)).toBe("LinkedHashMap(2) {'b' => 2, 'a' => 1}")
    expect(JSON.stringify(map)).toBe('[["b",2],["a",1]]')
    expect(inspect(map)).toBe("LinkedHashMap(2) { 'b' => 2, 'a' => 1 }")
    expect(Object.prototype.toString.call(map)).toBe('[object LinkedHashMap]')
    const self = new LinkedHashMap<string, unknown>()
    self.set('me', self)
    expect(String(self)).toBe("LinkedHashMap(1) {'me' => [Circular]}")
    expect(map instanceof LinkedHashMap).toBe(true)
    expect(map.reversed() instanceof LinkedHashMap).toBe(false)
    expect(new HashMap() instanceof LinkedHashMap).toBe(false)
    expect(map instanceof HashMap).toBe(false)
    for (const value of [map, map.reversed()]) {
      expect(isMapCollection(value)).toBe(true)
      expect(isSortedMap(value)).toBe(false)
      expect(isCollection(value)).toBe(false)
      expect(isSetCollection(value)).toBe(false)
    }
    expect(
      (map as unknown as Record<symbol, unknown>)[
        Symbol.for('javascript-collections-framework/1/SequencedMap')
      ],
    ).toBe(true)
  })

  it('calls key or hash once per argument and never for stored keys across inserts, moves, evictions, polls, growth and shrinking [014 S7-AC1]', () => {
    for (const kind of ['key', 'equivalence'] as const) {
      const { map, calls } = counted(kind, { accessOrder: true, maxSize: 200 })
      let expected = 0
      for (let i = 0; i < 1000; i++) {
        const k = `k${(i * 7919) % 400}`
        switch (i % 6) {
          case 0:
          case 1:
            map.set(k, i)
            break
          case 2:
            map.get(k)
            break
          case 3:
            map.putFirst(k, i)
            break
          case 4:
            map.delete(k)
            break
          default:
            map.pollFirstEntry()
            expected--
        }
        expected++
      }
      map.copy()
      for (const entry of map.entrySet()) void entry.value
      expect(calls.length, kind).toBe(expected)
    }
  })
})

describe('LinkedHashMap — shared contracts', () => {
  const sumOf = (elements: unknown[], hash: (value: unknown) => number) =>
    elements.reduce<number>((h, e) => (h + hash(e)) | 0, 0)
  for (const path of PATHS) {
    for (const reversed of [false, true]) {
      const name = reversed ? 'ReversedLinkedHashMap' : 'LinkedHashMap'
      /** An empty map on this path, or its reversed view. */
      const empty = (): SequencedMap<unknown, unknown> => {
        const map = makeOn(path)
        return reversed ? map.reversed() : map
      }
      const make = (initial?: Iterable<readonly [unknown, unknown]>) => {
        const map = empty()
        if (initial !== undefined) map.putAll(initial)
        return map
      }
      describe(`${name} on the ${path[0]} path`, () => {
        describeMapCollection(name, make)
        describeSequencedMap(name, make)

        // Each view is filled through the map that owns it.
        const owners = new WeakMap<object, SequencedMap<unknown, unknown>>()
        const ownerOf = (view: object) => owners.get(view) as SequencedMap<unknown, unknown>
        const keySet = (initial: Iterable<unknown> = []) => {
          const map = empty()
          for (const e of initial) map.set(e, e)
          const view = map.keySet()
          owners.set(view, map)
          return view
        }
        const entrySet = (initial: Iterable<unknown> = []) => {
          const map = empty()
          for (const e of initial) map.set(e, e)
          const view = map.entrySet() as unknown as ReturnType<typeof keySet>
          owners.set(view, map)
          return view
        }
        let nextKey = 0
        const valueCollection = (initial: Iterable<unknown> = []) => {
          const map = empty()
          for (const e of initial) map.set(`k${nextKey++}`, e)
          const view = map.valueCollection()
          owners.set(view, map)
          return view
        }
        const insertKey = (view: object, e: unknown) => {
          ownerOf(view).set(e, e)
        }
        const storedHashes = path[0] === 'equivalence'
        describeCollection('LinkedHashMapKeySet', keySet, {
          iteration: 'live',
          brackets: 'set',
          nullElements: 'store',
          peers: [(initial?: Iterable<unknown>) => new HashSet<unknown>(initial)],
          structural: {
            expectedHash: (elements, hash) =>
              storedHashes ? sumOf(elements, sameValueZeroEquivalence.hash) : sumOf(elements, hash),
          },
          insert: insertKey,
        })
        describeSetCollection('LinkedHashMapKeySet', keySet, { insert: insertKey })
        describeSequencedSet('LinkedHashMapKeySet', keySet, {
          addAtEnds: 'unsupported',
          insert: insertKey,
        })
        const entryOptions = {
          member: (entry: unknown) => (entry as MapEntry<unknown, unknown>).key,
          probe: (e: unknown) => [...new HashMap([[e, e]]).entrySet()][0],
        }
        describeSetCollection('LinkedHashMapEntrySet', entrySet, {
          ...entryOptions,
          insert: insertKey,
          printed: (text) => `${text} => ${text}`,
        })
        describeSequencedSet('LinkedHashMapEntrySet', entrySet as never, {
          ...entryOptions,
          addAtEnds: 'unsupported',
          insert: insertKey,
        })
        const insertValue = (view: object, e: unknown) => {
          ownerOf(view).set(`k${nextKey++}`, e)
        }
        describeCollection('LinkedHashMapValues', valueCollection, {
          iteration: 'live',
          brackets: 'list',
          nullElements: 'store',
          insert: insertValue,
        })
        describeSequencedCollection('LinkedHashMapValues', valueCollection, {
          addAtEnds: 'unsupported',
          insert: insertValue,
        })
      })
    }
  }

  it('runs the map and sequenced-map suites on the map and its reversed view, and the set, sequenced-set, collection and sequenced-collection suites on their views [014 S7-AC3]', () => {
    for (const path of PATHS) {
      const map = makeOn(path)
      const view = map.reversed()
      view.putAll(pairs('a', 'b'))
      expect(keysOf(view)).toEqual(['a', 'b'])
      expect(String(view.keySet())).toBe("LinkedHashMapKeySet(2) {'a', 'b'}")
      expect(String(map.entrySet())).toBe("LinkedHashMapEntrySet(2) {'b' => 'vb', 'a' => 'va'}")
      expect(String(view.valueCollection())).toBe("LinkedHashMapValues(2) ['va', 'vb']")
    }
  })
})

describe('LinkedHashMap — reference model against an array of mappings', () => {
  const paths: Array<[string, () => LinkedHashMapOptions<unknown, number>]> = [
    ['default', () => ({})],
    ['key', () => ({ key: (k: unknown) => k as number })],
    ['equivalence', () => ({ equivalence: sameValueZeroUser() })],
    [
      'equivalence with few hashes',
      () => ({
        equivalence: {
          equals: (a: unknown, b: unknown) => sameValueZeroEquivalence.equals(a, b),
          hash: (k: unknown) => (typeof k === 'number' ? k % 6 : 0),
        },
      }),
    ],
  ]
  const modes: Array<[string, boolean, number | undefined]> = [
    ['insertion order', false, undefined],
    ['access order', true, undefined],
    ['access order with maxSize 6', true, 6],
    ['insertion order with maxSize 6', false, 6],
  ]
  for (const [label, options] of paths) {
    for (const [mode, accessOrder, maxSize] of modes) {
      it(`matches the model in ${mode}, with the reversed view, views and open iterators (${label}) [014 S7-AC4] [014 S3-AC4] [014 S5-AC4]`, () => {
        for (const seed of [1, 2, 3]) {
          runSequencedMapReferenceModel({
            seed,
            steps: 1500,
            accessOrder,
            maxSize,
            make: (onEvict) =>
              new LinkedHashMap<unknown, number>({
                ...options(),
                accessOrder,
                maxSize,
                onEvict: maxSize === undefined ? undefined : onEvict,
              }),
          })
        }
      }, 60000)
    }
  }
})
