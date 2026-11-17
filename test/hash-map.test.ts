import { inspect } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HashMap, type HashMapOptions } from '../src/collections/hash-map'
import { HashSet } from '../src/collections/hash-set'
import {
  ArrayList,
  ConcurrentModificationError,
  type Equivalence,
  equals,
  equalsSymbol,
  hashCode,
  hashCodeSymbol,
  IllegalStateError,
  isCollection,
  isMapCollection,
  isSetCollection,
  type KeyOf,
  type MapEntry,
  sameValueZeroEquivalence,
  UnsupportedOperationError,
  valueEquivalence,
} from '../src/index'
import { setBucketSeedSourceForTesting } from '../src/internal/engines/hash-table'
import { describeCollection } from './contracts/collection'
import { describeMapCollection } from './contracts/map'
import { describeSetCollection } from './contracts/set'
import { fixHashSeed } from './support/hash-seed'
import { runMapReferenceModel } from './support/reference-model'

fixHashSeed()
// Bucket seeds come from a counter, so layouts are the same on every run.
let nextBucketSeed = 0
beforeEach(() => {
  nextBucketSeed = 0x5eed
  setBucketSeedSourceForTesting(() => nextBucketSeed++)
})
afterEach(() => setBucketSeedSourceForTesting(undefined))

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

type Path = readonly [string, () => HashMapOptions<unknown> | undefined]

/** The three ways a map can compare keys: native, by derived key, by an equivalence. */
const PATHS: readonly Path[] = [
  ['default', () => undefined],
  ['key', () => ({ key: identityKey() as KeyOf<unknown> })],
  ['equivalence', () => ({ equivalence: sameValueZeroUser() })],
]

function makeOn(
  path: Path,
  initial?: Iterable<readonly [unknown, unknown]>,
): HashMap<unknown, unknown> {
  return new HashMap<unknown, unknown>(initial, path[1]())
}

/** A map with counting `key` and `hash` functions, on the keyed or the bucket path. */
function counted(kind: 'key' | 'equivalence'): {
  map: HashMap<unknown, unknown>
  calls: unknown[]
} {
  const calls: unknown[] = []
  const options: HashMapOptions<unknown> =
    kind === 'key'
      ? {
          key: (k) => {
            calls.push(k)
            return k as string
          },
        }
      : {
          equivalence: {
            equals: (a, b) => a === b,
            hash: (k) => {
              calls.push(k)
              return sameValueZeroEquivalence.hash(k)
            },
          },
        }
  return { map: new HashMap<unknown, unknown>(options), calls }
}

describe('HashMap — reading', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      it('get returns the mapped value, or undefined when the key is absent [012 S1-AC1]', () => {
        const map = makeOn(path, [
          ['a', 1],
          [2, 'two'],
        ])
        expect(map.get('a')).toBe(1)
        expect(map.get(2)).toBe('two')
        expect(map.get('b')).toBeUndefined()
        expect(map.get('2')).toBeUndefined()
      })

      it('getOrDefault returns a stored undefined and the fallback only when absent [012 S1-AC2]', () => {
        const map = makeOn(path, [['u', undefined]])
        expect(map.getOrDefault('u', 'fallback')).toBeUndefined()
        expect(map.getOrDefault('x', 'fallback')).toBe('fallback')
      })

      it('has reports whether an equal key is present [012 S1-AC3]', () => {
        const map = makeOn(path, [['a', undefined]])
        expect(map.has('a')).toBe(true)
        expect(map.has('b')).toBe(false)
      })

      it('containsValue scans the values with SameValueZero [012 S1-AC4]', () => {
        const object = {}
        const map = makeOn(path, [
          ['a', Number.NaN],
          ['b', object],
          ['c', -0],
        ])
        expect(map.containsValue(Number.NaN)).toBe(true)
        expect(map.containsValue(object)).toBe(true)
        expect(map.containsValue(0)).toBe(true)
        expect(map.containsValue({})).toBe(false)
        expect(map.valueCollection().has(Number.NaN)).toBe(true)
      })

      it('stores and finds null and undefined as keys and values [012 S1-AC5]', () => {
        const map = makeOn(path, [
          [null, undefined],
          [undefined, null],
        ])
        expect(map.size).toBe(2)
        expect(map.has(null)).toBe(true)
        expect(map.has(undefined)).toBe(true)
        expect(map.get(undefined)).toBeNull()
        expect(map.getOrDefault(null, 'x')).toBeUndefined()
        expect(map.delete(null)).toBe(true)
        expect([...map]).toEqual([[undefined, null]])
      })

      it('turns a -0 key into 0 on every operation [012 S1-AC7]', () => {
        const map = makeOn(path, [[-0, 'a']])
        expect(Object.is([...map.keys()][0], 0)).toBe(true)
        expect(map.get(-0)).toBe('a')
        expect(map.get(0)).toBe('a')
        map.set(-0, 'b')
        expect(map.size).toBe(1)
        expect(map.put(-0, 'c')).toBe('b')
        expect(map.getOrInsert(-0, 'x')).toBe('c')
        expect(map.compute(-0, (v, k) => `${v}${Object.is(k, -0) ? '-0' : '0'}`)).toBe('c0')
        expect(map.keySet().has(-0)).toBe(true)
        expect(map.remove(-0)).toBe('c0')
        map.merge(-0, 'm', (a, b) => `${a}${b}`)
        expect(Object.is([...map.keys()][0], 0)).toBe(true)
        expect(map.keySet().delete(-0)).toBe(true)
        expect(map.getOrInsertComputed(-0, (k) => (Object.is(k, -0) ? 'minus' : 'zero'))).toBe(
          'zero',
        )
        expect(
          Object.is(
            HashMap.from([[-0, 1]], path[1]())
              .keys()
              .next().value,
            0,
          ),
        ).toBe(true)
      })
    })
  }

  it('compares keys with SameValueZero by default, exactly as a native Map [012 S1-AC6]', () => {
    const a = {}
    const b = {}
    const pairs: Array<[unknown, number]> = [
      [a, 1],
      [b, 2],
      [Number.NaN, 3],
      [Number.NaN, 4],
      [0, 5],
      [-0, 6],
      ['1', 7],
      [1, 8],
    ]
    const map = new HashMap<unknown, number>(pairs)
    const native = new Map<unknown, number>(pairs)
    expect([...map]).toEqual([...native])
    expect(map.has({})).toBe(false)
    expect(map.get(Number.NaN)).toBe(4)
  })

  it('never passes -0 to key, equals or hash [012 S1-AC7]', () => {
    const seen: unknown[] = []
    const keyed = new HashMap<number, number>({
      key: (v) => {
        seen.push(v)
        return v
      },
    })
    const bucketed = new HashMap<number, number>({
      equivalence: {
        equals: (x, y) => {
          seen.push(x, y)
          return x === y
        },
        hash: (v) => {
          seen.push(v)
          return 0
        },
      },
    })
    for (const map of [keyed, bucketed]) {
      map.set(-0, 1).set(-0, 2)
      map.get(-0)
      map.has(-0)
      map.compute(-0, (v) => v)
      map.merge(-0, 1, (a, b) => a + b)
      map.keySet().removeAll([-0])
      map.getOrInsertComputed(-0, () => 1)
      map.keySet().retainAll([-0])
      map.delete(-0)
    }
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.some((v) => Object.is(v, -0))).toBe(false)
  })
})

