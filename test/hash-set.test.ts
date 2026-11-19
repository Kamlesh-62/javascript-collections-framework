import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ArrayDeque } from '../src/collections/array-deque'
import { ArrayList } from '../src/collections/array-list'
import { HashSet, type HashSetOptions } from '../src/collections/hash-set'
import * as lib from '../src/index'
import {
  ConcurrentModificationError,
  type Equivalence,
  hashCode,
  hashCodeSymbol,
  isSetCollection,
  type KeyOf,
  sameValueZeroEquivalence,
  valueEquivalence,
} from '../src/index'
import { setBucketSeedSourceForTesting } from '../src/internal/engines/hash-table'
import { describeCollection } from './contracts/collection'
import { runContractPair } from './contracts/pairs'
import { fixHashSeed } from './support/hash-seed'
import { runReferenceModel } from './support/reference-model'

fixHashSeed()
// Bucket seeds come from a counter, so layouts are the same on every run; tests that count seeds
// install their own source.
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

/** A user-written SameValueZero equivalence: a new object, so the set uses its buckets. */
function sameValueZeroUser(): Equivalence<unknown> {
  return {
    equals: (a, b) => sameValueZeroEquivalence.equals(a, b),
    hash: (value) => sameValueZeroEquivalence.hash(value),
  }
}

type Path = readonly [string, () => HashSetOptions<unknown> | undefined]

/** The three ways a set can compare members: native, by derived key, by an equivalence. */
const PATHS: readonly Path[] = [
  ['default', () => undefined],
  ['key', () => ({ key: identityKey() as KeyOf<unknown> })],
  ['equivalence', () => ({ equivalence: sameValueZeroUser() })],
]

function makeOn(path: Path, initial?: Iterable<unknown>): HashSet<unknown> {
  return new HashSet<unknown>(initial, path[1]())
}

/** Runs the same scripted changes inside a loop over `ours` and over a native Set. */
function liveRun(
  ours: {
    forEachValue(visit: (value: number) => void): void
    add(v: number): void
    delete(v: number): void
    clear(): void
  },
  theirs: Set<number>,
  script: (
    value: number,
    apply: { add(v: number): void; delete(v: number): void; clear(): void },
  ) => void,
): [number[], number[]] {
  const seenOurs: number[] = []
  ours.forEachValue((value) => {
    seenOurs.push(value)
    script(value, ours)
  })
  const seenTheirs: number[] = []
  for (const value of theirs) {
    seenTheirs.push(value)
    script(value, theirs)
  }
  return [seenOurs, seenTheirs]
}

describe('HashSet — membership like a native Set', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      it('add adds a new member, keeps an equal one and its place, and returns the set [011 S1-AC1]', () => {
        const set = makeOn(path, ['a', 'b'])
        expect(set.add('c')).toBe(set)
        const revision = set.revision
        expect(set.add('a')).toBe(set)
        expect(set.revision).toBe(revision)
        expect(set.toArray()).toEqual(['a', 'b', 'c'])
      })

      it('has reports whether a member equals the value [011 S1-AC2]', () => {
        const set = makeOn(path, [1, 'x'])
        expect(set.has(1)).toBe(true)
        expect(set.has('x')).toBe(true)
        expect(set.has('1')).toBe(false)
        expect(set.has(2)).toBe(false)
      })

      it('delete removes the equal member and reports whether it did [011 S1-AC3]', () => {
        const set = makeOn(path, [1, 2, 3])
        expect(set.delete(2)).toBe(true)
        expect(set.toArray()).toEqual([1, 3])
        expect(set.delete(2)).toBe(false)
        expect(set.size).toBe(2)
      })

      it('turns -0 into 0 on add, has, delete, the constructor and bulk lookups [011 S1-AC6]', () => {
        const set = makeOn(path, [-0])
        expect(Object.is(set.toArray()[0], 0)).toBe(true)
        expect(set.has(-0)).toBe(true)
        expect(set.has(0)).toBe(true)
        expect(set.delete(-0)).toBe(true)
        set.add(-0)
        expect(Object.is(set.toArray()[0], 0)).toBe(true)
        expect(set.removeAll([-0])).toBe(true)
        set.add(0).add(1)
        expect(set.retainAll([-0])).toBe(true)
        expect(set.toArray()).toEqual([0])
        const from = HashSet.from([-0], path[1]())
        expect(Object.is(from.toArray()[0], 0)).toBe(true)
      })
    })
  }

  it('compares with SameValueZero by default, exactly as a native Set [011 S1-AC4]', () => {
    const a = {}
    const b = {}
    const values = [a, b, Number.NaN, Number.NaN, 0, -0, 1, '1']
    const set = new HashSet<unknown>(values)
    const native = new Set<unknown>(values)
    expect(set.size).toBe(native.size)
    expect(set.toArray()).toEqual([...native])
    expect(set.has({})).toBe(false)
    expect(set.has(Number.NaN)).toBe(true)
  })

  it('holds null and undefined as two distinct members by default [011 S1-AC5]', () => {
    const set = new HashSet<unknown>([null, undefined, null, undefined])
    expect(set.size).toBe(2)
    expect(set.has(null)).toBe(true)
    expect(set.has(undefined)).toBe(true)
    expect(set.delete(null)).toBe(true)
    expect(set.toArray()).toEqual([undefined])
  })

  it('never passes -0 to key, equals or hash [011 S1-AC6]', () => {
    const seen: unknown[] = []
    const keyed = new HashSet<number>({
      key: (v) => {
        seen.push(v)
        return v
      },
    })
    const bucketed = new HashSet<number>({
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
    for (const set of [keyed, bucketed]) {
      set.add(-0)
      set.add(-0)
      set.has(-0)
      set.removeAll([-0])
      set.add(-0)
      set.retainAll([-0])
      set.delete(-0)
    }
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.some((v) => Object.is(v, -0))).toBe(false)
  })
})

describe('HashSet — value equality on request', () => {
  it('treats values with SameValueZero-equal keys as one member and stores the values [011 S2-AC1]', () => {
    const first = { id: 1, name: 'first' }
    const second = { id: 1, name: 'second' }
    const set = new HashSet<{ id: number; name: string }>({ key: (user) => user.id })
    set.add(first).add(second).add({ id: Number.NaN, name: 'n' }).add({ id: Number.NaN, name: 'm' })
    expect(set.size).toBe(2)
    expect(set.toArray()[0]).toBe(first)
    expect(set.has({ id: 1, name: 'other' })).toBe(true)
    expect([...set].map((u) => u.name)).toEqual(['first', 'n'])
  })

  it('uses the native engine for sameValueZeroEquivalence, never calling protocol methods [011 S2-AC4]', () => {
    let calls = 0
    class Loud {
      [Symbol.for('javascript-collections-framework.equals')](): boolean {
        calls++
        return true
      }
      [Symbol.for('javascript-collections-framework.hashCode')](): number {
        calls++
        return 1
      }
    }
    let draws = 0
    setBucketSeedSourceForTesting(() => draws++)
    const set = new HashSet<unknown>([new Loud(), new Loud()], {
      equivalence: sameValueZeroEquivalence,
    })
    expect(set.size).toBe(2)
    expect(set.has(new Loud())).toBe(false)
    expect(calls).toBe(0)
    expect(draws).toBe(0) // no bucket table was created
    const plain = new HashSet<unknown>([new Loud()], { equivalence: valueEquivalence })
    expect(draws).toBe(1) // valueEquivalence uses the seeded buckets
    expect(plain.has(new Loud())).toBe(true)
    expect(calls).toBeGreaterThan(0)
  })
})

describe('HashSet — native Set compatibility', () => {
  for (const path of PATHS) {
    it(`keys and values iterate in insertion order; entries yields pairs (${path[0]}) [011 S3-AC1]`, () => {
      const set = makeOn(path, ['b', 'a', 'c'])
      expect([...set.keys()]).toEqual(['b', 'a', 'c'])
      expect([...set.values()]).toEqual(['b', 'a', 'c'])
      expect([...set.entries()]).toEqual([
        ['b', 'b'],
        ['a', 'a'],
        ['c', 'c'],
      ])
      const native = new Set(['b', 'a', 'c'])
      expect([...set.entries()]).toEqual([...native.entries()])
    })

    it(`forEach calls action(e, e, set) with thisArg (${path[0]}) [011 S3-AC2]`, () => {
      const set = makeOn(path, [1, 2])
      const calls: unknown[][] = []
      const self = { tag: 'this' }
      set.forEach(function (this: unknown, a, b, owner) {
        calls.push([a, b, owner, this])
      }, self)
      expect(calls).toEqual([
        [1, 1, set, self],
        [2, 2, set, self],
      ])
      expect(() => set.forEach('x' as never)).toThrow(TypeError)
    })

    it(`works with new Set, spread and native set methods (${path[0]}) [011 S3-AC3]`, () => {
      const set = makeOn(path, [3, 1, 2])
      expect(typeof set.size).toBe('number')
      expect([...new Set(set)]).toEqual([3, 1, 2])
      expect([...set]).toEqual([3, 1, 2])
      const union = (Set.prototype as { union?: (other: unknown) => Set<unknown> }).union
      if (typeof union === 'function') {
        expect([...union.call(new Set([9]), set)]).toEqual([9, 3, 1, 2])
        const isSubsetOf = (Set.prototype as unknown as { isSubsetOf: (o: unknown) => boolean })
          .isSubsetOf
        expect(isSubsetOf.call(new Set([1, 2]), set)).toBe(true)
      }
    })
  }
})