describe('HashMap — writing', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      it('set returns the map and replaces only the value of a present key, keeping its key object and place [012 S2-AC1]', () => {
        const map = makeOn(path)
        expect(map.set('a', 1)).toBe(map)
        map.set('b', 2).set('a', 3)
        expect([...map]).toEqual([
          ['a', 3],
          ['b', 2],
        ])
      })

      it('put sets like set and returns the previous value or undefined [012 S2-AC2]', () => {
        const map = makeOn(path)
        expect(map.put('a', 1)).toBeUndefined()
        expect(map.put('a', 2)).toBe(1)
        expect(map.get('a')).toBe(2)
      })

      it('remove removes the mapping and returns its value or undefined [012 S2-AC4]', () => {
        const map = makeOn(path, [
          ['a', 1],
          ['b', 2],
        ])
        expect(map.remove('a')).toBe(1)
        expect(map.remove('a')).toBeUndefined()
        expect([...map]).toEqual([['b', 2]])
      })

      it('delete removes the mapping and returns whether one existed [012 S2-AC5]', () => {
        const map = makeOn(path, [['a', undefined]])
        expect(map.delete('a')).toBe(true)
        expect(map.delete('a')).toBe(false)
        expect(map.size).toBe(0)
      })

      it('replace writes only a present key and returns the previous value [012 S2-AC8]', () => {
        const map = makeOn(path, [['a', 1]])
        expect(map.replace('a', 2)).toBe(1)
        expect(map.replace('b', 3)).toBeUndefined()
        expect([...map]).toEqual([['a', 2]])
      })

      it('changes revision on every write, even of the same value, and never on a no-op [012 S2-AC10]', () => {
        const map = makeOn(path, [['a', 1]])
        const seen = new Set([map.revision])
        const changed = (step: string) => {
          expect(seen.has(map.revision), step).toBe(false)
          seen.add(map.revision)
        }
        const unchanged = (step: string, call: () => unknown) => {
          const before = map.revision
          call()
          expect(map.revision, step).toBe(before)
        }
        map.set('a', 1)
        changed('set same value')
        map.put('b', 2)
        changed('put new')
        map.replace('b', 2)
        changed('replace')
        map.replaceAll((v) => v)
        changed('replaceAll')
        ;[...map.entrySet()][0]?.setValue(1)
        changed('setValue')
        map.compute('a', (v) => v)
        changed('compute')
        map.merge('a', 1, (x) => x)
        changed('merge')
        map.computeIfPresent('a', (v) => v)
        changed('computeIfPresent')
        map.getOrInsert('c', 3)
        changed('getOrInsert miss')
        map.getOrInsertComputed('d', () => 4)
        changed('getOrInsertComputed miss')
        map.delete('d')
        changed('delete')
        unchanged('delete absent', () => map.delete('zz'))
        unchanged('remove absent', () => map.remove('zz'))
        unchanged('replace absent', () => map.replace('zz', 1))
        unchanged('computeIfPresent absent', () => map.computeIfPresent('zz', () => 1))
        unchanged('compute undefined absent', () => map.compute('zz', () => undefined))
        unchanged('getOrInsert hit', () => map.getOrInsert('a', 9))
        unchanged('getOrInsertComputed hit', () => map.getOrInsertComputed('a', () => 9))
        unchanged('putAll nothing', () => map.putAll([]))
        unchanged('reads', () => {
          map.get('a')
          map.has('a')
          map.containsValue(1)
          String(map)
          map.toJSON()
          map.equals(map)
          hashCode(map)
          for (const _ of map) {
            // reading only
          }
        })
        map.clear()
        changed('clear')
        unchanged('clear empty', () => map.clear())
        unchanged('replaceAll empty', () => map.replaceAll(() => 1))
      })

      it('lets an open iteration continue across value writes [012 S2-AC10]', () => {
        const map = makeOn(path, [
          ['a', 1],
          ['b', 2],
          ['c', 3],
        ])
        const seen: unknown[] = []
        for (const [key, value] of map) {
          seen.push(value)
          if (key === 'a') {
            map.set('b', 20)
            map.replaceAll((v) => (v as number) * 10)
          }
        }
        expect(seen).toEqual([1, 200, 30])
      })
    })
  }
})

describe('HashMap — keys by value', () => {
  it('treats keys with SameValueZero-equal derived keys as one key and keeps the original key object [012 S6-AC1]', () => {
    const first = { id: 1 }
    const map = new HashMap<{ id: number }, string>({ key: (k) => k.id })
    map.set(first, 'a').set({ id: 1 }, 'b').set({ id: 2 }, 'c')
    expect(map.size).toBe(2)
    expect([...map.keys()][0]).toBe(first)
    expect(map.get({ id: 1 })).toBe('b')
  })

  it('decides key equality only by the equivalence, and treats sameValueZeroEquivalence as the default [012 S6-AC2]', () => {
    const byParity: Equivalence<number> = { equals: (a, b) => a % 2 === b % 2, hash: (v) => v % 2 }
    const map = new HashMap<number, string>([[1, 'odd']], { equivalence: byParity })
    expect(map.get(3)).toBe('odd')
    map.set(5, 'still odd')
    expect([...map]).toEqual([[1, 'still odd']])
    const point = (x: number) => ({
      x,
      [equalsSymbol]: (other: { x: number }) => other.x === x,
      [hashCodeSymbol]: (hash: (v: unknown) => number) => hash(x),
    })
    const byValue = new HashMap<unknown, number>([[point(1), 1]], {
      equivalence: valueEquivalence,
    })
    expect(byValue.get(point(1))).toBe(1)
    let protocolCalls = 0
    const counting = {
      [equalsSymbol]: () => {
        protocolCalls++
        return true
      },
      [hashCodeSymbol]: () => {
        protocolCalls++
        return 1
      },
    }
    const native = new HashMap<unknown, number>([[counting, 1]], {
      equivalence: sameValueZeroEquivalence,
    })
    expect(native.get({ ...counting })).toBeUndefined()
    expect(native.get(counting)).toBe(1)
    expect(protocolCalls).toBe(0)
  })
})