describe('HashSet — live iteration like a native Set', () => {
  for (const path of PATHS) {
    describe(`on the ${path[0]} path`, () => {
      it('yields each member once in insertion order; a re-added member moves to the end [011 S6-AC1]', () => {
        const set = makeOn(path, [1, 2, 3, 2])
        expect(set.toArray()).toEqual([1, 2, 3])
        set.delete(1)
        set.add(1)
        expect(set.toArray()).toEqual([2, 3, 1])
      })

      it('for…of and forEach match a native Set step for step across growth and shrinking [011 S6-AC2]', () => {
        const script = (
          value: number,
          target: { add(v: number): void; delete(v: number): void },
        ): void => {
          if (value < 150) {
            target.add(value + 3)
            target.add(value + 1000)
            target.delete(value + 1)
          }
          if (value === 60) for (let i = 0; i < 1200; i++) target.delete(i + 1000)
          if (value === 90) target.delete(0)
          if (value === 91) target.add(0)
        }
        for (const style of ['for-of', 'forEach'] as const) {
          const set = makeOn(path, [0, 1, 2, 3, 4]) as unknown as HashSet<number>
          const ours = {
            forEachValue(visit: (value: number) => void) {
              if (style === 'forEach')
                set.forEach((v) => {
                  visit(v)
                })
              else for (const v of set) visit(v)
            },
            add: (v: number) => set.add(v),
            delete: (v: number) => set.delete(v),
            clear: () => set.clear(),
          }
          const [mine, native] = liveRun(ours, new Set([0, 1, 2, 3, 4]), script)
          expect(mine.length).toBeGreaterThan(100)
          expect(mine).toEqual(native)
        }
      })

      it('ends an iteration on clear and visits members added after it [011 S6-AC3]', () => {
        const set = makeOn(path, [1, 2, 3])
        const seen: unknown[] = []
        for (const value of set) {
          seen.push(value)
          if (value === 1) {
            set.clear()
            set.add(7)
            set.add(8)
          }
        }
        expect(seen).toEqual([1, 7, 8])
        const it = set[Symbol.iterator]()
        set.clear()
        expect(it.next().done).toBe(true)
        set.add(1)
        expect(it.next().done).toBe(true)
      })

      it('continues with the remaining members after a cursor removal [011 S6-AC4]', () => {
        const set = makeOn(path, [1, 2, 3, 4, 5])
        const cursor = set.cursor()
        const seen: unknown[] = []
        while (cursor.hasNext()) {
          const value = cursor.next() as number
          seen.push(value)
          if (value % 2 === 0) cursor.remove()
          if (value === 3) {
            set.delete(1)
            set.add(1)
          }
        }
        expect(seen).toEqual([1, 2, 3, 4, 5, 1])
        expect(set.toArray()).toEqual([3, 5, 1])
      })
    })
  }

  it('matches a native Set across bucket re-seeding on the equivalence path [011 S6-AC2]', () => {
    let draws = 0
    setBucketSeedSourceForTesting(() => 0x1000 + draws++)
    // Few distinct hashes make long chains of different hashes, so the buckets are re-seeded.
    const set = new HashSet<number>([0, 1, 2], {
      equivalence: { equals: (a, b) => a === b, hash: (v) => v % 5 },
    })
    const native = new Set([0, 1, 2])
    const script = (value: number, target: { add(v: number): void; delete(v: number): void }) => {
      if (value < 300) target.add(value + 3)
      if (value % 7 === 0) target.delete(value + 1)
    }
    const ours = {
      forEachValue: (visit: (value: number) => void) => {
        for (const v of set) visit(v)
      },
      add: (v: number) => set.add(v),
      delete: (v: number) => set.delete(v),
      clear: () => set.clear(),
    }
    const [mine, theirs] = liveRun(ours, native, script)
    expect(mine).toEqual(theirs)
    expect(draws).toBeGreaterThan(1) // one seed for the table, more for re-seeds
  })

  it('is recognised as a set and never as a list, queue or sequenced collection [011 S9-AC1]', () => {
    expect(isSetCollection(new HashSet())).toBe(true)
    expect(isSetCollection(new Set())).toBe(false)
    expect(typeof hashCode(new HashSet([1]))).toBe('number')
  })
})