describe('HashMap — upsert, compute and merge', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      it('getOrInsert returns the present value or inserts and returns the given one [012 S2-AC6]', () => {
        const map = makeOn(path, [['a', 1]])
        expect(map.getOrInsert('a', 9)).toBe(1)
        expect(map.getOrInsert('b', undefined)).toBeUndefined()
        expect([...map]).toEqual([
          ['a', 1],
          ['b', undefined],
        ])
      })

      it('getOrInsertComputed follows the native steps [012 S2-AC7]', () => {
        const map = makeOn(path, [['a', 1]])
        // The callable check comes first, even when the key is present.
        expect(() => map.getOrInsertComputed('a', 1 as never)).toThrow(TypeError)
        let calls = 0
        expect(
          map.getOrInsertComputed('a', () => {
            calls++
            return 2
          }),
        ).toBe(1)
        expect(calls).toBe(0)
        const receivers: unknown[] = []
        expect(
          map.getOrInsertComputed('b', function (this: unknown, key) {
            receivers.push(this, key)
            return undefined
          }),
        ).toBeUndefined()
        expect(receivers).toEqual([undefined, 'b'])
        expect(map.has('b')).toBe(true)
        // A callback that inserts the key: the value is overwritten in place, at the callback's position.
        const first = map.getOrInsertComputed('c', () => {
          map.set('x', 0)
          map.set('c', 'inner')
          map.set('y', 0)
          return 'outer'
        })
        expect(first).toBe('outer')
        expect([...map.keys()]).toEqual(['a', 'b', 'x', 'c', 'y'])
        expect(map.get('c')).toBe('outer')
        // A callback that removes other mappings does not throw; the result is appended.
        expect(
          map.getOrInsertComputed('d', () => {
            map.delete('a')
            map.clear()
            return 'd'
          }),
        ).toBe('d')
        expect([...map]).toEqual([['d', 'd']])
      })

      it('computeIfPresent stores or removes on a present key and skips an absent one [012 S3-AC1]', () => {
        const map = makeOn(path, [
          ['a', 1],
          ['b', 2],
        ])
        const args: unknown[] = []
        expect(
          map.computeIfPresent('a', (value, key, owner) => {
            args.push(value, key, owner)
            return 10
          }),
        ).toBe(10)
        expect(args).toEqual([1, 'a', map])
        expect(map.computeIfPresent('b', () => undefined)).toBeUndefined()
        expect(map.has('b')).toBe(false)
        let called = false
        expect(
          map.computeIfPresent('z', () => {
            called = true
            return 1
          }),
        ).toBeUndefined()
        expect(called).toBe(false)
        expect([...map]).toEqual([['a', 10]])
      })

      it('compute passes the current value or undefined and stores or removes the result [012 S3-AC2]', () => {
        const map = makeOn(path, [['a', 1]])
        const args: unknown[] = []
        expect(
          map.compute('a', (value, key, owner) => {
            args.push(value, key, owner)
            return (value as number) + 1
          }),
        ).toBe(2)
        expect(args).toEqual([1, 'a', map])
        expect(map.compute('b', (value) => (value === undefined ? 'new' : 'old'))).toBe('new')
        expect(map.compute('a', () => undefined)).toBeUndefined()
        expect(map.compute('zz', () => undefined)).toBeUndefined()
        expect([...map]).toEqual([['b', 'new']])
        expect(map.compute('b', () => null)).toBeNull()
        expect(map.has('b')).toBe(true)
      })

      it('merge stores the value when absent and otherwise the combined result [012 S3-AC3]', () => {
        const map = makeOn(path)
        expect(map.merge('a', 1, () => 'unused')).toBe(1)
        expect(map.merge('u', undefined, () => 'unused')).toBeUndefined()
        expect(map.has('u')).toBe(true)
        const args: unknown[] = []
        expect(
          map.merge('a', 5, (old, value, key, owner) => {
            args.push(old, value, key, owner)
            return (old as number) + (value as number)
          }),
        ).toBe(6)
        expect(args).toEqual([1, 5, 'a', map])
        expect(map.merge('a', 1, () => undefined)).toBeUndefined()
        expect([...map]).toEqual([['u', undefined]])
      })

      it('makes no change of its own when a compute or merge function throws [012 S3-AC4]', () => {
        const map = makeOn(path, [['a', 1]])
        const failure = new Error('stop')
        const revision = map.revision
        for (const call of [
          () =>
            map.compute('a', () => {
              throw failure
            }),
          () =>
            map.compute('b', () => {
              throw failure
            }),
          () =>
            map.computeIfPresent('a', () => {
              throw failure
            }),
          () =>
            map.merge('a', 2, () => {
              throw failure
            }),
        ]) {
          expect(caught(call)).toBe(failure)
        }
        expect(map.revision).toBe(revision)
        expect([...map]).toEqual([['a', 1]])
        // A change the callback made itself stays.
        expect(
          caught(() =>
            map.compute('a', () => {
              map.set('a', 'inner')
              throw failure
            }),
          ),
        ).toBe(failure)
        expect(map.get('a')).toBe('inner')
      })

      it('throws ConcurrentModificationError when a callback changes the structure, keeping its change [012 S3-AC5]', () => {
        /** Returns 5 after adding a mapping (`grow`) or removing one. */
        const change = (m: HashMap<unknown, unknown>, grow: boolean) => () => {
          if (grow) m.set('new', 1)
          else m.delete('b')
          return 5
        }
        const calls: Array<[string, (map: HashMap<unknown, unknown>) => unknown]> = [
          ['compute', (m) => m.compute('a', change(m, true))],
          ['compute', (m) => m.compute('absent', change(m, false))],
          ['computeIfPresent', (m) => m.computeIfPresent('a', change(m, true))],
          ['merge', (m) => m.merge('a', 1, change(m, false))],
          ['replaceAll', (m) => m.replaceAll(change(m, true))],
        ]
        for (const [method, call] of calls) {
          const map = makeOn(path, [
            ['a', 1],
            ['b', 2],
          ])
          const error = caught(() => call(map))
          expect(error, method).toBeInstanceOf(ConcurrentModificationError)
          expect((error as Error).message).toBe(
            `HashMap.${method}: the map was changed by the callback`,
          )
          expect(map.get('a'), method).toBe(1)
          expect(map.has('new') || !map.has('b'), method).toBe(true)
          expect(map.has('absent'), method).toBe(false)
          expect(map.size).toBe([...map].length)
        }
      })

      it('replaceAll replaces each value in order and keeps the values replaced before an error [012 S2-AC9]', () => {
        const map = makeOn(path, [
          ['a', 1],
          ['b', 2],
          ['c', 3],
        ])
        const args: unknown[] = []
        expect(
          map.replaceAll((value, key, owner) => {
            args.push([value, key, owner === map])
            return (value as number) * 10
          }),
        ).toBeUndefined()
        expect(args).toEqual([
          [1, 'a', true],
          [2, 'b', true],
          [3, 'c', true],
        ])
        const failure = new Error('stop')
        expect(
          caught(() =>
            map.replaceAll((value, key) => {
              if (key === 'b') throw failure
              return (value as number) + 1
            }),
          ),
        ).toBe(failure)
        expect([...map.values()]).toEqual([11, 20, 30])
      })
    })
  }

  it('rejects a callback that is not a function, naming the method, before any lookup [012 S2-AC11]', () => {
    const { map, calls } = counted('key')
    map.set('a', 1)
    calls.length = 0
    const revision = map.revision
    const checks: Array<[string, () => unknown]> = [
      ['compute', () => map.compute('a', 1 as never)],
      ['computeIfPresent', () => map.computeIfPresent('a', null as never)],
      ['merge', () => map.merge('a', 1, {} as never)],
      ['replaceAll', () => map.replaceAll('x' as never)],
      ['getOrInsertComputed', () => map.getOrInsertComputed('a', undefined as never)],
      ['forEach', () => map.forEach(1 as never)],
    ]
    for (const [method, call] of checks) {
      const error = caught(call)
      expect(error, method).toBeInstanceOf(TypeError)
      expect((error as Error).message.startsWith(`HashMap.${method}: `), method).toBe(true)
    }
    expect(calls).toEqual([])
    expect(map.revision).toBe(revision)
  })
})

describe('HashMap — key options', () => {
  for (const kind of ['key', 'equivalence'] as const) {
    it(`calls ${kind === 'key' ? 'key' : 'hash'} once per argument key per operation and never for stored keys [012 S6-AC3]`, () => {
      const { map, calls } = counted(kind)
      const operations: Array<[string, () => unknown]> = [
        ['set', () => map.set('a', 1)],
        ['set present', () => map.set('a', 2)],
        ['put', () => map.put('b', 1)],
        ['get', () => map.get('a')],
        ['getOrDefault', () => map.getOrDefault('a', 0)],
        ['has', () => map.has('zz')],
        ['replace', () => map.replace('a', 3)],
        ['getOrInsert', () => map.getOrInsert('c', 1)],
        ['getOrInsertComputed miss', () => map.getOrInsertComputed('d', () => 1)],
        [
          'getOrInsertComputed inserting',
          () =>
            map.getOrInsertComputed('e', () => {
              map.set('e', 0)
              return 1
            }),
        ],
        ['compute', () => map.compute('a', () => 4)],
        ['computeIfPresent', () => map.computeIfPresent('a', () => 5)],
        ['merge', () => map.merge('a', 1, () => 6)],
        ['keySet().has', () => map.keySet().has('a')],
        ['remove', () => map.remove('b')],
        ['delete', () => map.delete('c')],
      ]
      for (const [label, run] of operations) {
        calls.length = 0
        run()
        const expected = label === 'getOrInsertComputed inserting' ? 2 : 1 // the callback's own set
        expect(calls.length, label).toBe(expected)
      }
      calls.length = 0
      for (let i = 0; i < 200; i++) map.set(`k${i}`, i)
      expect(calls.length).toBe(200) // one call per argument key, none while the table grows
      calls.length = 0
      for (let i = 0; i < 190; i++) map.keySet().cursor() // creating views calls nothing
      map.copy()
      map.replaceAll((v) => v)
      for (const entry of map.entrySet()) entry.setValue(entry.value)
      String(map)
      hashCode(map)
      map.keySet().removeIf((k) => String(k).endsWith('1'))
      map.clear()
      expect(calls).toEqual([])
    })
  }

  it('calls key and equivalence functions for null and undefined [012 S6-AC3]', () => {
    for (const kind of ['key', 'equivalence'] as const) {
      const { map, calls } = counted(kind)
      map.set(null, 1).set(undefined, 2)
      expect(calls).toEqual([null, undefined])
      expect(map.get(null)).toBe(1)
    }
  })

  it('reads options once, rejects key with equivalence, and validates results naming the HashMap method [012 S6-AC3]', () => {
    let reads = 0
    const options = {
      get key() {
        reads++
        return (k: unknown) => k as string
      },
    }
    const map = new HashMap<unknown, unknown>(options)
    map.set('a', 1)
    map.get('a')
    expect(reads).toBe(1)
    expect(
      messageOf(() => new HashMap({ key: (k) => k as string, equivalence: valueEquivalence })),
    ).toBe('HashMap: key and equivalence cannot both be given')
    expect(messageOf(() => HashMap.from([], { key: 1 as never }))).toBe(
      'HashMap.from: key is not a function',
    )
    const bad = new HashMap<unknown, unknown>({ key: () => ({}) as never })
    expect(messageOf(() => bad.set('a', 1))).toBe('HashMap.set: key function returned object')
    const badHash = new HashMap<unknown, unknown>({
      equivalence: { equals: () => true, hash: () => Number.NaN },
    })
    expect(messageOf(() => badHash.get('a'))).toBe('HashMap.get: equivalence.hash returned NaN')
    const badEquals = new HashMap<unknown, unknown>([['a', 1]], {
      equivalence: { equals: () => 1 as never, hash: () => 0 },
    })
    expect(messageOf(() => badEquals.has('b'))).toBe('HashMap.has: equivalence.equals returned 1')
  })

  it('throws ConcurrentModificationError when a key, equals or hash function changes the map [012 S6-AC3]', () => {
    let target: HashMap<unknown, unknown> | undefined
    let armed = false
    let fresh = 0
    const sneaky = () => {
      if (armed && target !== undefined) {
        armed = false
        target.set(`added${fresh++}`, 'added')
      }
    }
    const keyed = new HashMap<unknown, unknown>([['a', 1]], {
      key: (k) => {
        sneaky()
        return k as string
      },
    })
    const bucketed = new HashMap<unknown, unknown>([['a', 1]], {
      equivalence: {
        equals: (a, b) => {
          sneaky()
          return a === b
        },
        hash: () => 0,
      },
    })
    for (const map of [keyed, bucketed]) {
      target = map
      for (const [method, call] of [
        ['set', () => map.set('a', 2)],
        ['get', () => map.get('a')],
        ['delete', () => map.delete('a')],
        ['compute', () => map.compute('a', () => 3)],
      ] as const) {
        armed = true
        const error = caught(call)
        expect(error, method).toBeInstanceOf(ConcurrentModificationError)
        expect((error as Error).message).toBe(
          `HashMap.${method}: the map was changed by a key, equals or hash function`,
        )
        expect(map.get('a'), method).toBe(1)
      }
    }
  })
})

/** Runs the same scripted changes inside a loop over `ours` and over a native Map. */
function liveRun(
  visitOurs: (visit: (key: number) => void) => void,
  ours: HashMap<unknown, unknown>,
  makeScript: () => (
    key: number,
    map: { set(k: number, v: number): unknown; delete(k: number): unknown; clear(): void },
  ) => void,
  initial: number[],
): [number[], number[]] {
  const theirs = new Map<number, number>(initial.map((k) => [k, k]))
  const seenOurs: number[] = []
  let script = makeScript()
  visitOurs((key) => {
    seenOurs.push(key)
    script(key, ours as never)
  })
  const seenTheirs: number[] = []
  script = makeScript()
  for (const [key] of theirs) {
    seenTheirs.push(key)
    script(key, theirs)
  }
  return [seenOurs, seenTheirs]
}

describe('HashMap — iteration like a native Map', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      it('yields a new [key, value] array per mapping in insertion order [012 S5-AC1]', () => {
        const map = makeOn(path, [
          ['b', 1],
          ['a', 2],
        ])
        const first = [...map]
        expect(first).toEqual([
          ['b', 1],
          ['a', 2],
        ])
        expect([...map][0]).not.toBe(first[0])
      })

      it('keys, values and entries return live iterators in insertion order [012 S5-AC2]', () => {
        const map = makeOn(path, [
          ['a', 1],
          ['b', 2],
        ])
        expect([...map.keys()]).toEqual(['a', 'b'])
        expect([...map.values()]).toEqual([1, 2])
        expect([...map.entries()]).toEqual([
          ['a', 1],
          ['b', 2],
        ])
        const keys = map.keys()
        expect(keys.next().value).toBe('a')
        map.delete('b')
        map.set('c', 3)
        expect([...keys]).toEqual(['c'])
        const values = map.values()
        map.set('a', 10)
        expect(values.next().value).toBe(10)
        const iterator = map.entries()
        expect(iterator[Symbol.iterator]()).toBe(iterator)
      })

      it('forEach calls action(value, key, map) with thisArg [012 S5-AC3]', () => {
        const map = makeOn(path, [
          ['a', 1],
          ['b', 2],
        ])
        const calls: unknown[][] = []
        const self = {}
        map.forEach(function (this: unknown, value, key, owner) {
          calls.push([value, key, owner, this])
        }, self)
        expect(calls).toEqual([
          [1, 'a', map, self],
          [2, 'b', map, self],
        ])
      })

      it('copies into a native Map with new Map(hashMap) [012 S5-AC4]', () => {
        const map = makeOn(path, [
          ['b', 1],
          [null, 2],
          ['a', undefined],
        ])
        const native = new Map(map)
        expect([...native]).toEqual([...map])
      })

      it('for…of, forEach and the views iterate live exactly as a native Map [012 S4-AC7]', () => {
        // Each run changes the map once at 1 and once at 4, so a re-added key ends the run.
        const script = () => {
          let atOne = true
          let atFour = true
          return (
            key: number,
            m: { set(k: number, v: number): unknown; delete(k: number): unknown; clear(): void },
          ) => {
            if (key === 1 && atOne) {
              atOne = false
              m.delete(2)
              m.set(4, 4)
              m.delete(1)
              m.set(1, 1)
            }
            if (key === 4 && atFour) {
              atFour = false
              m.set(5, 5)
            }
          }
        }
        const visitors: Array<
          [string, (m: HashMap<unknown, unknown>, v: (k: number) => void) => void]
        > = [
          [
            'for…of',
            (m, v) => {
              for (const [k] of m) v(k as number)
            },
          ],
          [
            'forEach',
            (m, v) =>
              m.forEach((_value, k) => {
                v(k as number)
              }),
          ],
          [
            'keys',
            (m, v) => {
              for (const k of m.keys()) v(k as number)
            },
          ],
          [
            'keySet',
            (m, v) => {
              for (const k of m.keySet()) v(k as number)
            },
          ],
          [
            'keySet forEach',
            (m, v) =>
              m.keySet().forEach((k) => {
                v(k as number)
              }),
          ],
          [
            'entrySet',
            (m, v) => {
              for (const e of m.entrySet()) v(e.key as number)
            },
          ],
          [
            'values',
            (m, v) => {
              for (const value of m.valueCollection()) v(value as number)
            },
          ],
        ]
        for (const [label, visit] of visitors) {
          const map = makeOn(
            path,
            [1, 2, 3].map((k) => [k, k] as const),
          )
          const [ours, theirs] = liveRun((v) => visit(map, v), map, script, [1, 2, 3])
          expect(ours, label).toEqual(theirs)
        }
        // clear ends an open iteration; mappings added afterwards are visited.
        const map = makeOn(path, [
          [1, 1],
          [2, 2],
        ])
        const seen: unknown[] = []
        for (const [k] of map) {
          seen.push(k)
          if (k === 1) {
            map.clear()
            map.set(7, 7)
          }
        }
        expect(seen).toEqual([1, 7])
      })

      it('view cursors follow the live-cursor rules [012 S4-AC7]', () => {
        const map = makeOn(
          path,
          [1, 2, 3].map((k) => [k, `v${k}`] as const),
        )
        const cursor = map.keySet().cursor()
        expect(cursor.next()).toBe(1)
        map.delete(1)
        expect(() => cursor.remove()).not.toThrow()
        expect(cursor.hasNext()).toBe(true)
        map.delete(2)
        expect(cursor.next()).toBe(2)
        map.delete(3)
        map.set(3, 'again')
        expect(cursor.next()).toBe(3)
        cursor.remove()
        expect(map.has(3)).toBe(false)
        expect(cursor.hasNext()).toBe(false)
        map.set(9, 'late')
        expect(cursor.hasNext()).toBe(false)
        const values = map.valueCollection().cursor()
        expect(values.next()).toBe('late')
        values.remove()
        expect(map.size).toBe(0)
      })
    })
  }
})