describe('HashSet — the equivalence path and user functions', () => {
  const caseless: Equivalence<string> = {
    equals: (a, b) => a.toLowerCase() === b.toLowerCase(),
    hash: (s) => hashCode(s.toLowerCase()),
  }

  it('decides membership only by the equivalence [011 S2-AC2]', () => {
    const set = new HashSet(['Apple', 'apple', 'APPLE', 'pear'], { equivalence: caseless })
    expect(set.toArray()).toEqual(['Apple', 'pear'])
    expect(set.has('aPPle')).toBe(true)
    expect(set.delete('PEAR')).toBe(true)
    expect(set.toArray()).toEqual(['Apple'])
  })

  it('treats distinct objects equal under the protocol as one member with valueEquivalence [011 S2-AC3]', () => {
    const equalsKey = Symbol.for('javascript-collections-framework.equals')
    const hashKey = Symbol.for('javascript-collections-framework.hashCode')
    class Point {
      constructor(
        readonly x: number,
        readonly y: number,
      ) {}
      [equalsKey](other: unknown): boolean {
        return other instanceof Point && other.x === this.x && other.y === this.y
      }
      [hashKey](hash: (v: unknown) => number): number {
        return hash(this.x) * 31 + hash(this.y)
      }
    }
    const first = new Point(1, 2)
    const set = new HashSet<Point>([first, new Point(1, 2), new Point(2, 1)], {
      equivalence: valueEquivalence as Equivalence<Point>,
    })
    expect(set.size).toBe(2)
    expect(set.toArray()[0]).toBe(first)
    expect(set.has(new Point(2, 1))).toBe(true)
    expect(new HashSet([new Point(1, 2), new Point(1, 2)]).size).toBe(2) // default: identity
  })

  it('calls key and equivalence functions for null and undefined and lets their errors propagate [011 S2-AC8]', () => {
    const keys: unknown[] = []
    const keyed = new HashSet<unknown>([null, undefined], {
      key: (v) => {
        keys.push(v)
        return 'same'
      },
    })
    expect(keys).toEqual([null, undefined])
    expect(keyed.size).toBe(1)
    expect(keyed.toArray()).toEqual([null])
    const hashed: unknown[] = []
    const bucketed = new HashSet<unknown>([null, undefined], {
      equivalence: {
        equals: (a, b) => a === b,
        hash: (v) => {
          hashed.push(v)
          return 0
        },
      },
    })
    expect(hashed).toEqual([null, undefined])
    expect(bucketed.size).toBe(2)
    const failure = new Error('no nulls')
    const strict = new HashSet<{ id: number } | null>({
      key: (v) => {
        if (v === null) throw failure
        return v.id
      },
    })
    expect(caught(() => strict.add(null))).toBe(failure)
    expect(strict.size).toBe(0)
  })

  it('keeps equals calls per operation constant over a seeded workload [011 S5-AC1]', () => {
    let equalsCalls = 0
    let operations = 0
    const set = new HashSet<number>({
      equivalence: {
        equals: (a, b) => {
          equalsCalls++
          return a === b
        },
        hash: (v) => hashCode(v),
      },
    })
    let state = 0x2026
    const next = () => {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0
      return state % 5000
    }
    for (let i = 0; i < 20000; i++) {
      const v = next()
      const op = i % 3
      if (op === 0) set.add(v)
      else if (op === 1) set.has(v)
      else set.delete(next())
      operations++
    }
    expect(equalsCalls / operations).toBeLessThanOrEqual(2)
  })

  it('calls key or hash once per argument value per operation and never for stored members [011 S5-AC7]', () => {
    for (const kind of ['key', 'equivalence'] as const) {
      const calls: number[] = []
      const record = (v: number): number => {
        calls.push(v)
        return v
      }
      const options: HashSetOptions<number> =
        kind === 'key'
          ? { key: record }
          : { equivalence: { equals: (a, b) => a === b, hash: (v) => record(v) % 7 } }
      const set = new HashSet<number>(options)
      const expectCalls = (expected: number[], what: string) => {
        expect(calls, `${kind} ${what}`).toEqual(expected)
        calls.length = 0
      }
      // Grow past several thresholds (and, with only 7 hashes, through re-seeding).
      for (let i = 0; i < 300; i++) set.add(i)
      expectCalls(
        Array.from({ length: 300 }, (_, i) => i),
        'add',
      )
      set.add(5)
      expectCalls([5], 'add of a present member')
      set.has(7)
      expectCalls([7], 'has')
      set.delete(8)
      expectCalls([8], 'delete')
      set.removeIf((v) => v >= 20)
      expectCalls([], 'removeIf (shrinks)')
      set.removeAll([1, 2, 99])
      expectCalls([1, 2, 99], 'removeAll')
      set.retainAll([3, 4, 5, 6, 7])
      expectCalls([3, 4, 5, 6, 7], 'retainAll')
      const cursor = set.cursor()
      cursor.next()
      cursor.remove()
      expectCalls([], 'cursor remove')
      set.addAll([40, 41])
      expectCalls([40, 41], 'addAll')
      const copy = set.copy()
      expectCalls([], 'copy')
      expect(copy.equals(set)).toBe(true)
      expect(calls.length).toBe(2 * set.size)
      calls.length = 0
      String(set)
      set.toArray()
      set.clear()
      expectCalls([], 'clear')
    }
  })

  it('throws ConcurrentModificationError naming the method when a callback changes the set [011 S6-AC5]', () => {
    let target: HashSet<number> | undefined
    let action: ((set: HashSet<number>) => void) | undefined
    const run = (v: number): number => {
      const act = action
      action = undefined
      if (act !== undefined && target !== undefined) act(target)
      return v
    }
    for (const kind of ['key', 'equivalence'] as const) {
      const options: HashSetOptions<number> =
        kind === 'key'
          ? { key: run }
          : { equivalence: { equals: (a, b) => a === b, hash: (v) => run(v) } }
      const set = new HashSet<number>([1, 2, 3], options)
      target = set
      action = (s) => s.add(10)
      expect(messageOf(() => set.add(4))).toBe(
        'HashSet.add: the set was changed by a key, equals or hash function',
      )
      expect(set.has(4)).toBe(false) // the outer add made no change
      expect(set.has(10)).toBe(true) // the callback's change stays
      action = (s) => s.delete(10)
      expect(() => set.delete(1)).toThrow(ConcurrentModificationError)
      expect(set.has(1)).toBe(true)
      expect(set.has(10)).toBe(false)
      action = (s) => s.clear()
      expect(messageOf(() => set.has(1))).toContain('HashSet.has: ')
      expect(set.size).toBe(0)
      set.addAll([1, 2, 3])
      action = (s) => {
        s.has(1) // reads are allowed
        s.toArray()
      }
      expect(set.add(5)).toBe(set)
      expect(set.has(5)).toBe(true)
      const failure = new Error('callback failed')
      action = () => {
        throw failure
      }
      expect(caught(() => set.add(6))).toBe(failure)
      expect(set.has(6)).toBe(false)
      // addAll keeps what it added before the failing element.
      let count = 0
      action = undefined
      const before = set.size
      const failing = new HashSet<number>(
        kind === 'key'
          ? {
              key: (v) => {
                if (++count === 3) throw failure
                return v
              },
            }
          : {
              equivalence: {
                equals: (a, b) => a === b,
                hash: (v) => {
                  if (++count === 3) throw failure
                  return v
                },
              },
            },
      )
      expect(caught(() => failing.addAll([7, 8, 9, 10]))).toBe(failure)
      expect(failing.toArray()).toEqual([7, 8])
      expect(set.size).toBe(before)
      // removeAll and retainAll change nothing when a callback changes the set while deciding.
      action = (s) => s.add(77)
      expect(() => set.removeAll([1, 2])).toThrow(ConcurrentModificationError)
      expect(set.has(1)).toBe(true)
      expect(set.has(77)).toBe(true)
      action = (s) => s.add(78)
      expect(messageOf(() => set.retainAll([1]))).toContain('HashSet.retainAll: ')
      expect(set.has(2)).toBe(true)
    }
  })

  it('throws when an equals function changes the set while comparing [011 S6-AC5]', () => {
    let target: HashSet<number> | undefined
    let armed = false
    const set = new HashSet<number>([1, 2], {
      equivalence: {
        equals: (a, b) => {
          if (armed && target !== undefined) {
            armed = false
            target.delete(2)
          }
          return a === b
        },
        hash: () => 0,
      },
    })
    target = set
    armed = true
    expect(messageOf(() => set.add(3))).toBe(
      'HashSet.add: the set was changed by a key, equals or hash function',
    )
    expect(set.toArray()).toEqual([1])
  })

  it('does not crash when a member changes its key or hash while stored [011 S6-AC6]', () => {
    const item = { id: 1 }
    const keyed = new HashSet<{ id: number }>([item, { id: 2 }], { key: (v) => v.id })
    item.id = 5
    expect(() => keyed.has(item)).not.toThrow()
    expect(() => keyed.add(item)).not.toThrow()
    expect(keyed.size).toBeGreaterThanOrEqual(2)
    const bucketed = new HashSet<{ id: number }>([item], {
      equivalence: { equals: (a, b) => a.id === b.id, hash: (v) => v.id },
    })
    item.id = 6
    expect(() => bucketed.delete(item)).not.toThrow()
    expect(() => [...bucketed, bucketed.toArray(), String(bucketed)]).not.toThrow()
  })

  it('removes a member whose key or hash changed by its stored entry, without calling user functions [011 S6-AC7]', () => {
    for (const kind of ['key', 'equivalence'] as const) {
      let calls = 0
      const idOf = (v: { id: number }): number => {
        calls++
        return v.id
      }
      const options: HashSetOptions<{ id: number }> =
        kind === 'key'
          ? { key: idOf }
          : { equivalence: { equals: (a, b) => a.id === b.id, hash: idOf } }
      const make = () => {
        const items = [{ id: 1 }, { id: 2 }, { id: 3 }]
        const set = new HashSet(items, options)
        for (const item of items) item.id += 100
        calls = 0
        return { set, items }
      }
      let { set, items } = make()
      const cursor = set.cursor()
      cursor.next()
      cursor.remove()
      expect(set.toArray()).toEqual([items[1], items[2]])
      ;({ set, items } = make())
      set.removeIf((v) => v === items[0])
      expect(set.toArray()).toEqual([items[1], items[2]])
      ;({ set, items } = make())
      set.clear()
      expect(set.size).toBe(0)
      expect(calls, kind).toBe(0)
      ;({ set, items } = make())
      set.retainAll([])
      expect(set.size).toBe(0)
      expect(calls, kind).toBe(0)
      if (kind === 'key') {
        ;({ set, items } = make())
        set.removeAll([{ id: 2 }]) // matched against the stored key, not a recomputed one
        expect(set.toArray()).toEqual([items[0], items[2]])
        expect(calls).toBe(1) // only the argument
        ;({ set, items } = make())
        set.retainAll([{ id: 3 }])
        expect(set.toArray()).toEqual([items[2]])
      }
    }
  })

  it('a cursor whose last member is already gone deletes it by value, removing an equal member added again [011 S6-AC7]', () => {
    for (const path of PATHS) {
      const set = makeOn(path, ['a', 'b'])
      const cursor = set.cursor()
      expect(cursor.next()).toBe('a')
      set.delete('a')
      set.add('a')
      expect(set.toArray()).toEqual(['b', 'a'])
      cursor.remove()
      expect(set.toArray(), path[0]).toEqual(['b'])
      const other = makeOn(path, ['x'])
      const c2 = other.cursor()
      c2.next()
      other.delete('x')
      expect(() => c2.remove()).not.toThrow()
      expect(other.size).toBe(0)
    }
    const first = { id: 1 }
    const second = { id: 1 }
    const keyed = new HashSet<{ id: number }>([first], { key: (v) => v.id })
    const cursor = keyed.cursor()
    cursor.next()
    keyed.delete(first)
    keyed.add(second)
    cursor.remove()
    expect(keyed.size).toBe(0)
  })
})

describe('HashSet — option checks', () => {
  it('reads equivalence functions once and calls them with this set to the equivalence [011 S8-AC1]', () => {
    let reads = 0
    const receivers: unknown[] = []
    const equivalence = {
      get equals() {
        reads++
        return function (this: unknown, a: unknown, b: unknown) {
          receivers.push(this)
          return a === b
        }
      },
      get hash() {
        reads++
        return function (this: unknown) {
          receivers.push(this)
          return 0
        }
      },
    }
    const set = new HashSet<unknown>([1, 2], { equivalence })
    set.has(2)
    set.delete(1)
    expect(reads).toBe(2)
    expect(receivers.length).toBeGreaterThan(0)
    expect(receivers.every((r) => r === equivalence)).toBe(true)
  })

  it('rejects an invalid equivalence naming the constructor before storing anything [011 S8-AC1]', () => {
    const message = 'HashSet: equivalence must be an object with equals and hash functions'
    for (const bad of [null, 5, 'x', {}, { equals: () => true }, { hash: () => 0 }]) {
      expect(messageOf(() => new HashSet([1], { equivalence: bad as never }))).toBe(message)
    }
    expect(messageOf(() => HashSet.from([1], { equivalence: null as never }))).toBe(
      'HashSet.from: equivalence must be an object with equals and hash functions',
    )
  })

  it('rejects invalid equals and hash results naming the method and leaves the set unchanged [011 S8-AC2]', () => {
    const set = new HashSet<number>([1], {
      equivalence: { equals: () => 1 as never, hash: () => 0 },
    })
    expect(messageOf(() => set.add(2))).toBe('HashSet.add: equivalence.equals returned 1')
    expect(set.toArray()).toEqual([1])
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, '1', undefined]) {
      const hashing = new HashSet<number>({
        equivalence: { equals: (a, b) => a === b, hash: () => bad as never },
      })
      expect(() => hashing.add(1)).toThrow(TypeError)
      expect(messageOf(() => hashing.has(1))).toMatch(/^HashSet\.has: equivalence\.hash returned /)
      expect(hashing.size).toBe(0)
    }
    const big = new HashSet<number>({
      equivalence: { equals: (a, b) => a === b, hash: (v) => v * 2 ** 40 + 0.5 },
    })
    big.add(1).add(2)
    expect(big.has(2)).toBe(true)
  })

  it('recognises the built-in equivalences so protocol errors name the HashSet method [011 S8-AC3]', () => {
    const halfEquals = { [Symbol.for('javascript-collections-framework.equals')]: () => true }
    const set = new HashSet<unknown>({ equivalence: valueEquivalence })
    expect(messageOf(() => set.add(halfEquals))).toBe(
      'HashSet.add: object implements [equalsSymbol] without [hashCodeSymbol]',
    )
    const nested = {
      [Symbol.for('javascript-collections-framework.equals')]: () => true,
      [Symbol.for('javascript-collections-framework.hashCode')]: (hash: (v: unknown) => number) =>
        hash(halfEquals),
    }
    expect(messageOf(() => set.has(nested))).toBe(
      'HashSet.has: object implements [equalsSymbol] without [hashCodeSymbol]',
    )
    const badEquals = {
      [Symbol.for('javascript-collections-framework.equals')]: () => 'yes',
      [Symbol.for('javascript-collections-framework.hashCode')]: () => 1,
    }
    set.add(badEquals)
    const twin = { ...badEquals }
    expect(messageOf(() => set.delete(twin))).toBe('HashSet.delete: [equalsSymbol] returned "yes"')
  })

  it('reads key once, calls it with only the value, and rejects object results and bad options [011 S8-AC4]', () => {
    let reads = 0
    const argumentCounts: number[] = []
    const options = {
      get key() {
        reads++
        return function (this: unknown, ...args: unknown[]) {
          argumentCounts.push(args.length)
          expect(this).toBeUndefined()
          return args[0] as number
        }
      },
    }
    const set = new HashSet<number>([1, 2], options)
    set.has(1)
    set.delete(2)
    expect(reads).toBe(1)
    expect(argumentCounts).toEqual([1, 1, 1, 1])
    const boxed = new HashSet<string>({ key: (s) => new String(s) as never })
    expect(messageOf(() => boxed.add('a'))).toBe('HashSet.add: key function returned object')
    expect(messageOf(() => boxed.removeAll(['a']))).toBe(
      'HashSet.removeAll: key function returned object',
    )
    const fn = new HashSet<string>({ key: () => (() => 1) as never })
    expect(messageOf(() => fn.has('a'))).toBe('HashSet.has: key function returned function')
    for (const bad of [null, 1, 'k', {}]) {
      expect(messageOf(() => new HashSet([1], { key: bad as never }))).toBe(
        'HashSet: key is not a function',
      )
    }
    expect(messageOf(() => HashSet.from([1], { key: null as never }))).toBe(
      'HashSet.from: key is not a function',
    )
  })
})