describe('HashMap — entries', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      it('reads the current value while the key is present and the last one afterwards [012 S4-AC4]', () => {
        const map = makeOn(path, [['a', 1]])
        const entry = [...map.entrySet()][0] as MapEntry<unknown, unknown>
        expect(entry.key).toBe('a')
        expect(entry.value).toBe(1)
        map.set('a', 2)
        expect(entry.value).toBe(2)
        const [k, v] = entry
        expect([k, v]).toEqual(['a', 2])
        map.set('a', 3)
        map.delete('a')
        // never read 3, so the last value it returned stays
        expect(entry.value).toBe(2)
        expect(map.entrySet().has(entry)).toBe(false)
        map.set('a', 4)
        expect(entry.value).toBe(4)
        expect(map.entrySet().has(entry)).toBe(true)
      })

      it('setValue writes through while the key is present and throws once it is gone [012 S4-AC5]', () => {
        const map = makeOn(path, [['a', 1]])
        const entry = [...map.entrySet()][0] as MapEntry<unknown, unknown>
        expect(entry.setValue(5)).toBe(1)
        expect(map.get('a')).toBe(5)
        map.delete('a')
        const error = caught(() => entry.setValue(6))
        expect(error).toBeInstanceOf(IllegalStateError)
        expect((error as Error).message).toBe(
          'MapEntry.setValue: the mapping was removed from the map',
        )
        expect(entry.value).toBe(5)
        map.set('a', 7)
        expect(entry.setValue(8)).toBe(7)
        expect(map.get('a')).toBe(8)
        expect(entry.value).toBe(8)
      })

      it('compares entries by key and value and prints them as key => value [012 S4-AC6]', () => {
        // Values are compared with `equals`, so equal lists in two maps make equal entries.
        const a = makeOn(path, [['a', new ArrayList([1])]])
        const b = new HashMap<unknown, unknown>([['a', new ArrayList([1])]])
        const ea = [...a.entrySet()][0] as MapEntry<unknown, unknown>
        const eb = [...b.entrySet()][0] as MapEntry<unknown, unknown>
        expect(ea.equals(eb)).toBe(true)
        expect(ea[equalsSymbol](eb)).toBe(true)
        expect(equals(ea, eb)).toBe(true)
        expect(hashCode(ea)).toBe(hashCode(eb))
        const standIn = (value: unknown) => (typeof value === 'string' ? 3 : 4)
        expect(ea[hashCodeSymbol](standIn)).toBe(eb[hashCodeSymbol](standIn))
        b.set('a', new ArrayList([2]))
        expect(ea.equals(eb)).toBe(false)
        a.set('a', [1])
        expect(ea.equals(['a', [1]])).toBe(false)
        expect(ea.equals(ea)).toBe(true)
        expect(String(ea)).toBe("'a' => [1]")
        expect(ea.toJSON()).toEqual(['a', [1]])
        expect(JSON.stringify(ea)).toBe('["a",[1]]')
        expect(inspect(ea)).toBe("'a' => [ 1 ]")
        const brand = Symbol.for('javascript-collections-framework/1/MapEntry')
        expect((ea as unknown as Record<symbol, unknown>)[brand]).toBe(true)
      })

      it('entry reads and writes never call key or hash, even after the key was re-added [012 S4-AC4]', () => {
        for (const kind of ['key', 'equivalence'] as const) {
          const { map, calls } = counted(kind)
          map.set('a', 1)
          const entry = [...map.entrySet()][0] as MapEntry<unknown, unknown>
          map.delete('a')
          map.set('a', 2)
          calls.length = 0
          expect(entry.value).toBe(2)
          entry.setValue(3)
          expect(entry.value).toBe(3)
          expect(calls).toEqual([])
        }
      })
    })
  }
})