describe('HashSet — construction', () => {
  it('rejects key and equivalence together, naming the constructor, before calling either [011 S2-AC5]', () => {
    let calls = 0
    const key = (v: number) => {
      calls++
      return v
    }
    const options = { key, equivalence: valueEquivalence as Equivalence<number> }
    expect(messageOf(() => new HashSet([1, 2], options))).toBe(
      'HashSet: key and equivalence cannot both be given',
    )
    expect(caught(() => HashSet.from([1], options))).toBeInstanceOf(TypeError)
    expect(messageOf(() => HashSet.from([1], options))).toMatch(/^HashSet\.from: /)
    expect(calls).toBe(0)
  })

  it('copy and from keep the same key or equivalence [011 S2-AC6]', () => {
    const byId = { key: (v: { id: number }) => v.id }
    const set = new HashSet([{ id: 1 }], byId)
    const copy = set.copy()
    copy.add({ id: 1 })
    expect(copy.size).toBe(1)
    const from = HashSet.from([{ id: 1 }, { id: 1 }, { id: 2 }], byId)
    expect(from.size).toBe(2)
    const caseless: Equivalence<string> = {
      equals: (a, b) => a.toLowerCase() === b.toLowerCase(),
      hash: (s) => hashCode(s.toLowerCase()),
    }
    const words = new HashSet(['A'], { equivalence: caseless }).copy()
    expect(words.add('a').size).toBe(1)
    expect(words.has('a')).toBe(true)
    expect(new HashSet([1, 2]).copy().toArray()).toEqual([1, 2])
  })

  it('reads its arguments by the native Set rules: elements first, then options [011 S2-AC7]', () => {
    expect(new HashSet('aba').toArray()).toEqual(['a', 'b'])
    expect(new HashSet().size).toBe(0)
    expect(new HashSet(undefined).size).toBe(0)
    expect(new HashSet(null).size).toBe(0)
    expect(new HashSet(null, { key: (s: string) => s.length }).add('a').add('b').size).toBe(1)
    expect(new HashSet(undefined, null).size).toBe(0)
    expect(new HashSet<string>({ key: (s) => s.length }).add('a').add('b').size).toBe(1)
    expect(
      new HashSet<string>({ key: (s: string) => s.length } as never, null).add('a').add('b').size,
    ).toBe(1)
    expect(new HashSet([1], null).toArray()).toEqual([1])
    expect(new HashSet({} as never).size).toBe(0)
    expect(messageOf(() => new HashSet(5 as never))).toBe('HashSet: elements is not iterable (5)')
    expect(messageOf(() => new HashSet((() => 1) as never))).toBe(
      'HashSet: elements is not iterable (function)',
    )
    expect(messageOf(() => new HashSet({} as never, {}))).toBe(
      'HashSet: elements is not iterable (object)',
    )
    expect(messageOf(() => new HashSet(true as never, null))).toBe(
      'HashSet: elements is not iterable (true)',
    )
    expect(messageOf(() => new HashSet([1], 5 as never))).toBe(
      'HashSet: options is not an object (5)',
    )
    expect(messageOf(() => new HashSet(undefined, 'x' as never))).toBe(
      'HashSet: options is not an object ("x")',
    )
    expect(messageOf(() => new HashSet([1], (() => 1) as never))).toBe(
      'HashSet: options is not an object (function)',
    )
    expect(messageOf(() => HashSet.from([1], 5 as never))).toBe(
      'HashSet.from: options is not an object (5)',
    )
    expect(HashSet.from([1], null).toArray()).toEqual([1])
  })

  it('holds each distinct element once in first-seen order and rejects a non-iterable [011 S7-AC3]', () => {
    expect(new HashSet([3, 1, 3, 2, 1]).toArray()).toEqual([3, 1, 2])
    expect(HashSet.from(new Set([3, 1]).values()).toArray()).toEqual([3, 1])
    expect(HashSet.from('hello').toArray()).toEqual(['h', 'e', 'l', 'o'])
    for (const bad of [null, undefined, 5, {}]) {
      expect(() => HashSet.from(bad as never)).toThrow(TypeError)
    }
    expect(messageOf(() => HashSet.from(null as never))).toBe(
      'HashSet.from: elements is not iterable (null)',
    )
    expect(messageOf(() => new HashSet({ length: 1, 0: 'a' } as never, {}))).toBe(
      'HashSet: elements is not iterable (object)',
    )
  })

  it('changes revision only when the members change [011 S7-AC4]', () => {
    for (const path of PATHS) {
      const set = makeOn(path, [1, 2])
      let revision = set.revision
      const unchanged = (what: string) => expect(set.revision, `${path[0]} ${what}`).toBe(revision)
      const changed = (what: string) => {
        expect(set.revision, `${path[0]} ${what}`).not.toBe(revision)
        revision = set.revision
      }
      set.add(1)
      unchanged('add present')
      set.delete(9)
      unchanged('delete absent')
      set.addAll([1, 2])
      unchanged('addAll present')
      set.removeAll([9])
      unchanged('removeAll absent')
      set.retainAll([1, 2])
      unchanged('retainAll all')
      set.removeIf(() => false)
      unchanged('removeIf none')
      set.add(3)
      changed('add')
      set.delete(3)
      changed('delete')
      set.removeAll([2])
      changed('removeAll')
      set.addAll([4])
      changed('addAll')
      set.retainAll([4])
      changed('retainAll')
      set.removeIf(() => true)
      changed('removeIf')
      set.clear()
      unchanged('clear empty')
      set.add(5)
      changed('add')
      set.clear()
      changed('clear')
    }
  })
})

describe('HashSet — equality, hashing and output', () => {
  it('equals compares members both ways, whatever the order or element equality [011 S4-AC1]', () => {
    const a = new HashSet([1, 2, 3])
    const b = new HashSet([3, 1, 2])
    expect(a.equals(b)).toBe(true)
    expect(b.equals(a)).toBe(true)
    expect(a.equals(new HashSet([1, 2]))).toBe(false)
    expect(a.equals(new HashSet([1, 2, 4]))).toBe(false)
    // A caseless set has 'a' for 'A', but the default set does not have 'A' for 'a'.
    const caseless = new HashSet(['A', 'b'], {
      equivalence: {
        equals: (x: string, y: string) => x.toLowerCase() === y.toLowerCase(),
        hash: (s: string) => hashCode(s.toLowerCase()),
      },
    })
    const plain = new HashSet(['a', 'b'])
    expect(caseless.equals(plain)).toBe(false)
    expect(plain.equals(caseless)).toBe(false)
    const keyed = new HashSet(['b', 'A'], { key: (s: string) => s })
    expect(keyed.equals(caseless)).toBe(caseless.equals(keyed))
    expect(keyed.equals(caseless)).toBe(true)
  })

  it('is never equal to a list, a queue, a native Set, an array or a map [011 S4-AC2]', () => {
    const set = new HashSet([1, 2])
    for (const other of [
      new ArrayList([1, 2]),
      new ArrayDeque([1, 2]),
      new Set([1, 2]),
      [1, 2],
      new Map([
        [1, 1],
        [2, 2],
      ]),
    ]) {
      expect(set.equals(other)).toBe(false)
    }
    expect(new ArrayList([1, 2]).equals(set)).toBe(false)
  })

  it('gives equal sets with the same equality the same order-independent hash [011 S4-AC3]', () => {
    const standIn = (v: unknown) => (typeof v === 'number' ? v * 7 : 1000)
    const plainA = new HashSet([1, 2, 3])
    const plainB = new HashSet([3, 2, 1])
    expect(plainA[hashCodeSymbol](standIn)).toBe(plainB[hashCodeSymbol](standIn))
    const svz = new HashSet([2, 3, 1], { equivalence: sameValueZeroEquivalence })
    expect(svz[hashCodeSymbol](standIn)).toBe(plainA[hashCodeSymbol](standIn))
    const value = new HashSet([1, 3, 2], { equivalence: valueEquivalence as Equivalence<number> })
    expect(value[hashCodeSymbol](standIn)).toBe(plainA[hashCodeSymbol](standIn))
    const key = (v: number) => v * 10
    const keyedA = new HashSet([1, 2], { key })
    const keyedB = new HashSet([2, 1], { key })
    expect(keyedA[hashCodeSymbol](standIn)).toBe(keyedB[hashCodeSymbol](standIn))
    const user: Equivalence<number> = { equals: (a, b) => a === b, hash: (v) => v + 100 }
    const userA = new HashSet([1, 2], { equivalence: user })
    const userB = new HashSet([2, 1], { equivalence: user })
    expect(userA[hashCodeSymbol](standIn)).toBe(userB[hashCodeSymbol](standIn))
    expect(hashCode(plainA)).toBe(hashCode(plainB))
    expect('hashCode' in plainA).toBe(false)
  })

  it('hashes equal valueEquivalence sets from two loaded copies alike [011 S4-AC3]', async () => {
    const { vi } = await import('vitest')
    const equalsKey = Symbol.for('javascript-collections-framework.equals')
    const hashKey = Symbol.for('javascript-collections-framework.hashCode')
    const point = (x: number) => ({
      x,
      [equalsKey]: (other: { x?: number }) => other.x === x,
      [hashKey]: (hash: (v: unknown) => number) => hash(x),
    })
    const first = await import('../src/collections/hash-set')
    const firstEquality = await import('../src/internal/equality')
    vi.resetModules()
    const second = await import('../src/collections/hash-set')
    const secondEquality = await import('../src/internal/equality')
    expect(second.HashSet).not.toBe(first.HashSet)
    const a = new first.HashSet([point(1), point(2)], {
      equivalence: firstEquality.valueEquivalence,
    })
    const b = new second.HashSet([point(2), point(1)], {
      equivalence: secondEquality.valueEquivalence,
    })
    const standIn = (v: unknown) => (typeof v === 'number' ? v * 3 : 7)
    expect(a.equals(b)).toBe(true)
    expect(a[hashCodeSymbol](standIn)).toBe(b[hashCodeSymbol](standIn))
  })

  it('prints [Circular] for a set that contains itself and terminates equals and hashing [011 S4-AC4]', () => {
    for (const path of PATHS) {
      const a = makeOn(path, [1])
      a.add(a)
      expect(String(a)).toBe('HashSet(2) {1, [Circular]}')
      expect(a.equals(a)).toBe(true)
      expect(typeof hashCode(a)).toBe('number')
      const b = makeOn(path, [1])
      b.add(b)
      expect(a.equals(b)).toBe(b.equals(a))
    }
    const value = new HashSet<unknown>([1], { equivalence: valueEquivalence })
    value.add(value)
    const other = new HashSet<unknown>([1], { equivalence: valueEquivalence })
    other.add(other)
    expect(() => value.equals(other)).not.toThrow()
    expect(value.equals(other)).toBe(other.equals(value))
    expect(typeof hashCode(value)).toBe('number')
  })

  it('prints HashSet(n) {...} in insertion order and writes JSON as an array [011 S7-AC5]', () => {
    const set = new HashSet<unknown>(['b', 1, null, -0])
    expect(String(set)).toBe("HashSet(4) {'b', 1, null, 0}")
    expect(set.toString()).toBe("HashSet(4) {'b', 1, null, 0}")
    expect(String(new HashSet())).toBe('HashSet(0) {}')
    expect(set.toJSON()).toEqual(['b', 1, null, 0])
    expect(JSON.stringify(new HashSet([2, 1]))).toBe('[2,1]')
    expect(Object.prototype.toString.call(set)).toBe('[object HashSet]')
  })
})