describe('HashMap — live views', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      it('keySet is a live set of the keys: removal writes through and add throws [012 S4-AC1]', () => {
        const map = makeOn(path, [
          ['a', 1],
          ['b', 2],
          ['c', 3],
        ])
        const keys = map.keySet()
        expect(isSetCollection(keys)).toBe(true)
        expect(isMapCollection(keys)).toBe(false)
        expect(map.keySet()).not.toBe(keys)
        expect(keys.size).toBe(3)
        expect(keys.has('a')).toBe(true)
        expect(keys.delete('a')).toBe(true)
        expect(map.has('a')).toBe(false)
        map.set('d', 4)
        expect([...keys]).toEqual(['b', 'c', 'd'])
        expect(keys.removeAll(['b', 'x'])).toBe(true)
        expect(keys.retainAll(['d'])).toBe(true)
        expect([...map]).toEqual([['d', 4]])
        const error = caught(() => keys.add('e'))
        expect(error).toBeInstanceOf(UnsupportedOperationError)
        expect((error as Error).message.startsWith('HashMapKeySet.add: ')).toBe(true)
        expect(() => keys.addAll(['e'])).toThrow(/^HashMapKeySet\.addAll: /)
        expect(String(keys)).toBe("HashMapKeySet(1) {'d'}")
        keys.clear()
        expect(map.size).toBe(0)
      })

      it('valueCollection is a live collection of the values with SameValueZero, removal by value [012 S4-AC2]', () => {
        const map = makeOn(path, [
          ['a', 1],
          ['b', 2],
          ['c', 1],
          ['d', 3],
        ])
        const values = map.valueCollection()
        expect(isCollection(values)).toBe(true)
        expect(isSetCollection(values)).toBe(false)
        expect(values.has(2)).toBe(true)
        expect(values.delete(1)).toBe(true)
        expect([...map.keys()]).toEqual(['b', 'c', 'd'])
        expect(values.removeIf((v) => v === 3)).toBe(true)
        map.set('e', 1).set('f', 2)
        expect(values.removeAll([1])).toBe(true)
        expect([...map]).toEqual([
          ['b', 2],
          ['f', 2],
        ])
        expect(values.retainAll([9])).toBe(true)
        expect(map.size).toBe(0)
        expect(() => values.add(1)).toThrow(UnsupportedOperationError)
        expect(() => values.addAll([1])).toThrow(/^HashMapValues\.addAll: /)
        map.set('x', 'v')
        expect(String(values)).toBe("HashMapValues(1) ['v']")
        expect(values.equals(values)).toBe(true)
        expect(values.equals(map.valueCollection())).toBe(false)
        expect(values.equals(new ArrayList(['v']))).toBe(false)
        values.clear()
        expect(map.size).toBe(0)
      })

      it('entrySet holds only map entries with present keys and equal values [012 S4-AC3]', () => {
        const map = makeOn(path, [
          ['a', new ArrayList([1])],
          ['b', 2],
        ])
        const entries = map.entrySet()
        const other = new HashMap<unknown, unknown>([
          ['a', new ArrayList([1])],
          ['b', 3],
        ])
        const [oa, ob] = [...other.entrySet()] as Array<MapEntry<unknown, unknown>>
        expect(entries.has(oa as never)).toBe(true)
        expect(entries.has(ob as never)).toBe(false)
        expect(entries.has(['a', [1]] as never)).toBe(false)
        expect(entries.has({ key: 'a', value: [1] } as never)).toBe(false)
        expect(entries.delete(ob as never)).toBe(false)
        expect(entries.delete(oa as never)).toBe(true)
        expect(map.has('a')).toBe(false)
        map.set('c', 3).set('d', 4)
        expect(entries.removeAll([ob, ...new HashMap([['c', 3]]).entrySet()] as never)).toBe(true)
        expect([...map.keys()]).toEqual(['b', 'd'])
        expect(entries.retainAll([...new HashMap([['d', 4]]).entrySet()] as never)).toBe(true)
        expect([...map]).toEqual([['d', 4]])
        expect(() => entries.add(oa as never)).toThrow(UnsupportedOperationError)
        expect(() => entries.addAll([oa] as never)).toThrow(/^HashMapEntrySet\.addAll: /)
        expect(String(entries)).toBe("HashMapEntrySet(1) {'d' => 4}")
        expect(entries.removeIf((e) => e.value === 4)).toBe(true)
        expect(map.size).toBe(0)
        map.set('z', 0)
        entries.clear()
        expect(map.size).toBe(0)
      })

      it('the key and entry views hash like an equal HashSet and like the map [012 S4-AC1]', () => {
        const options = path[1]()
        const map = new HashMap<unknown, unknown>(
          [
            ['a', 1],
            ['b', 2],
          ],
          options,
        )
        const standIn = (v: unknown) => (typeof v === 'string' ? v.length * 7 : 11)
        const set = new HashSet<unknown>(['b', 'a'], options as never)
        expect(map.keySet()[hashCodeSymbol](standIn)).toBe(set[hashCodeSymbol](standIn))
        expect(map.keySet().equals(set)).toBe(true)
        expect(set.equals(map.keySet())).toBe(true)
        expect(map.entrySet()[hashCodeSymbol](standIn)).toBe(map[hashCodeSymbol](standIn))
        expect(hashCode(map.entrySet())).toBe(hashCode(map))
      })

      it('removes a mapping whose key changed by its stored key or hash, without calling user functions [012 S6-AC4]', () => {
        for (const kind of ['key', 'equivalence'] as const) {
          for (const removal of [
            'cursor',
            'removeIf',
            'removeAll',
            'retainAll',
            'clear',
          ] as const) {
            const label = `${kind} ${removal}`
            const keys = [{ id: 1 }, { id: 2 }, { id: 3 }]
            const calls: unknown[] = []
            const options: HashMapOptions<{ id: number }> =
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
            const map = new HashMap<{ id: number }, string>(
              keys.map((k) => [k, `v${k.id}`] as const),
              options,
            )
            ;(keys[1] as { id: number }).id = 99 // changed while stored
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
              map.keySet().retainAll([keys[0], keys[2]] as Array<{ id: number }>)
            } else {
              map.clear()
              expect(calls, label).toEqual([])
            }
            const left = [...map.keys()].map((k) => k.id)
            const unmatched = kind === 'equivalence' && removal === 'removeAll'
            expect(left, label).toEqual(removal === 'clear' ? [] : unmatched ? [1, 99, 3] : [1, 3])
            // Only argument values were passed to user functions, never the stored keys.
            expect(calls.includes(keys[1]), label).toBe(false)
          }
        }
      })
    })
  }
})