describe('HashSet — shared contracts', () => {
  const peers = [
    (initial?: Iterable<unknown>) => new ArrayList<unknown>(initial),
    (initial?: Iterable<unknown>) => new ArrayDeque<unknown>(initial),
  ]
  const sumOf = (elements: unknown[], hash: (value: unknown) => number) =>
    elements.reduce<number>((h, e) => (h + hash(e)) | 0, 0)
  for (const path of PATHS) {
    const make = (initial?: Iterable<unknown>) => makeOn(path, initial)
    const storedHashes = path[0] === 'equivalence'
    describe(`on the ${path[0]} path`, () => {
      describeCollection('HashSet', make, {
        iteration: 'live',
        brackets: 'set',
        nullElements: 'store',
        peers,
        structural: {
          expectedHash: (elements, hash) =>
            storedHashes ? sumOf(elements, sameValueZeroEquivalence.hash) : sumOf(elements, hash),
        },
        withEquality: (initial, equality) =>
          new HashSet<unknown>(initial, { equivalence: { equals: equality, hash: () => 0 } }),
        withFailingAdd: (rejects, failure) =>
          new HashSet<unknown>({
            key: (e) => {
              if (rejects(e)) throw failure
              return e as number
            },
          }),
      })
    })
  }
  runContractPair('HashSet', lib)
})

describe('HashSet — reference model against a native Set', () => {
  const runs: Array<[string, () => HashSetOptions<number> | undefined]> = [
    ['default', () => undefined],
    ['key', () => ({ key: (v: number) => v })],
    [
      'equivalence',
      () => ({
        equivalence: {
          equals: (a: number, b: number) => sameValueZeroEquivalence.equals(a, b),
          hash: (v: number) => sameValueZeroEquivalence.hash(v),
        },
      }),
    ],
    [
      'equivalence with few hashes',
      () => ({ equivalence: { equals: (a: number, b: number) => a === b, hash: (v) => v % 6 } }),
    ],
  ]
  for (const [label, options] of runs) {
    it(`matches results, size, order, iterators and cursors across growth and shrinking (${label}) [011 S7-AC2]`, () => {
      for (const seed of [1, 2, 3]) {
        runReferenceModel({
          seed,
          steps: 1500,
          values: 300,
          bulk: true,
          model: 'set',
          make: () => new HashSet<number>(undefined, options()),
        })
      }
      runReferenceModel({
        seed: 4,
        steps: 600,
        model: 'set',
        make: () => new HashSet<number>(undefined, options()),
      })
    })
  }
})

describe('HashSet — growth, shrinking and seeding', () => {
  it('places the same values with a different seed in each set on the equivalence path [011 S5-AC4]', () => {
    const seeds: number[] = []
    let next = 0x7a11
    setBucketSeedSourceForTesting(() => {
      seeds.push(next)
      return next++
    })
    const equivalence: Equivalence<number> = { equals: (a, b) => a === b, hash: (v) => v }
    new HashSet([1, 2, 3], { equivalence })
    new HashSet([1, 2, 3], { equivalence })
    expect(seeds.length).toBe(2)
    expect(seeds[0]).not.toBe(seeds[1])
  })

  it('keeps every member findable and the order unchanged across growth and shrinking [011 S5-AC5]', () => {
    for (const path of PATHS) {
      const set = makeOn(path)
      for (let i = 0; i < 3000; i++) set.add(i)
      set.removeIf((v) => (v as number) % 100 !== 0)
      for (let i = 0; i < 3000; i += 7) set.delete(i)
      const expected = Array.from({ length: 30 }, (_, i) => i * 100).filter((v) => v % 7 !== 0)
      expect(set.toArray(), path[0]).toEqual(expected)
      for (const v of expected) expect(set.has(v)).toBe(true)
      expect(set.has(1)).toBe(false)
      for (let i = 0; i < 2000; i++) set.add(i + 10000)
      expect(set.size).toBe(expected.length + 2000)
      expect(set.toArray().slice(0, expected.length)).toEqual(expected)
    }
  })
})