describe('HashMap — equality, hashing and output', () => {
  it('passes another map a fallback that behaves as an ordinary value once stored [012 S7-AC1]', () => {
    const fallbacks: unknown[] = []
    const target = new HashMap<string, unknown>([['a', 1]])
    const other = new Proxy(target, {
      get(t, property) {
        if (property === 'getOrDefault') {
          return (key: string, fallback: unknown) => {
            fallbacks.push(fallback)
            return t.getOrDefault(key, fallback)
          }
        }
        const value: unknown = Reflect.get(t, property, t)
        return typeof value === 'function' ? value.bind(t) : value
      },
    })
    const map = new HashMap<string, unknown>([['a', 1]])
    expect(map.equals(other)).toBe(true)
    expect(fallbacks.length).toBe(1)
    const fallback = fallbacks[0]
    const stored = new HashMap<string, unknown>([['k', fallback]])
    expect(stored.equals(stored.copy())).toBe(true)
    expect(stored.put('k', 2)).toBe(fallback)
    stored.set('k', fallback)
    expect(stored.remove('k')).toBe(fallback)
    stored.set('k', fallback)
    expect(stored.delete('k')).toBe(true)
    expect(stored.size).toBe(0)
  })

  it('equals compares mappings both ways, whatever the order or key equality [012 S7-AC1]', () => {
    const a = new HashMap<unknown, unknown>([
      ['a', new ArrayList([1])],
      ['b', 2],
    ])
    const b = new HashMap<unknown, unknown>([
      ['b', 2],
      ['a', new ArrayList([1])],
    ])
    expect(a.equals(b)).toBe(true)
    expect(b.equals(a)).toBe(true)
    expect(a[equalsSymbol](b)).toBe(true)
    expect(a.equals(new HashMap([['a', new ArrayList([1])]]))).toBe(false)
    expect(
      a.equals(
        new HashMap<unknown, unknown>([
          ['a', new ArrayList([1])],
          ['c', 2],
        ]),
      ),
    ).toBe(false)
    expect(
      a.equals(
        new HashMap<unknown, unknown>([
          ['a', new ArrayList([9])],
          ['b', 2],
        ]),
      ),
    ).toBe(false)
    expect(new HashMap([['a', undefined]]).equals(new HashMap([['b', undefined]]))).toBe(false)
    // A map that folds case and one that does not: same size, different keys.
    const folded = new HashMap<string, number>(
      [
        ['A', 1],
        ['b', 2],
      ],
      { key: (k) => k.toLowerCase() },
    )
    const plain = new HashMap<string, number>([
      ['a', 1],
      ['b', 2],
    ])
    expect(folded.equals(plain)).toBe(plain.equals(folded))
    expect(folded.equals(plain)).toBe(false)
    for (const other of [
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
      new HashSet(['a', 'b']),
      new ArrayList([
        ['a', 1],
        ['b', 2],
      ]),
      { a: 1, b: 2 },
      null,
      undefined,
    ]) {
      expect(plain.equals(other)).toBe(false)
    }
    expect(plain.equals(plain)).toBe(true)
  })

  it('gives equal maps with the same key equality the same order-independent hash [012 S7-AC2]', () => {
    const standIn = (v: unknown) => (typeof v === 'number' ? v * 7 : 1000)
    const pairs: Array<[number, number]> = [
      [1, 10],
      [2, 20],
      [3, 30],
    ]
    const reversed = [...pairs].reverse()
    const user: Equivalence<number> = { equals: (a, b) => a === b, hash: (v) => v + 100 }
    for (const options of [
      undefined,
      { key: (v: number) => v * 10 },
      { equivalence: user },
      { equivalence: valueEquivalence as Equivalence<number> },
    ]) {
      const a = new HashMap(pairs, options)
      const b = new HashMap(reversed, options)
      expect(a[hashCodeSymbol](standIn)).toBe(b[hashCodeSymbol](standIn))
      expect(hashCode(a)).toBe(hashCode(b))
    }
    const plain = new HashMap(pairs)
    const svz = new HashMap(reversed, { equivalence: sameValueZeroEquivalence })
    expect(svz[hashCodeSymbol](standIn)).toBe(plain[hashCodeSymbol](standIn))
    expect('hashCode' in plain).toBe(false)
  })

  it('prints HashMap(n) {k => v} in insertion order with the element rules [012 S7-AC3]', () => {
    const map = new HashMap<unknown, unknown>([
      ['a', 1],
      [2, "it's"],
      [null, undefined],
      [-0, 5n],
    ])
    expect(String(map)).toBe("HashMap(4) {'a' => 1, 2 => 'it\\'s', null => undefined, 0 => 5n}")
    expect(String(new HashMap())).toBe('HashMap(0) {}')
    expect(Object.prototype.toString.call(map)).toBe('[object HashMap]')
    expect(inspect(new HashMap([['a', { b: 1 }]]))).toBe("HashMap(1) { 'a' => { b: 1 } }")
    expect(inspect(new HashMap())).toBe('HashMap(0) {}')
    expect(inspect({ inner: new HashMap([['a', 1]]) }, { depth: 0 })).toBe('{ inner: [HashMap] }')
    expect(inspect(new HashMap([['a', { b: { c: { d: 1 } } }]]), { depth: null })).toContain('d: 1')
  })

  it('toJSON returns a new array of [key, value] arrays in insertion order [012 S7-AC4]', () => {
    const map = new HashMap<unknown, unknown>([
      ['b', 1],
      ['a', [2]],
    ])
    expect(map.toJSON()).toEqual([
      ['b', 1],
      ['a', [2]],
    ])
    expect(map.toJSON()).not.toBe(map.toJSON())
    expect(JSON.stringify(map)).toBe('[["b",1],["a",[2]]]')
  })

  it('terminates equals, hashing and printing for a map that contains itself [012 S7-AC5]', () => {
    for (const path of PATHS) {
      const a = makeOn(path, [['x', 1]])
      a.set('self', a)
      a.set(a, 'key')
      expect(String(a)).toBe("HashMap(3) {'x' => 1, 'self' => [Circular], [Circular] => 'key'}")
      expect(inspect(a)).toContain('[Circular]')
      expect(a.equals(a)).toBe(true)
      expect(typeof hashCode(a)).toBe('number')
      const b = makeOn(path, [['x', 1]])
      b.set('self', b)
      b.set(b, 'key')
      expect(() => a.equals(b)).not.toThrow()
      expect(a.equals(b)).toBe(b.equals(a))
    }
    const value = new HashMap<unknown, unknown>([['x', 1]], { equivalence: valueEquivalence })
    value.set('self', value)
    const other = new HashMap<unknown, unknown>([['x', 1]], { equivalence: valueEquivalence })
    other.set('self', other)
    expect(value.equals(other)).toBe(other.equals(value))
    expect(typeof hashCode(value)).toBe('number')
  })
})

describe('HashMap — construction', () => {
  it('sets each pair in input order, later pairs replacing earlier ones [012 S8-AC1]', () => {
    const pairs: Array<[string, number]> = [
      ['a', 1],
      ['b', 2],
      ['a', 3],
    ]
    for (const map of [new HashMap(pairs), HashMap.from(pairs)]) {
      expect([...map]).toEqual([
        ['a', 3],
        ['b', 2],
      ])
    }
    const source = new HashMap([['x', 1]])
    const fromEntries = new HashMap([...source.entrySet()])
    expect([...fromEntries]).toEqual([['x', 1]])
    expect([...new HashMap(new Map([['n', 1]]))]).toEqual([['n', 1]])
    expect([...new HashMap(source)]).toEqual([['x', 1]])
  })

  it('rejects an item that is not a pair of length 2 or a map entry before inserting anything [012 S8-AC2]', () => {
    const bad: unknown[] = [{ 0: 'a', 1: 1 }, ['a'], ['a', 1, 2], 'ab', null]
    for (const item of bad) {
      const input = [['ok', 1], item] as never
      const error = caught(() => new HashMap(input))
      expect(error, String(item)).toBeInstanceOf(TypeError)
      expect(
        (error as Error).message.startsWith('HashMap: item 1 is not a [key, value] pair'),
      ).toBe(true)
      expect(messageOf(() => HashMap.from(input)).startsWith('HashMap.from: item 1 ')).toBe(true)
    }
    let keyCalls = 0
    expect(() =>
      HashMap.from([['a', 1], ['b']] as never, {
        key: (k) => {
          keyCalls++
          return k as string
        },
      }),
    ).toThrow(TypeError)
    expect(keyCalls).toBe(0)
    expect(messageOf(() => HashMap.from(5 as never))).toBe(
      'HashMap.from: entries is not iterable (5)',
    )
    expect(() => HashMap.from(null as never)).toThrow(TypeError)
  })

  it('stores prototype-named strings as ordinary keys [012 S8-AC3]', () => {
    const map = new HashMap<string, unknown>([
      ['__proto__', 1],
      ['constructor', 2],
      ['prototype', 3],
    ])
    expect(map.size).toBe(3)
    expect(map.get('__proto__')).toBe(1)
    expect(map.get('constructor')).toBe(2)
    expect(Object.getPrototypeOf(map)).toBe(HashMap.prototype)
    expect(({} as Record<string, unknown>).constructor).toBe(Object)
    const keyed = new HashMap<string, number>([['__proto__', 1]], { key: (k) => k })
    expect(keyed.get('__proto__')).toBe(1)
  })

  it('reads an iterable first argument as entries and a plain object as options [012 S8-AC4]', () => {
    expect(new HashMap().size).toBe(0)
    expect(new HashMap(undefined).size).toBe(0)
    expect(new HashMap(null).size).toBe(0)
    const ignored = new HashMap({ a: 1 } as never)
    expect(ignored.size).toBe(0)
    const keyed = new HashMap<string, number>({ key: (k) => k.toLowerCase() })
    keyed.set('A', 1).set('a', 2)
    expect(keyed.size).toBe(1)
    const both = new HashMap<string, number>(null, { key: (k) => k.toLowerCase() })
    both.set('A', 1).set('a', 2)
    expect(both.size).toBe(1)
    expect(messageOf(() => new HashMap(5 as never))).toBe('HashMap: entries is not iterable (5)')
    expect(() => new HashMap({ a: 1 } as never, {})).toThrow(TypeError)
    expect(() => new HashMap((() => 1) as never)).toThrow(TypeError)
    expect(messageOf(() => new HashMap([], 5 as never))).toBe(
      'HashMap: options is not an object (5)',
    )
  })

  it('copy is independent, keeps order and options, and calls no user function [012 S8-AC5]', () => {
    for (const kind of ['key', 'equivalence'] as const) {
      const { map, calls } = counted(kind)
      map.set('a', 1).set('b', 2)
      calls.length = 0
      const copy = map.copy()
      expect(calls).toEqual([])
      expect([...copy]).toEqual([...map])
      expect(copy).toBeInstanceOf(HashMap)
      copy.set('a', 10)
      copy.delete('b')
      expect([...map]).toEqual([
        ['a', 1],
        ['b', 2],
      ])
      expect(copy.has('a')).toBe(true)
      expect(calls.length).toBe(3) // the copy kept the same key or hash function
    }
    const plain = new HashMap([['x', 1]])
    const copy = plain.copy()
    copy.set('x', 2)
    expect(plain.get('x')).toBe(1)
  })

  it('putAll reads and checks the whole argument first, accepts itself, and keeps mappings set before an error [012 S2-AC3]', () => {
    const map = new HashMap<string, number>([['a', 1]])
    map.putAll([
      ['b', 2],
      ['a', 3],
    ])
    expect([...map]).toEqual([
      ['a', 3],
      ['b', 2],
    ])
    map.putAll(map)
    expect(map.size).toBe(2)
    map.putAll(new Map([['c', 4]]))
    map.putAll(new HashMap([['d', 5]]).entrySet())
    expect([...map.keys()]).toEqual(['a', 'b', 'c', 'd'])
    const revision = map.revision
    expect(messageOf(() => map.putAll(5 as never))).toBe(
      'HashMap.putAll: entries is not iterable (5)',
    )
    expect(() => map.putAll([['e', 6], ['f']] as never)).toThrow(TypeError)
    expect(map.has('e')).toBe(false)
    expect(map.revision).toBe(revision)
    const failure = new Error('cannot key')
    const keyed = new HashMap<string, number>({
      key: (k) => {
        if (k === 'bad') throw failure
        return k
      },
    })
    expect(
      caught(() =>
        keyed.putAll([
          ['a', 1],
          ['bad', 2],
          ['c', 3],
        ]),
      ),
    ).toBe(failure)
    expect([...keyed]).toEqual([['a', 1]])
  })

  it('is recognised as a map, never as a collection, and instanceof uses the brand [012 S9-AC4]', () => {
    const map = new HashMap()
    expect(isMapCollection(map)).toBe(true)
    expect(isCollection(map)).toBe(false)
    expect(isSetCollection(map)).toBe(false)
    for (const value of [
      new Map(),
      new HashSet(),
      new ArrayList(),
      map.keySet(),
      {},
      null,
      undefined,
    ]) {
      expect(isMapCollection(value)).toBe(false)
    }
    expect(map instanceof HashMap).toBe(true)
    expect(new Map() instanceof HashMap).toBe(false)
  })
})

describe('HashMap — shared contracts', () => {
  const sumOf = (elements: unknown[], hash: (value: unknown) => number) =>
    elements.reduce<number>((h, e) => (h + hash(e)) | 0, 0)
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      describeMapCollection('HashMap', (initial) => makeOn(path, initial))

      // Each view is filled through the map that owns it.
      const owners = new WeakMap<object, HashMap<unknown, unknown>>()
      const ownerOf = (view: object) => owners.get(view) as HashMap<unknown, unknown>
      const keySet = (initial: Iterable<unknown> = []) => {
        const map = makeOn(path)
        for (const e of initial) map.set(e, e)
        const view = map.keySet()
        owners.set(view, map)
        return view
      }
      const entrySet = (initial: Iterable<unknown> = []) => {
        const map = makeOn(path)
        for (const e of initial) map.set(e, e)
        const view = map.entrySet() as unknown as ReturnType<typeof keySet>
        owners.set(view, map)
        return view
      }
      let nextKey = 0
      const valueCollection = (initial: Iterable<unknown> = []) => {
        const map = makeOn(path)
        for (const e of initial) map.set(`k${nextKey++}`, e)
        const view = map.valueCollection()
        owners.set(view, map)
        return view
      }
      const storedHashes = path[0] === 'equivalence'
      describeCollection('HashMapKeySet', keySet, {
        iteration: 'live',
        brackets: 'set',
        nullElements: 'store',
        peers: [(initial?: Iterable<unknown>) => new HashSet<unknown>(initial)],
        structural: {
          expectedHash: (elements, hash) =>
            storedHashes ? sumOf(elements, sameValueZeroEquivalence.hash) : sumOf(elements, hash),
        },
        insert: (view, e) => {
          ownerOf(view).set(e, e)
        },
      })
      describeSetCollection('HashMapKeySet', keySet, {
        insert: (view, e) => {
          ownerOf(view).set(e, e)
        },
      })
      describeSetCollection('HashMapEntrySet', entrySet, {
        insert: (view, e) => {
          ownerOf(view).set(e, e)
        },
        member: (entry) => (entry as MapEntry<unknown, unknown>).key,
        probe: (e) => [...new HashMap([[e, e]]).entrySet()][0],
        printed: (text) => `${text} => ${text}`,
      })
      it('runs the map contract on the map, the set contract on its key and entry views and the collection contract on its value view, filled through the map [012 S9-AC2]', () => {
        const views = [keySet([1, 2]), entrySet([1, 2]), valueCollection([1, 2])]
        expect(views.map((view) => String(view))).toEqual([
          'HashMapKeySet(2) {1, 2}',
          'HashMapEntrySet(2) {1 => 1, 2 => 2}',
          'HashMapValues(2) [1, 2]',
        ])
        for (const view of views) {
          const owner = ownerOf(view)
          expect(isMapCollection(owner)).toBe(true)
          expect(() => view.add(3)).toThrow(UnsupportedOperationError)
          owner.set('late', 'late')
          expect(view.size).toBe(3)
        }
      })

      describeCollection('HashMapValues', valueCollection, {
        iteration: 'live',
        brackets: 'list',
        nullElements: 'store',
        insert: (view, e) => {
          ownerOf(view).set(`k${nextKey++}`, e)
        },
      })
    })
  }
})

describe('HashMap — reference model against a native Map', () => {
  const runs: Array<[string, () => HashMapOptions<number> | undefined]> = [
    ['default', () => undefined],
    ['key', () => ({ key: (k: number) => k })],
    [
      'equivalence',
      () => ({
        equivalence: {
          equals: (a: number, b: number) => sameValueZeroEquivalence.equals(a, b),
          hash: (k: number) => sameValueZeroEquivalence.hash(k),
        },
      }),
    ],
    [
      'equivalence with few hashes',
      () => ({ equivalence: { equals: (a: number, b: number) => a === b, hash: (k) => k % 6 } }),
    ],
  ]
  for (const [label, options] of runs) {
    it(`matches results, size, order and open iterators across growth and shrinking (${label}) [012 S9-AC3]`, () => {
      for (const seed of [1, 2, 3]) {
        runMapReferenceModel({
          seed,
          steps: 1500,
          keys: 300,
          bulk: true,
          make: () => new HashMap<number, number>(undefined, options()),
        })
      }
      runMapReferenceModel({
        seed: 4,
        steps: 600,
        make: () => new HashMap<number, number>(undefined, options()),
      })
    })
  }
})

describe('HashMap.getOrInsertComputed with value keys', () => {
  it('keeps the key object the callback inserted when it overwrites in place [012 S2-AC7]', () => {
    type Id = { id: number }
    const paths: Array<HashMapOptions<Id>> = [
      { key: (k) => k.id },
      { equivalence: { equals: (a, b) => a.id === b.id, hash: (k) => k.id } },
    ]
    for (const options of paths) {
      const map = new HashMap<Id, string>(undefined, options)
      const outer: Id = { id: 1 }
      const inner: Id = { id: 1 }
      const result = map.getOrInsertComputed(outer, () => {
        map.set(inner, 'inner')
        return 'outer'
      })
      expect(result).toBe('outer')
      expect(map.size).toBe(1)
      expect([...map.keys()][0]).toBe(inner)
      expect(map.get(outer)).toBe('outer')
    }
  })
})
